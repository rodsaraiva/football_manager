import { Staff, StaffCandidate, StaffRole } from '@/types';
import type { ScoutArchetype } from '@/engine/scouting/scout-archetypes';
import { DbHandle } from './players';

// V1: sem season no escopo desta query. contract_end fica uma temporada à frente do
// horizonte do seed (anos 2025+1..4), evitando contrato já vencido na contratação.
const STAFF_HIRE_CONTRACT_END = 2028;

interface StaffRow {
  id: number;
  name: string;
  role: string;
  club_id: number | null;
  ability: number;
  wage: number;
  contract_end: number;
  archetype: string | null;
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
    archetype: (row.archetype ?? undefined) as ScoutArchetype | undefined,
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

export async function hireStaff(
  db: DbHandle,
  saveId: number,
  clubId: number,
  candidate: StaffCandidate,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO staff (save_id, name, role, club_id, ability, wage, contract_end)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(saveId, candidate.name, candidate.role, clubId, candidate.ability, candidate.wage, STAFF_HIRE_CONTRACT_END);
  return Number((result as { lastInsertRowid: number | bigint }).lastInsertRowid);
}

export async function fireStaff(db: DbHandle, saveId: number, staffId: number): Promise<void> {
  await db.prepare('DELETE FROM staff WHERE save_id = ? AND id = ?').run(saveId, staffId);
}
