import { z, ZodObject } from 'zod';
import { parseRows } from '../parse-rows';
import { DbHandle } from './players';

export interface NationalTitle {
  id: number;
  competitionId: number;
  season: number;
  championNationalId: number;
  runnerUpNationalId: number;
  userManagedWon: boolean;
}

const nationalTitleRowSchema = z
  .object({
    id: z.number(),
    competition_id: z.number(),
    season: z.number(),
    champion_national_id: z.number(),
    runner_up_national_id: z.number(),
    user_managed_won: z.number(),
  })
  .passthrough();
type NationalTitleRow = z.infer<typeof nationalTitleRowSchema>;

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'national_titles', schema: nationalTitleRowSchema },
];

function rowToTitle(row: NationalTitleRow): NationalTitle {
  return {
    id: row.id,
    competitionId: row.competition_id,
    season: row.season,
    championNationalId: row.champion_national_id,
    runnerUpNationalId: row.runner_up_national_id,
    userManagedWon: row.user_managed_won === 1,
  };
}

/** True se uma honra já está registrada para (competição, temporada) — usado para idempotência das news. */
export async function hasNationalTitle(
  db: DbHandle,
  saveId: number,
  competitionId: number,
  season: number,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS x FROM national_titles WHERE save_id = ? AND competition_id = ? AND season = ?')
    .get(saveId, competitionId, season);
  return !!row;
}

/** Registra o campeão do torneio internacional. INSERT OR IGNORE → idempotente por (comp, season). */
export async function recordNationalTitle(
  db: DbHandle,
  saveId: number,
  title: {
    competitionId: number;
    season: number;
    championNationalId: number;
    runnerUpNationalId: number;
    userManagedWon: boolean;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO national_titles
         (save_id, competition_id, season, champion_national_id, runner_up_national_id, user_managed_won)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      saveId,
      title.competitionId,
      title.season,
      title.championNationalId,
      title.runnerUpNationalId,
      title.userManagedWon ? 1 : 0,
    );
}

export async function getNationalTitles(db: DbHandle, saveId: number): Promise<NationalTitle[]> {
  const rows = await db
    .prepare('SELECT * FROM national_titles WHERE save_id = ? ORDER BY season ASC, competition_id ASC')
    .all(saveId);
  return parseRows(nationalTitleRowSchema, rows, 'national-titles.getNationalTitles').map(rowToTitle);
}
