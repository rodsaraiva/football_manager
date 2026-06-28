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
import { INTERNATIONAL_BREAK_WEEKS } from '@/engine/national/international-duty';
import { NATIONAL_TOURNAMENT_COMP_ID_BASE } from '@/engine/balance';
import {
  seedNationalTeams,
  loadNationalTeams,
  getUserManagedNation,
} from '@/database/queries/national-teams';
import {
  buildCycleSchedule,
  loadNationalFixturesByCompetition,
} from '@/database/queries/national-fixtures';
import { getNationalTitles } from '@/database/queries/national-titles';
import { advanceNationalWindow } from '@/engine/game-loop/international-duty';
import { Fixture } from '@/types';

const S = TEST_SAVE_ID;

function freshSeeded(): { rawDb: Database.Database; db: DbHandle } {
  const rawDb = createTestDb();
  seedTestDb(rawDb);
  const db = createTestDbHandle(rawDb);
  return { rawDb, db };
}

// Roda o calendário internacional de `seasons` temporadas, janela a janela, como o game-loop.
async function runSeasons(db: DbHandle, saveId: number, seasons: number): Promise<void> {
  for (let season = 1; season <= seasons; season++) {
    for (const week of INTERNATIONAL_BREAK_WEEKS) {
      await advanceNationalWindow(db, saveId, season, week);
    }
  }
}

function tournamentComp(saveId: number): number {
  // ciclo 0 (temporadas 1..tournamentSeason).
  return saveOffset(saveId) + NATIONAL_TOURNAMENT_COMP_ID_BASE + 0;
}

async function tournamentFixtures(db: DbHandle, saveId: number): Promise<Fixture[]> {
  const sched = buildCycleSchedule(saveId, 1, [0, 0, 0, 0, 0]); // só p/ tournamentSeason
  return loadNationalFixturesByCompetition(db, saveId, sched.tournamentSeason, tournamentComp(saveId));
}

function fixtureSnapshot(fixtures: Fixture[]): string {
  return JSON.stringify(
    [...fixtures]
      .sort((a, b) => a.id - b.id)
      .map((f) => [f.id, f.season, f.week, f.round, f.homeClubId, f.awayClubId, f.homeGoals, f.awayGoals, f.played]),
  );
}

