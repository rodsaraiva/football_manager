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
  selectNationalSquad,
  NationalSquadCandidate,
} from '@/engine/national/international-duty';
import { POSITION_GROUP } from '@/engine/simulation/squad-selection';
import { NATIONAL_SQUAD_SIZE } from '@/engine/balance';
import {
  seedNationalTeams,
  getUserManagedNation,
  loadNationalTeams,
  NationalTeam,
} from '@/database/queries/national-teams';
import {
  loadNationalFixtures,
  ensureNationalFixtures,
} from '@/database/queries/national-fixtures';
import {
  getCallUps,
  countCallUps,
  setManualCallUp,
} from '@/database/queries/national-callups';
import {
  ensureAutoCallUps,
  buildUserNationLineup,
  buildSyntheticNationLineup,
  simulateNationalMatch,
  nationalMatchSeed,
} from '@/engine/game-loop/national-lineup';
import { advanceNationalWindow } from '@/engine/game-loop/international-duty';
import { Fixture } from '@/types';

const S = TEST_SAVE_ID;

function freshSeeded(): { rawDb: Database.Database; db: DbHandle } {
  const rawDb = createTestDb();
  seedTestDb(rawDb);
  const db = createTestDbHandle(rawDb);
  return { rawDb, db };
}

// Primeiro fixture (qualquer janela) da temporada que envolve a seleção do usuário.
async function findUserFixture(
  db: DbHandle,
  nation: NationalTeam,
  season: number,
): Promise<Fixture> {
  const fixtures = await loadNationalFixtures(db, S, season);
  const f = fixtures.find((x) => x.homeClubId === nation.id || x.awayClubId === nation.id);
  if (!f) throw new Error('no user fixture in season');
  return f;
}

function callUpSnapshot(rows: { playerId: number; isStarter: boolean; source: string }[]): string {
  return JSON.stringify(
    [...rows]
      .sort((a, b) => a.playerId - b.playerId)
      .map((r) => [r.playerId, r.isStarter, r.source]),
  );
}

describe('L1-B — selectNationalSquad (pure)', () => {
  it('is deterministic, sorted by overall desc (id tiebreak), capped at size', () => {
    const pool: NationalSquadCandidate[] = [
      { id: 5, position: 'ST', overall: 80 },
      { id: 2, position: 'ST', overall: 80 }, // tie → lower id first
      { id: 9, position: 'GK', overall: 90 },
      { id: 1, position: 'GK', overall: 88 },
      { id: 3, position: 'CB', overall: 85 },
      { id: 4, position: 'CM', overall: 84 },
    ];
    const a = selectNationalSquad(pool, 4);
    const b = selectNationalSquad(pool, 4);
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
    // overall desc, id asc → 90,88,85,84 = [9,1,3,4]
    expect(a).toEqual([9, 1, 3, 4]);
  });

  it('guarantees positional coverage (≥1 GK) even when GKs are low overall', () => {
    const pool: NationalSquadCandidate[] = [];
    for (let i = 1; i <= 30; i++) pool.push({ id: i, position: 'ST', overall: 99 - i });
    pool.push({ id: 100, position: 'GK', overall: 50 });
    pool.push({ id: 101, position: 'GK', overall: 49 });
    const squad = selectNationalSquad(pool, NATIONAL_SQUAD_SIZE);
    expect(squad).toContain(100);
    expect(squad).toContain(101);
    expect(squad).toHaveLength(NATIONAL_SQUAD_SIZE);
  });

  it('returns the whole pool when it is smaller than size', () => {
    const pool: NationalSquadCandidate[] = [
      { id: 1, position: 'GK', overall: 80 },
      { id: 2, position: 'CB', overall: 79 },
    ];
    expect(selectNationalSquad(pool, 23)).toEqual([1, 2]);
  });
});

