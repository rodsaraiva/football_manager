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

export async function getStaffByClub(db: DbHandle, saveId: number, clubId: number): Promise<Staff[]> {
  const rows = await db.prepare('SELECT * FROM staff WHERE save_id = ? AND club_id = ?').all(saveId, clubId) as StaffRow[];
  return rows.map(rowToStaff);
}

export async function getStaffByRole(db: DbHandle, saveId: number, role: StaffRole): Promise<Staff[]> {
  const rows = await db.prepare('SELECT * FROM staff WHERE save_id = ? AND role = ?').all(saveId, role) as StaffRow[];
  return rows.map(rowToStaff);
}
