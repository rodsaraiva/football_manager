import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek, AdvanceWeekResult } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import { assignScout } from '@/database/queries/scouting';

// ─────────────────────────────────────────────────────────────────────────────
// EH-2 (Fase 1 · caracterização): trava o comportamento ATUAL de advanceGameWeek
// fase a fase (§2.1 da spec l3-engine-health) + um GOLDEN MASTER determinístico.
// Nenhum arquivo de produção é tocado — só este teste. É o gate da Fase 2 (EH-1).
// ─────────────────────────────────────────────────────────────────────────────

const S = TEST_SAVE_ID;

// Monta + persiste o calendário da temporada 1 num DB recém-semeado. Idêntico ao
// scaffolding de __tests__/engine/game-loop.test.ts (reaproveitado para o golden).
async function buildCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const league of leagues) {
    const clubs = await getClubsByLeague(db, S, league.id);
    clubsByLeague[league.id] = clubs.map((c) => c.id);
  }
  const calendar = generateSeasonCalendar({
    season: 1,
    leagues,
    clubsByLeague,
    championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, S, {
      id: comp.id, name: comp.name, type: comp.type,
      format: comp.format, season: comp.season, leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) {
    await addCompetitionEntry(db, S, entry);
  }
  for (const fixture of calendar.fixtures) {
    await createFixture(db, S, {
      id: fixture.id, competitionId: fixture.competitionId, season: fixture.season,
      week: fixture.week, round: fixture.round as string | null,
      homeClubId: fixture.homeClubId, awayClubId: fixture.awayClubId,
    });
  }
}

function sha(v: unknown): string {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex');
}

function playerFixtureRow(rawDb: Database.Database, week: number) {
  return rawDb
    .prepare(
      'SELECT id, competition_id, home_club_id, home_goals, away_goals, played FROM fixtures WHERE season = 1 AND week = ? AND (home_club_id = 1 OR away_club_id = 1)',
    )
    .get(week) as
    | { id: number; competition_id: number; home_club_id: number; home_goals: number | null; away_goals: number | null; played: number }
    | undefined;
}

describe('advanceGameWeek · caracterização por fase (EH-2)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await buildCalendar(db);
  });

  afterEach(() => rawDb.close());

  // ─── Fase 1 — fixtures + load ───────────────────────────────────────────────
  it('fase 1: carrega a fixture do clube humano da semana e a marca como jogada', async () => {
    const before = playerFixtureRow(rawDb, 7);
    expect(before).toBeDefined();
    expect(before!.played).toBe(0);

    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });

    const after = playerFixtureRow(rawDb, 7);
    expect(after!.played).toBe(1);
    expect(after!.home_goals).not.toBeNull();
    expect(after!.away_goals).not.toBeNull();
  });

  // ─── Fase 2 — simulação ─────────────────────────────────────────────────────
  it('fase 2: o jogo do clube humano roda no engine real (11 ratings por lado)', async () => {
    const res = await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    expect(res.playerMatchResult).not.toBeNull();
    expect(res.playerMatchResult!.homeRatings).toHaveLength(11);
    expect(res.playerMatchResult!.awayRatings).toHaveLength(11);
  });

  // ─── Fase 3 — persistência de resultados + stats ────────────────────────────
  it('fase 3: persiste player_stats (>=22 linhas) e event log da partida do humano', async () => {
    const res = await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    const fx = playerFixtureRow(rawDb, 7)!;

    const statRows = rawDb
      .prepare('SELECT COUNT(*) AS c FROM player_stats WHERE season = 1 AND competition_id = ? AND appearances > 0')
      .get(fx.competition_id) as { c: number };
    expect(statRows.c).toBeGreaterThanOrEqual(22);

    // O event log completo é gravado só para a partida do humano.
    const evRows = rawDb
      .prepare('SELECT COUNT(*) AS c FROM match_events WHERE fixture_id = ?')
      .get(fx.id) as { c: number };
    expect(evRows.c).toBe(res.playerMatchResult!.events.length);
  });

  // ─── Fase 4 — consequências do clube humano ─────────────────────────────────
  it('fase 4: progressão acumula nos *_progress de player_attributes', async () => {
    const sumProgress = () =>
      (rawDb
        .prepare(
          `SELECT COALESCE(SUM(ABS(finishing_progress)+ABS(passing_progress)+ABS(crossing_progress)+
             ABS(dribbling_progress)+ABS(heading_progress)+ABS(long_shots_progress)+ABS(free_kicks_progress)+
             ABS(vision_progress)+ABS(composure_progress)+ABS(decisions_progress)+ABS(positioning_progress)+
             ABS(aggression_progress)+ABS(leadership_progress)+ABS(pace_progress)+ABS(stamina_progress)+
             ABS(strength_progress)+ABS(agility_progress)+ABS(jumping_progress)), 0) AS s
           FROM player_attributes WHERE player_id IN (SELECT id FROM players WHERE club_id = 1)`,
        )
        .get() as { s: number }).s;

    expect(sumProgress()).toBe(0);
    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    // Progressão fracionária do treino acumula nos *_progress em vez de ser arredondada.
    expect(sumProgress()).toBeGreaterThan(0);
  });

  it('fase 4: lesões decrementam-antes-de-aplicar (recupera primeiro, lesão longa sobrevive à semana)', async () => {
    // injuryRecoveryStep subtrai 1 + bônus do physio; com 10 semanas a lesão recua
    // mas continua positiva — caracteriza "recupera-antes-de-aplicar" (a duração não
    // é re-bumpada nem zerada prematuramente pela lesão nova desta partida).
    const victim = rawDb.prepare('SELECT id FROM players WHERE club_id = 1 ORDER BY id ASC LIMIT 1').get() as { id: number };
    rawDb.prepare('UPDATE players SET injury_weeks_left = 10 WHERE id = ?').run(victim.id);

    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });

    const after = rawDb.prepare('SELECT injury_weeks_left AS w FROM players WHERE id = ?').get(victim.id) as { w: number };
    expect(after.w).toBeLessThan(10);
    expect(after.w).toBeGreaterThan(0);
  });

  it('fase 4: suspensões decrementam-antes-de-aplicar (2 → 1 na mesma semana)', async () => {
    const benched = rawDb.prepare('SELECT id FROM players WHERE club_id = 1 ORDER BY id DESC LIMIT 1').get() as { id: number };
    rawDb.prepare('UPDATE players SET suspension_weeks_left = 2 WHERE id = ?').run(benched.id);

    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });

    const after = rawDb.prepare('SELECT suspension_weeks_left AS s FROM players WHERE id = ?').get(benched.id) as { s: number };
    expect(after.s).toBe(1);
  });

  it('fase 4: moral pós-jogo do elenco humano muda após a partida', async () => {
    const before = rawDb
      .prepare('SELECT id, morale FROM players WHERE club_id = 1 ORDER BY id ASC')
      .all() as Array<{ id: number; morale: number }>;
    const beforeById = new Map(before.map((r) => [r.id, r.morale]));

    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });

    const after = rawDb
      .prepare('SELECT id, morale FROM players WHERE club_id = 1 ORDER BY id ASC')
      .all() as Array<{ id: number; morale: number }>;
    const changed = after.filter((r) => beforeById.get(r.id) !== r.morale);
    expect(changed.length).toBeGreaterThan(0);

    // P5: a partida do humano arma o gate da coletiva de imprensa.
    const press = rawDb.prepare('SELECT press_pending AS p FROM save_games WHERE id = ?').get(S) as { p: number };
    expect(press.p).toBe(1);
  });

  // ─── Fase 5 — convocações internacionais ────────────────────────────────────
  it('fase 5: na janela FIFA (sem 7) convoca jogadores e aplica fadiga de viagem', async () => {
    // week 7 ∈ INTERNATIONAL_BREAK_WEEKS.
    const res = await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    expect(res.internationalCallUps.length).toBeGreaterThan(0);
    // News de convocação foi gravada.
    const news = rawDb
      .prepare("SELECT COUNT(*) AS c FROM news_items WHERE save_id = ? AND category = 'callup'")
      .get(S) as { c: number };
    expect(news.c).toBeGreaterThan(0);
  });

  // ─── Fase 6 — scouting ──────────────────────────────────────────────────────
  it('fase 6: assignment ativo acumula knowledge do alvo na semana', async () => {
    // O seed atribui papéis de staff aleatoriamente; injeta um scout próprio do
    // clube 1 p/ o teste não depender de quais papéis o clube 1 sorteou.
    const scoutId = 90000001;
    rawDb
      .prepare("INSERT INTO staff (id, save_id, name, role, club_id, ability, wage, contract_end) VALUES (?, ?, 'Test Scout', 'scout', 1, 15, 1000, 2027)")
      .run(scoutId, S);
    const target = rawDb.prepare('SELECT id FROM players WHERE club_id = 2 AND is_free_agent = 0 LIMIT 1').get() as { id: number };
    await assignScout(db, S, target.id, scoutId);

    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });

    const know = rawDb.prepare('SELECT knowledge AS k FROM scouting WHERE save_id = ? AND player_id = ?').get(S, target.id) as { k: number };
    expect(know.k).toBeGreaterThan(0);
  });

  // ─── Fase 7 — knockout progression ──────────────────────────────────────────
  it('fase 7: avança a rodada eliminatória sem quebrar a semana', async () => {
    // Caracterização leve: maybeGenerateNextKnockoutRound roda dentro da semana e
    // não derruba o avanço (cobertura de regressão é dos testes de round-progression).
    const res = await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    expect(res.newWeek).toBe(8);
  });

  // ─── Fase 8 — mercado ───────────────────────────────────────────────────────
  it('fase 8: em janela de transferências o mercado de IA gera ofertas', async () => {
    // week 5 ∈ janela (1..6). Sem fixture de liga, mas o mercado roda mesmo assim.
    await advanceGameWeek({ dbHandle: db, season: 1, week: 5, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    const offers = rawDb.prepare('SELECT COUNT(*) AS c FROM transfer_offers WHERE save_id = ?').get(S) as { c: number };
    expect(offers.c).toBeGreaterThan(0);
  });

  // ─── Fase 9 — finanças semanais + debt-weeks ────────────────────────────────
  it('fase 9: grava entradas de finança da semana p/ o clube humano (tv/sponsor/wages/maintenance)', async () => {
    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    const types = (rawDb
      .prepare('SELECT type FROM club_finances WHERE club_id = 1 AND season = 1 AND week = 7')
      .all() as Array<{ type: string }>).map((r) => r.type);
    expect(types).toContain('tv');
    expect(types).toContain('sponsor');
    expect(types).toContain('wages');
    expect(types).toContain('maintenance');
  });

  it('fase 9: debt_weeks incrementa quando o orçamento fecha negativo', async () => {
    // Força saldo muito negativo p/ o clube humano antes da semana.
    rawDb.prepare('UPDATE clubs SET budget = -100000000, debt_weeks = 0 WHERE id = 1').run();
    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    const row = rawDb.prepare('SELECT debt_weeks AS d FROM clubs WHERE id = 1').get() as { d: number };
    expect(row.d).toBe(1);
  });

  // ─── Fase 10 — comentário de assistente ─────────────────────────────────────
  it('fase 10: o resultado expõe o campo assistantComment (null ou objeto)', async () => {
    const res = await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    expect(res).toHaveProperty('assistantComment');
    expect(res.assistantComment === null || typeof res.assistantComment === 'object').toBe(true);
  });

  // ─── Fase 11 — drift de moral idle + streak de aposentadoria ─────────────────
  it('fase 11: streak de baixa moral incrementa para jogador na janela etária', async () => {
    // Jogador na janela [33,40], moral abaixo do threshold → streak deve subir.
    const cand = rawDb.prepare('SELECT id FROM players WHERE club_id = 1 ORDER BY id ASC LIMIT 1').get() as { id: number };
    rawDb
      .prepare('UPDATE players SET age = 35, morale = 30, consecutive_low_morale_weeks = 0, will_retire_at_season_end = 0 WHERE id = ?')
      .run(cand.id);

    await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });

    const after = rawDb.prepare('SELECT consecutive_low_morale_weeks AS w FROM players WHERE id = ?').get(cand.id) as { w: number };
    expect(after.w).toBe(1);
  });

  // ─── Fase 12 — avanço / fim de temporada ────────────────────────────────────
  it('fase 12: avanço normal incrementa o ponteiro de semana no save', async () => {
    const res = await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    expect(res.newSeason).toBe(1);
    expect(res.newWeek).toBe(8);
    expect(res.isSeasonEnd).toBe(false);
    const save = rawDb.prepare('SELECT current_season AS s, current_week AS w FROM save_games WHERE id = ?').get(S) as { s: number; w: number };
    expect(save.s).toBe(1);
    expect(save.w).toBe(8);
  });

  it('fase 12: fim de temporada (semana 58) faz rollover e arquiva a temporada', async () => {
    rawDb
      .prepare("UPDATE fixtures SET home_goals = 3, away_goals = 0, played = 1 WHERE season = 1 AND week = 7 LIMIT 1")
      .run();
    const res = await advanceGameWeek({ dbHandle: db, season: 1, week: 58, playerClubId: 1, saveId: S, rng: new SeededRng(42) });
    expect(res.isSeasonEnd).toBe(true);
    expect(res.newSeason).toBe(2);
    expect(res.newWeek).toBe(1);
    const archived = rawDb.prepare('SELECT COUNT(*) AS c FROM season_competition_results WHERE season = 1').get() as { c: number };
    expect(archived.c).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN MASTER de determinismo. Monta um save real, avança 7 semanas com seeds
// fixas e computa digests SHA-256 ORDER-STABLE (ORDER BY PK) do estado de DB
// relevante + a sequência de AdvanceWeekResult. Os literais abaixo foram CAPTURADOS
// rodando o código ATUAL — são a guarda byte-a-byte da extração de fases (Fase 2).
// ─────────────────────────────────────────────────────────────────────────────

// Projeção determinística e estável (campos de gameplay que o loop muta).
function digestState(rawDb: Database.Database, results: AdvanceWeekResult[]) {
  const players = rawDb
    .prepare(
      `SELECT id, club_id, age, morale, fitness, match_sharpness, injury_weeks_left, injury_severity,
              injury_return_fitness, is_free_agent, consecutive_low_morale_weeks,
              will_retire_at_season_end, suspension_weeks_left
       FROM players ORDER BY id`,
    )
    .all();
  const attributes = rawDb.prepare('SELECT * FROM player_attributes ORDER BY player_id').all();
  const finances = rawDb
    .prepare('SELECT club_id, season, week, type, amount, description FROM club_finances ORDER BY id')
    .all();
  const save = rawDb
    .prepare(
      'SELECT id, current_season, current_week, press_pending, board_trust, manager_reputation, media_sentiment FROM save_games ORDER BY id',
    )
    .all();
  const resultSeq = results.map((r) => ({
    newSeason: r.newSeason,
    newWeek: r.newWeek,
    isSeasonEnd: r.isSeasonEnd,
    updatedBudget: r.updatedBudget,
    score: r.playerMatchResult ? [r.playerMatchResult.homeGoals, r.playerMatchResult.awayGoals] : null,
    events: r.playerMatchResult ? r.playerMatchResult.events.length : 0,
    newlyAnnounced: r.newlyAnnouncedRetirementIds.length,
    retiring: r.retiringPlayerIds.length,
    callUps: r.internationalCallUps.slice().sort((a, b) => a - b),
    hasComment: r.assistantComment != null,
  }));
  return {
    players: sha(players),
    attributes: sha(attributes),
    finances: sha(finances),
    save: sha(save),
    results: sha(resultSeq),
  };
}

describe('advanceGameWeek · golden master de determinismo', () => {
  // Literais capturados rodando o código ATUAL (golden master clássico).
  const GOLDEN = {
    players: '9d2a337cfc534f0a4d28c6d8a3da0a1ea42e1aa2e9207386ebf67068635c0a7a',
    attributes: '1812557b93b58a219e7c748d8608cfe86816b598a5bb1dcbb8eb15d3f2c8e93c',
    finances: '7f800f42122edb78b658dcd35fa7ef7be8c1da24b61eb218323e9671fedeb791',
    save: 'd383bcc0113147589ad8481b53422955ef180a2662295c297b72111bfeb6b071',
    results: 'bb4f9495b19569bc8c64f13c303421d8b04f953401db026a557d7dd41835ddac',
  };

  it('estado de DB + sequência de resultados batem com o golden literal (7 semanas)', async () => {
    const rawDb = createTestDb();
    seedTestDb(rawDb);
    const db = createTestDbHandle(rawDb);
    await buildCalendar(db);

    const results: AdvanceWeekResult[] = [];
    for (let week = 7; week <= 13; week++) {
      results.push(
        await advanceGameWeek({
          dbHandle: db, season: 1, week, playerClubId: 1, saveId: S,
          rng: new SeededRng(20260620 + week),
        }),
      );
    }

    const actual = digestState(rawDb, results);
    rawDb.close();

    // eslint-disable-next-line no-console
    if (process.env.CAPTURE_GOLDEN) console.log('GOLDEN_ACTUAL=' + JSON.stringify(actual));

    expect(actual).toEqual(GOLDEN);
  });
});
