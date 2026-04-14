import { simulateMatch, MatchInput, MatchResult } from '@/engine/simulation/match-engine';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';

const makeAttrs = (base: number): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base,
  vision: base, composure: base, decisions: base,
  positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
});

const makeSquad = (overall: number) => Array.from({ length: 11 }, (_, i) => ({
  id: i + 1,
  position: (['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall),
  morale: 70,
  fitness: 90,
}));

const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
  attackFocus: 'balanced', subStrategy: 'balanced',
};

const makeBench = (overall: number, idOffset: number) => Array.from({ length: 5 }, (_, i) => ({
  id: idOffset + i,
  position: (['CM', 'ST', 'LW', 'CB', 'GK'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall),
  morale: 70,
  fitness: 95,
}));

function makeInput(homeOverall: number, awayOverall: number): MatchInput {
  return {
    fixtureId: 1,
    homeSquad: makeSquad(homeOverall),
    awaySquad: makeSquad(awayOverall).map((p, i) => ({ ...p, id: i + 100 })),
    homeBench: makeBench(homeOverall, 200),
    awayBench: makeBench(awayOverall, 300),
    homeTactic: defaultTactic,
    awayTactic: { ...defaultTactic, id: 2, clubId: 2 },
    homeClubReputation: 80,
    awayClubReputation: 80,
    rng: new SeededRng(42),
  };
}

describe('simulateMatch', () => {
  it('returns a valid match result', () => {
    const result = simulateMatch(makeInput(70, 70));
    expect(result.homeGoals).toBeGreaterThanOrEqual(0);
    expect(result.awayGoals).toBeGreaterThanOrEqual(0);
    expect(result.events.length).toBeGreaterThanOrEqual(0);
    expect(result.homeRatings).toHaveLength(11);
    expect(result.awayRatings).toHaveLength(11);
    expect(typeof result.attendance).toBe('number');
  });

  it('is deterministic with same seed', () => {
    const r1 = simulateMatch(makeInput(70, 70));
    const r2 = simulateMatch(makeInput(70, 70));
    expect(r1.homeGoals).toBe(r2.homeGoals);
    expect(r1.awayGoals).toBe(r2.awayGoals);
  });

  it('stronger team wins more often over many simulations', () => {
    let strongWins = 0, weakWins = 0;
    for (let seed = 0; seed < 200; seed++) {
      const input = makeInput(85, 55);
      input.rng = new SeededRng(seed);
      const result = simulateMatch(input);
      if (result.homeGoals > result.awayGoals) strongWins++;
      if (result.awayGoals > result.homeGoals) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 2);
  });

  it('events contain only valid types', () => {
    const result = simulateMatch(makeInput(75, 75));
    const validTypes = ['goal', 'assist', 'yellow', 'red', 'substitution', 'injury', 'penalty_scored', 'penalty_missed', 'free_kick_scored', 'free_kick_missed', 'shot_on_target', 'shot_off_target', 'save'];
    for (const event of result.events) {
      expect(validTypes).toContain(event.type);
    }
  });

  it('events have minutes in valid range (1-90)', () => {
    const result = simulateMatch(makeInput(75, 75));
    for (const event of result.events) {
      expect(event.minute).toBeGreaterThanOrEqual(1);
      expect(event.minute).toBeLessThanOrEqual(90);
    }
  });

  it('total goals matches sum of goal/penalty_scored events', () => {
    for (let seed = 0; seed < 50; seed++) {
      const input = makeInput(70, 70);
      input.rng = new SeededRng(seed);
      const result = simulateMatch(input);
      const totalGoalEvents = result.events.filter(e =>
        e.type === 'goal' || e.type === 'penalty_scored' || e.type === 'free_kick_scored'
      ).length;
      expect(totalGoalEvents).toBe(result.homeGoals + result.awayGoals);
    }
  });

  it('substitutions only happen in second half (46+) or after injury', () => {
    for (let seed = 0; seed < 100; seed++) {
      const input = makeInput(70, 70);
      input.rng = new SeededRng(seed);
      const result = simulateMatch(input);
      const subs = result.events.filter(e => e.type === 'substitution');
      for (const sub of subs) {
        const isSecondHalf = sub.minute >= 46;
        if (!isSecondHalf) {
          const injuryBefore = result.events.find(e => e.type === 'injury' && e.minute <= sub.minute);
          expect(injuryBefore).toBeDefined();
        }
      }
    }
  });

  it('heavy_rotation sub strategy produces more substitutions than minimal over many runs', () => {
    let minimalSubs = 0;
    let heavySubs = 0;
    for (let seed = 0; seed < 40; seed++) {
      const base = makeInput(75, 75);
      base.rng = new SeededRng(seed);
      const minimalTactic: Tactic = { ...defaultTactic, subStrategy: 'minimal' };
      const heavyTactic: Tactic = { ...defaultTactic, subStrategy: 'heavy_rotation' };

      const minResult = simulateMatch({
        ...base,
        homeTactic: minimalTactic,
        awayTactic: minimalTactic,
        rng: new SeededRng(seed),
      });
      minimalSubs += minResult.events.filter(e => e.type === 'substitution').length;

      const heavyResult = simulateMatch({
        ...base,
        homeTactic: heavyTactic,
        awayTactic: heavyTactic,
        rng: new SeededRng(seed),
      });
      heavySubs += heavyResult.events.filter(e => e.type === 'substitution').length;
    }
    expect(heavySubs).toBeGreaterThan(minimalSubs);
  });

  it('attacking formations produce more goals than defensive formations over many runs', () => {
    let attackingGoals = 0;
    let defensiveGoals = 0;
    for (let seed = 0; seed < 40; seed++) {
      const base = makeInput(75, 70);
      const attackingTactic: Tactic = { ...defaultTactic, formation: '4-2-4' };
      const defensiveTactic: Tactic = { ...defaultTactic, formation: '5-4-1' };

      const a = simulateMatch({
        ...base,
        homeTactic: attackingTactic,
        awayTactic: defaultTactic,
        rng: new SeededRng(seed + 20_000),
      });
      attackingGoals += a.homeGoals;

      const d = simulateMatch({
        ...base,
        homeTactic: defensiveTactic,
        awayTactic: defaultTactic,
        rng: new SeededRng(seed + 20_000),
      });
      defensiveGoals += d.homeGoals;
    }
    expect(attackingGoals).toBeGreaterThan(defensiveGoals);
  });

  it('diamond formation raises possession vs a neutral opponent', () => {
    let totalHomePoss = 0;
    let runs = 0;
    for (let seed = 0; seed < 20; seed++) {
      const base = makeInput(75, 75);
      const diamond: Tactic = { ...defaultTactic, formation: '4-1-2-1-2' };
      const r = simulateMatch({
        ...base,
        homeTactic: diamond,
        awayTactic: defaultTactic,
        rng: new SeededRng(seed + 30_000),
      });
      totalHomePoss += r.stats.homePossession;
      runs++;
    }
    const avg = totalHomePoss / runs;
    // Diamond formation gives +5 possessionDelta; avg should be above neutral 50
    // (pressing adjustments reduce the exact value vs the old formula)
    expect(avg).toBeGreaterThan(50);
  });

  it('counter_attack and possession focuses both reduce total shots vs balanced', () => {
    let counterShots = 0;
    let balancedShots = 0;
    let possessionShots = 0;
    for (let seed = 0; seed < 30; seed++) {
      const base = makeInput(75, 75);
      const counterTactic: Tactic = { ...defaultTactic, attackFocus: 'counter_attack' };
      const balancedTactic: Tactic = { ...defaultTactic, attackFocus: 'balanced' };
      const possessionTactic: Tactic = { ...defaultTactic, attackFocus: 'possession' };

      const c = simulateMatch({
        ...base,
        homeTactic: counterTactic,
        awayTactic: counterTactic,
        rng: new SeededRng(seed + 10_000),
      });
      counterShots += c.stats.homeShots + c.stats.awayShots;

      const b = simulateMatch({
        ...base,
        homeTactic: balancedTactic,
        awayTactic: balancedTactic,
        rng: new SeededRng(seed + 10_000),
      });
      balancedShots += b.stats.homeShots + b.stats.awayShots;

      const p = simulateMatch({
        ...base,
        homeTactic: possessionTactic,
        awayTactic: possessionTactic,
        rng: new SeededRng(seed + 10_000),
      });
      possessionShots += p.stats.homeShots + p.stats.awayShots;
    }
    // Both counter-attack and possession cut down speculative off-target
    // attempts compared to the neutral balanced focus.
    expect(counterShots).toBeLessThan(balancedShots);
    expect(possessionShots).toBeLessThan(balancedShots);
  });

  it('produces match statistics', () => {
    const result = simulateMatch(makeInput(70, 70));
    expect(result.stats).toBeDefined();
    expect(typeof result.stats.homePossession).toBe('number');
    expect(typeof result.stats.awayPossession).toBe('number');
    expect(result.stats.homePossession + result.stats.awayPossession).toBeCloseTo(100, 0);
    expect(typeof result.stats.homeShots).toBe('number');
    expect(typeof result.stats.awayShots).toBe('number');
    expect(typeof result.stats.homeFouls).toBe('number');
    expect(typeof result.stats.awayFouls).toBe('number');
    expect(typeof result.stats.homeCorners).toBe('number');
    expect(typeof result.stats.awayCorners).toBe('number');
  });
});
