import Database from 'better-sqlite3';
import {
  createTestDb,
  createTestDbHandle,
  seedTestDb,
  TEST_SAVE_ID,
} from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { INTERNATIONAL_BREAK_WEEKS } from '@/engine/national/international-duty';
import {
  seedNationalTeams,
  loadNationalTeams,
  getUserManagedNation,
} from '@/database/queries/national-teams';
import {
  buildCycleSchedule,
  loadNationalFixtures,
  getNationalStartsInWindow,
} from '@/database/queries/national-fixtures';
import { getCallUps } from '@/database/queries/national-callups';
import { getCaps } from '@/database/queries/national-caps';
import { getNationalTitles } from '@/database/queries/national-titles';
import { getManagerReputation } from '@/database/queries/save';
import { advanceNationalWindow } from '@/engine/game-loop/international-duty';
import { computeNationalReputationDelta } from '@/engine/board/manager-reputation-engine';
import { computeCongestion } from '@/engine/simulation/congestion';
import { MANAGER_REP_NATIONAL_TITLE_BONUS } from '@/engine/balance';
import { DEMONYM_TO_COUNTRY } from '@/engine/national/nationality';
import { Fixture } from '@/types';

const ATTR_COLS = [
  'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'long_shots', 'free_kicks',
  'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
  'pace', 'stamina', 'strength', 'agility', 'jumping',
];

// Cenário controlado e determinístico de TÍTULO do usuário: zera o pool elegível da seleção
// dirigida (jogos do usuário caem no modelo abstrato) e dá força dominante a ela — assim a
// conquista é decidida só pela força agregada (SeededRng puro), sem depender do XI real.
async function forceUserTitleScenario(rawDb: Database.Database, db: DbHandle): Promise<void> {
  const userNation = (await getUserManagedNation(db, S))!;
  const demonyms = Object.entries(DEMONYM_TO_COUNTRY)
    .filter(([, c]) => c === userNation.name)
    .map(([d]) => d);
  const ph = demonyms.map(() => '?').join(',');
  const ids = rawDb.prepare(`SELECT id FROM players WHERE nationality IN (${ph})`).all(...demonyms) as { id: number }[];
  const setLow = ATTR_COLS.map((c) => `${c} = 30`).join(', ');
  for (const { id } of ids) rawDb.prepare(`UPDATE player_attributes SET ${setLow} WHERE player_id = ?`).run(id);
  rawDb
    .prepare('UPDATE national_teams SET strength = CASE WHEN is_user_managed = 1 THEN 99 ELSE 10 END WHERE save_id = ?')
    .run(S);
}

const S = TEST_SAVE_ID;

function freshSeeded(): { rawDb: Database.Database; db: DbHandle } {
  const rawDb = createTestDb();
  seedTestDb(rawDb);
  const db = createTestDbHandle(rawDb);
  return { rawDb, db };
}

async function runToTournament(db: DbHandle, saveId: number): Promise<number> {
  const sched = buildCycleSchedule(saveId, 1, (await loadNationalTeams(db, saveId)).map((t) => t.id));
  for (let season = 1; season <= sched.tournamentSeason; season++) {
    for (const week of INTERNATIONAL_BREAK_WEEKS) {
      await advanceNationalWindow(db, saveId, season, week);
    }
  }
  return sched.tournamentSeason;
}

// Jogos da seleção do usuário (qualificatórios + torneio) já disputados, em todas as temporadas.
async function userFixtures(db: DbHandle, saveId: number, userId: number, lastSeason: number): Promise<Fixture[]> {
  const out: Fixture[] = [];
  for (let season = 1; season <= lastSeason; season++) {
    const all = await loadNationalFixtures(db, saveId, season);
    for (const f of all) {
      if (f.played && (f.homeClubId === userId || f.awayClubId === userId)) out.push(f);
    }
  }
  return out;
}

function userOutcome(f: Fixture, userId: number): 'win' | 'draw' | 'loss' {
  const userIsHome = f.homeClubId === userId;
  const ug = (userIsHome ? f.homeGoals : f.awayGoals) ?? 0;
  const og = (userIsHome ? f.awayGoals : f.homeGoals) ?? 0;
  return ug > og ? 'win' : ug < og ? 'loss' : 'draw';
}

