import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { processSeasonEndBoard } from '@/engine/board/season-end-board';
import { getBoardObjective } from '@/database/queries/board';

describe('processSeasonEndBoard', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const CLUB = 1;
  const ENDED = 1;
  const NEW = 2;
  let saveId: number;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const res = await db
      .prepare("INSERT INTO save_games (name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES ('t', ?, 1, ?, 'normal', 50, '2026-01-01', '2026-01-01')")
      .run(NEW, CLUB);
    saveId = Number((res as { lastInsertRowid: number | bigint }).lastInsertRowid);
  });

  afterEach(() => rawDb.close());

  it('persists a new objective for the new season (covers the null-objective loop regression)', async () => {
    expect(await getBoardObjective(db, saveId, CLUB, NEW)).toBeNull();
    const result = await processSeasonEndBoard({
      dbHandle: db, clubId: CLUB, saveId, endedSeason: ENDED, newSeason: NEW,
      leaguePosition: 5, totalTeams: 20, currentReputation: 60, budgetBalance: 1_000_000,
      wasRelegated: false, wasPromoted: false, wonLeague: false, wonCup: false,
    });
    expect(result.newObjective).not.toBeNull();
    expect(await getBoardObjective(db, saveId, CLUB, NEW)).not.toBeNull();
  });

  it('applies a budget cut (~20%) when the consequence is budget_cut', async () => {
    const before = ((await db.prepare('SELECT budget FROM clubs WHERE id = ?').get(CLUB)) as { budget: number }).budget;
    await db.prepare('UPDATE save_games SET board_trust = 25 WHERE id = ?').run(saveId);
    const result = await processSeasonEndBoard({
      dbHandle: db, clubId: CLUB, saveId, endedSeason: ENDED, newSeason: NEW,
      leaguePosition: 20, totalTeams: 20, currentReputation: 60, budgetBalance: -500_000,
      wasRelegated: true, wasPromoted: false, wonLeague: false, wonCup: false,
    });
    const after = ((await db.prepare('SELECT budget FROM clubs WHERE id = ?').get(CLUB)) as { budget: number }).budget;
    if (result.consequence === 'budget_cut') {
      expect(after).toBe(Math.trunc(before * 0.8));
    } else if (result.consequence === 'budget_bonus') {
      expect(after).toBe(Math.trunc(before * 1.1));
    } else {
      expect(after).toBe(before);
    }
  });

  it('records the ended season in reputation history', async () => {
    const result = await processSeasonEndBoard({
      dbHandle: db, clubId: CLUB, saveId, endedSeason: ENDED, newSeason: NEW,
      leaguePosition: 3, totalTeams: 20, currentReputation: 60, budgetBalance: 200_000,
      wasRelegated: false, wasPromoted: false, wonLeague: false, wonCup: false,
    });
    expect(result.reputationHistory.some(h => h.season === ENDED)).toBe(true);
  });
});