describe('L1-B — automatic call-ups (integration)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let nation: NationalTeam;

  beforeEach(async () => {
    ({ rawDb, db } = freshSeeded());
    await seedNationalTeams(db, S);
    nation = (await getUserManagedNation(db, S))!;
  });
  afterEach(() => rawDb.close());

  it('persists a 23-man auto squad with exactly 11 starters', async () => {
    await ensureAutoCallUps(db, S, nation, 1, 7);
    const rows = await getCallUps(db, S, nation.id, 1, 7);
    expect(rows).toHaveLength(NATIONAL_SQUAD_SIZE);
    expect(rows.every((r) => r.source === 'auto')).toBe(true);
    expect(rows.filter((r) => r.isStarter)).toHaveLength(11);
  });

  it('is idempotent — second call does not duplicate or clobber', async () => {
    await ensureAutoCallUps(db, S, nation, 1, 7);
    const again = await ensureAutoCallUps(db, S, nation, 1, 7);
    expect(again).toBe(false);
    expect(await countCallUps(db, S, nation.id, 1, 7)).toBe(NATIONAL_SQUAD_SIZE);
  });

  it('is stable across two independent seeds (golden)', async () => {
    const a = freshSeeded();
    const b = freshSeeded();
    await seedNationalTeams(a.db, S);
    await seedNationalTeams(b.db, S);
    const na = (await getUserManagedNation(a.db, S))!;
    const nb = (await getUserManagedNation(b.db, S))!;
    await ensureAutoCallUps(a.db, S, na, 1, 7);
    await ensureAutoCallUps(b.db, S, nb, 1, 7);
    const ra = await getCallUps(a.db, S, na.id, 1, 7);
    const rb = await getCallUps(b.db, S, nb.id, 1, 7);
    expect(callUpSnapshot(ra)).toBe(callUpSnapshot(rb));
    a.rawDb.close();
    b.rawDb.close();
  });
});

describe('L1-B — manual override (integration)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let nation: NationalTeam;

  beforeEach(async () => {
    ({ rawDb, db } = freshSeeded());
    await seedNationalTeams(db, S);
    nation = (await getUserManagedNation(db, S))!;
    await ensureAutoCallUps(db, S, nation, 1, 7);
  });
  afterEach(() => rawDb.close());

  it('forces a manual player into the starting XI, dropping a weaker auto starter', async () => {
    const before = await buildUserNationLineup(db, S, nation, 1, 7);
    const autoStarterIds = new Set(before.squad.map((p) => p.id));
    // Um reserva auto que NÃO era titular.
    const benchPlayer = before.bench[before.bench.length - 1];
    expect(autoStarterIds.has(benchPlayer.id)).toBe(false);

    await setManualCallUp(db, S, nation.id, 1, 7, benchPlayer.id, true);

    const after = await buildUserNationLineup(db, S, nation, 1, 7);
    const afterStarterIds = after.squad.map((p) => p.id);
    expect(afterStarterIds).toContain(benchPlayer.id); // manual respeitado
    expect(after.squad).toHaveLength(11);

    const rows = await getCallUps(db, S, nation.id, 1, 7);
    const manualRow = rows.find((r) => r.playerId === benchPlayer.id)!;
    expect(manualRow.source).toBe('manual');
    expect(manualRow.isStarter).toBe(true);
  });

  it('the manual override CAUSES the player to enter the simulated XI ratings', async () => {
    const rivalName = (await loadNationalTeams(db, S)).find((t) => t.id !== nation.id)!.name;
    const rival = await buildSyntheticNationLineup(db, S, rivalName);
    const sim = (home: Awaited<ReturnType<typeof buildUserNationLineup>>) =>
      simulateNationalMatch(999, 12345, {
        home, homeReputation: 80, away: rival, awayReputation: 78,
      });

    // Baseline SEM override: identifica um reserva que NÃO entra no jogo do usuário (nem
    // titular, nem substituto). Assim, sua presença pós-override é prova de causa, não acaso.
    const baselineLineup = await buildUserNationLineup(db, S, nation, 1, 7);
    const baselineRated = new Set(sim(baselineLineup).homeRatings.map((r) => r.playerId));
    const benchPlayer = baselineLineup.bench.find((p) => !baselineRated.has(p.id));
    if (!benchPlayer) throw new Error('expected at least one unused bench player in baseline');
    expect(baselineRated.has(benchPlayer.id)).toBe(false);

    await setManualCallUp(db, S, nation.id, 1, 7, benchPlayer.id, true);

    const userLineup = await buildUserNationLineup(db, S, nation, 1, 7);
    expect(userLineup.squad.map((p) => p.id)).toContain(benchPlayer.id); // virou titular
    const afterRated = new Set(sim(userLineup).homeRatings.map((r) => r.playerId));
    expect(afterRated.has(benchPlayer.id)).toBe(true); // agora aparece nos ratings reais
  });
});

