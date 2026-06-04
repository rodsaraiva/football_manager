import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { processAssistantsSeasonEnd } from '@/engine/assistant/season-end-assistants';
import { insertAssistant, getAssistantsBySave } from '@/database/queries/assistants';

describe('processAssistantsSeasonEnd', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let SAVE: number;
  const CLUB = 1;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    // assistants.save_id REFERENCES save_games(id) — with FK ON the parent save must exist.
    const res = await db
      .prepare("INSERT INTO save_games (name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES ('t', 1, 1, ?, 'normal', 50, '2026-01-01', '2026-01-01')")
      .run(CLUB);
    SAVE = Number((res as { lastInsertRowid: number | bigint }).lastInsertRowid);
  });

  afterEach(() => rawDb.close());

  it('ages survivors and deletes assistants past retirement age', async () => {
    // Survivor: age 50, retirementAge 70.
    await insertAssistant(db, { clubId: CLUB, saveId: SAVE, role: 'squad', name: 'Surv', age: 50, archetype: 'tactician', seasonsAtClub: 1, retirementAge: 70, wagePerMonth: 3000, willRetireNextSeason: false });
    // Retiree: age 70, retirementAge 70 → newAge 71 > 70 → retired.
    await insertAssistant(db, { clubId: CLUB, saveId: SAVE, role: 'youth', name: 'Old', age: 70, archetype: 'motivator', seasonsAtClub: 5, retirementAge: 70, wagePerMonth: 2500, willRetireNextSeason: false });

    const updated = await processAssistantsSeasonEnd(db, SAVE);

    expect(updated.find(a => a.name === 'Old')).toBeUndefined(); // retired/deleted
    const surv = updated.find(a => a.name === 'Surv');
    expect(surv).toBeDefined();
    expect(surv!.age).toBe(51);
    expect(surv!.seasonsAtClub).toBe(2);

    // The DB reflects the same.
    const fromDb = await getAssistantsBySave(db, SAVE);
    expect(fromDb).toHaveLength(1);
    expect(fromDb[0].name).toBe('Surv');
  });
});
