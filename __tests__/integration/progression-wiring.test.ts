import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';
import { setClubTrainingFocus } from '@/database/queries/clubs';
import { upsertPlayerStats } from '@/database/queries/player-stats';

const S = TEST_SAVE_ID;
const SEASON = 2026;

// Seed a single league fixture so the player's club plays this week (progression
// only fires inside the match block). Returns the opponent id.
function seedPlayerFixture(rawDb: Database.Database, clubId: number): number {
  const lg = rawDb.prepare('SELECT league_id FROM clubs WHERE id = ?').get(clubId) as { league_id: number };
  const opp = rawDb
    .prepare('SELECT id FROM clubs WHERE id != ? AND league_id = ? LIMIT 1')
    .get(clubId, lg.league_id) as { id: number };
  rawDb.prepare(
    `INSERT INTO competitions (id, save_id, name, type, format, season, league_id)
     VALUES (90001, ?, 'Test League', 'league', 'round_robin', ?, ?)`,
  ).run(S, SEASON, lg.league_id);
  rawDb.prepare(
    `INSERT INTO fixtures (id, save_id, competition_id, season, week, round, home_club_id, away_club_id, played)
     VALUES (90002, ?, 90001, ?, 1, NULL, ?, ?, 0)`,
  ).run(S, SEASON, clubId, opp.id);
  return opp.id;
}

describe('progression wiring (integration)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const club = rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number };
    clubId = club.id;
    seedPlayerFixture(rawDb, clubId);
  });
  afterEach(() => rawDb.close());

  it('high-minutes/high-rating player gains more than a zero-minutes one', async () => {
    const squad = await getPlayersByClub(db, S, clubId);
    const [starter, reserve] = squad.slice(0, 2);
    rawDb.prepare('UPDATE players SET age = 21 WHERE id IN (?, ?)').run(starter.id, reserve.id);
    rawDb.prepare('UPDATE player_attributes SET passing = 60 WHERE player_id IN (?, ?)').run(starter.id, reserve.id);

    await upsertPlayerStats(db, S, {
      playerId: starter.id, season: SEASON, competitionId: 90001,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 8.0, minutesPlayed: 90,
    });

    const before = rawDb.prepare(
      'SELECT player_id, passing, passing_progress FROM player_attributes WHERE player_id IN (?, ?)',
    ).all(starter.id, reserve.id) as Array<{ player_id: number; passing: number; passing_progress: number }>;

    await advanceGameWeek({ dbHandle: db, season: SEASON, week: 1, playerClubId: clubId, saveId: S, rng: new SeededRng(1) });

    const after = rawDb.prepare(
      'SELECT player_id, passing, passing_progress FROM player_attributes WHERE player_id IN (?, ?)',
    ).all(starter.id, reserve.id) as Array<{ player_id: number; passing: number; passing_progress: number }>;

    const gainOf = (pid: number) => {
      const b = before.find((r) => r.player_id === pid)!;
      const a = after.find((r) => r.player_id === pid)!;
      return (a.passing + a.passing_progress) - (b.passing + b.passing_progress);
    };
    expect(gainOf(starter.id)).toBeGreaterThan(gainOf(reserve.id));
  });

  it("'physical' focus skews gains toward physical attributes vs technical", async () => {
    const squad = await getPlayersByClub(db, S, clubId);
    const p = squad[0];
    rawDb.prepare('UPDATE players SET age = 21 WHERE id = ?').run(p.id);
    rawDb.prepare('UPDATE player_attributes SET passing = 60, pace = 60 WHERE player_id = ?').run(p.id);
    await setClubTrainingFocus(db, clubId, 'physical');
    await upsertPlayerStats(db, S, {
      playerId: p.id, season: SEASON, competitionId: 90001,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 7.5, minutesPlayed: 90,
    });

    const before = rawDb.prepare('SELECT passing, passing_progress, pace, pace_progress FROM player_attributes WHERE player_id = ?').get(p.id) as { passing: number; passing_progress: number; pace: number; pace_progress: number };
    await advanceGameWeek({ dbHandle: db, season: SEASON, week: 1, playerClubId: clubId, saveId: S, rng: new SeededRng(2) });
    const after = rawDb.prepare('SELECT passing, passing_progress, pace, pace_progress FROM player_attributes WHERE player_id = ?').get(p.id) as { passing: number; passing_progress: number; pace: number; pace_progress: number };

    const paceGain = (after.pace + after.pace_progress) - (before.pace + before.pace_progress);
    const passGain = (after.passing + after.passing_progress) - (before.passing + before.passing_progress);
    expect(paceGain).toBeGreaterThan(passGain);
  });

  it('fractional weekly gains accumulate in *_progress instead of vanishing', async () => {
    const squad = await getPlayersByClub(db, S, clubId);
    const p = squad[0];
    rawDb.prepare('UPDATE players SET age = 21 WHERE id = ?').run(p.id);
    await upsertPlayerStats(db, S, {
      playerId: p.id, season: SEASON, competitionId: 90001,
      appearances: 1, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      rating: 7.0, minutesPlayed: 90,
    });
    await advanceGameWeek({ dbHandle: db, season: SEASON, week: 1, playerClubId: clubId, saveId: S, rng: new SeededRng(3) });
    const row = rawDb.prepare(
      'SELECT finishing_progress, passing_progress, pace_progress FROM player_attributes WHERE player_id = ?',
    ).get(p.id) as Record<string, number>;
    const anyFractional = Object.values(row).some((v) => v !== 0 && Math.abs(v) < 1);
    expect(anyFractional).toBe(true);
  });
});