describe('L1-D — caps + prestígio + sinergia C8', () => {
  it('reputação do técnico reflete os resultados da seleção e o título — determinística', async () => {
    const a = freshSeeded();
    const b = freshSeeded();
    await seedNationalTeams(a.db, S);
    await seedNationalTeams(b.db, S);

    const initial = await getManagerReputation(a.db, S);

    const lastSeason = await runToTournament(a.db, S);
    await runToTournament(b.db, S);

    const repA = await getManagerReputation(a.db, S);
    const repB = await getManagerReputation(b.db, S);

    // Determinismo: duas execuções independentes ⇒ mesma reputação final.
    expect(repA).toBe(repB);

    // Reconstrói o esperado replayando os jogos persistidos do usuário pelo MESMO helper puro.
    const userNation = (await getUserManagedNation(a.db, S))!;
    const fixtures = await userFixtures(a.db, S, userNation.id, lastSeason);
    expect(fixtures.length).toBeGreaterThan(0);

    let expected = initial;
    for (const f of fixtures) {
      expected = computeNationalReputationDelta({ current: expected, outcome: userOutcome(f, userNation.id) }).next;
    }
    const title = (await getNationalTitles(a.db, S))[0];
    if (title?.userManagedWon) {
      expected = computeNationalReputationDelta({ current: expected, wonTitle: true }).next;
    }
    expect(repA).toBe(expected);

    a.rawDb.close();
    b.rawDb.close();
  });

  it('vencer o torneio aumenta a reputação pelo bônus de título — determinística', async () => {
    const run = async () => {
      const { rawDb, db } = freshSeeded();
      await seedNationalTeams(db, S);
      await forceUserTitleScenario(rawDb, db);
      const userNation = (await getUserManagedNation(db, S))!;
      const before = await getManagerReputation(db, S);
      await runToTournament(db, S);
      const title = (await getNationalTitles(db, S))[0];
      const after = await getManagerReputation(db, S);
      rawDb.close();
      return { before, after, championId: title.championNationalId, userId: userNation.id, won: title.userManagedWon };
    };

    const a = await run();
    const b = await run();

    // A seleção do usuário é a campeã do cenário forçado.
    expect(a.championId).toBe(a.userId);
    expect(a.won).toBe(true);
    // Jogos do usuário são abstratos aqui (pool zerado) ⇒ a ÚNICA variação de reputação é o
    // bônus de título. Valor pós-título exato e clampado.
    expect(a.after).toBe(Math.min(100, a.before + MANAGER_REP_NATIONAL_TITLE_BONUS));
    expect(a.after).toBeGreaterThan(a.before);
    // Determinismo: duas execuções idênticas.
    expect(b.after).toBe(a.after);
    expect(b.before).toBe(a.before);
  });

  it('NÃO move a reputação quando não há seleção dirigida (resultados de rivais não contam)', async () => {
    const { rawDb, db } = freshSeeded();
    await seedNationalTeams(db, S);
    // Remove o gestor de qualquer seleção: todos os jogos passam a ser rival-vs-rival.
    await db.prepare('UPDATE national_teams SET is_user_managed = 0 WHERE save_id = ?').run(S);
    expect(await getUserManagedNation(db, S)).toBeNull();

    const initial = await getManagerReputation(db, S);
    await runToTournament(db, S);

    expect(await getManagerReputation(db, S)).toBe(initial);
    rawDb.close();
  });

  it('caps: cada titular acumula 1 cap por jogo real; gols vêm dos scorers; não-convocado não ganha cap', async () => {
    const { rawDb, db } = freshSeeded();
    await seedNationalTeams(db, S);
    const lastSeason = await runToTournament(db, S);

    const userNation = (await getUserManagedNation(db, S))!;
    const fixtures = await userFixtures(db, S, userNation.id, lastSeason);
    expect(fixtures.length).toBeGreaterThan(0);

    // Caps esperados por jogador = nº de jogos do usuário em que foi TITULAR (is_starter na
    // janela do fixture). Gols totais = gols marcados pela seleção do usuário nesses jogos.
    const expectedCaps = new Map<number, number>();
    let userGoals = 0;
    const seenWindows = new Set<string>();
    for (const f of fixtures) {
      const userIsHome = f.homeClubId === userNation.id;
      userGoals += (userIsHome ? f.homeGoals : f.awayGoals) ?? 0;
      const key = `${f.season}:${f.week}`;
      if (seenWindows.has(key)) continue; // 1 convocação por janela
      seenWindows.add(key);
      const callUps = await getCallUps(db, S, userNation.id, f.season, f.week);
      for (const c of callUps) {
        if (c.isStarter) expectedCaps.set(c.playerId, (expectedCaps.get(c.playerId) ?? 0) + 1);
      }
    }
    expect(expectedCaps.size).toBeGreaterThan(0);

    // Um titular recorrente acumula >1 cap, e cada cap registrado bate com o esperado.
    let goalsTotal = 0;
    for (const [pid, caps] of expectedCaps) {
      const rec = await getCaps(db, S, pid);
      expect(rec.caps).toBe(caps);
      goalsTotal += rec.goals;
    }
    const maxCaps = Math.max(...expectedCaps.values());
    expect(maxCaps).toBeGreaterThan(1);

    // Gols reais: o acumulado total de gols casa com os gols marcados pela seleção do usuário.
    expect(goalsTotal).toBe(userGoals);
    expect(goalsTotal).toBeGreaterThan(0);

    // Jogador que NUNCA foi convocado pelo usuário não tem cap.
    const someStarter = expectedCaps.keys().next().value as number;
    const outsider = (await db
      .prepare(
        'SELECT id FROM players WHERE save_id = ? AND id NOT IN (SELECT player_id FROM national_caps WHERE save_id = ?) LIMIT 1',
      )
      .get(S, S)) as { id: number };
    expect(outsider.id).not.toBe(someStarter);
    expect(await getCaps(db, S, outsider.id)).toEqual({ caps: 0, goals: 0 });

    rawDb.close();
  });

  it('caps são determinísticos entre execuções', async () => {
    const a = freshSeeded();
    const b = freshSeeded();
    await seedNationalTeams(a.db, S);
    await seedNationalTeams(b.db, S);
    await runToTournament(a.db, S);
    await runToTournament(b.db, S);

    const snap = (db: DbHandle) =>
      db.prepare('SELECT player_id, caps, goals FROM national_caps WHERE save_id = ? ORDER BY player_id ASC').all(S);
    expect(await snap(a.db)).toEqual(await snap(b.db));

    a.rawDb.close();
    b.rawDb.close();
  });

  it('sinergia C8: titular de jogo de seleção na janela eleva gamesInWindow e a queda de fitness, sem dupla cobrança', async () => {
    const { rawDb, db } = freshSeeded();
    await seedNationalTeams(db, S);

    const teams = await loadNationalTeams(db, S);
    const nationId = teams[0].id;
    const STARTER = 1001;
    const RESTED = 1002;

    // Um national_fixture JOGADO na semana 7 (dentro da janela [5,7] de um jogo de liga na
    // semana 8) com STARTER titular pela seleção; RESTED não foi convocado.
    rawDb
      .prepare(
        `INSERT INTO national_fixtures (id, save_id, competition_id, season, week, round, home_national_id, away_national_id, home_goals, away_goals, played)
         VALUES (700001, ?, 1, 1, 7, 1, ?, ?, 1, 0, 1)`,
      )
      .run(S, nationId, teams[1].id);
    rawDb
      .prepare(
        `INSERT INTO national_callups (save_id, national_team_id, season, window, player_id, is_starter, source)
         VALUES (?, ?, 1, 7, ?, 1, 'auto')`,
      )
      .run(S, nationId, STARTER);

    const startsByPlayer = await getNationalStartsInWindow(db, S, 1, 5, 7);
    expect(startsByPlayer.get(STARTER)).toBe(1);
    expect(startsByPlayer.get(RESTED) ?? 0).toBe(0);

    // Mesma base de congestão de clube e mesmo baseDrop: o titular da seleção sofre queda
    // MAIOR por somar o jogo de seleção; o reservado não. (Sem stacking: a contagem é 1,
    // não duplicada — a viagem é um custo flat à parte, fora desta query.)
    const clubGames = 1; // 1 jogo de liga na janela
    const baseDrop = 10;
    const starterDrop = computeCongestion({
      gamesInWindow: clubGames + (startsByPlayer.get(STARTER) ?? 0),
      baseFitnessDrop: baseDrop,
    }).fitnessDrop;
    const restedDrop = computeCongestion({
      gamesInWindow: clubGames + (startsByPlayer.get(RESTED) ?? 0),
      baseFitnessDrop: baseDrop,
    }).fitnessDrop;
    expect(starterDrop).toBeGreaterThan(restedDrop);

    // Determinismo: repetir a query dá o mesmo resultado.
    const again = await getNationalStartsInWindow(db, S, 1, 5, 7);
    expect(again.get(STARTER)).toBe(1);

    rawDb.close();
  });
});
