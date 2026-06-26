import { z, ZodObject } from 'zod';
import { Staff, StaffCandidate, StaffRole } from '@/types';
import type { ScoutArchetype } from '@/engine/scouting/scout-archetypes';
import { parseRows } from '../parse-rows';
import { DbHandle } from './players';

// V1: sem season no escopo desta query. contract_end fica uma temporada à frente do
// horizonte do seed (anos 2025+1..4), evitando contrato já vencido na contratação.
const STAFF_HIRE_CONTRACT_END = 2028;

// Só os campos consumidos por rowToStaff; club_id/archetype são nullable no schema.
const staffRowSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
    club_id: z.number().nullable(),
    ability: z.number(),
    wage: z.number(),
    contract_end: z.number(),
    archetype: z.string().nullable(),
  })
  .passthrough();
type StaffRow = z.infer<typeof staffRowSchema>;

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'staff', schema: staffRowSchema },
];

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
  const rows = await db.prepare('SELECT * FROM staff WHERE save_id = ? AND club_id = ?').all(saveId, clubId);
  return parseRows(staffRowSchema, rows, 'staff.getStaffByClub').map(rowToStaff);
}

export async function getStaffByRole(db: DbHandle, saveId: number, role: StaffRole): Promise<Staff[]> {
  const rows = await db.prepare('SELECT * FROM staff WHERE save_id = ? AND role = ?').all(saveId, role);
  return parseRows(staffRowSchema, rows, 'staff.getStaffByRole').map(rowToStaff);
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