describe('L1-C — international tournament', () => {
  it('runs a full deterministic tournament: same champion + same knockout fixtures across runs', async () => {
    const a = freshSeeded();
    const b = freshSeeded();
    await seedNationalTeams(a.db, S);
    await seedNationalTeams(b.db, S);

    const sched = buildCycleSchedule(S, 1, (await loadNationalTeams(a.db, S)).map((t) => t.id));
    await runSeasons(a.db, S, sched.tournamentSeason);
    await runSeasons(b.db, S, sched.tournamentSeason);

    const ta = await getNationalTitles(a.db, S);
    const tb = await getNationalTitles(b.db, S);
    expect(ta).toHaveLength(1);
    expect(tb).toHaveLength(1);
    expect(ta[0].championNationalId).toBe(tb[0].championNationalId);
    expect(ta[0].runnerUpNationalId).toBe(tb[0].runnerUpNationalId);

    const fa = await tournamentFixtures(a.db, S);
    const fb = await tournamentFixtures(b.db, S);
    expect(fa.length).toBeGreaterThan(0);
    expect(fixtureSnapshot(fa)).toBe(fixtureSnapshot(fb));

    a.rawDb.close();
    b.rawDb.close();
  });

  it('progresses SF (round 1, 2 games) → final (round 2, 1 game); winners advance', async () => {
    const { rawDb, db } = freshSeeded();
    await seedNationalTeams(db, S);
    const sched = buildCycleSchedule(S, 1, (await loadNationalTeams(db, S)).map((t) => t.id));
    await runSeasons(db, S, sched.tournamentSeason);

    const fx = await tournamentFixtures(db, S);
    const sf = fx.filter((f) => f.round === 1);
    const finals = fx.filter((f) => f.round === 2);
    expect(sf).toHaveLength(2);
    expect(finals).toHaveLength(1);
    expect(fx.every((f) => f.played)).toBe(true);

    // SF e final em janelas distintas.
    expect(sf[0].week).not.toBe(finals[0].week);
    expect(INTERNATIONAL_BREAK_WEEKS).toContain(sf[0].week);
    expect(INTERNATIONAL_BREAK_WEEKS).toContain(finals[0].week);

    // Os dois finalistas são vencedores das semifinais (gols decidem; empate → pênaltis,
    // mas o vencedor sempre vem de uma das semis).
    const sfTeams = new Set<number>();
    for (const m of sf) {
      sfTeams.add(m.homeClubId);
      sfTeams.add(m.awayClubId);
    }
    expect(sfTeams.has(finals[0].homeClubId)).toBe(true);
    expect(sfTeams.has(finals[0].awayClubId)).toBe(true);

    // Cada finalista venceu (ou empatou e foi p/ pênaltis) sua semi — não pode ter PERDIDO no tempo normal.
    const winnersInRegulation = sf.map((m) =>
      m.homeGoals! > m.awayGoals! ? m.homeClubId : m.awayGoals! > m.homeGoals! ? m.awayClubId : null,
    );
    for (const fid of [finals[0].homeClubId, finals[0].awayClubId]) {
      const semiOfFinalist = sf.find((m) => m.homeClubId === fid || m.awayClubId === fid)!;
      const loserInReg =
        semiOfFinalist.homeGoals! > semiOfFinalist.awayGoals!
          ? semiOfFinalist.awayClubId
          : semiOfFinalist.awayGoals! > semiOfFinalist.homeGoals!
            ? semiOfFinalist.homeClubId
            : null;
      expect(loserInReg).not.toBe(fid);
    }
    void winnersInRegulation;

    // O campeão registrado é um dos dois finalistas.
    const title = (await getNationalTitles(db, S))[0];
    expect([finals[0].homeClubId, finals[0].awayClubId]).toContain(title.championNationalId);
    expect([finals[0].homeClubId, finals[0].awayClubId]).toContain(title.runnerUpNationalId);
    expect(title.championNationalId).not.toBe(title.runnerUpNationalId);

    rawDb.close();
  });

  it('records the title in history and emits a champion news item', async () => {
    const { rawDb, db } = freshSeeded();
    await seedNationalTeams(db, S);
    const sched = buildCycleSchedule(S, 1, (await loadNationalTeams(db, S)).map((t) => t.id));
    await runSeasons(db, S, sched.tournamentSeason);

    const titles = await getNationalTitles(db, S);
    expect(titles).toHaveLength(1);
    expect(titles[0].competitionId).toBe(tournamentComp(S));

    const userNation = (await getUserManagedNation(db, S))!;
    expect(titles[0].userManagedWon).toBe(titles[0].championNationalId === userNation.id);

    const news = (await db
      .prepare("SELECT title_key, body_key, category FROM news_items WHERE save_id = ? AND category = 'national'")
      .all(S)) as { title_key: string; body_key: string; category: string }[];
    expect(news.length).toBeGreaterThanOrEqual(1);
    const keys = new Set(news.map((n) => n.title_key));
    const championKeys = ['news.national_champion_title', 'news.national_champion_user_title'];
    expect(championKeys.some((k) => keys.has(k))).toBe(true);

    rawDb.close();
  });

  it('is idempotent: re-running the tournament windows does not duplicate titles or news', async () => {
    const { rawDb, db } = freshSeeded();
    await seedNationalTeams(db, S);
    const sched = buildCycleSchedule(S, 1, (await loadNationalTeams(db, S)).map((t) => t.id));
    await runSeasons(db, S, sched.tournamentSeason);

    // Re-roda as janelas da temporada de torneio.
    for (const week of INTERNATIONAL_BREAK_WEEKS) {
      await advanceNationalWindow(db, S, sched.tournamentSeason, week);
    }

    expect(await getNationalTitles(db, S)).toHaveLength(1);
    const newsCount = (await db
      .prepare("SELECT COUNT(*) AS c FROM news_items WHERE save_id = ? AND category = 'national'")
      .get(S)) as { c: number };
    expect(newsCount.c).toBe(1);

    rawDb.close();
  });

  it('keeps two saves disjoint (save-isolation of tournament fixtures and titles)', async () => {
    const rawDb = createTestDb();
    seedTestDb(rawDb); // save 1
    const db = createTestDbHandle(rawDb);

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
    const sched = buildCycleSchedule(S, 1, (await loadNationalTeams(db, S)).map((t) => t.id));
    await runSeasons(db, S, sched.tournamentSeason);
    await runSeasons(db, 2, sched.tournamentSeason);

    const f1 = await tournamentFixtures(db, S);
    const f2 = await tournamentFixtures(db, 2);
    expect(f1.length).toBeGreaterThan(0);
    expect(f2.length).toBeGreaterThan(0);
    const ids1 = new Set(f1.map((f) => f.id));
    for (const f of f2) expect(ids1.has(f.id)).toBe(false);

    const t1 = await getNationalTitles(db, S);
    const t2 = await getNationalTitles(db, 2);
    expect(t1).toHaveLength(1);
    expect(t2).toHaveLength(1);
    expect(t1[0].championNationalId).not.toBe(t2[0].championNationalId);

    rawDb.close();
  });
});
