import Database from 'better-sqlite3';
import { createAllTables } from '@/database/schema';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { createTestDbHandle, seedReferenceTables, seedWorldForSave } from '../database/test-helpers';
import { saveOffset } from '@/database/constants';
import { getClubsByLeague, getClubById } from '@/database/queries/clubs';
import { getPlayersByClub } from '@/database/queries/players';
import { createFixture, getFixturesByWeek } from '@/database/queries/fixtures';

describe('scoped queries respect save_id', () => {
  let raw: Database.Database;
  let db: ReturnType<typeof createTestDbHandle>;
  const data = generateSeedData(42);
  const leagueId = data.leagues[0].id;
  const clubRaw = data.clubs.find((c) => c.leagueId === leagueId)!;

  beforeEach(() => {
    raw = new Database(':memory:');
    raw.pragma('foreign_keys = OFF'); // circular world FK; seeding runs FK-off (see seed-world.test)
    createAllTables(raw);
    db = createTestDbHandle(raw);
    seedReferenceTables(raw, data);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (1,'A',?, '', '')").run(saveOffset(1) + clubRaw.id);
    raw.prepare("INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (2,'B',?, '', '')").run(saveOffset(2) + clubRaw.id);
    seedWorldForSave(raw, data, 1);
    seedWorldForSave(raw, data, 2);
  });
  afterEach(() => raw.close());

  it('getClubsByLeague returns only the requested save', async () => {
    const a = await getClubsByLeague(db, 1, leagueId);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((c) => c.id >= saveOffset(1) && c.id < saveOffset(2))).toBe(true);
  });

  it('getPlayersByClub of save 1 is unaffected by save 2', async () => {
    const clubId1 = clubRaw.id + saveOffset(1);
    const before = await getPlayersByClub(db, 1, clubId1);
    // mutate save 2 squad: move one of save-2 players to free agency
    raw.prepare('UPDATE players SET club_id = NULL WHERE save_id = 2').run();
    const after = await getPlayersByClub(db, 1, clubId1);
    expect(after.length).toBe(before.length);
  });

  it('getFixturesByWeek is scoped; creating a fixture in save 1 is invisible to save 2', async () => {
    const clubId1 = clubRaw.id + saveOffset(1);
    const other1 = (data.clubs.find((c) => c.leagueId === leagueId && c.id !== clubRaw.id)!).id + saveOffset(1);
    await createFixture(db, 1, { id: saveOffset(1) + 1, competitionId: saveOffset(1) + 1, season: 1, week: 1, homeClubId: clubId1, awayClubId: other1 });
    expect((await getFixturesByWeek(db, 1, 1, 1)).length).toBe(1);
    expect((await getFixturesByWeek(db, 2, 1, 1)).length).toBe(0);
  });

  it('getClubById is scoped to the save', async () => {
    const c = await getClubById(db, 1, clubRaw.id + saveOffset(1));
    expect(c).not.toBeNull();
    expect(await getClubById(db, 2, clubRaw.id + saveOffset(1))).toBeNull();
  });
});
