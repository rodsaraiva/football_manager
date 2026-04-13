# Football Manager — Plan 3: Engine Systems

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the financial engine, player progression/training system, transfer market AI, staff effects, youth academy, and the week advancement orchestrator that ties everything together. After this plan, a full season can be advanced week by week with all systems running.

**Architecture:** Pure engine functions in `src/engine/` that receive data and return changes. The orchestrator (`src/engine/week-advance.ts`) coordinates all systems and interacts with the database through query functions.

**Tech Stack:** TypeScript, SeededRng, existing types/queries/engine from Plans 1-2.

---

## File Structure

```
src/engine/
├── rng.ts                          # (exists)
├── competition/                    # (exists from Plan 2)
├── simulation/                     # (exists from Plan 2)
├── finance/
│   └── finance-engine.ts           # Weekly income/expenses calculations
├── training/
│   ├── progression.ts              # Player evolution formula
│   └── potential.ts                # Dynamic potential recalculator
├── transfer/
│   ├── market-value.ts             # Dynamic market value calculator
│   └── transfer-ai.ts             # AI club transfer decisions
├── staff/
│   └── staff-effects.ts           # How staff quality affects the club
├── youth/
│   └── youth-academy.ts           # Generate youth players
└── week-advance.ts                 # Main orchestrator
```

```
__tests__/engine/
├── finance/
│   └── finance-engine.test.ts
├── training/
│   ├── progression.test.ts
│   └── potential.test.ts
├── transfer/
│   ├── market-value.test.ts
│   └── transfer-ai.test.ts
├── staff/
│   └── staff-effects.test.ts
├── youth/
│   └── youth-academy.test.ts
└── week-advance.test.ts
```

---

### Task 1: Financial Engine

**Files:**
- Create: `src/engine/finance/finance-engine.ts`
- Test: `__tests__/engine/finance/finance-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/finance/finance-engine.test.ts`:

```ts
import {
  calculateWeeklyIncome,
  calculateWeeklyExpenses,
  calculateUpgradeCost,
  WeeklyIncomeInput,
  WeeklyExpensesInput,
} from '@/engine/finance/finance-engine';

describe('calculateWeeklyIncome', () => {
  const baseInput: WeeklyIncomeInput = {
    clubReputation: 80,
    stadiumCapacity: 50000,
    hasHomeMatch: true,
    leaguePosition: 5,
    season: 1,
    week: 15,
  };

  it('generates ticket revenue for home matches', () => {
    const income = calculateWeeklyIncome(baseInput);
    expect(income.ticket).toBeGreaterThan(0);
  });

  it('generates zero ticket revenue for away matches', () => {
    const income = calculateWeeklyIncome({ ...baseInput, hasHomeMatch: false });
    expect(income.ticket).toBe(0);
  });

  it('higher reputation generates more ticket revenue', () => {
    const low = calculateWeeklyIncome({ ...baseInput, clubReputation: 40 });
    const high = calculateWeeklyIncome({ ...baseInput, clubReputation: 95 });
    expect(high.ticket).toBeGreaterThan(low.ticket);
  });

  it('generates weekly TV income', () => {
    const income = calculateWeeklyIncome(baseInput);
    expect(income.tv).toBeGreaterThan(0);
  });

  it('generates weekly sponsor income', () => {
    const income = calculateWeeklyIncome(baseInput);
    expect(income.sponsor).toBeGreaterThan(0);
  });
});

describe('calculateWeeklyExpenses', () => {
  const baseInput: WeeklyExpensesInput = {
    totalPlayerWages: 2000000,
    totalStaffWages: 200000,
    stadiumCapacity: 50000,
    trainingFacilities: 3,
    youthAcademy: 3,
    medicalDepartment: 3,
  };

  it('includes player and staff wages', () => {
    const expenses = calculateWeeklyExpenses(baseInput);
    expect(expenses.wages).toBe(2200000);
  });

  it('includes maintenance based on facilities', () => {
    const expenses = calculateWeeklyExpenses(baseInput);
    expect(expenses.maintenance).toBeGreaterThan(0);
  });

  it('higher facilities cost more to maintain', () => {
    const low = calculateWeeklyExpenses({ ...baseInput, trainingFacilities: 1, youthAcademy: 1, medicalDepartment: 1 });
    const high = calculateWeeklyExpenses({ ...baseInput, trainingFacilities: 5, youthAcademy: 5, medicalDepartment: 5 });
    expect(high.maintenance).toBeGreaterThan(low.maintenance);
  });
});

describe('calculateUpgradeCost', () => {
  it('stadium upgrades cost more at higher levels', () => {
    const cost1 = calculateUpgradeCost('stadium', 1);
    const cost4 = calculateUpgradeCost('stadium', 4);
    expect(cost4).toBeGreaterThan(cost1);
  });

  it('returns cost and weeks for all facility types', () => {
    for (const type of ['stadium', 'training', 'youth', 'medical'] as const) {
      const result = calculateUpgradeCost(type, 2);
      expect(result.cost).toBeGreaterThan(0);
      expect(result.weeks).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement financial engine**

Create `src/engine/finance/finance-engine.ts`:

```ts
export interface WeeklyIncomeInput {
  clubReputation: number;
  stadiumCapacity: number;
  hasHomeMatch: boolean;
  leaguePosition: number;
  season: number;
  week: number;
}

