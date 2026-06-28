import { DbHandle } from '@/database/queries/players';
import { getFixturesByWeek } from '@/database/queries/fixtures';
import { getClubById } from '@/database/queries/clubs';
import { getAssistantByRole } from '@/database/queries/assistants';
import { loadClubMatchData } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic } from '@/types/tactic';
import {
  initLiveMatch, simulateSegment, applyWindowOverrides, finalizeMatchResult,
  LiveMatchState, MatchInput, MatchResult, MatchStats, SecondHalfOverrides,
} from '@/engine/simulation/match-engine';
import { generateMatchAdvice } from '@/engine/assistant/match-advisor';
import { AssistantArchetype } from '@/types/assistant';
import { LiveWindowKind, LiveTrigger, MatchAdvice } from '@/types/match-advice';
import {
  LIVE_WINDOW_BLOCKS, LIVE_FINAL_STRETCH_BLOCK, MAX_LIVE_WINDOWS,
} from '@/engine/balance';

const TOTAL_BLOCKS = 30;
const HALF_BLOCK = 15;
const SUB_CAP = 5; // espelha MAX_SUBS do motor

// Isolated seed for the user's live preview so simulating ONLY their match never
// touches the rng stream the weekly advance uses for AI matches.
export function liveSeed(season: number, week: number, fixtureId: number): number {
  return season * 100000 + week * 100 + fixtureId;
}

/** Próxima fronteira de janela FIXA após `fromBlock`. null se o teto de janelas
 *  já foi atingido ou não há ponto fixo restante antes do fim. */
export function nextWindowBlock(fromBlock: number, windowsUsed: number): number | null {
  if (windowsUsed >= MAX_LIVE_WINDOWS) return null;
  for (const b of LIVE_WINDOW_BLOCKS) if (b > fromBlock) return b;
  return null;
}

/** Mapeia o bloco da janela para o tipo (UI). */
function windowKindForBlock(block: number): LiveWindowKind {
  if (block <= HALF_BLOCK) return 'halftime';
  if (block >= LIVE_FINAL_STRETCH_BLOCK) return 'final_stretch';
  return 'second_half';
}

export interface UserLiveContext {
  state: LiveMatchState;
  /** True if the user's club is the HOME side of the real fixture. */
  isHome: boolean;
  opponentName: string;
  windowKind: LiveWindowKind;
  advice: MatchAdvice[];
  /** The user's available bench (engine "home" side). */
  homeBench: PlayerForStrength[];
  homeTactic: Tactic;
  fixtureId: number;
}

function buildAdvice(
  state: LiveMatchState, archetype: AssistantArchetype, qualityStars: number, opponentName: string,
): MatchAdvice[] {
  const home = state.home;
  return generateMatchAdvice({
    archetype, qualityStars,
    userGoals: home.goals, oppGoals: state.away.goals,
    currentBlock: state.currentBlock, userTactic: home.tactic,
    onPitch: home.squad, bench: home.bench,
    yellowCardedIds: home.yellows, fatigueByPlayer: home.fatigueByPlayer,
    subsRemaining: Math.max(0, SUB_CAP - home.subsUsed),
    opponentName, rng: state.rng,
  });
}

/**
 * Simulates the user's match up to the half-time window with an isolated rng so
 * AI matches are unaffected by the pause. The user's club is ALWAYS oriented as
 * the engine's "home" side (manager overrides apply to the home side); `isHome`
 * records the real fixture venue so the UI shows the score correctly and the
 * final result is re-oriented back to the fixture frame (orientResultToFixture).
 *
 * Returns null when the user has no fixture this week.
 */
export async function startUserMatchLive(params: {
  dbHandle: DbHandle; season: number; week: number; playerClubId: number; saveId: number;
}): Promise<UserLiveContext | null> {
  const { dbHandle: db, season, week, playerClubId, saveId } = params;
  const fixtures = await getFixturesByWeek(db, saveId, season, week);
  const fixture = fixtures.find(f => !f.played && (f.homeClubId === playerClubId || f.awayClubId === playerClubId));
  if (!fixture) return null;

  const isHome = fixture.homeClubId === playerClubId;
  const opponentId = isHome ? fixture.awayClubId : fixture.homeClubId;
  const userData = await loadClubMatchData(db, saveId, playerClubId);
  const opponentData = await loadClubMatchData(db, saveId, opponentId);
  const opponentClub = await getClubById(db, saveId, opponentId);
  const squadAssistant = await getAssistantByRole(db, saveId, 'squad');

  const input: MatchInput = {
    fixtureId: fixture.id,
    homeSquad: userData.squad, awaySquad: opponentData.squad,
    homeBench: userData.bench, awayBench: opponentData.bench,
    homeTactic: userData.tactic, awayTactic: opponentData.tactic,
    homeClubReputation: userData.reputation, awayClubReputation: opponentData.reputation,
    homeSetPieceTakers: userData.setPieceTakers, awaySetPieceTakers: opponentData.setPieceTakers,
    rng: new SeededRng(liveSeed(season, week, fixture.id)),
  };

  const state = simulateSegment(initLiveMatch(input), HALF_BLOCK);
  const archetype: AssistantArchetype = squadAssistant?.archetype ?? 'tactician';
  const qualityStars = squadAssistant?.qualityStars ?? 3;
  const opponentName = opponentClub?.name ?? 'Opponent';

  return {
    state, isHome, opponentName,
    windowKind: 'halftime',
    advice: buildAdvice(state, archetype, qualityStars, opponentName),
    homeBench: state.home.bench, homeTactic: state.home.tactic, fixtureId: fixture.id,
  };
}

