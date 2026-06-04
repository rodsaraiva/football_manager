import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { rolloverSeason } from '@/engine/season-rollover';
import { getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry } from '@/database/queries/leagues';
import { createFixture, getFixturesByClub } from '@/database/queries/fixtures';

describe('rolloverSeason', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const PLAYER_CLUB = 1;
  const ENDED = 1;
  const NEW = 2;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);

    // Persist a season-1 calendar so getCompetitionsBySeason has data when needed.
    const leagues = await getAllLeagues(db);
    const clubsByLeague: Record<number, number[]> = {};
    for (const league of leagues) {
      const clubs = await getClubsByLeague(db, league.id);
      clubsByLeague[league.id] = clubs.map(c => c.id);
    }
    const calendar = generateSeasonCalendar({ season: ENDED, leagues, clubsByLeague, championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24] });
    for (const comp of calendar.competitions) {
      await createCompetition(db, { id: comp.id, name: comp.name, type: comp.type, format: comp.format, season: comp.season, leagueId: comp.leagueId });
    }
    for (const entry of calendar.entries) await addCompetitionEntry(db, entry);
    for (const f of calendar.fixtures) {
      await createFixture(db, { id: f.id, competitionId: f.competitionId, season: f.season, week: f.week, round: f.round as string | null, homeClubId: f.homeClubId, awayClubId: f.awayClubId });
    }
  });

  afterEach(() => rawDb.close());

  it('ages players in a club or free agents, not retirees', async () => {
    const active = (await db.prepare('SELECT id, age FROM players WHERE club_id = ? LIMIT 1').get(PLAYER_CLUB)) as { id: number; age: number };
    const retiree = (await db.prepare('SELECT id, age FROM players WHERE club_id IS NOT NULL AND id != ? LIMIT 1').get(active.id)) as { id: number; age: number };
    await db.prepare('UPDATE players SET club_id = NULL, is_free_agent = 0 WHERE id = ?').run(retiree.id);

    await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });

    const activeAfter = ((await db.prepare('SELECT age FROM players WHERE id = ?').get(active.id)) as { age: number }).age;
    const retireeAfter = ((await db.prepare('SELECT age FROM players WHERE id = ?').get(retiree.id)) as { age: number }).age;
    expect(activeAfter).toBe(active.age + 1); // active club player aged
    expect(retireeAfter).toBe(retiree.age);  // retiree did NOT age
  });

  it('expires contracts ending at or before the ended season', async () => {
    const p = (await db.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(PLAYER_CLUB)) as { id: number };
    await db.prepare('UPDATE players SET contract_end = ?, is_free_agent = 0 WHERE id = ?').run(ENDED, p.id);

    await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });

    const after = (await db.prepare('SELECT is_free_agent FROM players WHERE id = ?').get(p.id)) as { is_free_agent: number };
    expect(after.is_free_agent).toBe(1);
  });

  it('generates youth players attached to the player club with attributes', async () => {
    const result = await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });

    expect(result.youthGeneratedIds.length).toBeGreaterThan(0);
    for (const id of result.youthGeneratedIds) {
      const pl = (await db.prepare('SELECT club_id FROM players WHERE id = ?').get(id)) as { club_id: number };
      expect(pl.club_id).toBe(PLAYER_CLUB);
      const attr = (await db.prepare('SELECT player_id FROM player_attributes WHERE player_id = ?').get(id)) as { player_id: number } | undefined;
      expect(attr).toBeDefined();
    }
  });

  it('regenerates the calendar for the new season and is idempotent on retry', async () => {
    const r1 = await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });
    expect(r1.competitionsCreated).toBeGreaterThan(0);
    expect(r1.fixturesCreated).toBeGreaterThan(0);

    const newFixtures1 = (await getFixturesByClub(db, PLAYER_CLUB, NEW)).length;
    // Re-run: try/catch on existing rows means no duplicates.
    await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });
    const newFixtures2 = (await getFixturesByClub(db, PLAYER_CLUB, NEW)).length;
    expect(newFixtures2).toBe(newFixtures1);
  });

  it('does not crash when squad has no player_stats (potentialUpdatedIds empty)', async () => {
    await db.prepare('DELETE FROM player_stats').run();
    const result = await rolloverSeason({ dbHandle: db, playerClubId: PLAYER_CLUB, saveId: -1, endedSeason: ENDED, newSeason: NEW, youthAcademyLevel: 3, rng: new SeededRng(NEW) });
    expect(result.potentialUpdatedIds).toEqual([]);
  });
});
