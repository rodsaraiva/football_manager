import { getPlayersWithAttributesByClub, DbHandle } from '@/database/queries/players';
import { insertNewsItem } from '@/database/queries/news';
import { loadNationalTeams, getUserManagedNation } from '@/database/queries/national-teams';
import {
  ensureNationalFixtures,
  loadNationalFixturesDue,
  updateNationalFixtureResult,
} from '@/database/queries/national-fixtures';
import {
  ensureAutoCallUps,
  buildUserNationLineup,
  buildSyntheticNationLineup,
  simulateNationalMatch,
  nationalMatchSeed,
  NationalLineup,
} from './national-lineup';
import { calculateOverall } from '@/utils/overall';
import {
  isInternationalBreak,
  selectCallUps,
  applyTravelFatigue,
  CallUpCandidate,
} from '@/engine/national/international-duty';
import { simulateAbstractMatch } from '@/engine/national/nationality';
import { SeededRng } from '@/engine/rng';
import { NATIONAL_HOME_ADVANTAGE, NATIONAL_TOURNAMENT_COMP_ID_BASE } from '@/engine/balance';
import { saveOffset } from '@/database/constants';
import { advanceNationalTournament } from './national-tournament';
import { recordUserNationMatch } from './national-consequences';
import { WeekContext } from './week-context';

// Fase: P9 convocações internacionais. Em semanas de janela FIFA os jogadores de
// nível internacional do clube humano são convocados e voltam com fadiga de viagem.
// Roda independente de ter havido fixture de liga (a janela é evento de calendário).
export async function internationalDuty(ctx: WeekContext): Promise<number[]> {
  const { db, saveId, season, week, playerClubId } = ctx;

  // 9c. Travel fatigue STACKS with any match fitness change applied above
  // (returning from internationals tired is realistic).
  const internationalCallUps: number[] = [];
  if (isInternationalBreak(week)) {
    const squad = await getPlayersWithAttributesByClub(db, saveId, playerClubId);
    const candidates: CallUpCandidate[] = squad
      .filter((p) => !p.isFreeAgent)
      .map((p) => ({
        id: p.id,
        nationality: p.nationality,
        overall: calculateOverall(p.attributes, p.position),
      }));
    const fitnessById = new Map(squad.map((p) => [p.id, p.fitness]));
    for (const id of selectCallUps(candidates)) {
      const current = fitnessById.get(id);
      if (current == null) continue;
      const next = applyTravelFatigue(current);
      await db.prepare('UPDATE players SET fitness = ? WHERE save_id = ? AND id = ?').run(next, saveId, id);
      internationalCallUps.push(id);
    }
    if (internationalCallUps.length > 0) {
      await insertNewsItem(db, saveId, {
        season, week, category: 'callup', icon: '🌍', priority: 75,
        titleKey: 'news.persist_callup_title',
        bodyKey: internationalCallUps.length === 1 ? 'news.persist_callup_body_one' : 'news.persist_callup_body_other',
        bodyVars: { count: internationalCallUps.length },
      });
    }

    // L1: avança o calendário internacional na mesma janela FIFA. No-op para saves sem
    // seleções semeadas (mundos de teste legados), preservando a fadiga/news acima.
    await advanceNationalWindow(db, saveId, season, week);
  }

  return internationalCallUps;
}

// Gera (se faltar) os jogos da temporada e resolve os da janela atual. Jogos rival-vs-rival
// seguem o modelo ABSTRATO (SeededRng namespaced por save/season/week + força do pool). A
// seleção GERIDA passa por escalação REAL no match engine (seed própria por fixture). O
// stream do rng abstrato é consumido para TODOS os jogos (mesmo do usuário) e só sobrescrito
// pelo resultado real depois — assim os resultados rival-vs-rival ficam idênticos ao L1-A.
export async function advanceNationalWindow(
  db: DbHandle,
  saveId: number,
  season: number,
  week: number,
): Promise<void> {
  await ensureNationalFixtures(db, saveId, season);

  const userNation = await getUserManagedNation(db, saveId);
  if (userNation) await ensureAutoCallUps(db, saveId, userNation, season, week);

  const teams = await loadNationalTeams(db, saveId);
  if (teams.length < 2) return;
  const strengthById = new Map(teams.map((t) => [t.id, t.strength]));
  const nameById = new Map(teams.map((t) => [t.id, t.name]));

  // Só jogos de ELIMINATÓRIA aqui (exclui o mata-mata do torneio, que vive noutra competição
  // dentro do mesmo national_fixtures e é resolvido por advanceNationalTournament).
  const off = saveOffset(saveId);
  const due = (await loadNationalFixturesDue(db, saveId, season, week)).filter(
    (f) => f.competitionId < off + NATIONAL_TOURNAMENT_COMP_ID_BASE,
  );

  if (due.length > 0) {
    const rng = new SeededRng(saveId * 7919 + season * 1000 + week * 31 + 0x4e54);
    for (const f of due) {
      const homeStrength = (strengthById.get(f.homeClubId) ?? 0) + NATIONAL_HOME_ADVANTAGE;
      const awayStrength = strengthById.get(f.awayClubId) ?? 0;
      const abstract = simulateAbstractMatch(rng, homeStrength, awayStrength);

      const userIsHome = userNation != null && f.homeClubId === userNation.id;
      const userIsAway = userNation != null && f.awayClubId === userNation.id;

      if (userNation && (userIsHome || userIsAway)) {
        const userLineup = await buildUserNationLineup(db, saveId, userNation, season, week);
        const rivalId = userIsHome ? f.awayClubId : f.homeClubId;
        const rivalName = nameById.get(rivalId) ?? '';
        const rivalLineup = await buildSyntheticNationLineup(db, saveId, rivalName);

        const home: NationalLineup = userIsHome ? userLineup : rivalLineup;
        const away: NationalLineup = userIsHome ? rivalLineup : userLineup;
        // Lados sem XI elegível: cai no resultado abstrato (não trava o calendário).
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
          continue;
        }
      }

      await updateNationalFixtureResult(db, saveId, f.id, abstract.homeGoals, abstract.awayGoals);
    }
  }

  // Torneio final: nas janelas livres da temporada de torneio, roda o mata-mata.
  await advanceNationalTournament(db, saveId, season, week, teams, userNation);
}
