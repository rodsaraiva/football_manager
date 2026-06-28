import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { MatchResult } from '@/engine/simulation/match-engine';
import { ClubMatchData } from '@/engine/simulation/match-runner';
import { Fixture } from '@/types';

// Entrada read-only compartilhada por todas as fases de advanceGameWeek. Os campos
// db/saveId/season/week/playerClubId/rng vêm dos params; fixtures/clubData/
// resultByFixture/playerMatchResult são produzidos pela fase simulate-and-persist e
// consumidos pelas fases seguintes. Cada fase devolve um delta tipado próprio — o
// contexto nunca é mutado (não é um god object).
export interface WeekContext {
  readonly db: DbHandle;
  readonly saveId: number;
  readonly season: number;
  readonly week: number;
  readonly playerClubId: number;
  readonly rng: SeededRng;
  readonly userMatchResultOverride?: MatchResult;
  readonly fixtures: Fixture[];
  readonly clubData: Map<number, ClubMatchData>;
  readonly playerFixture: Fixture | undefined;
  readonly resultByFixture: Map<number, MatchResult>;
  readonly playerMatchResult: MatchResult | null;
}

// Saída da fase simulate-and-persist — o "match setup" que completa o WeekContext.
export interface MatchSetup {
  fixtures: Fixture[];
  clubData: Map<number, ClubMatchData>;
  playerFixture: Fixture | undefined;
  resultByFixture: Map<number, MatchResult>;
  playerMatchResult: MatchResult | null;
}
