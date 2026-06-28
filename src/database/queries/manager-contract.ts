import { z } from 'zod';
import { DbHandle } from './players';
import { parseRow } from '../parse-rows';
import { ManagerContractTerms } from '@/engine/board/manager-contract-engine';

export interface ManagerContractRow extends ManagerContractTerms {
  clubId: number;
}

const managerContractRowSchema = z
  .object({
    club_id: z.number(),
    start_season: z.number(),
    end_season: z.number(),
    wage_per_season: z.number(),
    release_clause: z.number(),
    expectation: z.number(),
  })
  .passthrough();

export const __rowSchemas = [{ table: 'manager_contracts', schema: managerContractRowSchema }];

/** Grava (ou substitui) o contrato ativo do save. UNIQUE(save_id) garante 1 linha. */
export async function upsertManagerContract(db: DbHandle, saveId: number, c: ManagerContractRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO manager_contracts
         (save_id, club_id, start_season, end_season, wage_per_season, release_clause, expectation)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(save_id) DO UPDATE SET
         club_id = excluded.club_id,
         start_season = excluded.start_season,
         end_season = excluded.end_season,
         wage_per_season = excluded.wage_per_season,
         release_clause = excluded.release_clause,
         expectation = excluded.expectation`,
    )
    .run(saveId, c.clubId, c.startSeason, c.endSeason, c.wagePerSeason, c.releaseClause, c.expectation);
}

export async function getActiveManagerContract(db: DbHandle, saveId: number): Promise<ManagerContractRow | null> {
  const raw = await db
    .prepare(
      `SELECT club_id, start_season, end_season, wage_per_season, release_clause, expectation
         FROM manager_contracts WHERE save_id = ?`,
    )
    .get(saveId);
  const row = parseRow(managerContractRowSchema.nullable(), raw, 'manager-contract.getActiveManagerContract');
  if (!row) return null;
  return {
    clubId: row.club_id,
    startSeason: row.start_season,
    endSeason: row.end_season,
    wagePerSeason: row.wage_per_season,
    releaseClause: row.release_clause,
    expectation: row.expectation,
  };
}

export async function clearManagerContract(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('DELETE FROM manager_contracts WHERE save_id = ?').run(saveId);
}
