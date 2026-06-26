import Database from 'better-sqlite3';
import {
  createTestDb,
  createTestDbHandle,
  seedTestDb,
  seedWorldForSave,
  TEST_SAVE_ID,
} from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { generateSeedData } from '../../../scripts/generate-seed-data';
import { saveOffset } from '@/database/constants';
import {
  DEMONYM_TO_COUNTRY,
  deriveNationalPool,
  computeNationalStrength,
  PoolCandidate,
} from '@/engine/national/nationality';
import { INTERNATIONAL_BREAK_WEEKS, INTERNATIONAL_CALLUP_MIN_OVERALL } from '@/engine/national/international-duty';
import { SEASON_END_WEEK } from '@/engine/balance';
import {
  seedNationalTeams,
  loadNationalTeams,
  getUserManagedNation,
} from '@/database/queries/national-teams';
import { loadNationalFixtures } from '@/database/queries/national-fixtures';
import { advanceNationalWindow } from '@/engine/game-loop/international-duty';
import { calculateStandings } from '@/engine/competition/standings';
import { Fixture } from '@/types';

const S = TEST_SAVE_ID;

// Roda o calendário internacional de `seasons` temporadas, exatamente como o game-loop:
// em cada janela FIFA chama advanceNationalWindow (gera + simula + persiste).
async function runSeasons(db: DbHandle, saveId: number, seasons: number): Promise<void> {
  for (let season = 1; season <= seasons; season++) {
    for (const week of INTERNATIONAL_BREAK_WEEKS) {
      await advanceNationalWindow(db, saveId, season, week);
    }
  }
}

function fixtureSnapshot(fixtures: Fixture[]): string {
  return JSON.stringify(
    [...fixtures]
      .sort((a, b) => a.id - b.id)
      .map((f) => [f.id, f.season, f.week, f.round, f.homeClubId, f.awayClubId, f.homeGoals, f.awayGoals, f.played]),
  );
}

describe('L1-A — nationality model (pure)', () => {
  it('DEMONYM_TO_COUNTRY maps the five playable demonyms', () => {
    expect(DEMONYM_TO_COUNTRY).toEqual({
      English: 'England',
      Spanish: 'Spain',
      Italian: 'Italy',
      German: 'Germany',
      French: 'France',
    });
  });

  it('deriveNationalPool filters by demonym + floor, sorts desc, breaks ties by id, caps at topN', () => {
    const players: PoolCandidate[] = [
      { id: 5, nationality: 'English', overall: 80 },
      { id: 2, nationality: 'English', overall: 80 }, // tie with id 5 → comes first (lower id)
      { id: 9, nationality: 'English', overall: 90 },
      { id: 3, nationality: 'English', overall: INTERNATIONAL_CALLUP_MIN_OVERALL - 1 }, // below floor
      { id: 7, nationality: 'Spanish', overall: 95 }, // wrong nation
    ];
    const pool = deriveNationalPool(players, 'England', 2);
    expect(pool.map((p) => p.id)).toEqual([9, 2]);
  });

  it('computeNationalStrength is the rounded mean; empty pool → 0', () => {
    expect(computeNationalStrength([])).toBe(0);
    expect(
      computeNationalStrength([
        { id: 1, nationality: 'English', overall: 80 },
        { id: 2, nationality: 'English', overall: 76 },
        { id: 3, nationality: 'English', overall: 75 },
      ]),
    ).toBe(77);
  });
});

describe('L1-A — national teams seeding (integration)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
  });
  afterEach(() => rawDb.close());

  it('seeds one national team per playable country with a positive strength', async () => {
    const created = await seedNationalTeams(db, S);
    expect(created).toBe(5);

    const teams = await loadNationalTeams(db, S);
    expect(teams.map((t) => t.name).sort()).toEqual(['England', 'France', 'Germany', 'Italy', 'Spain']);
    for (const t of teams) {
      expect(t.continent).toBe('Europe');
      expect(t.strength).toBeGreaterThan(0);
      expect(t.id).toBeGreaterThanOrEqual(saveOffset(S));
    }
  });

  it('marks exactly one nation as user-managed', async () => {
    await seedNationalTeams(db, S);
    const managed = await getUserManagedNation(db, S);
    expect(managed).not.toBeNull();
    const teams = await loadNationalTeams(db, S);
    expect(teams.filter((t) => t.isUserManaged)).toHaveLength(1);
  });

  it('is idempotent — second call creates nothing', async () => {
    await seedNationalTeams(db, S);
    expect(await seedNationalTeams(db, S)).toBe(0);
    expect(await loadNationalTeams(db, S)).toHaveLength(5);
  });
});