export interface WeeklyIncome {
  ticket: number;
  tv: number;
  sponsor: number;
}

export interface WeeklyExpensesInput {
  totalPlayerWages: number;
  totalStaffWages: number;
  stadiumCapacity: number;
  trainingFacilities: number;
  youthAcademy: number;
  medicalDepartment: number;
}

export interface WeeklyExpenses {
  wages: number;
  maintenance: number;
}

export interface UpgradeCost {
  cost: number;
  weeks: number;
}

export type FacilityType = 'stadium' | 'training' | 'youth' | 'medical';

/**
 * Calculate weekly income for a club.
 * Ticket revenue only on home match weeks.
 * TV and sponsor income is weekly.
 */
export function calculateWeeklyIncome(input: WeeklyIncomeInput): WeeklyIncome {
  // Ticket: capacity * occupancy * average ticket price
  // Occupancy: 60% base + reputation bonus (up to 95%)
  const occupancy = Math.min(0.95, 0.4 + (input.clubReputation / 100) * 0.55);
  const avgTicketPrice = 30 + (input.clubReputation / 100) * 40; // $30-$70
  const ticket = input.hasHomeMatch
    ? Math.round(input.stadiumCapacity * occupancy * avgTicketPrice)
    : 0;

  // TV: weekly split of annual TV deal. Higher reputation = bigger share.
  const annualTvBase = 50_000_000; // base for the league
  const tvShare = 0.3 + (input.clubReputation / 100) * 0.7; // 30%-100% of base share
  const tv = Math.round((annualTvBase * tvShare) / 46); // 46 weeks per season

  // Sponsor: proportional to reputation
  const annualSponsor = input.clubReputation * input.clubReputation * 100;
  const sponsor = Math.round(annualSponsor / 46);

  return { ticket, tv, sponsor };
}

/**
 * Calculate weekly expenses for a club.
 */
export function calculateWeeklyExpenses(input: WeeklyExpensesInput): WeeklyExpenses {
  const wages = input.totalPlayerWages + input.totalStaffWages;

  // Maintenance: stadium + facilities
  const stadiumMaint = Math.round(input.stadiumCapacity * 2); // $2 per seat per week
  const facilityLevel = input.trainingFacilities + input.youthAcademy + input.medicalDepartment;
  const facilityMaint = facilityLevel * 15000; // $15k per level per week
  const maintenance = stadiumMaint + facilityMaint;

  return { wages, maintenance };
}

/**
 * Calculate upgrade cost and duration for a facility.
 * currentLevel is the CURRENT level (upgrade to currentLevel+1).
 */
export function calculateUpgradeCost(type: FacilityType, currentLevel: number): UpgradeCost {
  const baseCosts: Record<FacilityType, number> = {
    stadium: 10_000_000,
    training: 5_000_000,
    youth: 4_000_000,
    medical: 3_000_000,
  };
  const baseWeeks: Record<FacilityType, number> = {
    stadium: 12,
    training: 8,
    youth: 8,
    medical: 6,
  };

  // Cost scales exponentially with level
  const multiplier = Math.pow(1.8, currentLevel);
  const cost = Math.round(baseCosts[type] * multiplier);
  const weeks = Math.round(baseWeeks[type] * (1 + currentLevel * 0.3));

  return { cost, weeks };
}
```

- [ ] **Step 4: Run tests — all 8 PASS**
- [ ] **Step 5: Commit**

```bash
git add src/engine/finance/ __tests__/engine/finance/ && git commit -m "feat: add financial engine with weekly income, expenses, and upgrade costs"
```

---

### Task 2: Player Progression Engine

**Files:**
- Create: `src/engine/training/progression.ts`
- Test: `__tests__/engine/training/progression.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/training/progression.test.ts`:

```ts
import { calculateWeeklyProgression, ProgressionInput, ProgressionResult } from '@/engine/training/progression';
import { PlayerAttributes } from '@/types';

const baseAttrs: PlayerAttributes = {
  finishing: 70, passing: 70, crossing: 70, dribbling: 70,
  heading: 70, longShots: 70, freeKicks: 70,
  vision: 70, composure: 70, decisions: 70,
  positioning: 70, aggression: 70, leadership: 70,
  pace: 70, stamina: 70, strength: 70, agility: 70, jumping: 70,
};

