import { z, ZodObject } from 'zod';
import { Club } from '@/types';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';
import { TrainingFocus } from '@/engine/training/progression';

// Linha completa de clubs (SELECT *); todas as colunas são NOT NULL no schema.
const clubRowSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    short_name: z.string(),
    country_id: z.number(),
    league_id: z.number(),
    reputation: z.number(),
    budget: z.number(),
    wage_budget: z.number(),
    stadium_name: z.string(),
    stadium_capacity: z.number(),
    training_facilities: z.number(),
    youth_academy: z.number(),
    medical_department: z.number(),
    primary_color: z.string(),
    secondary_color: z.string(),
    training_focus: z.string(),
    academy_reputation: z.number(),
  })
  .passthrough();
type ClubRow = z.infer<typeof clubRowSchema>;

// JOIN com leagues: division_level é projeção, não entra em __rowSchemas.
const clubWithDivisionRowSchema = clubRowSchema
  .extend({ division_level: z.number() })
  .passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'clubs', schema: clubRowSchema },
];

function rowToClub(row: ClubRow): Club {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    countryId: row.country_id,
    leagueId: row.league_id,
    reputation: row.reputation,
    budget: row.budget,
    wageBudget: row.wage_budget,
    stadiumName: row.stadium_name,
    stadiumCapacity: row.stadium_capacity,
    trainingFacilities: row.training_facilities,
    youthAcademy: row.youth_academy,
    medicalDepartment: row.medical_department,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    trainingFocus: (row.training_focus as TrainingFocus) ?? 'balanced',
    academyReputation: row.academy_reputation ?? 50,
  };
}

export async function getClubById(db: DbHandle, saveId: number, clubId: number): Promise<Club | null> {
  const row = await db.prepare('SELECT * FROM clubs WHERE save_id = ? AND id = ?').get(saveId, clubId);
  const parsed = parseRow(clubRowSchema.nullable(), row, 'clubs.getClubById');
  return parsed ? rowToClub(parsed) : null;
}

export async function getClubsByLeague(db: DbHandle, saveId: number, leagueId: number): Promise<Club[]> {
  const rows = await db.prepare('SELECT * FROM clubs WHERE save_id = ? AND league_id = ?').all(saveId, leagueId);
  return parseRows(clubRowSchema, rows, 'clubs.getClubsByLeague').map(rowToClub);
}

export async function getAllClubs(db: DbHandle, saveId: number): Promise<Club[]> {
  const rows = await db.prepare('SELECT * FROM clubs WHERE save_id = ?').all(saveId);
  return parseRows(clubRowSchema, rows, 'clubs.getAllClubs').map(rowToClub);
}

export async function updateClubBudget(db: DbHandle, saveId: number, clubId: number, budget: number): Promise<void> {
  await db.prepare('UPDATE clubs SET budget = ? WHERE save_id = ? AND id = ?').run(budget, saveId, clubId);
}

export interface ClubWithDivision extends Club {
  divisionLevel: number;
}

export async function getClubsByCountry(
  db: DbHandle,
  saveId: number,
  countryId: number,
): Promise<ClubWithDivision[]> {
  const rows = await db
    .prepare(
      `SELECT clubs.*, leagues.division_level AS division_level
       FROM clubs JOIN leagues ON clubs.league_id = leagues.id
       WHERE clubs.save_id = ? AND leagues.country_id = ?`,
    )
    .all(saveId, countryId);
  return parseRows(clubWithDivisionRowSchema, rows, 'clubs.getClubsByCountry').map((r) => ({
    ...rowToClub(r),
    divisionLevel: r.division_level,
  }));
}

export async function updateClubReputation(db: DbHandle, saveId: number, clubId: number, reputation: number): Promise<void> {
  await db.prepare('UPDATE clubs SET reputation = ? WHERE save_id = ? AND id = ?').run(reputation, saveId, clubId);
}

// Projeção de coluna única; não é linha de tabela pura, fica fora de __rowSchemas.
const trainingFocusRowSchema = z.object({ training_focus: z.string() }).passthrough();

// Projeção do JOIN com countries; idem.
const countryCodeRowSchema = z.object({ code: z.string() }).passthrough();

const VALID_FOCI: TrainingFocus[] = ['technical', 'tactical', 'physical', 'balanced'];

// Club ids are globally unique (offset per save), so id alone scopes correctly.
export async function getClubTrainingFocus(db: DbHandle, clubId: number): Promise<TrainingFocus> {
  const row = await db.prepare('SELECT training_focus FROM clubs WHERE id = ?').get(clubId);
  const parsed = parseRow(trainingFocusRowSchema.nullable(), row, 'clubs.getClubTrainingFocus');
  const focus = parsed?.training_focus as TrainingFocus | undefined;
  return focus && VALID_FOCI.includes(focus) ? focus : 'balanced';
}

export async function setClubTrainingFocus(
  db: DbHandle,
  clubId: number,
  focus: TrainingFocus,
): Promise<void> {
  await db.prepare('UPDATE clubs SET training_focus = ? WHERE id = ?').run(focus, clubId);
}

export async function getClubCountryCode(db: DbHandle, clubId: number): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT countries.code AS code
         FROM clubs
         JOIN leagues ON clubs.league_id = leagues.id
         JOIN countries ON leagues.country_id = countries.id
        WHERE clubs.id = ?`,
    )
    .get(clubId);
  const parsed = parseRow(countryCodeRowSchema.nullable(), row, 'clubs.getClubCountryCode');
  return parsed?.code ?? null;
}
