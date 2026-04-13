export interface StaffEffectsInput {
  fitnessCoachAbility: number;
  physioAbility: number;
  scoutAbility: number;
  youthCoachAbility: number;
  assistantAbility: number;
}

export interface StaffEffects {
  trainingBonus: number;
  injuryRecoveryBonus: number;
  scoutAccuracy: number;
  youthQualityBonus: number;
  tacticBonus: number;
}

export function getStaffEffects(input: StaffEffectsInput): StaffEffects {
  return {
    trainingBonus: (input.fitnessCoachAbility / 20) * 0.30,
    injuryRecoveryBonus: (input.physioAbility / 20) * 0.50,
    scoutAccuracy: input.scoutAbility / 20,
    youthQualityBonus: Math.round((input.youthCoachAbility / 20) * 10),
    tacticBonus: (input.assistantAbility / 20) * 0.10,
  };
}
