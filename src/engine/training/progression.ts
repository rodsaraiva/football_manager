import { PlayerAttributes } from '@/types';

export type TrainingFocus = 'technical' | 'tactical' | 'physical' | 'balanced';

export interface ProgressionInput {
  age: number;
  attributes: PlayerAttributes;
  effectivePotential: number;
  minutesPlayedRecent: number;    // last 4-6 weeks
  totalPossibleMinutes: number;   // max possible in same period
  avgRatingRecent: number;        // avg rating last 4-6 weeks (0 if no games)
  trainingFocus: TrainingFocus;
  trainingFacilityLevel: number;  // 1-5
}

export interface ProgressionResult {
  attributeChanges: Record<keyof PlayerAttributes, number>;
}

// Attribute category classification
const TECHNICAL_ATTRS: Array<keyof PlayerAttributes> = [
  'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'longShots', 'freeKicks',
];

const MENTAL_ATTRS: Array<keyof PlayerAttributes> = [
  'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
];

const PHYSICAL_ATTRS: Array<keyof PlayerAttributes> = [
  'pace', 'stamina', 'strength', 'agility', 'jumping',
];

// Training focus to attribute category mapping
const FOCUS_CATEGORY_MAP: Record<TrainingFocus, Array<keyof PlayerAttributes> | null> = {
  technical: TECHNICAL_ATTRS,
  tactical: MENTAL_ATTRS,
  physical: PHYSICAL_ATTRS,
  balanced: null,
};

function getBaseByAge(age: number): number {
  if (age <= 20) return 0.6;
  if (age <= 24) return 0.35;
  if (age <= 27) return 0.15;
  if (age <= 30) return 0.05;
  return -0.2; // 31+
}

function getMinutesFactor(minutesPct: number, age: number): number {
  if (minutesPct >= 0.8) return 1.5;
  if (minutesPct >= 0.5) return 1.0;
  if (minutesPct >= 0.2) return 0.5;
  // 0-19%
  return age <= 24 ? 0.1 : 0.0;
}

function getPerformanceFactor(avgRating: number): number {
  if (avgRating >= 7.5) return 1.4;
  if (avgRating >= 6.5) return 1.0;
  if (avgRating >= 5.5) return 0.6;
  return 0.3;
}

function getTrainingFactor(facilityLevel: number): number {
  return 1.0 + facilityLevel * 0.06;
}

function getPotentialFactor(effectivePotential: number, currentAttrAvg: number): number {
  return Math.max(0, (effectivePotential - currentAttrAvg) / 40);
}

function getTrainingFocusMultiplier(
  attr: keyof PlayerAttributes,
  focus: TrainingFocus,
): number {
  if (focus === 'balanced') return 1.0;

  const focusedAttrs = FOCUS_CATEGORY_MAP[focus];
  if (focusedAttrs && focusedAttrs.includes(attr)) return 1.3;
  return 0.9;
}

export function calculateWeeklyProgression(input: ProgressionInput): ProgressionResult {
  const {
    age,
    attributes,
    effectivePotential,
    minutesPlayedRecent,
    totalPossibleMinutes,
    avgRatingRecent,
    trainingFocus,
    trainingFacilityLevel,
  } = input;

  const minutesPct = totalPossibleMinutes > 0
    ? minutesPlayedRecent / totalPossibleMinutes
    : 0;

  const minutesFactor = getMinutesFactor(minutesPct, age);

  // Early exit: 25+ with zero effective minutes factor
  if (minutesFactor === 0.0) {
    const zeroChanges = {} as Record<keyof PlayerAttributes, number>;
    for (const attr of [...TECHNICAL_ATTRS, ...MENTAL_ATTRS, ...PHYSICAL_ATTRS]) {
      zeroChanges[attr] = 0;
    }
    return { attributeChanges: zeroChanges };
  }

  const performanceFactor = getPerformanceFactor(avgRatingRecent);
  const trainingFactor = getTrainingFactor(trainingFacilityLevel);

  const allAttrs = attributes as Record<keyof PlayerAttributes, number>;
  const attrValues = Object.values(allAttrs) as number[];
  const currentAttrAvg = attrValues.reduce((sum, v) => sum + v, 0) / attrValues.length;
  const potentialFactor = getPotentialFactor(effectivePotential, currentAttrAvg);

  const isVeteran = age >= 31;
  const veteranExcellent = isVeteran && minutesPct >= 0.8 && avgRatingRecent >= 7.0;
  const veteranRareBonus = isVeteran && avgRatingRecent >= 8.0 && potentialFactor > 0;

  const baseByAge = getBaseByAge(age);

  const attributeChanges = {} as Record<keyof PlayerAttributes, number>;

  const allAttrKeys: Array<keyof PlayerAttributes> = [
    ...TECHNICAL_ATTRS,
    ...MENTAL_ATTRS,
    ...PHYSICAL_ATTRS,
  ];

  for (const attr of allAttrKeys) {
    let base = baseByAge;

    if (isVeteran) {
      const isPhysical = PHYSICAL_ATTRS.includes(attr);
      const isMental = MENTAL_ATTRS.includes(attr);
      const isTechnical = TECHNICAL_ATTRS.includes(attr);

      if (isPhysical) {
        // Physical attrs use the negative base as-is (decline)
        base = baseByAge; // already -0.2
      } else if (isMental) {
        base = baseByAge * 0.5; // 50% decline rate
      } else if (isTechnical) {
        base = baseByAge * 0.7; // 70% decline rate
      }

      // Excellent veteran: reduce decline by 60%
      // Physical attrs still decline; mental/technical get boosted enough to be positive
      if (veteranExcellent) {
        if (isPhysical) {
          base = base * (1 - 0.6);
        } else {
          // For mental/technical, the high activity + performance effectively
          // maintains sharpness — apply a modest positive base instead of reduced decline
          base = Math.abs(base) * 0.4;
        }
      }

      // Rare bonus: slight gain on mentals/technicals
      if (veteranRareBonus && (isMental || isTechnical)) {
        const change =
          base * minutesFactor * performanceFactor * trainingFactor * potentialFactor +
          0.05;
        const focusMultiplier = getTrainingFocusMultiplier(attr, trainingFocus);
        attributeChanges[attr] = change * focusMultiplier;
        continue;
      }
    }

    const focusMultiplier = getTrainingFocusMultiplier(attr, trainingFocus);

    const change =
      base * minutesFactor * performanceFactor * trainingFactor * potentialFactor;

    attributeChanges[attr] = change * focusMultiplier;
  }

  return { attributeChanges };
}
