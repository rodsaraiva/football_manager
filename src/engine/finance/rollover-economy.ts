import {
  DbHandle,
  getPlayersWithAttributesByClub,
  getFreeAgentsWithAttributes,
} from '@/database/queries/players';
import { addFinanceEntry } from '@/database/queries/finances';
import { updateClubBudget, getClubById } from '@/database/queries/clubs';
import { calculateMarketValue } from '@/engine/transfer/market-value';
import { calculateOverall } from '@/utils/overall';
import { PrizeAward } from './prize-money';

/**
 * Contract expiry: a player whose contract_end <= endedSeason is released —
 * club_id NULL, wage 0, is_free_agent 1. Fixes the two-state bug where the
 * player was flagged free but still attached to (and paid by) the club.
 */
export async function expireContracts(db: DbHandle, saveId: number, endedSeason: number): Promise<void> {
  await db
    .prepare(
      'UPDATE players SET is_free_agent = 1, club_id = NULL, wage = 0 WHERE save_id = ? AND contract_end <= ? AND club_id IS NOT NULL',
    )
    .run(saveId, endedSeason);
}

/**
 * Recompute market_value for every attached + free-agent player using fresh
 * overall/age/potential/contract. Runs once per season at rollover so values
 * stop being frozen at their seed figure.
 */
export async function recalculateMarketValues(db: DbHandle, saveId: number, currentSeason: number): Promise<void> {
  const clubs = (await db
    .prepare('SELECT id FROM clubs WHERE save_id = ?')
    .all(saveId)) as Array<{ id: number }>;

  const squads: Awaited<ReturnType<typeof getPlayersWithAttributesByClub>> = [];
  for (const c of clubs) {
    squads.push(...(await getPlayersWithAttributesByClub(db, saveId, c.id)));
  }
  squads.push(...(await getFreeAgentsWithAttributes(db, saveId)));

  for (const pl of squads) {
    const overall = Math.round(calculateOverall(pl.attributes, pl.position));
    const value = calculateMarketValue({
      overall,
      effectivePotential: pl.effectivePotential,
      age: pl.age,
      contractYearsLeft: Math.max(0, pl.contractEnd - currentSeason),
    });
    await db.prepare('UPDATE players SET market_value = ? WHERE save_id = ? AND id = ?').run(value, saveId, pl.id);
  }
}

/**
 * Credit prize money to each club's budget and write a 'prize' finance row.
 * Single call point per season (game-loop season-end) → idempotent by
 * construction.
 */
export async function distributePrizeMoney(
  db: DbHandle,
  saveId: number,
  awards: PrizeAward[],
  season: number,
  week: number,
): Promise<void> {
  for (const a of awards) {
    if (a.amount <= 0) continue;
    const club = await getClubById(db, saveId, a.clubId);
    if (!club) continue;
    await updateClubBudget(db, saveId, a.clubId, club.budget + a.amount);
    await addFinanceEntry(db, saveId, {
      clubId: a.clubId,
      season,
      week,
      type: 'prize',
      amount: a.amount,
      description: a.description,
    });
  }
}
