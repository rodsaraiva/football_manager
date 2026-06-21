// Pure mission model. No React/Expo/DB. Determinístico (sem rng).
import { weeklyKnowledgeGain } from './scouting-engine';

export type MissionType = 'short_eval' | 'long_project' | 'opponent_intel' | 'youth_prospect';

export interface MissionDef {
  type: MissionType;
  durationWeeks: number;
  weeklyPaceMult: number;
  revealsPotential: boolean;
}

export const MISSION_DEFS: Record<MissionType, MissionDef> = {
  short_eval: { type: 'short_eval', durationWeeks: 3, weeklyPaceMult: 1.5, revealsPotential: false },
  long_project: { type: 'long_project', durationWeeks: 10, weeklyPaceMult: 0.8, revealsPotential: true },
  opponent_intel: { type: 'opponent_intel', durationWeeks: 1, weeklyPaceMult: 2.0, revealsPotential: false },
  youth_prospect: { type: 'youth_prospect', durationWeeks: 4, weeklyPaceMult: 1.2, revealsPotential: false },
};

export interface MissionProgressRow {
  missionId: number;
  type: MissionType;
  knowledge: number;
  weeksElapsed: number;
  scoutAbility: number;
  archetypeMult: number;
}

export interface MissionProgressResult {
  missionId: number;
  knowledge: number;
  weeksElapsed: number;
  completed: boolean;
  expiredEarly: boolean;
}

export function advanceMission(row: MissionProgressRow): MissionProgressResult {
  const def = MISSION_DEFS[row.type];
  const gain = weeklyKnowledgeGain(row.scoutAbility) * def.weeklyPaceMult * row.archetypeMult;
  const knowledge = Math.min(100, Math.round(row.knowledge + gain));
  const weeksElapsed = row.weeksElapsed + 1;
  const reachedFull = knowledge >= 100;
  const deadlineHit = weeksElapsed >= def.durationWeeks;
  const completed = reachedFull || deadlineHit;
  return {
    missionId: row.missionId,
    knowledge,
    weeksElapsed,
    completed,
    expiredEarly: completed && !reachedFull,
  };
}

export type VerdictKey =
  | 'verdict.bargain'
  | 'verdict.solid'
  | 'verdict.risky'
  | 'verdict.inconclusive';

/** Veredito textual-chave a partir do conhecimento final + masked overall. */
export function missionVerdict(knowledge: number, maskedOvr: number): { verdictKey: VerdictKey } {
  if (knowledge < 60) return { verdictKey: 'verdict.inconclusive' };
  if (maskedOvr >= 78) return { verdictKey: 'verdict.bargain' };
  if (maskedOvr >= 65) return { verdictKey: 'verdict.solid' };
  return { verdictKey: 'verdict.risky' };
}
