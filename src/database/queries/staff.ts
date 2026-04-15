import { Staff, StaffRole } from '@/types';
import { DbHandle } from './players';

interface StaffRow {
  id: number;
  name: string;
  role: string;
  club_id: number | null;
  ability: number;
  wage: number;
  contract_end: number;
}

function rowToStaff(row: StaffRow): Staff {
  return {
    id: row.id,
    name: row.name,
    role: row.role as StaffRole,
    clubId: row.club_id as number,
    ability: row.ability,
    wage: row.wage,
    contractEnd: row.contract_end,
  };
}

export async function getStaffByClub(db: DbHandle, clubId: number): Promise<Staff[]> {
  const rows = await db.prepare('SELECT * FROM staff WHERE club_id = ?').all(clubId) as StaffRow[];
  return rows.map(rowToStaff);
}

export async function getStaffByRole(db: DbHandle, role: StaffRole): Promise<Staff[]> {
  const rows = await db.prepare('SELECT * FROM staff WHERE role = ?').all(role) as StaffRow[];
  return rows.map(rowToStaff);
}
