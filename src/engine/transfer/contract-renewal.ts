export interface RenewalInput {
  playerAge: number;
  playerOverall: number;
  effectivePotential: number;
  currentWage: number;
  offeredWage: number;
  offeredYears: number;
  contractYearsLeft: number;
  clubReputation: number;
}

export interface RenewalResult {
  decision: 'accept' | 'reject' | 'counter';
  counterWage?: number;
  counterYears?: number;
}

/**
 * Pure: the player's expected wage scales with overall and (for prospects)
 * potential. Accept if the offer meets the expectation; reject if it's far
 * below; otherwise counter with the expected wage.
 */
export function evaluateRenewal(input: RenewalInput): RenewalResult {
  const {
    playerAge,
    playerOverall,
    effectivePotential,
    currentWage,
    offeredWage,
    offeredYears,
    clubReputation,
  } = input;

  const potentialGap = Math.max(0, effectivePotential - playerOverall);
  const overallFactor = Math.pow((playerOverall - 40) / 10, 2) * 2000;
  const potentialBoost = 1 + potentialGap * 0.04;
  const repBoost = 1 + (clubReputation / 100) * 0.2;
  // Veterans (30+) decline: they accept a pay cut. Younger players hold their value.
  const ageDecline = playerAge >= 30 ? Math.max(0.6, 1 - (playerAge - 30) * 0.05) : 1;
  const expected = Math.max(2000, Math.round((overallFactor * potentialBoost * repBoost * ageDecline) / 500) * 500);

  // Players still in their prime/rise want at least a small bump over the current
  // wage; a veteran in decline does not demand a raise floor.
  const floor = playerAge < 30 ? Math.max(expected, Math.round(currentWage * 1.05)) : expected;

  if (offeredWage >= floor) {
    return { decision: 'accept' };
  }
  // Far below expectation → walk away.
  if (offeredWage < floor * 0.7) {
    return { decision: 'reject' };
  }
  // Close → counter with the expected wage and at least the offered length.
  return {
    decision: 'counter',
    counterWage: floor,
    counterYears: Math.max(1, offeredYears),
  };
}
