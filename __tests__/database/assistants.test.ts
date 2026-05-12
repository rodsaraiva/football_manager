import { createTestDb, createTestDbHandle, seedTestDb } from './test-helpers';
import {
  insertAssistant,
  getAssistantsBySave,
  getAssistantByRole,
  updateAssistantSeasonEnd,
  deleteAssistant,
  dismissAssistant,
} from '@/database/queries/assistants';
import { GeneratedAssistant } from '@/engine/assistant/assistant-engine';

function makeDb() {
  const db = createTestDb();
  seedTestDb(db);
  // Insert a save_games row for tests
  db.prepare(
    `INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 'Test Save', 1, 1, 1, 'normal', '2026-01-01', '2026-01-01');
  return createTestDbHandle(db);
}

const baseGenerated: GeneratedAssistant = {
  role: 'squad',
  clubId: 1,
  saveId: 1,
  name: 'Alan Bright',
  age: 45,
  archetype: 'analytics',
  seasonsAtClub: 0,
  retirementAge: 65,
  wagePerMonth: 8000,
  willRetireNextSeason: false,
};

describe('insertAssistant + getAssistantsBySave', () => {
  it('inserts and retrieves a round-trip correctly', async () => {
    const db = makeDb();
    const id = await insertAssistant(db, baseGenerated);
    expect(id).toBeGreaterThan(0);

    const assistants = await getAssistantsBySave(db, 1);
    expect(assistants).toHaveLength(1);
    const a = assistants[0];
    expect(a.id).toBe(id);
    expect(a.role).toBe('squad');
    expect(a.name).toBe('Alan Bright');
    expect(a.age).toBe(45);
    expect(a.archetype).toBe('analytics');
    expect(a.seasonsAtClub).toBe(0);
    expect(a.retirementAge).toBe(65);
    expect(a.wagePerMonth).toBe(8000);
    expect(a.willRetireNextSeason).toBe(false);
    expect(a.clubId).toBe(1);
    expect(a.saveId).toBe(1);
  });

  it('computes qualityStars from seasonsAtClub on read', async () => {
    const db = makeDb();
    await insertAssistant(db, { ...baseGenerated, seasonsAtClub: 0 });
    const [a] = await getAssistantsBySave(db, 1);
    expect(a.qualityStars).toBe(1);
  });

  it('returns empty array when no assistants for save', async () => {
    const db = makeDb();
    const result = await getAssistantsBySave(db, 999);
    expect(result).toHaveLength(0);
  });

  it('only returns assistants for the given saveId', async () => {
    const db = createTestDb();
    seedTestDb(db);
    db.prepare(
      `INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ).run(1, 'Save 1', 1, 1, 1, 'normal', '2026-01-01', '2026-01-01');
    db.prepare(
      `INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ).run(2, 'Save 2', 1, 1, 1, 'normal', '2026-01-01', '2026-01-01');
    const handle = createTestDbHandle(db);

    await insertAssistant(handle, { ...baseGenerated, saveId: 1 });
    await insertAssistant(handle, { ...baseGenerated, role: 'financial', saveId: 2 });

    const save1 = await getAssistantsBySave(handle, 1);
    const save2 = await getAssistantsBySave(handle, 2);
    expect(save1).toHaveLength(1);
    expect(save2).toHaveLength(1);
    expect(save1[0].role).toBe('squad');
    expect(save2[0].role).toBe('financial');
  });
});

describe('getAssistantByRole', () => {
  it('returns null when role does not exist', async () => {
    const db = makeDb();
    const result = await getAssistantByRole(db, 1, 'financial');
    expect(result).toBeNull();
  });

  it('returns correct assistant for given role', async () => {
    const db = makeDb();
    await insertAssistant(db, baseGenerated); // squad
    await insertAssistant(db, { ...baseGenerated, role: 'financial', name: 'Marco Ricci' });

    const squad = await getAssistantByRole(db, 1, 'squad');
    const financial = await getAssistantByRole(db, 1, 'financial');
    expect(squad?.name).toBe('Alan Bright');
    expect(financial?.name).toBe('Marco Ricci');
  });
});

describe('updateAssistantSeasonEnd', () => {
  it('persists new age, seasonsAtClub, and willRetireNextSeason', async () => {
    const db = makeDb();
    const id = await insertAssistant(db, baseGenerated);

    await updateAssistantSeasonEnd(db, id, 46, 1, true);

    const [a] = await getAssistantsBySave(db, 1);
    expect(a.age).toBe(46);
    expect(a.seasonsAtClub).toBe(1);
    expect(a.willRetireNextSeason).toBe(true);
  });

  it('updates qualityStars derived from new seasonsAtClub', async () => {
    const db = makeDb();
    const id = await insertAssistant(db, baseGenerated);

    await updateAssistantSeasonEnd(db, id, 46, 2, false);

    const [a] = await getAssistantsBySave(db, 1);
    expect(a.qualityStars).toBe(2);
  });
});

describe('deleteAssistant', () => {
  it('removes the assistant from the table', async () => {
    const db = makeDb();
    const id = await insertAssistant(db, baseGenerated);
    await deleteAssistant(db, id);
    const all = await getAssistantsBySave(db, 1);
    expect(all).toHaveLength(0);
  });
});

describe('dismissAssistant', () => {
  it('removes the assistant (same as delete)', async () => {
    const db = makeDb();
    const id = await insertAssistant(db, baseGenerated);
    await dismissAssistant(db, id);
    const all = await getAssistantsBySave(db, 1);
    expect(all).toHaveLength(0);
  });
});
