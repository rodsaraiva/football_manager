import { ClubFinance, FinanceType } from '@/types';
import { DbHandle } from './players';

interface ClubFinanceRow {
  id: number;
  club_id: number;
  season: number;
  week: number;
  type: string;
  amount: number;
  description: string;
}

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

export async function addFinanceEntry(db: DbHandle, input: AddFinanceEntryInput): Promise<void> {
  await db.prepare(
    'INSERT INTO club_finances (club_id, season, week, type, amount, description) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(input.clubId, input.season, input.week, input.type, input.amount, input.description);
}

export async function getFinancesBySeason(db: DbHandle, clubId: number, season: number): Promise<ClubFinance[]> {
  const rows = await db
    .prepare('SELECT * FROM club_finances WHERE club_id = ? AND season = ?')
    .all(clubId, season) as ClubFinanceRow[];
  return rows.map(rowToFinance);
}

export async function getSeasonBalance(db: DbHandle, clubId: number, season: number): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM club_finances WHERE club_id = ? AND season = ?',
    )
    .get(clubId, season) as { total: number };
  return row.total;
}
