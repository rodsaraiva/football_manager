import { DbHandle } from '@/database/queries/players';
import { NationalTeam } from '@/database/queries/national-teams';
import {
  buildCycleSchedule,
  loadNationalFixtures,
  loadNationalFixturesByCompetition,
  insertNationalKnockoutFixtures,
  updateNationalFixtureResult,
} from '@/database/queries/national-fixtures';
import { createCompetition } from '@/database/queries/leagues';
import { hasNationalTitle, recordNationalTitle } from '@/database/queries/national-titles';
import { insertNewsItem } from '@/database/queries/news';
import {
  buildUserNationLineup,
  buildSyntheticNationLineup,
  simulateNationalMatch,
  nationalMatchSeed,
  NationalLineup,
} from './national-lineup';
import { recordUserNationMatch, applyUserNationTitleReputation } from './national-consequences';
import { calculateStandings } from '@/engine/competition/standings';
import { generateKnockoutRound } from '@/engine/competition/fixture-generator';
import {
  resolveKnockoutTie,
  buildNextKnockoutRound,
  isKnockoutComplete,
  PlayedKnockoutFixture,
} from '@/engine/competition/knockout';
import { simulateAbstractMatch } from '@/engine/national/nationality';
import { INTERNATIONAL_BREAK_WEEKS } from '@/engine/national/international-duty';
import { SeededRng } from '@/engine/rng';
import { saveOffset } from '@/database/constants';
import {
  NATIONAL_HOME_ADVANTAGE,
  NATIONAL_TOURNAMENT_COMP_ID_BASE,
  NATIONAL_TOURNAMENT_FIXTURE_ID_BASE,
} from '@/engine/balance';
import { Fixture } from '@/types';

// Maior potência de 2 ≤ n (define o tamanho do bracket; 5 nações → 4 → semifinais).
function largestPow2(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

// Ordem de seeding padrão do mata-mata (1 enfrenta o pior, etc.), 0-based sobre a
// classificação. n=4 → [0,3,1,2] ⇒ (1º x 4º), (2º x 3º).
function seedBracketOrder(n: number): number[] {
  let seeds = [1];
  while (seeds.length < n) {
    const len = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(len - s);
    }
    seeds = next;
  }
  return seeds.map((s) => s - 1);
}

// Ids estáveis e distintos dos da eliminatória para os jogos de mata-mata.
function knockoutFixtureId(off: number, cycle: number, round: number, idx: number): number {
  return off + NATIONAL_TOURNAMENT_FIXTURE_ID_BASE + cycle * 10_000 + round * 100 + idx;
}

// Seed do desempate de mata-mata (pênaltis), por rodada — estável entre execuções.
function tournamentResolveSeed(saveId: number, comp: number, season: number, round: number): number {
  return (saveId * 1_000_003 + comp) * 131 + season * 17 + round;
}

// Seed do resultado abstrato (rival vs rival) no mata-mata, namespaced por fixture.
function tournamentAbstractSeed(saveId: number, season: number, week: number, fixtureId: number): number {
  return (saveId * 7919 + season * 1000 + week * 31) * 1_000_003 + fixtureId + 0x544e;
}

function toPlayed(f: Fixture, round: number): PlayedKnockoutFixture {
  return {
    homeClubId: f.homeClubId,
    awayClubId: f.awayClubId,
    homeGoals: f.homeGoals ?? 0,
    awayGoals: f.awayGoals ?? 0,
    round,
  };
}

async function ensureTournamentCompetition(
  db: DbHandle,
  saveId: number,
  competitionId: number,
  season: number,
): Promise<void> {
  const row = await db
    .prepare('SELECT 1 AS x FROM competitions WHERE save_id = ? AND id = ?')
    .get(saveId, competitionId);
  if (row) return;
  await createCompetition(db, saveId, {
    id: competitionId,
    name: 'International Tournament',
    type: 'national',
    format: 'knockout',
    season,
    leagueId: null,
  });
}