const makeInput = (overrides: Partial<ProgressionInput> = {}): ProgressionInput => ({
  age: 22,
  attributes: { ...baseAttrs },
  effectivePotential: 85,
  minutesPlayedRecent: 360, // 4 full matches out of 6 weeks
  totalPossibleMinutes: 540, // 6 weeks * 90 min
  avgRatingRecent: 7.0,
  trainingFocus: 'balanced',
  trainingFacilityLevel: 3,
  fitnessCoachAbility: 12,
  ...overrides,
});

describe('calculateWeeklyProgression', () => {
  it('young player with good minutes evolves positively', () => {
    const result = calculateWeeklyProgression(makeInput({ age: 19 }));
    const totalChange = Object.values(result.attributeChanges).reduce((s, v) => s + v, 0);
    expect(totalChange).toBeGreaterThan(0);
  });

  it('more minutes played = faster progression', () => {
    const fewMinutes = calculateWeeklyProgression(makeInput({ minutesPlayedRecent: 90, totalPossibleMinutes: 540 }));
    const manyMinutes = calculateWeeklyProgression(makeInput({ minutesPlayedRecent: 450, totalPossibleMinutes: 540 }));
    const fewTotal = Object.values(fewMinutes.attributeChanges).reduce((s, v) => s + v, 0);
    const manyTotal = Object.values(manyMinutes.attributeChanges).reduce((s, v) => s + v, 0);
    expect(manyTotal).toBeGreaterThan(fewTotal);
  });

  it('better performance = faster progression', () => {
    const low = calculateWeeklyProgression(makeInput({ avgRatingRecent: 5.5 }));
    const high = calculateWeeklyProgression(makeInput({ avgRatingRecent: 8.0 }));
    const lowTotal = Object.values(low.attributeChanges).reduce((s, v) => s + v, 0);
    const highTotal = Object.values(high.attributeChanges).reduce((s, v) => s + v, 0);
    expect(highTotal).toBeGreaterThan(lowTotal);
  });

  it('veteran (31+) declines by default', () => {
    const result = calculateWeeklyProgression(makeInput({ age: 33, minutesPlayedRecent: 90, totalPossibleMinutes: 540, avgRatingRecent: 6.0 }));
    // Physical attributes should decline
    expect(result.attributeChanges.pace).toBeLessThanOrEqual(0);
    expect(result.attributeChanges.stamina).toBeLessThanOrEqual(0);
  });

  it('veteran with excellent performance can slow decline', () => {
    const badVet = calculateWeeklyProgression(makeInput({ age: 32, minutesPlayedRecent: 90, totalPossibleMinutes: 540, avgRatingRecent: 5.5 }));
    const goodVet = calculateWeeklyProgression(makeInput({ age: 32, minutesPlayedRecent: 480, totalPossibleMinutes: 540, avgRatingRecent: 7.8 }));
    const badTotal = Object.values(badVet.attributeChanges).reduce((s, v) => s + v, 0);
    const goodTotal = Object.values(goodVet.attributeChanges).reduce((s, v) => s + v, 0);
    // Good veteran declines less (or even improves slightly)
    expect(goodTotal).toBeGreaterThan(badTotal);
  });

  it('player at potential ceiling barely evolves', () => {
    const atCeiling = calculateWeeklyProgression(makeInput({
      age: 22,
      attributes: { ...baseAttrs, finishing: 85, passing: 85, crossing: 85, dribbling: 85, heading: 85, longShots: 85, freeKicks: 85, vision: 85, composure: 85, decisions: 85, positioning: 85, aggression: 85, leadership: 85, pace: 85, stamina: 85, strength: 85, agility: 85, jumping: 85 },
      effectivePotential: 85,
    }));
    const totalChange = Object.values(atCeiling.attributeChanges).reduce((s, v) => s + v, 0);
    expect(Math.abs(totalChange)).toBeLessThan(1);
  });

  it('25+ player with zero minutes does not evolve', () => {
    const result = calculateWeeklyProgression(makeInput({ age: 27, minutesPlayedRecent: 0, totalPossibleMinutes: 540 }));
    const totalChange = Object.values(result.attributeChanges).reduce((s, v) => s + v, 0);
    expect(totalChange).toBe(0);
  });

  it('higher training facility boosts progression', () => {
    const low = calculateWeeklyProgression(makeInput({ trainingFacilityLevel: 1 }));
    const high = calculateWeeklyProgression(makeInput({ trainingFacilityLevel: 5 }));
    const lowTotal = Object.values(low.attributeChanges).reduce((s, v) => s + v, 0);
    const highTotal = Object.values(high.attributeChanges).reduce((s, v) => s + v, 0);
    expect(highTotal).toBeGreaterThan(lowTotal);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement progression engine**

Create `src/engine/training/progression.ts`:

Key design from the spec:

```
evolution = base_by_age × minutes_factor × performance_factor × training_factor × potential_factor
```

- `base_by_age`: 16-20: 0.4-0.8, 21-24: 0.2-0.5, 25-27: 0.1-0.2, 28-30: 0-0.1, 31-35: -0.1 to -0.3
- `minutes_factor`: 80-100%→1.5x, 50-79%→1.0x, 20-49%→0.5x, 0-19%→0.1x (young) / 0.0x (25+)
- `performance_factor`: 7.5+→1.4x, 6.5-7.4→1.0x, 5.5-6.4→0.6x, <5.5→0.3x
- `training_factor`: 1.0 + (facilityLevel * 0.06) (i.e. +6% to +30%)
- `potential_factor`: how close current attrs are to effective_potential. At ceiling → 0, far below → 1.0

For veterans (31+): base is negative (decline). But if playing 80%+ minutes AND rating 7.0+, decline is reduced by 50-80%. Physical attrs decline faster than mental.

Training focus ('technical'|'tactical'|'physical'|'balanced') determines which attribute group gets a bonus.

Export: `ProgressionInput`, `ProgressionResult` (with `attributeChanges: Record<keyof PlayerAttributes, number>`)

- [ ] **Step 4: Run tests — all 8 PASS**
- [ ] **Step 5: Commit**

```bash
git add src/engine/training/ __tests__/engine/training/ && git commit -m "feat: add player progression engine with minutes/performance-driven evolution"
```

---

### Task 3: Dynamic Potential Recalculator

**Files:**
- Create: `src/engine/training/potential.ts`
- Test: `__tests__/engine/training/potential.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/training/potential.test.ts`:

```ts
import { recalculatePotential, PotentialInput } from '@/engine/training/potential';

describe('recalculatePotential', () => {
  const base: PotentialInput = {
    basePotential: 80,
    effectivePotential: 80,
    currentOverall: 65,
    seasonRatings: [{ avgRating: 7.0, minutesPercent: 60 }],
  };

  it('performance above expected raises potential', () => {
    const result = recalculatePotential({
      ...base,
      seasonRatings: [
        { avgRating: 7.8, minutesPercent: 80 },
        { avgRating: 7.5, minutesPercent: 75 },
        { avgRating: 7.6, minutesPercent: 85 },
      ],
    });
    expect(result.newEffectivePotential).toBeGreaterThan(80);
  });

  it('performance below expected lowers potential', () => {
    const result = recalculatePotential({
      ...base,
      seasonRatings: [
        { avgRating: 5.5, minutesPercent: 60 },
        { avgRating: 5.8, minutesPercent: 55 },
      ],
    });
    expect(result.newEffectivePotential).toBeLessThan(80);
  });

  it('caps upward at base + 15', () => {
    const result = recalculatePotential({
      ...base,
      effectivePotential: 94,
      seasonRatings: [
        { avgRating: 9.0, minutesPercent: 90 },
        { avgRating: 9.0, minutesPercent: 90 },
        { avgRating: 9.0, minutesPercent: 90 },
      ],
    });
    expect(result.newEffectivePotential).toBeLessThanOrEqual(95); // base 80 + 15
  });

  it('caps downward at base - 20, but never below current overall', () => {
    const result = recalculatePotential({
      ...base,
      currentOverall: 65,
      effectivePotential: 62,
      seasonRatings: [
        { avgRating: 4.5, minutesPercent: 40 },
        { avgRating: 4.5, minutesPercent: 40 },
        { avgRating: 4.5, minutesPercent: 40 },
      ],
    });
    expect(result.newEffectivePotential).toBeGreaterThanOrEqual(60); // base 80 - 20 = 60
    expect(result.newEffectivePotential).toBeGreaterThanOrEqual(65); // never below overall
  });

  it('insufficient minutes freezes potential', () => {
    const result = recalculatePotential({
      ...base,
      seasonRatings: [{ avgRating: 7.0, minutesPercent: 20 }],
    });
    expect(result.newEffectivePotential).toBe(80);
  });

  it('no season data freezes potential', () => {
    const result = recalculatePotential({ ...base, seasonRatings: [] });
    expect(result.newEffectivePotential).toBe(80);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement potential recalculator**

Create `src/engine/training/potential.ts`:

Key logic:
- Compare player's avg rating across last 1-3 seasons against expected rating for their overall
- Expected rating ≈ `5.5 + (currentOverall - 50) * 0.04` (overall 50→5.5, 70→6.3, 90→7.1)
- If avg rating consistently above expected: +2 to +5 per qualifying season
- If consistently below: -2 to -4 per qualifying season (3 bad seasons: -5 to -8)
- Only seasons with 30%+ minutes played count
- Cap: effective_potential ∈ [max(basePotential-20, currentOverall), basePotential+15]

- [ ] **Step 4: Run tests — all 6 PASS**
- [ ] **Step 5: Commit**

```bash
git add src/engine/training/potential.ts __tests__/engine/training/potential.test.ts && git commit -m "feat: add dynamic potential recalculator for end-of-season adjustments"
```

---

### Task 4: Market Value Calculator

**Files:**
- Create: `src/engine/transfer/market-value.ts`
- Test: `__tests__/engine/transfer/market-value.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/transfer/market-value.test.ts`:

```ts
import { calculateMarketValue, MarketValueInput } from '@/engine/transfer/market-value';

describe('calculateMarketValue', () => {
  const base: MarketValueInput = {
    overall: 75,
    effectivePotential: 82,
    age: 25,
    contractYearsLeft: 3,
  };

  it('returns a positive value', () => {
    expect(calculateMarketValue(base)).toBeGreaterThan(0);
  });

  it('higher overall = higher value', () => {
    const low = calculateMarketValue({ ...base, overall: 60 });
    const high = calculateMarketValue({ ...base, overall: 85 });
    expect(high).toBeGreaterThan(low);
  });

  it('younger players are worth more', () => {
    const young = calculateMarketValue({ ...base, age: 21 });
    const old = calculateMarketValue({ ...base, age: 33 });
    expect(young).toBeGreaterThan(old);
  });

  it('higher potential gap increases value', () => {
    const lowPot = calculateMarketValue({ ...base, effectivePotential: 76 });
    const highPot = calculateMarketValue({ ...base, effectivePotential: 90 });
    expect(highPot).toBeGreaterThan(lowPot);
  });

  it('last year of contract reduces value', () => {
    const long = calculateMarketValue({ ...base, contractYearsLeft: 4 });
    const short = calculateMarketValue({ ...base, contractYearsLeft: 1 });
    expect(long).toBeGreaterThan(short);
  });

  it('returns values rounded to 10k', () => {
    const value = calculateMarketValue(base);
    expect(value % 10000).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement market value calculator**

Create `src/engine/transfer/market-value.ts`:

```ts
export interface MarketValueInput {
  overall: number;
  effectivePotential: number;
  age: number;
  contractYearsLeft: number;
}

export function calculateMarketValue(input: MarketValueInput): number {
  // Base value scales exponentially with overall
  let base = Math.pow(input.overall / 10, 3) * 100000;

  // Age multiplier
  if (input.age <= 21) base *= 1.5;
  else if (input.age <= 25) base *= 1.3;
  else if (input.age <= 28) base *= 1.1;
  else if (input.age <= 30) base *= 0.8;
  else if (input.age <= 33) base *= 0.5;
  else base *= 0.3;

  // Potential bonus
  const potentialGap = Math.max(0, input.effectivePotential - input.overall);
  base *= 1 + potentialGap * 0.03;

  // Contract multiplier (less contract = lower value)
  if (input.contractYearsLeft <= 1) base *= 0.6;
  else if (input.contractYearsLeft <= 2) base *= 0.8;

  return Math.round(base / 10000) * 10000;
}
```

- [ ] **Step 4: Run tests — all 6 PASS**
- [ ] **Step 5: Commit**

```bash
git add src/engine/transfer/ __tests__/engine/transfer/ && git commit -m "feat: add dynamic market value calculator"
```

---

### Task 5: Transfer AI

**Files:**
- Create: `src/engine/transfer/transfer-ai.ts`
- Test: `__tests__/engine/transfer/transfer-ai.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/transfer/transfer-ai.test.ts`:

```ts
import { evaluateOffer, generateAiTransfer, OfferEvalInput, AiTransferInput } from '@/engine/transfer/transfer-ai';
import { SeededRng } from '@/engine/rng';

describe('evaluateOffer', () => {
  const base: OfferEvalInput = {
    playerMarketValue: 10_000_000,
    feeOffered: 10_000_000,
    playerIsStarter: true,
    clubHasReplacement: true,
    playerAge: 25,
    contractYearsLeft: 3,
  };

  it('accepts offer at market value when replacement exists', () => {
    const result = evaluateOffer(base);
    expect(result.decision).toBe('accept');
  });

  it('rejects low offer for starter with no replacement', () => {
    const result = evaluateOffer({
      ...base,
      feeOffered: 5_000_000,
      clubHasReplacement: false,
    });
    expect(result.decision).toBe('reject');
  });

  it('counters when offer is close but not enough', () => {
    const result = evaluateOffer({
      ...base,
      feeOffered: 7_000_000,
      clubHasReplacement: true,
    });
    expect(['accept', 'counter']).toContain(result.decision);
    if (result.decision === 'counter') {
      expect(result.counterFee).toBeGreaterThan(7_000_000);
    }
  });

  it('accepts below market value for old player with short contract', () => {
    const result = evaluateOffer({
      ...base,
      feeOffered: 6_000_000,
      playerAge: 33,
      contractYearsLeft: 1,
    });
    expect(result.decision).toBe('accept');
  });
});

describe('generateAiTransfer', () => {
  it('AI club identifies position needs', () => {
    const rng = new SeededRng(42);
    const input: AiTransferInput = {
      clubId: 1,
      clubBudget: 50_000_000,
      clubReputation: 80,
      squadPositions: ['GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'CM', 'LM', 'RM', 'ST'],
      // Missing: no LW, no RW, only 1 ST
      availablePlayers: [
        { id: 100, position: 'LW', overall: 72, marketValue: 5_000_000, wage: 50000, clubReputation: 60 },
        { id: 101, position: 'ST', overall: 70, marketValue: 4_000_000, wage: 40000, clubReputation: 55 },
        { id: 102, position: 'CB', overall: 75, marketValue: 8_000_000, wage: 60000, clubReputation: 70 },
      ],
      rng,
    };
    const result = generateAiTransfer(input);
    // Should prefer LW or ST (positions they lack) over CB (already have 3)
    if (result) {
      expect([100, 101]).toContain(result.targetPlayerId);
    }
  });

  it('returns null when budget is insufficient', () => {
    const rng = new SeededRng(42);
    const result = generateAiTransfer({
      clubId: 1,
      clubBudget: 100_000,
      clubReputation: 80,
      squadPositions: ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'],
      availablePlayers: [
        { id: 100, position: 'LW', overall: 72, marketValue: 5_000_000, wage: 50000, clubReputation: 60 },
      ],
      rng,
    });
    expect(result).toBeNull();
  });

  it('big club does not target player from bigger club', () => {
    const rng = new SeededRng(42);
    const result = generateAiTransfer({
      clubId: 1,
      clubBudget: 100_000_000,
      clubReputation: 70,
      squadPositions: ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'],
      availablePlayers: [
        { id: 100, position: 'LW', overall: 85, marketValue: 50_000_000, wage: 200000, clubReputation: 95 },
      ],
      rng,
    });
    // Player from a much bigger club — AI shouldn't realistically pursue
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement transfer AI**

Create `src/engine/transfer/transfer-ai.ts`:

Two main functions:

1. `evaluateOffer(input)` — Seller's perspective: accept/reject/counter
   - Accept if: fee >= marketValue AND (has replacement OR player is old/short contract)
   - Reject if: fee < 70% marketValue AND player is starter AND no replacement
   - Counter if: fee is 70-95% of marketValue — counter at marketValue * 1.1

2. `generateAiTransfer(input)` — AI club decides who to buy
   - Identify positions with fewer than 2 players
   - From available players, filter: affordable (fee <= budget), position matches need, player's current club reputation <= this club's reputation + 10
   - Pick best value player (overall / marketValue ratio)
   - Return target or null

- [ ] **Step 4: Run tests — all 6 PASS**
- [ ] **Step 5: Commit**

```bash
git add src/engine/transfer/transfer-ai.ts __tests__/engine/transfer/transfer-ai.test.ts && git commit -m "feat: add transfer AI with offer evaluation and position-need targeting"
```

---

### Task 6: Staff Effects

**Files:**
- Create: `src/engine/staff/staff-effects.ts`
- Test: `__tests__/engine/staff/staff-effects.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/staff/staff-effects.test.ts`:

```ts
import { getStaffEffects, StaffEffectsInput, StaffEffects } from '@/engine/staff/staff-effects';

describe('getStaffEffects', () => {
  it('returns training bonus from fitness coach', () => {
    const result = getStaffEffects({
      fitnessCoachAbility: 15,
      physioAbility: 10,
      scoutAbility: 12,
      youthCoachAbility: 10,
      assistantAbility: 14,
    });
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

  it('youth coach ability affects generated youth quality', () => {
    const low = getStaffEffects({ fitnessCoachAbility: 10, physioAbility: 10, scoutAbility: 10, youthCoachAbility: 3, assistantAbility: 10 });
    const high = getStaffEffects({ fitnessCoachAbility: 10, physioAbility: 10, scoutAbility: 10, youthCoachAbility: 18, assistantAbility: 10 });
    expect(high.youthQualityBonus).toBeGreaterThan(low.youthQualityBonus);
  });

  it('handles missing staff (ability 0)', () => {
    const result = getStaffEffects({
      fitnessCoachAbility: 0,
      physioAbility: 0,
      scoutAbility: 0,
      youthCoachAbility: 0,
      assistantAbility: 0,
    });
    expect(result.trainingBonus).toBe(0);
    expect(result.injuryRecoveryBonus).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement staff effects**

Create `src/engine/staff/staff-effects.ts`:

```ts
export interface StaffEffectsInput {
  fitnessCoachAbility: number; // 0-20
  physioAbility: number;       // 0-20
  scoutAbility: number;        // 0-20
  youthCoachAbility: number;   // 0-20
  assistantAbility: number;    // 0-20
}

export interface StaffEffects {
  trainingBonus: number;       // 0.0-0.30 (added to training factor)
  injuryRecoveryBonus: number; // 0.0-0.50 (fraction of weeks saved)
  scoutAccuracy: number;       // 0.0-1.0 (1=perfect potential visibility)
  youthQualityBonus: number;   // 0-10 (added to youth player base overall)
  tacticBonus: number;         // 0.0-0.10 (added to team strength)
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
```

- [ ] **Step 4: Run tests — all 5 PASS**
- [ ] **Step 5: Commit**

```bash
git add src/engine/staff/ __tests__/engine/staff/ && git commit -m "feat: add staff effects system"
```

---

### Task 7: Youth Academy

**Files:**
- Create: `src/engine/youth/youth-academy.ts`
- Test: `__tests__/engine/youth/youth-academy.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/youth/youth-academy.test.ts`:

```ts
import { generateYouthPlayers, YouthGenerationInput } from '@/engine/youth/youth-academy';
import { SeededRng } from '@/engine/rng';

describe('generateYouthPlayers', () => {
  const base: YouthGenerationInput = {
    clubId: 1,
    academyLevel: 3,
    youthCoachBonus: 5,
    countryCode: 'EN',
    rng: new SeededRng(42),
  };

  it('generates 2-5 youth players', () => {
    const players = generateYouthPlayers(base);
    expect(players.length).toBeGreaterThanOrEqual(2);
    expect(players.length).toBeLessThanOrEqual(5);
  });

  it('all youth are aged 16-18', () => {
    const players = generateYouthPlayers(base);
    for (const p of players) {
      expect(p.age).toBeGreaterThanOrEqual(16);
      expect(p.age).toBeLessThanOrEqual(18);
    }
  });

  it('higher academy level produces better youth', () => {
    const rng1 = new SeededRng(42);
    const rng2 = new SeededRng(42);
    const lowAcademy = generateYouthPlayers({ ...base, academyLevel: 1, youthCoachBonus: 0, rng: rng1 });
    const highAcademy = generateYouthPlayers({ ...base, academyLevel: 5, youthCoachBonus: 10, rng: rng2 });

    const avgPotential = (players: typeof lowAcademy) =>
      players.reduce((s, p) => s + p.basePotential, 0) / players.length;

    expect(avgPotential(highAcademy)).toBeGreaterThan(avgPotential(lowAcademy));
  });

  it('youth players have valid positions', () => {
    const validPositions = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
    const players = generateYouthPlayers(base);
    for (const p of players) {
      expect(validPositions).toContain(p.position);
    }
  });

  it('youth have attributes between 1 and 99', () => {
    const players = generateYouthPlayers(base);
    for (const p of players) {
      const vals = Object.values(p.attributes);
      for (const v of vals) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
  });

  it('is deterministic with same seed', () => {
    const rng1 = new SeededRng(99);
    const rng2 = new SeededRng(99);
    const p1 = generateYouthPlayers({ ...base, rng: rng1 });
    const p2 = generateYouthPlayers({ ...base, rng: rng2 });
    expect(p1.length).toBe(p2.length);
    expect(p1[0].name).toBe(p2[0].name);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement youth academy**

Create `src/engine/youth/youth-academy.ts`:

- Generates 2-5 players (higher academy = more)
- Age 16-18
- Base potential: `40 + academyLevel * 8 + youthCoachBonus + random(-5, 10)`
- Current overall: `basePotential - random(10, 20)` (young, not developed yet)
- Generate attributes using same approach as seed data generator (base around current overall, position boosts)
- Name generation: use name pools from `scripts/data/names.ts` — but import from a shared location. For now, inline a small set of names or import from scripts.
- Position: random from all positions, weighted (more midfielders/forwards than goalkeepers)

- [ ] **Step 4: Run tests — all 6 PASS**
- [ ] **Step 5: Commit**

```bash
git add src/engine/youth/ __tests__/engine/youth/ && git commit -m "feat: add youth academy player generator"
```

---

### Task 8: Week Advancement Orchestrator

**Files:**
- Create: `src/engine/week-advance.ts`
- Test: `__tests__/engine/week-advance.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/engine/week-advance.test.ts`:

```ts
import { advanceWeek, WeekAdvanceInput, WeekAdvanceResult } from '@/engine/week-advance';
import { SeededRng } from '@/engine/rng';

describe('advanceWeek', () => {
  const makeMinimalInput = (): WeekAdvanceInput => ({
    season: 1,
    week: 15,
    allClubs: [
      {
        id: 1, reputation: 80, budget: 50_000_000, wageBudget: 2_000_000,
        stadiumCapacity: 50000, trainingFacilities: 3, youthAcademy: 3, medicalDepartment: 3,
        totalPlayerWages: 1_500_000, totalStaffWages: 150_000,
        staffEffects: { trainingBonus: 0.15, injuryRecoveryBonus: 0.3, scoutAccuracy: 0.6, youthQualityBonus: 5, tacticBonus: 0.05 },
      },
    ],
    fixtures: [],
    isTransferWindow: false,
    rng: new SeededRng(42),
  });

  it('returns updated week number', () => {
    const result = advanceWeek(makeMinimalInput());
    expect(result.newWeek).toBe(16);
  });

  it('processes financial transactions', () => {
    const result = advanceWeek(makeMinimalInput());
    expect(result.financeEntries.length).toBeGreaterThan(0);
  });

  it('generates match results for fixtures in this week', () => {
    // This test validates the orchestrator calls the match engine
    // For a proper test, we'd need full squad data — keep it simple
    const result = advanceWeek(makeMinimalInput());
    expect(result.matchResults).toBeDefined();
    expect(Array.isArray(result.matchResults)).toBe(true);
  });

  it('reduces injury recovery weeks', () => {
    const input = makeMinimalInput();
    input.injuredPlayers = [{ playerId: 1, weeksLeft: 3 }];
    const result = advanceWeek(input);
    const updated = result.injuryUpdates.find(u => u.playerId === 1);
    expect(updated).toBeDefined();
    expect(updated!.newWeeksLeft).toBe(2);
  });

  it('recovers fitness for players who did not play', () => {
    const input = makeMinimalInput();
    input.playerFitness = [{ playerId: 1, fitness: 70, played: false }];
    const result = advanceWeek(input);
    const updated = result.fitnessUpdates.find(u => u.playerId === 1);
    expect(updated).toBeDefined();
    expect(updated!.newFitness).toBeGreaterThan(70);
  });

  it('wraps to next season at week 46', () => {
    const input = makeMinimalInput();
    input.week = 46;
    const result = advanceWeek(input);
    expect(result.newWeek).toBe(1);
    expect(result.newSeason).toBe(2);
    expect(result.isSeasonEnd).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

- [ ] **Step 3: Implement week advancement**

Create `src/engine/week-advance.ts`:

The orchestrator coordinates the weekly cycle from the spec:

```ts
export interface ClubWeekData {
  id: number;
  reputation: number;
  budget: number;
  wageBudget: number;
  stadiumCapacity: number;
  trainingFacilities: number;
  youthAcademy: number;
  medicalDepartment: number;
  totalPlayerWages: number;
  totalStaffWages: number;
  staffEffects: StaffEffects;
}

export interface WeekAdvanceInput {
  season: number;
  week: number;
  allClubs: ClubWeekData[];
  fixtures: []; // fixtures for this week (simplified for now)
  isTransferWindow: boolean;
  rng: SeededRng;
  injuredPlayers?: { playerId: number; weeksLeft: number }[];
  playerFitness?: { playerId: number; fitness: number; played: boolean }[];
}

export interface WeekAdvanceResult {
  newWeek: number;
  newSeason: number;
  isSeasonEnd: boolean;
  financeEntries: FinanceEntry[];
  matchResults: unknown[];
  injuryUpdates: { playerId: number; newWeeksLeft: number }[];
  fitnessUpdates: { playerId: number; newFitness: number }[];
  news: string[];
}
```

The function:
1. Calculate weekly income/expenses for each club
2. Process injury recovery (-1 week)
3. Recover fitness for non-playing players (+5 to +15, capped at 100)
4. Advance week counter (46 → season+1, week 1)
5. Return all changes (the caller persists to DB)

Note: Match simulation and transfer processing are NOT called inside the orchestrator in this task — they'll be called by the UI/store layer. The orchestrator handles finances, injuries, fitness, and week progression.

- [ ] **Step 4: Run tests — all 6 PASS**
- [ ] **Step 5: Run full test suite**

```bash
cd /root/rodrigo/football-manager && npx jest
```

All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/week-advance.ts __tests__/engine/week-advance.test.ts && git commit -m "feat: add week advancement orchestrator"
```

---

## Summary

After completing all 8 tasks, the Engine Systems are in place:

- **Financial engine** — Weekly income (tickets, TV, sponsors), expenses (wages, maintenance), upgrade costs
- **Player progression** — Minutes-driven evolution formula with age brackets, performance multipliers, veteran decline/sustain
- **Dynamic potential** — End-of-season recalculation with upward cap (+15) and downward cap (-20)
- **Market value calculator** — Dynamic valuation based on overall, age, potential, contract
- **Transfer AI** — Offer evaluation (accept/reject/counter) and position-need targeting
- **Staff effects** — Training bonus, injury recovery, scout accuracy, youth quality, tactic bonus
- **Youth academy** — Procedural youth generation scaled by academy level and coach quality
- **Week orchestrator** — Coordinates finances, injuries, fitness, season transitions

**Next plan:** Plan 4 (UI Layer) — Navigation, all screens, Zustand stores, new game flow, save/load.
