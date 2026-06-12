import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getClubTrainingFocus } from '@/database/queries/clubs';
import { useTrainingStore, setTrainingFocus, loadTrainingFocus } from '@/store/training-store';

const S = TEST_SAVE_ID;

function seedClub(db: Database.Database) {
  db.pragma('foreign_keys = OFF');
  db.prepare(`INSERT INTO countries (id,name,code,continent) VALUES (1,'Brazil','BR','SA')`).run();
  db.prepare(`INSERT INTO leagues (id,name,country_id,division_level,num_teams,promotion_spots,relegation_spots) VALUES (1,'A',1,1,20,0,4)`).run();
  db.prepare(
    `INSERT INTO clubs (id,save_id,name,short_name,country_id,league_id,reputation,budget,wage_budget,stadium_name,stadium_capacity,training_facilities,youth_academy,medical_department,primary_color,secondary_color)
     VALUES (1,?,'C','C',1,1,50,0,0,'S',1000,3,3,3,'#000','#fff')`,
  ).run(S);
}

describe('training store', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    seedClub(rawDb);
    db = createTestDbHandle(rawDb);
    useTrainingStore.setState({ focus: 'balanced' });
  });
  afterEach(() => rawDb.close());

  it('setTrainingFocus updates the store and persists to the club', async () => {
    await setTrainingFocus(db, 1, 'physical');
    expect(useTrainingStore.getState().focus).toBe('physical');
    expect(await getClubTrainingFocus(db, 1)).toBe('physical');
  });

  it('loadTrainingFocus reads the persisted value into the store', async () => {
    await setTrainingFocus(db, 1, 'technical');
    useTrainingStore.setState({ focus: 'balanced' });
    await loadTrainingFocus(db, 1);
    expect(useTrainingStore.getState().focus).toBe('technical');
  });
});
