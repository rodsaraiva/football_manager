import { useGameStore } from '@/store/game-store';
import { SaveGame } from '@/types';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import Database from 'better-sqlite3';
import { DbHandle } from '@/database/queries/players';

function mkSave(o: Partial<SaveGame> = {}): SaveGame {
  return {
    id: o.id ?? 1, name: o.name ?? 'S', currentSeason: o.currentSeason ?? 2,
    currentWeek: o.currentWeek ?? 7, playerClubId: o.playerClubId ?? 10,
    difficulty: o.difficulty ?? 'normal',
    preseasonPending: o.preseasonPending ?? false, pressPending: o.pressPending ?? false,
    jobOffersPending: o.jobOffersPending ?? false, unemployed: o.unemployed ?? false,
    managerReputation: o.managerReputation ?? 62, onboardingSeen: o.onboardingSeen ?? true,
    createdAt: '', updatedAt: '',
  };
}

describe('game-store', () => {
  beforeEach(() => {
    useGameStore.getState().clearGame();
  });

  it('startNewGame popula currentSave/derivados e zera carreira', () => {
    useGameStore.getState().startNewGame(5, 33, 1, 1);
    const s = useGameStore.getState();
    expect(s.currentSave?.id).toBe(5);
    expect(s.playerClubId).toBe(33);
    expect(s.season).toBe(1);
    expect(s.week).toBe(1);
    expect(s.managerReputation).toBe(50);
    expect(s.unemployed).toBe(false);
  });

  it('loadSave hidrata season/week/playerClubId e flags de carreira do save', () => {
    useGameStore.getState().loadSave(mkSave({ id: 9, playerClubId: 21, currentSeason: 3, currentWeek: 12, managerReputation: 80 }));
    const s = useGameStore.getState();
    expect(s.currentSave?.id).toBe(9);
    expect(s.playerClubId).toBe(21);
    expect(s.season).toBe(3);
    expect(s.week).toBe(12);
    expect(s.managerReputation).toBe(80);
    // loadSave reseta dados voláteis
    expect(s.recentResults).toEqual([]);
    expect(s.playerClub).toBeNull();
    expect(s.lastMatchResult).toBeNull();
  });

  it('clearGame volta ao estado inicial', () => {
    useGameStore.getState().loadSave(mkSave({ id: 9 }));
    useGameStore.getState().clearGame();
    const s = useGameStore.getState();
    expect(s.currentSave).toBeNull();
    expect(s.playerClubId).toBeNull();
    expect(s.season).toBe(1);
    expect(s.unreadNewsCount).toBe(0);
  });

  it('setters atualizam slices isoladamente', () => {
    const g = useGameStore.getState();
    g.setAdvancing(true);
    g.updateWeek(4, 9);
    g.setUnreadNewsCount(3);
    const s = useGameStore.getState();
    expect(s.isAdvancing).toBe(true);
    expect(s.season).toBe(4);
    expect(s.week).toBe(9);
    expect(s.unreadNewsCount).toBe(3);
  });
});

describe('game-store refreshUnreadNewsCount (DB real)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    useGameStore.getState().clearGame();
  });
  afterEach(() => rawDb.close());

  it('sem currentSave não lança e mantém contador 0', async () => {
    await useGameStore.getState().refreshUnreadNewsCount(db);
    expect(useGameStore.getState().unreadNewsCount).toBe(0);
  });

  it('com currentSave lê countUnread do DB (save vazio = 0)', async () => {
    useGameStore.getState().startNewGame(TEST_SAVE_ID, 10, 1, 1);
    await useGameStore.getState().refreshUnreadNewsCount(db);
    expect(useGameStore.getState().unreadNewsCount).toBe(0); // sem news inseridas
  });
});
