import { getStaffEffects, StaffEffectsInput, assistantAbilityFromStars } from '@/engine/staff/staff-effects';

describe('getStaffEffects', () => {
  it('returns training bonus from fitness coach', () => {
    const result = getStaffEffects({ fitnessCoachAbility: 15, physioAbility: 10, scoutAbility: 12, youthCoachAbility: 10, assistantAbility: 14 });
    expect(result.trainingBonus).toBeGreaterThan(0);
  });
  it('higher physio reduces injury recovery time', () => {
    const low = getStaffEffects({ fitnessCoachAbility: 10, physioAbility: 5, scoutAbility: 10, youthCoachAbility: 10, assistantAbility: 10 });
    const high = getStaffEffects({ fitnessCoachAbility: 10, physioAbility: 18, scoutAbility: 10, youthCoachAbility: 10, assistantAbility: 10 });
    expect(high.injuryRecoveryBonus).toBeGreaterThan(low.injuryRecoveryBonus);
  });
  it('scout ability affects potential visibility accuracy', () => {
    const low = getStaffEffects({ fitnessCoachAbility: 10, physioAbility: 10, scoutAbility: 3, youthCoachAbility: 10, assistantAbility: 10 });
    const high = getStaffEffects({ fitnessCoachAbility: 10, physioAbility: 10, scoutAbility: 18, youthCoachAbility: 10, assistantAbility: 10 });
    expect(high.scoutAccuracy).toBeGreaterThan(low.scoutAccuracy);
  });
  it('youth coach ability affects youth quality', () => {
    const low = getStaffEffects({ fitnessCoachAbility: 10, physioAbility: 10, scoutAbility: 10, youthCoachAbility: 3, assistantAbility: 10 });
    const high = getStaffEffects({ fitnessCoachAbility: 10, physioAbility: 10, scoutAbility: 10, youthCoachAbility: 18, assistantAbility: 10 });
    expect(high.youthQualityBonus).toBeGreaterThan(low.youthQualityBonus);
  });
  it('handles missing staff (ability 0)', () => {
    const result = getStaffEffects({ fitnessCoachAbility: 0, physioAbility: 0, scoutAbility: 0, youthCoachAbility: 0, assistantAbility: 0 });
    expect(result.trainingBonus).toBe(0);
    expect(result.injuryRecoveryBonus).toBe(0);
  });
});

describe('assistantAbilityFromStars', () => {
  it('maps 1-5 stars onto the 1-20 ability scale (stars*4)', () => {
    expect(assistantAbilityFromStars(1)).toBe(4);
    expect(assistantAbilityFromStars(3)).toBe(12);
    expect(assistantAbilityFromStars(5)).toBe(20);
  });

  it('feeds tacticBonus and trainingBonus when used as assistantAbility', () => {
    const ability = assistantAbilityFromStars(5);
    const effects = getStaffEffects({
      fitnessCoachAbility: ability, physioAbility: 0, scoutAbility: 0,
      youthCoachAbility: 0, assistantAbility: ability,
    });
    expect(effects.tacticBonus).toBeCloseTo(0.10, 5);
    expect(effects.trainingBonus).toBeCloseTo(0.30, 5);
  });
});
