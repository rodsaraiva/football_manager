export interface SeasonRating {
  avgRating: number;
  minutesPercent: number; // 0-100
}

export interface PotentialInput {
  basePotential: number;
  effectivePotential: number;
  currentOverall: number;
  seasonRatings: SeasonRating[]; // last 1-3 seasons
}

export interface PotentialResult {
  newEffectivePotential: number;
}

export function recalculatePotential(input: PotentialInput): PotentialResult {
  const { basePotential, effectivePotential, currentOverall, seasonRatings } = input;

  // Filter seasons with >= 30% minutes played
  const qualifyingSeasons = seasonRatings.filter((s) => s.minutesPercent >= 30);

  // If no qualifying seasons, freeze
  if (qualifyingSeasons.length === 0) {
    return { newEffectivePotential: effectivePotential };
  }

  // Expected rating based on current overall
  const expectedRating = 5.5 + (currentOverall - 50) * 0.04;

  let totalAdjustment = 0;
  let allBelow = true;

  for (const season of qualifyingSeasons) {
    const diff = season.avgRating - expectedRating;

    if (diff >= 0.8) {
      totalAdjustment += 3;
      allBelow = false;
    } else if (diff >= 0.3) {
      totalAdjustment += 1;
      allBelow = false;
    } else if (diff <= -1.0) {
      totalAdjustment += -4;
    } else if (diff <= -0.5) {
      totalAdjustment += -2;
    } else {
      // Between -0.5 and +0.3 — neutral, but not "below"
      allBelow = false;
    }
  }

  // Extra penalty if all 3 qualifying seasons are below expected
  if (qualifyingSeasons.length === 3 && allBelow) {
    totalAdjustment -= 3;
  }

  const rawNew = effectivePotential + totalAdjustment;

  // Clamp: min = max(basePotential - 20, currentOverall), max = basePotential + 15
  const minCap = Math.max(basePotential - 20, currentOverall);
  const maxCap = basePotential + 15;
  const newEffectivePotential = Math.min(maxCap, Math.max(minCap, rawNew));

  return { newEffectivePotential };
}