/**
 * Aplica os overrides da janela atual e roda até a PRÓXIMA fronteira — o menor
 * entre o próximo ponto fixo e o bloco onde um trigger opt-in dispara. Devolve o
 * próximo contexto ou null se o jogo chegou ao fim (chamador → finishLiveMatch).
 */
export function advanceToNextWindow(params: {
  state: LiveMatchState; isHome: boolean; opponentName: string; windowsUsed: number;
  overrides: SecondHalfOverrides; triggers: LiveTrigger[];
  archetype: AssistantArchetype; qualityStars: number;
}): UserLiveContext | null {
  const { state, isHome, opponentName, windowsUsed, overrides, triggers, archetype, qualityStars } = params;
  applyWindowOverrides(state, overrides);

  const finalStretchOn = triggers.includes('final_stretch');
  const concededOn = triggers.includes('conceded_goal');

  // Alvo "ideal": próximo ponto fixo (15→22), ou reta final se opt-in pediu.
  let target = nextWindowBlock(state.currentBlock, windowsUsed);
  if (
    finalStretchOn &&
    (target === null || target > LIVE_FINAL_STRETCH_BLOCK) &&
    state.currentBlock < LIVE_FINAL_STRETCH_BLOCK &&
    windowsUsed < MAX_LIVE_WINDOWS
  ) {
    target = LIVE_FINAL_STRETCH_BLOCK;
  }
  if (target === null) return null;

  if (concededOn) {
    // Roda bloco-a-bloco; para no fim do bloco onde o away marcar.
    const before = state.away.goals;
    while (state.currentBlock < target) {
      simulateSegment(state, state.currentBlock + 1);
      if (state.away.goals > before && state.currentBlock < TOTAL_BLOCKS) break;
    }
  } else {
    simulateSegment(state, target);
  }

  if (state.currentBlock >= TOTAL_BLOCKS) return null;

  const windowKind = windowKindForBlock(state.currentBlock);
  return {
    state, isHome, opponentName, windowKind,
    advice: buildAdvice(state, archetype, qualityStars, opponentName),
    homeBench: state.home.bench, homeTactic: state.home.tactic, fixtureId: state.input.fixtureId,
  };
}

export function finishLiveMatch(params: {
  state: LiveMatchState; isHome: boolean; overrides: SecondHalfOverrides;
}): MatchResult {
  const { state, isHome, overrides } = params;
  applyWindowOverrides(state, overrides);
  simulateSegment(state, TOTAL_BLOCKS);
  return orientResultToFixture(finalizeMatchResult(state), isHome);
}

/**
 * Re-orients an engine result (user-as-home) back to the real fixture frame.
 * When the user is the away side, home/away are swapped so the persisted
 * scoreline, stats and ratings match the fixture's home/away clubs.
 */
export function orientResultToFixture(result: MatchResult, userIsHome: boolean): MatchResult {
  if (userIsHome) return result;
  const s = result.stats;
  const swappedStats: MatchStats = {
    homePossession: s.awayPossession,
    awayPossession: s.homePossession,
    homeShots: s.awayShots,
    awayShots: s.homeShots,
    homeShotsOnTarget: s.awayShotsOnTarget,
    awayShotsOnTarget: s.homeShotsOnTarget,
    homeFouls: s.awayFouls,
    awayFouls: s.homeFouls,
    homeCorners: s.awayCorners,
    awayCorners: s.homeCorners,
    homeXG: s.awayXG,
    awayXG: s.homeXG,
  };
  return {
    homeGoals: result.awayGoals,
    awayGoals: result.homeGoals,
    events: result.events,
    homeRatings: result.awayRatings,
    awayRatings: result.homeRatings,
    stats: swappedStats,
    attendance: result.attendance,
  };
}