describe('L1-B — real match engine for the user nation (integration)', () => {
  it('user fixtures get goals from the MATCH ENGINE, deterministic across runs', async () => {
    const a = freshSeeded();
    const b = freshSeeded();
    await seedNationalTeams(a.db, S);
    await seedNationalTeams(b.db, S);
    const na = (await getUserManagedNation(a.db, S))!;
    const nb = (await getUserManagedNation(b.db, S))!;

    // Janela do primeiro jogo do usuário na temporada 1.
    await ensureNationalFixtures(a.db, S, 1);
    const userFx = await findUserFixture(a.db, na, 1);

    await advanceNationalWindow(a.db, S, 1, userFx.week);
    await advanceNationalWindow(b.db, S, 1, userFx.week);

    const fa = (await loadNationalFixtures(a.db, S, 1)).find((f) => f.id === userFx.id)!;
    const fb = (await loadNationalFixtures(b.db, S, 1)).find((f) => f.id === userFx.id)!;
    expect(fa.played).toBe(true);
    // Determinístico nas duas execuções.
    expect([fa.homeGoals, fa.awayGoals]).toEqual([fb.homeGoals, fb.awayGoals]);

    // Prova de que o caminho REAL (match engine) foi usado: recomputa a partida com a
    // mesma seed namespaced e os mesmos lados e bate o placar persistido.
    const userIsHome = userFx.homeClubId === na.id;
    const userLineup = await buildUserNationLineup(a.db, S, na, 1, userFx.week);
    const rivalId = userIsHome ? userFx.awayClubId : userFx.homeClubId;
    const teams = await loadNationalTeams(a.db, S);
    const rival = teams.find((t) => t.id === rivalId)!;
    const rivalLineup = await buildSyntheticNationLineup(a.db, S, rival.name);
    const homeRep = teams.find((t) => t.id === userFx.homeClubId)!.strength;
    const awayRep = teams.find((t) => t.id === userFx.awayClubId)!.strength;
    const expected = simulateNationalMatch(
      userFx.id,
      nationalMatchSeed(S, 1, userFx.week, userFx.id),
      {
        home: userIsHome ? userLineup : rivalLineup,
        homeReputation: homeRep,
        away: userIsHome ? rivalLineup : userLineup,
        awayReputation: awayRep,
      },
    );
    expect(expected.homeRatings.length + expected.awayRatings.length).toBeGreaterThan(0);
    expect([fa.homeGoals, fa.awayGoals]).toEqual([expected.homeGoals, expected.awayGoals]);

    a.rawDb.close();
    b.rawDb.close();
  });
});

describe('L1-B — save-isolation of national_callups', () => {
  it('two saves never share call-up rows', async () => {
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
    const n1 = (await getUserManagedNation(db, S))!;
    const n2 = (await getUserManagedNation(db, 2))!;
    await ensureAutoCallUps(db, S, n1, 1, 7);
    await ensureAutoCallUps(db, 2, n2, 1, 7);

    const r1 = await getCallUps(db, S, n1.id, 1, 7);
    const r2 = await getCallUps(db, 2, n2.id, 1, 7);
    expect(r1.length).toBe(NATIONAL_SQUAD_SIZE);
    expect(r2.length).toBe(NATIONAL_SQUAD_SIZE);

    // save 1 nunca enxerga convocações do save 2.
    const ids2 = new Set(r2.map((r) => r.playerId));
    const crossLeak = r1.some((r) => ids2.has(r.playerId));
    expect(crossLeak).toBe(false);
    // Query do save 1 com o nation id do save 2 não retorna nada.
    expect(await getCallUps(db, S, n2.id, 1, 7)).toHaveLength(0);

    rawDb.close();
  });
});

// POSITION_GROUP é importado só para garantir que o teste de cobertura reflita o mapa real.
it('POSITION_GROUP maps GK to GK group (sanity for coverage test)', () => {
  expect(POSITION_GROUP.GK).toBe('GK');
});
