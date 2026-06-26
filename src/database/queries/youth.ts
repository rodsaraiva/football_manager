import { z, ZodObject } from 'zod';
import { Player, SquadTier } from '@/types';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle, getPlayersByClub } from './players';

export interface YouthLoanRow {
  id: number; playerId: number; parentClubId: number; loanClubId: number;
  startSeason: number; loanEnd: number;
  minutesPlayed: number; appearances: number; ratingSum: number;
  recalled: 0 | 1; settled: 0 | 1;
}

const youthLoanRowSchema = z
  .object({
    id: z.number(),
    player_id: z.number(),
    parent_club_id: z.number(),
    loan_club_id: z.number(),
    start_season: z.number(),
    loan_end: z.number(),
    minutes_played: z.number(),
    appearances: z.number(),
    rating_sum: z.number(),
    recalled: z.number(),
    settled: z.number(),
  })
  .passthrough();
type YouthLoanDbRow = z.infer<typeof youthLoanRowSchema>;

// Projeção de clubs (id, name, academy_reputation): não é linha de tabela pura.
const academyRankRowSchema = z
  .object({ id: z.number(), name: z.string(), academy_reputation: z.number() })
  .passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'youth_loans', schema: youthLoanRowSchema },
];

function toLoanRow(r: YouthLoanDbRow): YouthLoanRow {
  return {
    id: r.id, playerId: r.player_id, parentClubId: r.parent_club_id, loanClubId: r.loan_club_id,
    startSeason: r.start_season, loanEnd: r.loan_end,
    minutesPlayed: r.minutes_played, appearances: r.appearances, ratingSum: r.rating_sum,
    recalled: (r.recalled === 1 ? 1 : 0), settled: (r.settled === 1 ? 1 : 0),
  };
}

export async function insertYouthLoan(
  db: DbHandle, saveId: number,
  r: { playerId: number; parentClubId: number; loanClubId: number; startSeason: number; loanEnd: number },
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO youth_loans (save_id, player_id, parent_club_id, loan_club_id, start_season, loan_end)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(saveId, r.playerId, r.parentClubId, r.loanClubId, r.startSeason, r.loanEnd);
  return Number((res as { lastInsertRowid: number | bigint }).lastInsertRowid);
}

export async function getActiveYouthLoans(
  db: DbHandle, saveId: number, parentClubId: number,
): Promise<YouthLoanRow[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM youth_loans
       WHERE save_id = ? AND parent_club_id = ? AND settled = 0 AND recalled = 0
       ORDER BY id ASC`,
    )
    .all(saveId, parentClubId);
  return parseRows(youthLoanRowSchema, rows, 'youth.getActiveYouthLoans').map(toLoanRow);
}

export async function getYouthLoanById(
  db: DbHandle, saveId: number, loanId: number,
): Promise<YouthLoanRow | null> {
  const row = await db
    .prepare('SELECT * FROM youth_loans WHERE save_id = ? AND id = ?')
    .get(saveId, loanId);
  return row ? toLoanRow(parseRow(youthLoanRowSchema, row, 'youth.getYouthLoanById')) : null;
}

export async function promotePlayerTier(
  db: DbHandle, saveId: number, playerId: number, tier: SquadTier,
): Promise<void> {
  await db.prepare('UPDATE players SET squad_tier = ? WHERE save_id = ? AND id = ?').run(tier, saveId, playerId);
}

export async function getPlayersByClubAndTier(
  db: DbHandle, saveId: number, clubId: number, tier: SquadTier,
): Promise<Player[]> {
  return getPlayersByClub(db, saveId, clubId, tier);
}

export async function getAcademyReputationRanking(
  db: DbHandle, saveId: number, countryId: number,
): Promise<Array<{ clubId: number; name: string; academyReputation: number; rank: number }>> {
  const rows = await db
    .prepare(
      `SELECT id, name, academy_reputation FROM clubs
       WHERE save_id = ? AND country_id = ?
       ORDER BY academy_reputation DESC, id ASC`,
    )
    .all(saveId, countryId);
  return parseRows(academyRankRowSchema, rows, 'youth.getAcademyReputationRanking').map((r, i) => ({
    clubId: r.id, name: r.name, academyReputation: r.academy_reputation, rank: i + 1,
  }));
}
