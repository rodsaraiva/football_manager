import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../test-helpers';
import { DbHandle } from '../../../src/database/queries/players';
import {
  getSeasonSummary,
  getCompetitionHistory,
  getClubTrophies,
  getPlayerAwards,
  getPlayerTitles,
} from '../../../src/database/queries/history';

describe('history queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);

    // Seed two competitions so the JOIN to competitions.name returns something.
    rawDb.prepare(
      `INSERT INTO competitions (id, name, type, format, season, league_id)
       VALUES (1, 'Premier League', 'league', 'round_robin', 1, 1),
              (2, 'FA Cup',          'cup',    'knockout',    1, NULL)`,
    ).run();

    // Archived seasons 1 and 2 manually.
    rawDb.prepare(
      `INSERT INTO season_competition_results (season, competition_id, champion_club_id, runner_up_club_id)
       VALUES (1, 1, 1, 2), (2, 1, 2, 1), (1, 2, 3, 4)`,
    ).run();
    rawDb.prepare(
      `INSERT INTO season_relegated (season, league_id, club_id, final_position)
       VALUES (1, 1, 10, 18), (1, 1, 11, 19), (1, 1, 12, 20)`,
    ).run();
    rawDb.prepare(
      `INSERT INTO season_awards (season, competition_id, award_type, rank, player_id, club_id, value)
       VALUES
         (1, 1, 'top_scorer', 1, 100, 1, 25),
         (1, 1, 'top_scorer', 2, 101, 2, 22),
         (1, 1, 'mvp',        1, 100, 1, 8.4),
         (2, 1, 'top_scorer', 1, 100, 2, 19)`,
    ).run();
    rawDb.prepare(
      `INSERT INTO season_player_titles (season, competition_id, club_id, player_id)
       VALUES (1, 1, 1, 100), (2, 1, 2, 100), (1, 2, 3, 200)`,
    ).run();
  });

  afterEach(() => {
    rawDb.close();
  });

  it('getSeasonSummary returns competitions with champion, runner-up, relegated, awards', async () => {
    const summary = await getSeasonSummary(db, 1);
    expect(summary.length).toBeGreaterThanOrEqual(2);
    const liga = summary.find((s) => s.competitionId === 1)!;
    expect(liga.championClubId).toBe(1);
    expect(liga.runnerUpClubId).toBe(2);
    expect(liga.relegated.map((r) => r.clubId).sort()).toEqual([10, 11, 12]);
    expect(liga.topScorers[0].playerId).toBe(100);
    expect(liga.mvp?.playerId).toBe(100);
  });

  it('getCompetitionHistory lists champions by season ascending', async () => {
    const history = await getCompetitionHistory(db, 1);
    expect(history.map((h) => h.season)).toEqual([1, 2]);
    expect(history[0].championClubId).toBe(1);
    expect(history[1].championClubId).toBe(2);
  });

  it('getClubTrophies aggregates titles and runner-ups per competition', async () => {
    const trophies = await getClubTrophies(db, 1);
    const liga = trophies.find((t) => t.competitionId === 1)!;
    expect(liga.titles).toBe(1);
    expect(liga.runnerUps).toBe(1);
    expect(liga.titleYears).toEqual([1]);
    expect(liga.runnerUpYears).toEqual([2]);
  });

  it('getPlayerAwards returns all awards of a player chronologically', async () => {
    const awards = await getPlayerAwards(db, 100);
    expect(awards.length).toBe(3);
    // ensure order: seasons non-decreasing
    for (let i = 1; i < awards.length; i++) {
      expect(awards[i].season).toBeGreaterThanOrEqual(awards[i - 1].season);
    }
  });

  it('getPlayerTitles returns titles snapshotted for the player', async () => {
    const titles = await getPlayerTitles(db, 100);
    expect(titles.length).toBe(2);
    expect(titles.map((t) => ({ season: t.season, clubId: t.clubId }))).toEqual([
      { season: 1, clubId: 1 },
      { season: 2, clubId: 2 },
    ]);
  });
});
