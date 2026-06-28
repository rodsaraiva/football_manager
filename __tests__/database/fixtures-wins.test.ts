import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from './test-helpers';
import { DbHandle } from '@/database/queries/players';
import {
  createFixture,
  updateFixtureResult,
  countClubWins,
  getNextFixtureForClub,
} from '@/database/queries/fixtures';

const SAVE_ID = TEST_SAVE_ID;

describe('countClubWins', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubA: number;
  let clubB: number;
  let compId: number;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const clubs = rawDb.prepare('SELECT id FROM clubs ORDER BY id LIMIT 2').all() as { id: number }[];
    clubA = clubs[0].id;
    clubB = clubs[1].id;
    rawDb.prepare(
      "INSERT INTO competitions (id, save_id, name, type, format, season) VALUES (900, ?, 'L', 'league', 'round_robin', 1)",
    ).run(SAVE_ID);
    compId = 900;
  });
  afterEach(() => rawDb.close());

  async function playMatch(id: number, home: number, away: number, hg: number, ag: number, week: number) {
    await createFixture(db, SAVE_ID, { id, competitionId: compId, season: 1, week, homeClubId: home, awayClubId: away });
    await updateFixtureResult(db, SAVE_ID, id, hg, ag);
  }

  it('counts wins as home and away, ignoring draws, losses and unplayed', async () => {
    await playMatch(1, clubA, clubB, 3, 0, 1); // A home win
    await playMatch(2, clubB, clubA, 0, 2, 2); // A away win
    await playMatch(3, clubA, clubB, 1, 1, 3); // draw
    await playMatch(4, clubA, clubB, 0, 2, 4); // A loss
    // unplayed
    await createFixture(db, SAVE_ID, { id: 5, competitionId: compId, season: 1, week: 5, homeClubId: clubA, awayClubId: clubB });

    expect(await countClubWins(db, SAVE_ID, clubA)).toBe(2);
    expect(await countClubWins(db, SAVE_ID, clubB)).toBe(1);
  });

  it('returns 0 when the club has no wins', async () => {
    expect(await countClubWins(db, SAVE_ID, clubA)).toBe(0);
  });

  // Regressão L3/EH-3: com schema Zod não-nulável, o .get() sem linha (fim de temporada)
  // lançava em vez de retornar null. Guarda o caso "sem próxima partida".
  it('getNextFixtureForClub retorna null (não lança) quando não há partida pendente', async () => {
    await expect(getNextFixtureForClub(db, SAVE_ID, clubA, 1)).resolves.toBeNull();
    await playMatch(10, clubA, clubB, 1, 0, 1);
    const next = await getNextFixtureForClub(db, SAVE_ID, clubA, 1);
    expect(next).toBeNull(); // a única partida foi jogada → nenhuma pendente
  });
});
