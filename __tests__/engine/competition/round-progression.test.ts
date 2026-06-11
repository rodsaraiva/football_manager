import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { maybeGenerateNextKnockoutRound } from '@/engine/competition/round-progression';

const KNOCKOUT_WEEK = 47;
const S = TEST_SAVE_ID;

function seedCup(rawDb: Database.Database, clubIds: number[]): void {
  rawDb.prepare(
    `INSERT INTO competitions (id, save_id, name, type, format, season, league_id)
     VALUES (500, ?, 'Test Cup', 'cup', 'knockout', 1, 1)`,
  ).run(S);
  clubIds.forEach((c, i) => {
    rawDb.prepare(
      'INSERT INTO competition_entries (save_id, competition_id, club_id, group_name, seed) VALUES (?, 500, ?, NULL, ?)',
    ).run(S, c, i + 1);
  });
  // Round 1: 4 ties among 8 clubs.
  let fid = 9000;
  for (let i = 0; i < clubIds.length; i += 2) {
    rawDb.prepare(
      `INSERT INTO fixtures (id, save_id, competition_id, season, week, round, home_club_id, away_club_id, played)
       VALUES (?, ?, 500, 1, ?, '1', ?, ?, 0)`,
    ).run(fid++, S, KNOCKOUT_WEEK, clubIds[i], clubIds[i + 1]);
  }
}

function playRound(rawDb: Database.Database, round: number, score: (h: number, a: number) => [number, number]): void {
  const rows = rawDb.prepare(
    "SELECT id, home_club_id, away_club_id FROM fixtures WHERE competition_id = 500 AND round = ? AND played = 0",
  ).all(String(round)) as Array<{ id: number; home_club_id: number; away_club_id: number }>;
  for (const r of rows) {
    const [h, a] = score(r.home_club_id, r.away_club_id);
    rawDb.prepare('UPDATE fixtures SET home_goals = ?, away_goals = ?, played = 1 WHERE id = ?').run(h, a, r.id);
  }
}

describe('maybeGenerateNextKnockoutRound', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const clubs = [1, 2, 3, 4, 5, 6, 7, 8];

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    seedCup(rawDb, clubs);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('is a no-op while the current round is unfinished', async () => {
    await maybeGenerateNextKnockoutRound(db, S, 1, KNOCKOUT_WEEK, new SeededRng(1));
    const r2 = rawDb.prepare("SELECT COUNT(*) AS c FROM fixtures WHERE competition_id = 500 AND round = '2'").get() as { c: number };
    expect(r2.c).toBe(0);
  });

  it('drives a cup to a single champion across rounds', async () => {
    // Round 1: home always wins → survivors 1,3,5,7.
    playRound(rawDb, 1, () => [2, 0]);
    await maybeGenerateNextKnockoutRound(db, S, 1, KNOCKOUT_WEEK, new SeededRng(1));
    let r2 = rawDb.prepare("SELECT id, home_club_id, away_club_id, week FROM fixtures WHERE competition_id = 500 AND round = '2'").all() as Array<{ id: number; home_club_id: number; away_club_id: number; week: number }>;
    expect(r2).toHaveLength(2);
    expect(r2.every((f) => f.week > KNOCKOUT_WEEK)).toBe(true);
    const r2Clubs = r2.flatMap((f) => [f.home_club_id, f.away_club_id]).sort((a, b) => a - b);
    expect(r2Clubs).toEqual([1, 3, 5, 7]);

    // Round 2: a draw → shootout decides; home win for the other.
    playRound(rawDb, 2, (h) => (h === r2[0].home_club_id ? [1, 1] : [3, 0]));
    await maybeGenerateNextKnockoutRound(db, S, 1, r2[0].week, new SeededRng(7));
    const r3 = rawDb.prepare("SELECT id, home_club_id, away_club_id FROM fixtures WHERE competition_id = 500 AND round = '3'").all() as Array<{ id: number; home_club_id: number; away_club_id: number }>;
    expect(r3).toHaveLength(1); // the final

    // A shootout event was persisted for the drawn round-2 tie.
    const shootout = rawDb.prepare(
      "SELECT COUNT(*) AS c FROM match_events WHERE type = 'penalty_shootout' AND fixture_id = ?",
    ).get(r2[0].id) as { c: number };
    expect(shootout.c).toBe(1);

    // Final played → no further round generated; isKnockoutComplete terminal.
    playRound(rawDb, 3, () => [2, 1]);
    const week3 = (rawDb.prepare("SELECT week FROM fixtures WHERE competition_id = 500 AND round = '3'").get() as { week: number }).week;
    await maybeGenerateNextKnockoutRound(db, S, 1, week3, new SeededRng(1));
    const r4 = rawDb.prepare("SELECT COUNT(*) AS c FROM fixtures WHERE competition_id = 500 AND round = '4'").get() as { c: number };
    expect(r4.c).toBe(0);
  });

  it('is idempotent — re-running on the same week does not duplicate the next round', async () => {
    playRound(rawDb, 1, () => [2, 0]);
    await maybeGenerateNextKnockoutRound(db, S, 1, KNOCKOUT_WEEK, new SeededRng(1));
    await maybeGenerateNextKnockoutRound(db, S, 1, KNOCKOUT_WEEK, new SeededRng(1));
    const r2 = rawDb.prepare("SELECT COUNT(*) AS c FROM fixtures WHERE competition_id = 500 AND round = '2'").get() as { c: number };
    expect(r2.c).toBe(2);
  });
});
