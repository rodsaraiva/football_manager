import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';
import { TRAVEL_FATIGUE_PENALTY, INTERNATIONAL_BREAK_WEEKS } from '@/engine/national/international-duty';

const S = TEST_SAVE_ID;
const BREAK_WEEK = INTERNATIONAL_BREAK_WEEKS[0]; // 7 — seedTestDb has no fixtures, so the user club is idle.
const NON_BREAK_WEEK = 8;

// Force a player to overall 99 (all attributes maxed) and pin nationality + fitness.
function makeStar(rawDb: Database.Database, playerId: number, nationality: string, fitness: number): void {
  rawDb.prepare('UPDATE players SET nationality = ?, fitness = ? WHERE id = ?').run(nationality, fitness, playerId);
  const cols = [
    'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'long_shots', 'free_kicks',
    'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
    'pace', 'stamina', 'strength', 'agility', 'jumping',
  ];
  rawDb.prepare(`UPDATE player_attributes SET ${cols.map((c) => `${c} = 99`).join(', ')} WHERE player_id = ?`).run(playerId);
}

// Pin a player below the call-up threshold (all attributes = 40 → overall ~40).
function makeBench(rawDb: Database.Database, playerId: number, nationality: string, fitness: number): void {
  rawDb.prepare('UPDATE players SET nationality = ?, fitness = ? WHERE id = ?').run(nationality, fitness, playerId);
  const cols = [
    'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'long_shots', 'free_kicks',
    'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
    'pace', 'stamina', 'strength', 'agility', 'jumping',
  ];
  rawDb.prepare(`UPDATE player_attributes SET ${cols.map((c) => `${c} = 40`).join(', ')} WHERE player_id = ?`).run(playerId);
}

describe('international-duty wiring (integration)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;
  let starA: number;
  let starB: number;
  let belowThreshold: number;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    clubId = (rawDb.prepare('SELECT id FROM clubs LIMIT 1').get() as { id: number }).id;

    const squad = await getPlayersByClub(db, S, clubId);
    starA = squad[0].id;
    starB = squad[1].id;
    belowThreshold = squad[2].id;

    // The seed already contains several international-caliber players; drive every
    // squad member below the call-up threshold first, then control exactly three.
    for (const p of squad) makeBench(rawDb, p.id, p.nationality, p.fitness);

    makeStar(rawDb, starA, 'Brazil', 90);
    makeStar(rawDb, starB, 'Argentina', 90);
    makeBench(rawDb, belowThreshold, 'Spain', 90);
  });
  afterEach(() => rawDb.close());

  it('calls up eligible players and applies travel fatigue on a break week', async () => {
    const result = await advanceGameWeek({
      dbHandle: db, season: 2026, week: BREAK_WEEK, playerClubId: clubId, saveId: S, rng: new SeededRng(7),
    });

    expect(result.internationalCallUps.sort((a, b) => a - b)).toEqual([starA, starB].sort((a, b) => a - b));

    const after = await getPlayersByClub(db, S, clubId);
    const byId = new Map(after.map((p) => [p.id, p]));
    expect(byId.get(starA)!.fitness).toBe(90 - TRAVEL_FATIGUE_PENALTY);
    expect(byId.get(starB)!.fitness).toBe(90 - TRAVEL_FATIGUE_PENALTY);
    // Sub-threshold player was NOT called up and keeps full fitness.
    expect(byId.get(belowThreshold)!.fitness).toBe(90);
  });

  it('calls up at most one player per nationality', async () => {
    // Make starB Brazilian too, but weaker than starA → only starA goes.
    rawDb.prepare('UPDATE players SET nationality = ? WHERE id = ?').run('Brazil', starB);
    const cols = ['finishing', 'passing', 'crossing', 'dribbling', 'heading', 'long_shots', 'free_kicks',
      'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
      'pace', 'stamina', 'strength', 'agility', 'jumping'];
    rawDb.prepare(`UPDATE player_attributes SET ${cols.map((c) => `${c} = 80`).join(', ')} WHERE player_id = ?`).run(starB);

    const result = await advanceGameWeek({
      dbHandle: db, season: 2026, week: BREAK_WEEK, playerClubId: clubId, saveId: S, rng: new SeededRng(7),
    });

    expect(result.internationalCallUps).toEqual([starA]);
    const after = await getPlayersByClub(db, S, clubId);
    const byId = new Map(after.map((p) => [p.id, p]));
    expect(byId.get(starB)!.fitness).toBe(90); // not called up
  });

  it('does not call up or apply travel fatigue on a non-break week', async () => {
    const result = await advanceGameWeek({
      dbHandle: db, season: 2026, week: NON_BREAK_WEEK, playerClubId: clubId, saveId: S, rng: new SeededRng(7),
    });

    expect(result.internationalCallUps).toEqual([]);
    const after = await getPlayersByClub(db, S, clubId);
    const byId = new Map(after.map((p) => [p.id, p]));
    // No fixtures seeded → idle week → fitness untouched by both match-sim and travel.
    expect(byId.get(starA)!.fitness).toBe(90);
    expect(byId.get(starB)!.fitness).toBe(90);
  });
});
