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

export function addFinanceEntry(db: DbHandle, input: AddFinanceEntryInput): void {
  db.prepare(
    'INSERT INTO club_finances (club_id, season, week, type, amount, description) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(input.clubId, input.season, input.week, input.type, input.amount, input.description);
}

export function getFinancesBySeason(db: DbHandle, clubId: number, season: number): ClubFinance[] {
  const rows = db
    .prepare('SELECT * FROM club_finances WHERE club_id = ? AND season = ?')
    .all(clubId, season) as ClubFinanceRow[];
  return rows.map(rowToFinance);
}

export function getSeasonBalance(db: DbHandle, clubId: number, season: number): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM club_finances WHERE club_id = ? AND season = ?',
    )
    .get(clubId, season) as { total: number };
  return row.total;
}
