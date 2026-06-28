import { DbHandle } from '@/database/queries/players';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic } from '@/types/tactic';
import { HalftimeState } from '@/engine/simulation/match-engine';
import { startUserMatchLive } from '@/engine/match-day/live-match';

// Retrocompat: `orientResultToFixture` e `halftimeSeed` agora vivem em
// live-match.ts (evita ciclo de import). Re-exportados aqui para os consumidores
// existentes (telas, testes de integração).
export { orientResultToFixture, liveSeed as halftimeSeed } from '@/engine/match-day/live-match';

export interface UserHalftimeContext {
  halftime: HalftimeState;
  /** True if the user's club is the HOME side of the real fixture. */
  isHome: boolean;
  opponentName: string;
  /** The user's on-pitch XI at the start of H2 (what's currently playing). */
  homeSquad: PlayerForStrength[];
  /** The user's available bench. */
  homeBench: PlayerForStrength[];
  /** The user's current tactic (mentality/pressing/tempo etc.). */
  homeTactic: Tactic;
  fixtureId: number;
}

/**
 * Retrocompat wrapper sobre `startUserMatchLive`. Mantém o shape antigo
 * `UserHalftimeContext` consumido por telas/testes que ainda não migraram.
 * Returns null when the user has no fixture this week.
 */
export async function startUserMatchHalftime(params: {
  dbHandle: DbHandle;
  season: number;
  week: number;
  playerClubId: number;
  saveId: number;
}): Promise<UserHalftimeContext | null> {
  const ctx = await startUserMatchLive(params);
  if (!ctx) return null;
  return {
    halftime: ctx.state,
    isHome: ctx.isHome,
    opponentName: ctx.opponentName,
    homeSquad: ctx.state.home.squad,
    homeBench: ctx.homeBench,
    homeTactic: ctx.homeTactic,
    fixtureId: ctx.fixtureId,
  };
}
