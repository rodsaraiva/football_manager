import type { PersonalityArchetype } from './personality';

export type MoraleDriverKind =
  | 'matchWin' | 'matchLoss' | 'matchDraw' | 'heavyDefeat'
  | 'benched' | 'benchStreak' | 'idleDrift'
  | 'praise' | 'criticism' | 'teamTalk' | 'press'
  | 'wage' | 'chemistry' | 'positionUnhappy';

export interface MoraleDriver {
  kind: MoraleDriverKind;
  delta: number; // float pré-clamp; arredondar só no applyMoraleDelta
  season: number;
  week: number;
}

export interface DriverCtx {
  season: number;
  week: number;
  archetype: PersonalityArchetype;
}

export function driver(kind: MoraleDriverKind, delta: number, ctx: DriverCtx): MoraleDriver {
  return { kind, delta, season: ctx.season, week: ctx.week };
}

export function sumDrivers(drivers: readonly MoraleDriver[]): number {
  return drivers.reduce((s, d) => s + d.delta, 0);
}
