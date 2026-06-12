import { Club } from '@/types';
import { DbHandle } from './players';
import { TrainingFocus } from '@/engine/training/progression';

interface ClubRow {
  id: number;
  name: string;
  short_name: string;
  country_id: number;
  league_id: number;
  reputation: number;
  budget: number;
  wage_budget: number;
  stadium_name: string;
  stadium_capacity: number;
  training_facilities: number;
  youth_academy: number;
  medical_department: number;
  primary_color: string;
  secondary_color: string;
  training_focus: string;
}

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
  };
}

export async function getClubById(db: DbHandle, saveId: number, clubId: number): Promise<Club | null> {
  const row = await db.prepare('SELECT * FROM clubs WHERE save_id = ? AND id = ?').get(saveId, clubId) as ClubRow | undefined;
  return row ? rowToClub(row) : null;
}

export async function getClubsByLeague(db: DbHandle, saveId: number, leagueId: number): Promise<Club[]> {
  const rows = await db.prepare('SELECT * FROM clubs WHERE save_id = ? AND league_id = ?').all(saveId, leagueId) as ClubRow[];
  return rows.map(rowToClub);
}

export async function getAllClubs(db: DbHandle, saveId: number): Promise<Club[]> {
  const rows = await db.prepare('SELECT * FROM clubs WHERE save_id = ?').all(saveId) as ClubRow[];
  return rows.map(rowToClub);
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
  const rows = (await db
    .prepare(
      `SELECT clubs.*, leagues.division_level AS division_level
       FROM clubs JOIN leagues ON clubs.league_id = leagues.id
       WHERE clubs.save_id = ? AND leagues.country_id = ?`,
    )
    .all(saveId, countryId)) as Array<ClubRow & { division_level: number }>;
  return rows.map((r) => ({ ...rowToClub(r), divisionLevel: r.division_level }));
}

export async function updateClubReputation(db: DbHandle, saveId: number, clubId: number, reputation: number): Promise<void> {
  await db.prepare('UPDATE clubs SET reputation = ? WHERE save_id = ? AND id = ?').run(reputation, saveId, clubId);
}

const VALID_FOCI: TrainingFocus[] = ['technical', 'tactical', 'physical', 'balanced'];

// Club ids are globally unique (offset per save), so id alone scopes correctly.
export async function getClubTrainingFocus(db: DbHandle, clubId: number): Promise<TrainingFocus> {
  const row = (await db
    .prepare('SELECT training_focus FROM clubs WHERE id = ?')
    .get(clubId)) as { training_focus: string } | undefined;
  const focus = row?.training_focus as TrainingFocus | undefined;
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
  const row = (await db
    .prepare(
      `SELECT countries.code AS code
         FROM clubs
         JOIN leagues ON clubs.league_id = leagues.id
         JOIN countries ON leagues.country_id = countries.id
        WHERE clubs.id = ?`,
    )
    .get(clubId)) as { code: string } | undefined;
  return row?.code ?? null;
}
