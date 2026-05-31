import { Club } from '@/types';
import { DbHandle } from './players';

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
  };
}

export async function getClubById(db: DbHandle, clubId: number): Promise<Club | null> {
  const row = await db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId) as ClubRow | undefined;
  return row ? rowToClub(row) : null;
}

export async function getClubsByLeague(db: DbHandle, leagueId: number): Promise<Club[]> {
  const rows = await db.prepare('SELECT * FROM clubs WHERE league_id = ?').all(leagueId) as ClubRow[];
  return rows.map(rowToClub);
}

export async function getAllClubs(db: DbHandle): Promise<Club[]> {
  const rows = await db.prepare('SELECT * FROM clubs').all() as ClubRow[];
  return rows.map(rowToClub);
}

export async function updateClubBudget(db: DbHandle, clubId: number, budget: number): Promise<void> {
  await db.prepare('UPDATE clubs SET budget = ? WHERE id = ?').run(budget, clubId);
}

export interface ClubWithDivision extends Club {
  divisionLevel: number;
}

export async function getClubsByCountry(
  db: DbHandle,
  countryId: number,
): Promise<ClubWithDivision[]> {
  const rows = (await db
    .prepare(
      `SELECT clubs.*, leagues.division_level AS division_level
       FROM clubs JOIN leagues ON clubs.league_id = leagues.id
       WHERE leagues.country_id = ?`,
    )
    .all(countryId)) as Array<ClubRow & { division_level: number }>;
  return rows.map((r) => ({ ...rowToClub(r), divisionLevel: r.division_level }));
}

export async function updateClubReputation(db: DbHandle, clubId: number, reputation: number): Promise<void> {
  await db.prepare('UPDATE clubs SET reputation = ? WHERE id = ?').run(reputation, clubId);
}
