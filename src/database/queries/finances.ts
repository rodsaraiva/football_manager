import { z, ZodObject } from 'zod';
import { ClubFinance, FinanceType } from '@/types';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';

// Só os campos consumidos por rowToFinance; .passthrough() deixa save_id/id passarem.
const clubFinanceRowSchema = z
  .object({
    club_id: z.number(),
    season: z.number(),
    week: z.number(),
    type: z.string(),
    amount: z.number(),
    description: z.string(),
  })
  .passthrough();
type ClubFinanceRow = z.infer<typeof clubFinanceRowSchema>;

// Agregado SUM(): não é linha de tabela, fica fora de __rowSchemas.
const seasonBalanceRowSchema = z.object({ total: z.number() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'club_finances', schema: clubFinanceRowSchema },
];

function rowToFinance(row: ClubFinanceRow): ClubFinance {
  return {
    clubId: row.club_id,
    season: row.season,
    week: row.week,
    type: row.type as FinanceType,
    amount: row.amount,
    description: row.description,
  };
}

export interface AddFinanceEntryInput {
  clubId: number;
  season: number;
  week: number;
  type: FinanceType;
  amount: number;
  description: string;
}

export async function addFinanceEntry(db: DbHandle, saveId: number, input: AddFinanceEntryInput): Promise<void> {
  await db.prepare(
    'INSERT INTO club_finances (save_id, club_id, season, week, type, amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(saveId, input.clubId, input.season, input.week, input.type, input.amount, input.description);
}

export async function getFinancesBySeason(db: DbHandle, saveId: number, clubId: number, season: number): Promise<ClubFinance[]> {
  const rows = await db
    .prepare('SELECT * FROM club_finances WHERE save_id = ? AND club_id = ? AND season = ?')
    .all(saveId, clubId, season);
  return parseRows(clubFinanceRowSchema, rows, 'finances.getFinancesBySeason').map(rowToFinance);
}

export async function getSeasonBalance(db: DbHandle, saveId: number, clubId: number, season: number): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM club_finances WHERE save_id = ? AND club_id = ? AND season = ?',
    )
    .get(saveId, clubId, season);
  return parseRow(seasonBalanceRowSchema, row, 'finances.getSeasonBalance').total;
}
