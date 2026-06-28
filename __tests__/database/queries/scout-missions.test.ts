import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  createMission,
  getActiveMissions,
  getMissionsByScout,
  setMissionWeeks,
  completeMission,
  cancelMission,
  getCompletedIntelForClub,
} from '@/database/queries/scout-missions';

describe('scout-missions queries (SQLite real)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const SAVE = TEST_SAVE_ID;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  it('create → getActive → complete', async () => {
    const id = await createMission(db, SAVE, {
      scoutId: 10, type: 'short_eval', targetPlayerId: 200,
      targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 3,
    });
    expect(id).toBeGreaterThan(0);
    const active = await getActiveMissions(db, SAVE);
    expect(active.some((m) => m.id === id && m.type === 'short_eval' && m.targetPlayerId === 200)).toBe(true);
    await completeMission(db, SAVE, id, 'completed');
    const after = await getActiveMissions(db, SAVE);
    expect(after.some((m) => m.id === id)).toBe(false);
  });

  it('save-isolation: missão do save A não aparece no save B', async () => {
    const id = await createMission(db, SAVE, {
      scoutId: 1, type: 'long_project', targetPlayerId: 5,
      targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1,
    });
    const otherSave = await getActiveMissions(db, SAVE + 999);
    expect(otherSave.some((m) => m.id === id)).toBe(false);
  });

  it('getMissionsByScout filtra por olheiro', async () => {
    await createMission(db, SAVE, { scoutId: 7, type: 'short_eval', targetPlayerId: 1, targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1 });
    await createMission(db, SAVE, { scoutId: 8, type: 'short_eval', targetPlayerId: 2, targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1 });
    const m7 = await getMissionsByScout(db, SAVE, 7);
    expect(m7).toHaveLength(1);
    expect(m7[0].scoutId).toBe(7);
  });

  it('setMissionWeeks atualiza progresso; cancel marca expired e some do active', async () => {
    const id = await createMission(db, SAVE, { scoutId: 3, type: 'long_project', targetPlayerId: 9, targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1 });
    await setMissionWeeks(db, SAVE, id, 4);
    const active = await getActiveMissions(db, SAVE);
    expect(active.find((m) => m.id === id)?.weeksElapsed).toBe(4);
    await cancelMission(db, SAVE, id);
    expect((await getActiveMissions(db, SAVE)).some((m) => m.id === id)).toBe(false);
  });

  it('getCompletedIntelForClub true só após opponent_intel concluído', async () => {
    expect(await getCompletedIntelForClub(db, SAVE, 99)).toBe(false);
    const id = await createMission(db, SAVE, { scoutId: 2, type: 'opponent_intel', targetPlayerId: null, targetClubId: 99, regionCode: null, createdSeason: 1, createdWeek: 1 });
    await completeMission(db, SAVE, id, 'completed');
    expect(await getCompletedIntelForClub(db, SAVE, 99)).toBe(true);
  });
});
