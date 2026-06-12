import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { computeReputationDelta, squadStrengthDelta } from '@/engine/board/reputation-engine';
import { computeTrustDelta } from '@/engine/board/trust-engine';
import { isManagerDismissed } from '@/engine/board/season-outcome';
import { markSaveEnded, isSaveEnded } from '@/database/queries/save';
import { getCompetitionsBySeason } from '@/database/queries/leagues';

const SAVE_ID = TEST_SAVE_ID; // seedTestDb already creates save id=1
const CLUB_ID = 1;
const SEASON = 1;

describe('end-of-season board wiring', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    // A domestic cup the player's club won this season.
    rawDb.prepare(
      `INSERT INTO competitions (id, save_id, name, type, format, season, league_id)
       VALUES (5000, ?, 'National Cup', 'cup', 'knockout', ?, NULL)`,
    ).run(SAVE_ID, SEASON);
    rawDb.prepare(
      `INSERT INTO season_competition_results (save_id, season, competition_id, champion_club_id, runner_up_club_id)
       VALUES (?, ?, 5000, ?, NULL)`,
    ).run(SAVE_ID, SEASON, CLUB_ID);
  });
  afterEach(() => rawDb.close());

  // mirrors the screen's wonCup derivation: any won 'cup' (excluding 'continental')
  async function deriveWonCup(): Promise<boolean> {
    const comps = await getCompetitionsBySeason(db, SAVE_ID, SEASON);
    const domesticCups = comps.filter((c) => c.type === 'cup');
    for (const c of domesticCups) {
      const row = rawDb
        .prepare('SELECT champion_club_id AS champ FROM season_competition_results WHERE save_id = ? AND season = ? AND competition_id = ?')
        .get(SAVE_ID, SEASON, c.id) as { champ: number } | undefined;
      if (row?.champ === CLUB_ID) return true;
    }
    return false;
  }

  it('detects a won domestic cup from season_competition_results', async () => {
    expect(await deriveWonCup()).toBe(true);
  });

  it('a won cup meets a cup_win objective and raises trust', async () => {
    const wonCup = await deriveWonCup();
    const rep = computeReputationDelta({
      currentReputation: 50, leaguePosition: 6, totalTeams: 20,
      wonLeague: false, wonCup, wasRelegated: false, wasPromoted: false,
      budgetBalance: 0, squadAverageOverall: 70, staffAverageAbility: 10,
    });
    const trust = computeTrustDelta({
      currentTrust: 50, objectiveType: 'cup_win', objectiveTarget: null,
      leaguePosition: 6, totalTeams: 20, wonCup, wasRelegated: false, wasPromoted: false,
      reputationDelta: rep.delta, budgetBalance: 0,
    });
    expect(trust.outcome).toBe('objective_met');
    expect(trust.newTrust).toBeGreaterThan(50);
    expect(isManagerDismissed(trust.consequence)).toBe(false);
  });

  it('a failed cup objective with low trust fires the manager', async () => {
    // No cup win this run: simulate a different (real, seeded) club as champion.
    const other = rawDb.prepare('SELECT id FROM clubs WHERE id != ? ORDER BY id LIMIT 1').get(CLUB_ID) as { id: number };
    rawDb.prepare('UPDATE season_competition_results SET champion_club_id = ? WHERE competition_id = 5000').run(other.id);
    const wonCup = await deriveWonCup();
    expect(wonCup).toBe(false);
    const trust = computeTrustDelta({
      currentTrust: 30, objectiveType: 'cup_win', objectiveTarget: null,
      leaguePosition: 18, totalTeams: 20, wonCup, wasRelegated: false, wasPromoted: false,
      reputationDelta: -4, budgetBalance: -1000,
    });
    expect(trust.outcome).toBe('objective_failed');
    expect(trust.newTrust).toBeLessThan(20);
    expect(isManagerDismissed(trust.consequence)).toBe(true);
  });

  it('marking a save ended persists and is read back (no rollover)', async () => {
    await markSaveEnded(db, SAVE_ID);
    expect(await isSaveEnded(db, SAVE_ID)).toBe(true);
  });

  it('squad strength raises reputation more than a median squad', async () => {
    expect(squadStrengthDelta(82)).toBeGreaterThan(squadStrengthDelta(70));
  });
});
