import { z, ZodObject } from 'zod';
import { Friendly } from '@/types';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';

const friendlyRowSchema = z
  .object({
    id: z.number(),
    season: z.number(),
    home_club_id: z.number(),
    away_club_id: z.number(),
    home_goals: z.number().nullable(),
    away_goals: z.number().nullable(),
    played: z.number(),
    attendance: z.number().nullable(),
  })
  .passthrough();
type FriendlyRow = z.infer<typeof friendlyRowSchema>;

// Projeção COUNT(*): não é linha de tabela, fica fora de __rowSchemas.
const countFriendliesRowSchema = z.object({ c: z.number() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'friendlies', schema: friendlyRowSchema },
];

function rowToFriendly(row: FriendlyRow): Friendly {
  return {
    id: row.id,
    season: row.season,
    homeClubId: row.home_club_id,
    awayClubId: row.away_club_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    played: row.played === 1,
    attendance: row.attendance,
  };
}

export interface CreateFriendlyInput {
  season: number;
  homeClubId: number;
  awayClubId: number;
}

export async function createFriendly(
  db: DbHandle,
  saveId: number,
  input: CreateFriendlyInput,
): Promise<number> {
  const result = (await db
    .prepare(
      `INSERT INTO friendlies (save_id, season, home_club_id, away_club_id, played)
       VALUES (?, ?, ?, ?, 0)`,
    )
    .run(saveId, input.season, input.homeClubId, input.awayClubId)) as {
    lastInsertRowid: number | bigint;
  };
  return Number(result.lastInsertRowid);
}

export async function getFriendliesBySeason(
  db: DbHandle,
  saveId: number,
  season: number,
): Promise<Friendly[]> {
  const rows = await db
    .prepare('SELECT * FROM friendlies WHERE save_id = ? AND season = ? ORDER BY id ASC')
    .all(saveId, season);
  return parseRows(friendlyRowSchema, rows, 'friendlies.getFriendliesBySeason').map(rowToFriendly);
}

export async function countFriendliesBySeason(
  db: DbHandle,
  saveId: number,
  season: number,
): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS c FROM friendlies WHERE save_id = ? AND season = ?')
    .get(saveId, season);
  return parseRow(countFriendliesRowSchema, row, 'friendlies.countFriendliesBySeason').c;
}

export async function updateFriendlyResult(
  db: DbHandle,
  saveId: number,
  friendlyId: number,
  homeGoals: number,
  awayGoals: number,
  attendance?: number,
): Promise<void> {
  await db
    .prepare(
      'UPDATE friendlies SET home_goals = ?, away_goals = ?, played = 1, attendance = ? WHERE save_id = ? AND id = ?',
    )
    .run(homeGoals, awayGoals, attendance ?? null, saveId, friendlyId);
}
