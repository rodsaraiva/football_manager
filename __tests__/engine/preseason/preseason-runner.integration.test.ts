import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { createFriendly, getFriendliesBySeason } from '@/database/queries/friendlies';
import { getFinancesBySeason } from '@/database/queries/finances';
import { getPlayersByClub } from '@/database/queries/players';
import { playFriendly } from '@/engine/preseason/preseason-runner';

describe('playFriendly (integration)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const SAVE_ID = TEST_SAVE_ID;
  const SEASON = 1;
  // seed creates real clubs with ids 1..N and squads; player club = 1.
  const PLAYER_CLUB = 1;
  const OPPONENT = 2;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  async function setup() {
    const friendlyId = await createFriendly(db, SAVE_ID, {
      season: SEASON,
      homeClubId: PLAYER_CLUB,
      awayClubId: OPPONENT,
    });
    return friendlyId;
  }

  it('persists a played result on the friendly row', async () => {
    const id = await setup();
    await playFriendly({
      dbHandle: db,
      saveId: SAVE_ID,
      season: SEASON,
      friendlyId: id,
      playerClubId: PLAYER_CLUB,
      rng: new SeededRng(123),
    });
    const [f] = await getFriendliesBySeason(db, SAVE_ID, SEASON);
    expect(f.played).toBe(true);
    expect(f.homeGoals).not.toBeNull();
    expect(f.awayGoals).not.toBeNull();
  });

  it('records a ticket revenue finance entry for the home club', async () => {
    const id = await setup();
    await playFriendly({
      dbHandle: db,
      saveId: SAVE_ID,
      season: SEASON,
      friendlyId: id,
      playerClubId: PLAYER_CLUB,
      rng: new SeededRng(123),
    });
    const finances = await getFinancesBySeason(db, SAVE_ID, PLAYER_CLUB, SEASON);
    const ticket = finances.filter((e) => e.type === 'ticket');
    expect(ticket.length).toBe(1);
    expect(ticket[0].amount).toBeGreaterThan(0);
  });

  it('does NOT create any official fixture', async () => {
    const id = await setup();
    await playFriendly({
      dbHandle: db,
      saveId: SAVE_ID,
      season: SEASON,
      friendlyId: id,
      playerClubId: PLAYER_CLUB,
      rng: new SeededRng(123),
    });
    const fixtureCount = rawDb
      .prepare('SELECT COUNT(*) AS c FROM fixtures WHERE save_id = ?')
      .get(SAVE_ID) as { c: number };
    expect(fixtureCount.c).toBe(0);
  });

  it('gives a small fitness boost to the player squad and never exceeds 100', async () => {
    const id = await setup();
    // Force a known low fitness so we can observe the gain.
    rawDb.prepare('UPDATE players SET fitness = 70 WHERE save_id = ? AND club_id = ?').run(SAVE_ID, PLAYER_CLUB);
    await playFriendly({
      dbHandle: db,
      saveId: SAVE_ID,
      season: SEASON,
      friendlyId: id,
      playerClubId: PLAYER_CLUB,
      rng: new SeededRng(123),
    });
    const squad = await getPlayersByClub(db, SAVE_ID, PLAYER_CLUB);
    for (const p of squad) {
      expect(p.fitness).toBeGreaterThanOrEqual(70); // never drops
      expect(p.fitness).toBeLessThanOrEqual(100);
    }
    // at least the starting XI should have gained
    const gained = squad.filter((p) => p.fitness > 70);
    expect(gained.length).toBeGreaterThan(0);
  });

  it('returns the match result so the UI can show the score', async () => {
    const id = await setup();
    const out = await playFriendly({
      dbHandle: db,
      saveId: SAVE_ID,
      season: SEASON,
      friendlyId: id,
      playerClubId: PLAYER_CLUB,
      rng: new SeededRng(123),
    });
    expect(out.result.homeGoals).toBeGreaterThanOrEqual(0);
    expect(out.result.awayGoals).toBeGreaterThanOrEqual(0);
    expect(typeof out.isHome).toBe('boolean');
  });
});
