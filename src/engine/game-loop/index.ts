import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { MatchResult } from '@/engine/simulation/match-engine';
import { AssistantComment } from '@/types/assistant';
import { SEASON_END_WEEK } from '@/engine/balance';
import { WeekContext } from './week-context';
import { simulateAndPersist, loadClubMatchData } from './simulate-and-persist';
import { humanMatchConsequences } from './human-match-consequences';
import { internationalDuty } from './international-duty';
import { scoutingPhase } from './scouting-phase';
import { transferMarket } from './transfer-market';
import { weeklyFinances } from './weekly-finances';
import { retirementPhase } from './retirement-phase';
import { advanceCalendar } from './advance-calendar';

// loadClubMatchData é parte da API pública (live-match.ts) — re-exportado daqui p/
// preservar o import path "@/engine/game-loop".
export { loadClubMatchData };

export interface AdvanceWeekParams {
  dbHandle: DbHandle;
  season: number;
  week: number;
  playerClubId: number;
  saveId: number;
  rng: SeededRng;
  // P4 (halftime): when present, the user's fixture is NOT re-simulated — this
  // already-computed result (from the watched/resumed match) is persisted and
  // its consequences applied instead. AI fixtures still run with the week rng,
  // excluding the user's fixture from the batch so the stream is unaffected.
  userMatchResultOverride?: MatchResult;
}

export interface AdvanceWeekResult {
  newSeason: number;
  newWeek: number;
  isSeasonEnd: boolean;
  playerMatchResult: MatchResult | null;
  updatedBudget: number;
  // Anunciados nesta semana (flag will_retire_at_season_end acabou de ser setada).
  newlyAnnouncedRetirementIds: number[];
  // Efetivamente aposentados nesta semana — só populado em isSeasonEnd.
  retiringPlayerIds: number[];
  // Comentário espontâneo de assistente (null se nenhum ativou esta semana).
  assistantComment: AssistantComment | null;
  // P9: jogadores do elenco convocados para suas seleções nesta semana (vazio fora
  // de janela FIFA). Cada convocado leva uma penalidade de fitness por viagem.
  internationalCallUps: number[];
}

// Sequenciador fino: monta o WeekContext (entradas + match setup) e encadeia as
// fases na MESMA ordem de antes, preservando o stream do rng. Cada fase devolve um
// delta tipado agregado no AdvanceWeekResult.
export async function advanceGameWeek(params: AdvanceWeekParams): Promise<AdvanceWeekResult> {
  const { dbHandle: db, season, week, playerClubId, saveId, rng, userMatchResultOverride } = params;

  const setup = await simulateAndPersist({
    db, saveId, season, week, playerClubId, rng, userMatchResultOverride,
  });

  const ctx: WeekContext = {
    db, saveId, season, week, playerClubId, rng, userMatchResultOverride,
    fixtures: setup.fixtures,
    clubData: setup.clubData,
    playerFixture: setup.playerFixture,
    resultByFixture: setup.resultByFixture,
    playerMatchResult: setup.playerMatchResult,
  };

  await humanMatchConsequences(ctx);
  const internationalCallUps = await internationalDuty(ctx);
  await scoutingPhase(ctx);
  await transferMarket(ctx);
  const { updatedBudget, assistantComment } = await weeklyFinances(ctx);

  const isSeasonEnd = week >= SEASON_END_WEEK;
  const { newlyAnnouncedRetirementIds, retiringPlayerIds } = await retirementPhase(ctx, isSeasonEnd);
  const { newSeason, newWeek } = await advanceCalendar(ctx, isSeasonEnd);

  return {
    newSeason,
    newWeek,
    isSeasonEnd,
    playerMatchResult: setup.playerMatchResult,
    updatedBudget,
    newlyAnnouncedRetirementIds,
    retiringPlayerIds,
    assistantComment,
    internationalCallUps,
  };
}
