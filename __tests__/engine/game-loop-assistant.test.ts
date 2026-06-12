import { calculateWeeklyProgression } from '@/engine/training/progression';
import { getStaffEffects, assistantAbilityFromStars } from '@/engine/staff/staff-effects';
import { PlayerAttributes } from '@/types';

const attrs40: PlayerAttributes = {
  finishing: 40, passing: 40, crossing: 40, dribbling: 40, heading: 40,
  longShots: 40, freeKicks: 40, vision: 40, composure: 40, decisions: 40,
  positioning: 40, aggression: 40, leadership: 40, pace: 40, stamina: 40,
  strength: 40, agility: 40, jumping: 40,
};

it('a 5-star assistant boosts weekly growth via getStaffEffects.trainingBonus', () => {
  const ability = assistantAbilityFromStars(5); // 20
  const bonus = getStaffEffects({
    fitnessCoachAbility: ability, physioAbility: 0, scoutAbility: 0,
    youthCoachAbility: 0, assistantAbility: ability,
  }).trainingBonus; // 0.30
  const baseInput = {
    age: 19, attributes: attrs40, effectivePotential: 85,
    minutesPlayedRecent: 90, totalPossibleMinutes: 90,
    avgRatingRecent: 7.5, trainingFocus: 'balanced' as const, trainingFacilityLevel: 3,
  };
  const without = calculateWeeklyProgression(baseInput);
  const withAssistant = calculateWeeklyProgression({ ...baseInput, staffTrainingBonus: bonus });
  expect(withAssistant.attributeChanges.passing).toBeGreaterThan(without.attributeChanges.passing);
});
