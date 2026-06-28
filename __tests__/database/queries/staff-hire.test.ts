import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../test-helpers';
import { DbHandle } from '@/database/queries/players';
import { getStaffByClub, hireStaff, fireStaff } from '@/database/queries/staff';

describe('staff hire/fire queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const clubId = 1;

  beforeAll(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });

  afterAll(() => {
    rawDb.close();
  });

  it('hireStaff insere e fireStaff remove', async () => {
    const before = await getStaffByClub(db, TEST_SAVE_ID, clubId);

    const id = await hireStaff(db, TEST_SAVE_ID, clubId, {
      name: 'Test Scout',
      role: 'scout',
      ability: 14,
      wage: 3500,
    });

    const after = await getStaffByClub(db, TEST_SAVE_ID, clubId);
    expect(after).toHaveLength(before.length + 1);
    const hired = after.find((s) => s.id === id);
    expect(hired).toBeDefined();
    expect(hired!.role).toBe('scout');
    expect(hired!.name).toBe('Test Scout');
    expect(hired!.ability).toBe(14);
    expect(hired!.wage).toBe(3500);
    expect(hired!.clubId).toBe(clubId);
    expect(hired!.contractEnd).toBeGreaterThan(0);

    await fireStaff(db, TEST_SAVE_ID, id);

    const afterFire = await getStaffByClub(db, TEST_SAVE_ID, clubId);
    expect(afterFire.some((s) => s.id === id)).toBe(false);
    expect(afterFire).toHaveLength(before.length);
  });

  it('fireStaff respeita save isolation (não remove staff de outro save)', async () => {
    const id = await hireStaff(db, TEST_SAVE_ID, clubId, {
      name: 'Isolated Physio',
      role: 'physio',
      ability: 12,
      wage: 3000,
    });

    await fireStaff(db, TEST_SAVE_ID + 999, id);

    const after = await getStaffByClub(db, TEST_SAVE_ID, clubId);
    expect(after.some((s) => s.id === id)).toBe(true);

    await fireStaff(db, TEST_SAVE_ID, id);
    const cleaned = await getStaffByClub(db, TEST_SAVE_ID, clubId);
    expect(cleaned.some((s) => s.id === id)).toBe(false);
  });

  it('getStaffByClub lê archetype quando presente', async () => {
    await db.prepare(
      `INSERT INTO staff (id, save_id, name, role, club_id, ability, wage, contract_end, archetype)
       VALUES (990501, ?, 'Olheiro Teste', 'scout', ?, 14, 3000, 9999, 'youth')`,
    ).run(TEST_SAVE_ID, clubId);
    const staff = await getStaffByClub(db, TEST_SAVE_ID, clubId);
    expect(staff.find((s) => s.id === 990501)?.archetype).toBe('youth');
    await fireStaff(db, TEST_SAVE_ID, 990501);
  });
});
