import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import {
  upsertManagerCareerEntry, setManagerExitReason, getManagerCareer,
  upsertRivalry, getRivalry, getRivalries,
  replaceClubLegends, getClubLegends, replaceClubRecords, getClubRecords,
} from '../../../src/database/queries/legacy';

describe('legacy queries', () => {
  let rawDb: Database.Database; let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb);
    rawDb.pragma('foreign_keys = OFF');
  });
  afterEach(() => rawDb.close());

  it('manager_career: upsert, sobrescreve exit_reason, ordena por temporada', async () => {
    await upsertManagerCareerEntry(db, 1, { season: 1, clubId: 1, divisionLevel: 1, leaguePosition: 3, totalTeams: 20, trophies: 1, managerReputation: 55, exitReason: 'stayed' });
    await upsertManagerCareerEntry(db, 1, { season: 2, clubId: 1, divisionLevel: 1, leaguePosition: 1, totalTeams: 20, trophies: 2, managerReputation: 70, exitReason: 'stayed' });
    await setManagerExitReason(db, 1, 1, 'resigned');
    const career = await getManagerCareer(db, 1);
    expect(career.map((e) => e.season)).toEqual([1, 2]);
    expect(career[0].exitReason).toBe('resigned');
    expect(career[1].trophies).toBe(2);
  });

  it('rivalries: upsert par canônico, getRivalry normaliza (a,b)/(b,a)', async () => {
    await upsertRivalry(db, 1, { clubAId: 2, clubBId: 5, intensity: 70, origin: 'division' });
    expect((await getRivalry(db, 1, 5, 2))?.intensity).toBe(70);
    expect((await getRivalry(db, 1, 2, 5))?.origin).toBe('division');
    await upsertRivalry(db, 1, { clubAId: 2, clubBId: 5, intensity: 85, origin: 'division' });
    expect((await getRivalry(db, 1, 2, 5))?.intensity).toBe(85);
    const list = await getRivalries(db, 1, 2);
    expect(list.some((r) => r.clubAId === 2 && r.clubBId === 5)).toBe(true);
  });

  it('legends/records: replace é idempotente (snapshot completo)', async () => {
    await replaceClubLegends(db, 1, 1, [
      { playerId: 100, clubId: 1, legendScore: 100, appearances: 200, goals: 90, trophies: 3, individualAwards: 2, firstSeason: 1, lastSeason: 5 },
    ]);
    await replaceClubLegends(db, 1, 1, [
      { playerId: 100, clubId: 1, legendScore: 100, appearances: 220, goals: 95, trophies: 3, individualAwards: 2, firstSeason: 1, lastSeason: 6 },
    ]);
    const legs = await getClubLegends(db, 1, 1);
    expect(legs).toHaveLength(1);
    expect(legs[0].appearances).toBe(220);

    await replaceClubRecords(db, 1, 1, [
      { type: 'all_time_top_scorer', clubId: 1, value: 90, holderId: 100, season: null, fixtureRef: null, detail: '' },
    ]);
    const recs = await getClubRecords(db, 1, 1);
    expect(recs[0].type).toBe('all_time_top_scorer');
    expect(recs[0].holderId).toBe(100);
  });

  it('save-isolation: save 2 não vê dados do save 1', async () => {
    await upsertRivalry(db, 1, { clubAId: 2, clubBId: 5, intensity: 70, origin: 'division' });
    expect(await getRivalry(db, 2, 2, 5)).toBeNull();
  });
});
