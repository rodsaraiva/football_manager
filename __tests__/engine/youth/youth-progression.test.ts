import {
  evaluateTierTransitions, evaluatePromotion, TierCandidate, SquadContext,
  PROMOTION_OVERALL_MARGIN, FIRST_TEAM_CAP,
} from '@/engine/youth/youth-progression';
import { SeededRng } from '@/engine/rng';

const cand = (over: Partial<TierCandidate> = {}): TierCandidate => ({
  playerId: 1, age: 19, currentOverall: 60, effectivePotential: 80,
  squadTier: 'youth', seasonMinutesPercent: 0, ...over,
});
const ctx: SquadContext = { firstTeamSize: 22, starterAvgOverall: 72 };

describe('youth-progression', () => {
  it('jovem velho o suficiente sobe de youth para reserve', () => {
    const ts = evaluateTierTransitions([cand({ age: 19, currentOverall: 64 })], ctx, new SeededRng(3));
    expect(ts.find((t) => t.playerId === 1)).toMatchObject({ from: 'youth', to: 'reserve' });
  });

  it('jovem cru (16, overall baixo) permanece youth', () => {
    const ts = evaluateTierTransitions([cand({ age: 16, currentOverall: 40 })], ctx, new SeededRng(3));
    expect(ts.find((t) => t.playerId === 1)).toBeUndefined();
  });

  it('reserva pronto (overall perto do benchmark) integra ao first', () => {
    const ts = evaluateTierTransitions(
      [cand({ squadTier: 'reserve', currentOverall: 71, seasonMinutesPercent: 60 })], ctx, new SeededRng(3),
    );
    expect(ts.find((t) => t.playerId === 1)).toMatchObject({ from: 'reserve', to: 'first', reason: 'integration' });
  });

  it('é determinístico para a mesma seed', () => {
    const a = evaluateTierTransitions([cand(), cand({ playerId: 2, age: 20 })], ctx, new SeededRng(5));
    const b = evaluateTierTransitions([cand(), cand({ playerId: 2, age: 20 })], ctx, new SeededRng(5));
    expect(a).toEqual(b);
  });

  it('evaluatePromotion: ready quando overall >= benchmark - margem', () => {
    const r = evaluatePromotion(cand({ currentOverall: ctx.starterAvgOverall - PROMOTION_OVERALL_MARGIN }), ctx);
    expect(r).toEqual({ allowed: true, reason: 'ready' });
  });

  it('evaluatePromotion: too_raw quando muito abaixo', () => {
    const r = evaluatePromotion(cand({ currentOverall: 50 }), ctx);
    expect(r).toEqual({ allowed: false, reason: 'too_raw' });
  });

  it('evaluatePromotion: squad_full quando first no teto', () => {
    const full: SquadContext = { firstTeamSize: FIRST_TEAM_CAP, starterAvgOverall: 72 };
    const r = evaluatePromotion(cand({ currentOverall: 75 }), full);
    expect(r).toEqual({ allowed: false, reason: 'squad_full' });
  });
});
