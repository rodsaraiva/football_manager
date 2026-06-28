import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb } from '../database/test-helpers';
import { DbHandle } from '../../src/database/queries/players';
import { archiveLegacy, bootstrapRivalries } from '../../src/engine/legacy/legacy-archiver';
import { getClubLegends, getClubRecords, getRivalries } from '../../src/database/queries/legacy';

const CLUB = 1;

function seedArchivedSeason(rawDb: Database.Database) {
  rawDb.pragma('foreign_keys = OFF');
  rawDb.prepare(`INSERT INTO competitions (id, save_id, name, type, format, season, league_id)
                 VALUES (9001, 1, 'League', 'league', 'round_robin', 1, 1)`).run();
  rawDb.prepare(`INSERT INTO fixtures (id, save_id, competition_id, season, week, home_club_id, away_club_id, home_goals, away_goals, played)
                 VALUES (9001,1,9001,1,1,1,12,5,0,1),(9002,1,9001,1,2,13,1,2,0,1)`).run();
  rawDb.prepare(`INSERT INTO match_events (fixture_id, minute, type, player_id, secondary_player_id)
                 VALUES (9001,10,'goal',100,NULL),(9001,20,'goal',100,NULL)`).run();
  rawDb.prepare(`INSERT INTO player_stats (save_id, player_id, season, competition_id, appearances, goals, assists)
                 VALUES (1,100,1,9001,2,2,0)`).run();
  rawDb.prepare(`UPDATE players SET club_id = 1 WHERE id = 100 AND save_id = 1`).run();
  rawDb.prepare(`INSERT INTO season_competition_results (save_id, season, competition_id, champion_club_id, runner_up_club_id)
                 VALUES (1,1,9001,1,2)`).run();
  rawDb.prepare(`INSERT INTO season_player_titles (save_id, season, competition_id, club_id, player_id)
                 VALUES (1,1,9001,1,100)`).run();
  rawDb.pragma('foreign_keys = ON');
}

describe('legacy-archiver (integração)', () => {
  let rawDb: Database.Database; let db: DbHandle;
  beforeEach(() => { rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb); seedArchivedSeason(rawDb); });
  afterEach(() => rawDb.close());

  it('materializa legends e records do clube e é idempotente', async () => {
    await archiveLegacy(db, 1, 1, CLUB);
    const legs1 = await getClubLegends(db, 1, CLUB);
    const recs1 = await getClubRecords(db, 1, CLUB);
    expect(legs1.some((l) => l.playerId === 100 && l.goals === 2)).toBe(true);
    expect(recs1.find((r) => r.type === 'biggest_win')?.value).toBe(5);
    await archiveLegacy(db, 1, 1, CLUB);
    const legs2 = await getClubLegends(db, 1, CLUB);
    expect(legs2).toEqual(legs1);
  });

  it('bootstrapRivalries é determinístico por saveId', async () => {
    await bootstrapRivalries(db, 1);
    const r1 = await getRivalries(db, 1, CLUB);
    await bootstrapRivalries(db, 1);
    const r2 = await getRivalries(db, 1, CLUB);
    expect(r2).toEqual(r1);
  });
});