// Simula UM jogo de mata-mata: seleção do usuário com XI real (igual L1-B); rivais por
// modelo abstrato (SeededRng namespaced por fixture). Persiste o placar.
async function simulateTournamentFixture(
  db: DbHandle,
  saveId: number,
  season: number,
  week: number,
  f: Fixture,
  userNation: NationalTeam | null,
  strengthById: Map<number, number>,
  nameById: Map<number, string>,
): Promise<void> {
  const userIsHome = userNation != null && f.homeClubId === userNation.id;
  const userIsAway = userNation != null && f.awayClubId === userNation.id;

  if (userNation && (userIsHome || userIsAway)) {
    const userLineup = await buildUserNationLineup(db, saveId, userNation, season, week);
    const rivalId = userIsHome ? f.awayClubId : f.homeClubId;
    const rivalName = nameById.get(rivalId) ?? '';
    const rivalLineup = await buildSyntheticNationLineup(db, saveId, rivalName);
    const home: NationalLineup = userIsHome ? userLineup : rivalLineup;
    const away: NationalLineup = userIsHome ? rivalLineup : userLineup;
    if (home.squad.length > 0 && away.squad.length > 0) {
      const result = simulateNationalMatch(f.id, nationalMatchSeed(saveId, season, week, f.id), {
        home,
        homeReputation: strengthById.get(f.homeClubId) ?? 50,
        away,
        awayReputation: strengthById.get(f.awayClubId) ?? 50,
      });
      await updateNationalFixtureResult(db, saveId, f.id, result.homeGoals, result.awayGoals);
      // L1-D: caps/gols dos titulares do usuário + prestígio do técnico pelo resultado.
      await recordUserNationMatch(db, saveId, userIsHome, userLineup, result);
      return;
    }
  }

  const rng = new SeededRng(tournamentAbstractSeed(saveId, season, week, f.id));
  const home = (strengthById.get(f.homeClubId) ?? 0) + NATIONAL_HOME_ADVANTAGE;
  const away = strengthById.get(f.awayClubId) ?? 0;
  const abstract = simulateAbstractMatch(rng, home, away);
  await updateNationalFixtureResult(db, saveId, f.id, abstract.homeGoals, abstract.awayGoals);
}

async function recordChampion(
  db: DbHandle,
  saveId: number,
  competitionId: number,
  season: number,
  week: number,
  championId: number,
  runnerUpId: number,
  userNation: NationalTeam | null,
  nameById: Map<number, string>,
): Promise<void> {
  if (await hasNationalTitle(db, saveId, competitionId, season)) return; // idempotente
  const userWon = userNation != null && userNation.id === championId;
  await recordNationalTitle(db, saveId, {
    competitionId,
    season,
    championNationalId: championId,
    runnerUpNationalId: runnerUpId,
    userManagedWon: userWon,
  });
  // L1-D: bônus de prestígio do técnico por conquistar o torneio (idempotente via guarda acima).
  if (userWon) await applyUserNationTitleReputation(db, saveId);
  await insertNewsItem(db, saveId, {
    season,
    week,
    category: 'national',
    icon: '🏆',
    priority: 90,
    titleKey: userWon ? 'news.national_champion_user_title' : 'news.national_champion_title',
    bodyKey: userWon ? 'news.national_champion_user_body' : 'news.national_champion_body',
    bodyVars: { nation: nameById.get(championId) ?? '' },
  });
}

/**
 * Torneio final internacional. Na temporada de torneio do ciclo (última do ciclo de
 * eliminatória), as janelas FIFA livres (sem jogos de qualificação) hospedam o mata-mata:
 * top-K da classificação da eliminatória → semifinais → final, reusando standings/knockout
 * puros. Aditivo: não toca na eliminatória/standings/news de L1-A/B. Determinístico e
 * idempotente por janela.
 */