describe('L1-A — international competition (integration)', () => {
  function freshSeeded(): { rawDb: Database.Database; db: DbHandle } {
    const rawDb = createTestDb();
    seedTestDb(rawDb);
    const db = createTestDbHandle(rawDb);
    return { rawDb, db };
  }

  it('produces identical fixtures and standings across two runs (determinism)', async () => {
    const a = freshSeeded();
    const b = freshSeeded();
    await seedNationalTeams(a.db, S);
    await seedNationalTeams(b.db, S);
    await runSeasons(a.db, S, 2);
    await runSeasons(b.db, S, 2);

    const ids = (await loadNationalTeams(a.db, S)).map((t) => t.id);
    for (const season of [1, 2]) {
      const fa = await loadNationalFixtures(a.db, S, season);
      const fb = await loadNationalFixtures(b.db, S, season);
      expect(fixtureSnapshot(fa)).toBe(fixtureSnapshot(fb));

      const sa = calculateStandings(fa, ids);
      const sb = calculateStandings(fb, ids);
      expect(JSON.stringify(sa)).toBe(JSON.stringify(sb));
    }

    a.rawDb.close();
    b.rawDb.close();
  });

  it('records games for the user-managed nation after 2 seasons', async () => {
    const { rawDb, db } = freshSeeded();
    await seedNationalTeams(db, S);
    await runSeasons(db, S, 2);

    const managed = await getUserManagedNation(db, S);
    expect(managed).not.toBeNull();
    const all = [...(await loadNationalFixtures(db, S, 1)), ...(await loadNationalFixtures(db, S, 2))];
    const userGames = all.filter(
      (f) => f.played && (f.homeClubId === managed!.id || f.awayClubId === managed!.id),
    );
    expect(userGames.length).toBeGreaterThan(0);
    rawDb.close();
  });

  it('never schedules a national fixture on SEASON_END_WEEK and at most one game per nation per window', async () => {
    const { rawDb, db } = freshSeeded();
    await seedNationalTeams(db, S);
    await runSeasons(db, S, 2);

    for (const season of [1, 2]) {
      const fixtures = await loadNationalFixtures(db, S, season);
      expect(fixtures.length).toBeGreaterThan(0);
      for (const f of fixtures) {
        expect(f.week).not.toBe(SEASON_END_WEEK);
        expect(INTERNATIONAL_BREAK_WEEKS).toContain(f.week);
        expect(f.played).toBe(true);
      }
      // ≤ 1 game per nation per (season, week).
      const byWeek = new Map<number, number[]>();
      for (const f of fixtures) {
        const list = byWeek.get(f.week) ?? [];
        list.push(f.homeClubId, f.awayClubId);
        byWeek.set(f.week, list);
      }
      for (const ids of byWeek.values()) {
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
    rawDb.close();
  });

  it('keeps two saves disjoint (save-isolation)', async () => {
    const rawDb = createTestDb();
    seedTestDb(rawDb); // save 1
    const db = createTestDbHandle(rawDb);

    // Second save in the SAME db: own offset id-space + save_games row.
    const data = generateSeedData(42);
    rawDb.pragma('foreign_keys = OFF');
    rawDb
      .prepare(
        "INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (2, 'Test2', 1, 1, ?, 'normal', 50, '', '')",
      )
      .run(saveOffset(2) + data.clubs[0].id);
    seedWorldForSave(rawDb, data, 2);
    rawDb.pragma('foreign_keys = ON');

    await seedNationalTeams(db, S);
    await seedNationalTeams(db, 2);
    await runSeasons(db, S, 2);
    await runSeasons(db, 2, 2);

    const f1 = [...(await loadNationalFixtures(db, S, 1)), ...(await loadNationalFixtures(db, S, 2))];
    const f2 = [...(await loadNationalFixtures(db, 2, 1)), ...(await loadNationalFixtures(db, 2, 2))];
    expect(f1.length).toBeGreaterThan(0);
    expect(f2.length).toBeGreaterThan(0);

    const ids1 = new Set(f1.map((f) => f.id));
    const ids2 = new Set(f2.map((f) => f.id));
    for (const id of ids2) expect(ids1.has(id)).toBe(false);

    // save 1 queries never leak save 2's national teams.
    const teams1 = await loadNationalTeams(db, S);
    const teams2 = await loadNationalTeams(db, 2);
    const teamIds1 = new Set(teams1.map((t) => t.id));
    for (const t of teams2) expect(teamIds1.has(t.id)).toBe(false);

    rawDb.close();
  });
});
