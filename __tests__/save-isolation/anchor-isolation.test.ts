import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createTestDbHandle, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { saveOffset } from '@/database/constants';
import { getPlayersByClub, updatePlayerMorale } from '@/database/queries/players';
import { updateClubBudget, getClubById } from '@/database/queries/clubs';
import { deleteSave } from '@/database/queries/saves';

describe('ANCHOR: playing save A never mutates save B', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof createTestDbHandle>;
  const data = generateSeedData(42);
  const club = data.clubs[0];

  beforeEach(() => {
    raw = new Database(':memory:');
    raw.pragma('foreign_keys = OFF'); // circular world FK; seeding runs FK-off
    createAllTables(raw);
    db = createTestDbHandle(raw);
    seedReferenceTables(raw, data);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + club.id);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + club.id);
    seedWorldForSave(raw, data, 1);
    seedWorldForSave(raw, data, 2);
  });
  afterEach(() => raw.close());

  it('budget/morale changes in A leave B identical', async () => {
    const clubA = saveOffset(1) + club.id;
    const clubB = saveOffset(2) + club.id;
    const bBefore = await getPlayersByClub(db, 2, clubB);

    await updateClubBudget(db, 1, clubA, 999);
    const aPlayers = await getPlayersByClub(db, 1, clubA);
    await updatePlayerMorale(db, 1, aPlayers[0].id, 1);

    const bAfter = await getPlayersByClub(db, 2, clubB);
    expect(bAfter).toEqual(bBefore);
    expect((await getClubById(db, 2, clubB))?.budget).not.toBe(999);
  });

  it('deleting B does not touch A', async () => {
    const aBefore = (raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id=1').get() as { c: number }).c;
    await deleteSave(db, 2);
    expect((raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id=1').get() as { c: number }).c).toBe(aBefore);
    expect((raw.prepare('SELECT COUNT(*) c FROM players WHERE save_id=2').get() as { c: number }).c).toBe(0);
  });
});
