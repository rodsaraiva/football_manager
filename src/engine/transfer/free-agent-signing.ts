import { DbHandle } from '@/database/queries/players';
import { addFinanceEntry } from '@/database/queries/finances';
import { createTransfer } from '@/database/queries/transfers';

/**
 * Free agent expected weekly wage is proportional to overall. A 60-ovr player
 * expects ~20k/wk, an 80-ovr expects ~100k/wk, a 90-ovr expects ~250k/wk.
 */
export function freeAgentExpectedWage(overall: number): number {
  // Exponential scaling on overall
  // 50 → ~4k, 60 → ~20k, 70 → ~50k, 80 → ~100k, 90 → ~250k
  const base = Math.pow((overall - 45) / 10, 2) * 1500;
  return Math.max(2000, Math.round(base / 500) * 500);
}

export interface SignFreeAgentInput {
  playerId: number;
  clubId: number;
  wageOffered: number;
  contractYears: number; // 1..5
  playerOverall: number;
  season: number;
  week: number;
}

export interface SignFreeAgentResult {
  success: boolean;
  reason?: string;
}

/**
 * Attempts to sign a free agent. The player accepts if the wage meets their
 * expectation. Contract length is stored as `contract_end = season + years`.
 *
 * No fee is paid (free transfer), but the buying club must be able to cover
 * the weekly wage (> 0 budget check).
 */
export async function signFreeAgent(
  db: DbHandle,
  input: SignFreeAgentInput,
): Promise<SignFreeAgentResult> {
  const { playerId, clubId, wageOffered, contractYears, playerOverall, season, week } = input;

  if (wageOffered <= 0) return { success: false, reason: 'Wage must be greater than zero.' };
  if (contractYears < 1 || contractYears > 5) {
    return { success: false, reason: 'Contract length must be between 1 and 5 years.' };
  }

  // Verify player is a free agent
  const player = (await db
    .prepare('SELECT id, is_free_agent FROM players WHERE id = ?')
    .get(playerId)) as { id: number; is_free_agent: number } | undefined;
  if (!player) return { success: false, reason: 'Player not found.' };
  if (player.is_free_agent !== 1) return { success: false, reason: 'Player is not a free agent.' };

  // Verify club budget can sustain at least a few weeks of wages
  const club = (await db
    .prepare('SELECT budget FROM clubs WHERE id = ?')
    .get(clubId)) as { budget: number } | undefined;
  if (!club) return { success: false, reason: 'Club not found.' };
  if (club.budget < wageOffered * 4) {
    return { success: false, reason: 'Budget too low to sustain this wage.' };
  }

  const expected = freeAgentExpectedWage(playerOverall);
  if (wageOffered < expected) {
    return {
      success: false,
      reason: `Player declined. They expect at least $${expected.toLocaleString()}/wk.`,
    };
  }

  // Sign
  const contractEnd = season + contractYears;
  await db
    .prepare(
      `UPDATE players SET club_id = ?, wage = ?, contract_end = ?, is_free_agent = 0
       WHERE id = ?`,
    )
    .run(clubId, wageOffered, contractEnd, playerId);

  // Record as free-transfer in transfers table
  await createTransfer(db, {
    playerId,
    season,
    fromClubId: null,
    toClubId: clubId,
    fee: 0,
    wageOffered,
    type: 'free',
  });

  // Signing bonus (small) recorded in finances
  const bonus = Math.round(wageOffered * 4); // 4 weeks worth
  await db.prepare('UPDATE clubs SET budget = budget - ? WHERE id = ?').run(bonus, clubId);
  await addFinanceEntry(db, {
    clubId,
    season,
    week,
    type: 'bonus',
    amount: -bonus,
    description: `Signing bonus for free agent #${playerId}`,
  });

  return { success: true };
}
