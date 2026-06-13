import {
  knowledgeTier,
  weeklyKnowledgeGain,
  maskedRange,
  advanceScouting,
  ScoutingTier,
} from '@/engine/scouting/scouting-engine';

describe('knowledgeTier', () => {
  it('classifies the golden-path bands', () => {
    expect(knowledgeTier(0)).toBe('unknown');
    expect(knowledgeTier(40)).toBe('vague');
    expect(knowledgeTier(80)).toBe('partial');
    expect(knowledgeTier(100)).toBe('full');
  });

  it('respects the exact band boundaries', () => {
    expect(knowledgeTier(24)).toBe('unknown');
    expect(knowledgeTier(25)).toBe('vague');
    expect(knowledgeTier(59)).toBe('vague');
    expect(knowledgeTier(60)).toBe('partial');
    expect(knowledgeTier(99)).toBe('partial');
    expect(knowledgeTier(100)).toBe('full');
  });

  it('treats anything above 100 as full', () => {
    expect(knowledgeTier(150)).toBe('full');
  });
});

describe('weeklyKnowledgeGain', () => {
  it('gives 7/wk for ability 1 and 20/wk for ability 20', () => {
    expect(weeklyKnowledgeGain(1)).toBe(7);
    expect(weeklyKnowledgeGain(20)).toBe(20);
  });

  it('clamps ability below 1 and above 20', () => {
    expect(weeklyKnowledgeGain(0)).toBe(7);
    expect(weeklyKnowledgeGain(-5)).toBe(7);
    expect(weeklyKnowledgeGain(25)).toBe(20);
  });

  it('rounds the mid-range', () => {
    // 6 + 10*0.7 = 13
    expect(weeklyKnowledgeGain(10)).toBe(13);
    // 6 + 14*0.7 = 15.8 -> 16
    expect(weeklyKnowledgeGain(14)).toBe(16);
  });
});

describe('maskedRange', () => {
  it('returns null for unknown', () => {
    expect(maskedRange(50, 'unknown')).toBeNull();
  });

  it('returns the exact value for full', () => {
    expect(maskedRange(50, 'full')).toEqual({ lo: 50, hi: 50 });
  });

  it('uses margin 4 for partial and margin 10 for vague', () => {
    expect(maskedRange(50, 'partial')).toEqual({ lo: 46, hi: 54 });
    expect(maskedRange(50, 'vague')).toEqual({ lo: 40, hi: 60 });
  });

  it('clamps lo/hi to [1, 99]', () => {
    expect(maskedRange(3, 'vague')).toEqual({ lo: 1, hi: 13 });
    expect(maskedRange(95, 'vague')).toEqual({ lo: 85, hi: 99 });
    expect(maskedRange(1, 'partial')).toEqual({ lo: 1, hi: 5 });
    expect(maskedRange(99, 'partial')).toEqual({ lo: 95, hi: 99 });
  });
});

describe('advanceScouting', () => {
  it('advances each row by the weekly gain', () => {
    const out = advanceScouting([{ playerId: 7, knowledge: 30, scoutAbility: 10 }]);
    expect(out).toEqual([{ playerId: 7, knowledge: 43, reachedFull: false }]);
  });

  it('caps knowledge at 100 and flags reachedFull on the crossing week', () => {
    const out = advanceScouting([{ playerId: 7, knowledge: 95, scoutAbility: 20 }]);
    expect(out[0].knowledge).toBe(100);
    expect(out[0].reachedFull).toBe(true);
  });

  it('does not re-flag reachedFull once already at 100', () => {
    const out = advanceScouting([{ playerId: 7, knowledge: 100, scoutAbility: 20 }]);
    expect(out[0].knowledge).toBe(100);
    expect(out[0].reachedFull).toBe(false);
  });

  it('handles multiple rows independently', () => {
    const out = advanceScouting([
      { playerId: 1, knowledge: 0, scoutAbility: 1 },
      { playerId: 2, knowledge: 98, scoutAbility: 5 },
    ]);
    expect(out[0]).toEqual({ playerId: 1, knowledge: 7, reachedFull: false });
    expect(out[1]).toEqual({ playerId: 2, knowledge: 100, reachedFull: true });
  });
});

// type smoke — ensures the exported union is usable
const _tier: ScoutingTier = 'full';
void _tier;
