import type { TKey } from '@/i18n/translate';
import { applyMoraleDelta } from '@/engine/morale/morale-engine';

export type PressTone = 'measured' | 'confident' | 'defiant';
export type PressOutcome = 'win' | 'draw' | 'loss';

export interface PressMember {
  id: number;
  morale: number;
  recentAvgRating: number; // 0 if no recent games
}

export interface SquadPressResult {
  results: { id: number; nextMorale: number }[];
  summary: { improved: number; worsened: number; unchanged: number };
  confidenceDelta: number;
  headlineKey: TKey;
}

/** Contextual question the press asks, shaped by the result. */
export function pressQuestionKey(outcome: PressOutcome): TKey {
  return `press.q_${outcome}` as TKey;
}

// ─── Trade-off matrix ─────────────────────────────────────────────────────────
// Base morale delta per (tone, outcome) BEFORE form modulation. Each tone is a
// genuine choice:
//   measured  — safe/stable: a small lift whatever the result, small trust gain.
//   confident — high risk/reward: a win pumps the room and pleases the board; a
//               loss looks arrogant and costs both morale and trust; a draw is flat.
//   defiant   — back the players / deflect blame: the squad feels protected (morale
//               up, most on a loss), but the board dislikes deflection (trust down).
const BASE_MORALE: Record<PressTone, Record<PressOutcome, number>> = {
  measured: { win: 2, draw: 1, loss: 1 },
  confident: { win: 4, draw: 0, loss: -4 },
  defiant: { win: 1, draw: 2, loss: 3 },
};

const BASE_CONFIDENCE: Record<PressTone, Record<PressOutcome, number>> = {
  measured: { win: 1, draw: 1, loss: 1 },
  confident: { win: 3, draw: 0, loss: -3 },
  defiant: { win: -1, draw: -2, loss: -2 },
};

const IN_FORM_THRESHOLD = 7.0;

/**
 * Pure: per-player morale delta from a press tone, modulated by form.
 * A positive (encouraging) line lands harder on out-of-form players — they need
 * the lift more. A negative line stings in-form players more — they have a
 * reputation to wound. Mirrors the spirit of computeTeamTalkDelta.
 */
function pressMoraleDelta(base: number, recentAvgRating: number): number {
  if (base === 0) return 0;
  const inForm = recentAvgRating >= IN_FORM_THRESHOLD;
  if (base > 0) {
    // out-of-form players gain an extra point from encouragement
    return inForm ? base : base + 1;
  }
  // base < 0: in-form players take the slight harder
  return inForm ? base - 1 : base;
}

/**
 * Pure: apply one post-match press conference to the whole roster. Each player's
 * morale moves by a form-modulated tone delta; the board's confidence shifts by a
 * modest amount keyed only to (tone, outcome). Returns per-player next morale, a
 * reaction summary computed from the post-clamp effective change, the board-trust
 * nudge, and a media-headline key.
 */
export function computePressConference(
  roster: PressMember[],
  tone: PressTone,
  outcome: PressOutcome,
): SquadPressResult {
  const baseMorale = BASE_MORALE[tone][outcome];
  const summary = { improved: 0, worsened: 0, unchanged: 0 };

  const results = roster.map((m) => {
    const delta = pressMoraleDelta(baseMorale, m.recentAvgRating);
    const nextMorale = applyMoraleDelta(m.morale, delta);
    const effective = nextMorale - m.morale; // post-clamp
    if (effective > 0) summary.improved += 1;
    else if (effective < 0) summary.worsened += 1;
    else summary.unchanged += 1;
    return { id: m.id, nextMorale };
  });

  return {
    results,
    summary,
    confidenceDelta: BASE_CONFIDENCE[tone][outcome],
    headlineKey: `press.headline_${tone}_${outcome}` as TKey,
  };
}
