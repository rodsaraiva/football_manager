import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { createCompetition } from '@/database/queries/leagues';
import { createFixture } from '@/database/queries/fixtures';
import { buildCupBracket } from '@/screens/league/cup-bracket';

const S = TEST_SAVE_ID;

describe('buildCupBracket', () => {
  let raw: Database.Database;
  let db: DbHandle;
  let clubs: { id: number; name: string }[];

  beforeEach(async () => {
    raw = createTestDb();
    seedTestDb(raw);
    db = createTestDbHandle(raw);
    clubs = raw.prepare('SELECT id, name FROM clubs ORDER BY id LIMIT 4').all() as { id: number; name: string }[];
    await createCompetition(db, S, { id: 200, name: 'Cup', type: 'cup', format: 'knockout', season: 1, leagueId: null });
    await createCompetition(db, S, { id: 100, name: 'League', type: 'league', format: 'round_robin', season: 1, leagueId: 1 });
    // two round-1 cup ties in week 3
    await createFixture(db, S, { id: 9001, competitionId: 200, season: 1, week: 3, round: '1', homeClubId: clubs[0].id, awayClubId: clubs[1].id });
    await createFixture(db, S, { id: 9002, competitionId: 200, season: 1, week: 3, round: '1', homeClubId: clubs[2].id, awayClubId: clubs[3].id });
    // a league fixture must NOT appear in the bracket
    await createFixture(db, S, { id: 9003, competitionId: 100, season: 1, week: 3, round: null, homeClubId: clubs[0].id, awayClubId: clubs[2].id });
  });
  afterEach(() => raw.close());

  it('groups cup fixtures by round with resolved club names', async () => {
    const bracket = await buildCupBracket(db, S, 1, 5, 200);
    expect(bracket).toHaveLength(1);
    expect(bracket[0].round).toBe(1);
    expect(bracket[0].ties).toEqual([
      { homeClubId: clubs[0].id, awayClubId: clubs[1].id, homeName: clubs[0].name, awayName: clubs[1].name, homeGoals: null, awayGoals: null },
      { homeClubId: clubs[2].id, awayClubId: clubs[3].id, homeName: clubs[2].name, awayName: clubs[3].name, homeGoals: null, awayGoals: null },
    ]);
  });

  it('returns empty when the competition has no fixtures', async () => {
    expect(await buildCupBracket(db, S, 1, 5, 999)).toEqual([]);
  });
});
