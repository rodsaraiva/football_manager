import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  getClubTrainingFocus,
  setClubTrainingFocus,
  getClubCountryCode,
  getClubById,
} from '@/database/queries/clubs';

const S = TEST_SAVE_ID;

function seedClub(db: Database.Database, id: number, countryId: number) {
  db.pragma('foreign_keys = OFF');
  db.prepare(
    `INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)`,
  ).run(countryId, 'Brazil', 'BR', 'South America');
  db.prepare(
    `INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 'Serie A', countryId, 1, 20, 0, 4);
  db.prepare(
    `INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget,
      wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy,
      medical_department, primary_color, secondary_color)
     VALUES (?, ?, 'C','C', ?, 1, 50, 0, 0, 'S', 1000, 3, 3, 3, '#000', '#fff')`,
  ).run(id, S, countryId);
}

describe('club training focus + country code', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    seedClub(rawDb, 1, 100);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('defaults to balanced for a fresh club', async () => {
    expect(await getClubTrainingFocus(db, 1)).toBe('balanced');
  });

  it('sets and reads a focus', async () => {
    await setClubTrainingFocus(db, 1, 'physical');
    expect(await getClubTrainingFocus(db, 1)).toBe('physical');
  });

  it('falls back to balanced for an unknown club id', async () => {
    expect(await getClubTrainingFocus(db, 999)).toBe('balanced');
  });

  it('exposes training_focus on the Club object', async () => {
    await setClubTrainingFocus(db, 1, 'technical');
    const club = await getClubById(db, S, 1);
    expect(club?.trainingFocus).toBe('technical');
  });

  it('derives the club country code via its league', async () => {
    expect(await getClubCountryCode(db, 1)).toBe('BR');
  });

  it('returns null country code for an unknown club', async () => {
    expect(await getClubCountryCode(db, 999)).toBeNull();
  });
});