export async function advanceNationalTournament(
  db: DbHandle,
  saveId: number,
  season: number,
  week: number,
  teams: NationalTeam[],
  userNation: NationalTeam | null,
): Promise<void> {
  if (teams.length < 4) return; // sem bracket mínimo de 4, não há torneio
  const ids = teams.map((t) => t.id);
  const schedule = buildCycleSchedule(saveId, season, ids);
  if (season !== schedule.tournamentSeason) return;

  const qualifierWeeks = new Set(
    schedule.fixtures.filter((f) => f.season === schedule.tournamentSeason).map((f) => f.week),
  );
  const freeWindows = INTERNATIONAL_BREAK_WEEKS.filter((w) => !qualifierWeeks.has(w));
  const j = freeWindows.indexOf(week);
  if (j === -1) return; // janela ocupada pela eliminatória ou fora do calendário

  const off = saveOffset(saveId);
  const comp = off + NATIONAL_TOURNAMENT_COMP_ID_BASE + schedule.cycle;
  const bracketSize = largestPow2(teams.length);

  const strengthById = new Map(teams.map((t) => [t.id, t.strength]));
  const nameById = new Map(teams.map((t) => [t.id, t.name]));
  const reputationByClubId = new Map(teams.map((t) => [t.id, t.strength]));

  await ensureTournamentCompetition(db, saveId, comp, schedule.tournamentSeason);

  let tf = await loadNationalFixturesByCompetition(db, saveId, schedule.tournamentSeason, comp);

  // Seeding das semifinais (só na 1ª janela livre).
  if (tf.length === 0) {
    if (j !== 0) return; // o torneio não começa no meio das janelas livres
    const qualFixtures: Fixture[] = [];
    for (let s = schedule.baseSeason; s <= schedule.tournamentSeason; s++) {
      const all = await loadNationalFixtures(db, saveId, s);
      for (const f of all) if (f.competitionId === schedule.competitionId) qualFixtures.push(f);
    }
    const table = calculateStandings(qualFixtures, ids);
    const topIds = table.slice(0, bracketSize).map((e) => e.clubId);
    const seeded = seedBracketOrder(bracketSize).map((i) => topIds[i]);
    const sf = generateKnockoutRound(seeded, {
      competitionId: comp,
      season: schedule.tournamentSeason,
      week,
      round: 1,
    });
    await insertNationalKnockoutFixtures(
      db,
      saveId,
      sf.map((f, i) => ({
        id: knockoutFixtureId(off, schedule.cycle, 1, i),
        competitionId: comp,
        season: schedule.tournamentSeason,
        week,
        round: 1,
        homeId: f.homeClubId,
        awayId: f.awayClubId,
      })),
    );
    tf = await loadNationalFixturesByCompetition(db, saveId, schedule.tournamentSeason, comp);
  }

  // Simula os jogos desta janela ainda não jogados.
  for (const f of tf.filter((x) => x.week === week && !x.played)) {
    await simulateTournamentFixture(db, saveId, schedule.tournamentSeason, week, f, userNation, strengthById, nameById);
  }

  tf = await loadNationalFixturesByCompetition(db, saveId, schedule.tournamentSeason, comp);

  // Resolve a rodada completa e gera a próxima até concluir (ou até cair numa janela futura).
  for (;;) {
    const currentRound = Math.max(...tf.map((f) => f.round ?? 0));
    const roundFx = tf.filter((f) => (f.round ?? 0) === currentRound).sort((a, b) => a.id - b.id);
    if (roundFx.some((f) => !f.played)) break; // rodada ainda não disputada nesta janela

    const rng = new SeededRng(tournamentResolveSeed(saveId, comp, schedule.tournamentSeason, currentRound));
    const resolved = roundFx.map((f) => resolveKnockoutTie(toPlayed(f, currentRound), rng));
    const winners = resolved.map((r) => r.winnerClubId);

    if (isKnockoutComplete(winners, [])) {
      await recordChampion(
        db,
        saveId,
        comp,
        schedule.tournamentSeason,
        week,
        winners[0],
        resolved[0].loserClubId,
        userNation,
        nameById,
      );
      break;
    }

    const nextRound = currentRound + 1;
    const nextWeek = freeWindows[Math.min(nextRound - 1, freeWindows.length - 1)];
    const next = buildNextKnockoutRound({
      competitionId: comp,
      season: schedule.tournamentSeason,
      completedRound: currentRound,
      winners,
      pendingByeClubIds: [],
      week: nextWeek,
      reputationByClubId,
    });
    await insertNationalKnockoutFixtures(
      db,
      saveId,
      next.fixtures.map((f, i) => ({
        id: knockoutFixtureId(off, schedule.cycle, nextRound, i),
        competitionId: comp,
        season: schedule.tournamentSeason,
        week: nextWeek,
        round: nextRound,
        homeId: f.homeClubId,
        awayId: f.awayClubId,
      })),
    );

    if (nextWeek === week) {
      // Drenagem (mesma janela): simula a rodada recém-criada e continua resolvendo.
      const fresh = (await loadNationalFixturesByCompetition(db, saveId, schedule.tournamentSeason, comp)).filter(
        (x) => (x.round ?? 0) === nextRound && !x.played,
      );
      for (const f of fresh) {
        await simulateTournamentFixture(db, saveId, schedule.tournamentSeason, week, f, userNation, strengthById, nameById);
      }
      tf = await loadNationalFixturesByCompetition(db, saveId, schedule.tournamentSeason, comp);
      continue;
    }
    break; // a próxima rodada cai numa janela futura
  }
}
