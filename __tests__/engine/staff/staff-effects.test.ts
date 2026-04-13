import { getStaffEffects, StaffEffectsInput } from '@/engine/staff/staff-effects';

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
