import {
  simulateMatch,
  simulateFirstHalf,
  resumeSecondHalf,
  initLiveMatch,
  simulateSegment,
  finalizeMatchResult,
  MatchInput,
  MatchResult,
  SecondHalfOverrides,
} from '@/engine/simulation/match-engine';
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

function makeInput(homeOverall: number, awayOverall: number, seed: number): MatchInput {
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
    rng: new SeededRng(seed),
  };
}

describe('compose-equals-whole: simulateFirstHalf + resumeSecondHalf == simulateMatch', () => {
  it('produces a byte-for-byte identical MatchResult for several seeds (same rng instance)', () => {
    for (const seed of [1, 7, 42, 99, 123, 777, 2024, 31337]) {
      // Whole simulation
      const whole = simulateMatch(makeInput(72, 68, seed));

      // Composed simulation with the SAME rng instance threaded across the pause
      const composedInput = makeInput(72, 68, seed);
      const half = simulateFirstHalf(composedInput);
      const composed = resumeSecondHalf(half);

      expect(composed.homeGoals).toBe(whole.homeGoals);
      expect(composed.awayGoals).toBe(whole.awayGoals);
      expect(composed.attendance).toBe(whole.attendance);
      expect(composed.stats).toEqual(whole.stats);
      expect(composed.events).toEqual(whole.events);
      expect(composed.homeRatings).toEqual(whole.homeRatings);
      expect(composed.awayRatings).toEqual(whole.awayRatings);
    }
  });

  it('simulateFirstHalf only produces events from the first half (minute <= 45)', () => {
    const half = simulateFirstHalf(makeInput(72, 72, 42));
    for (const ev of half.events) {
      expect(ev.minute).toBeLessThanOrEqual(45);
    }
  });
});

describe('overrides bite: home tactic / subs change the second half', () => {
  it('an attacking+fast tactic override changes H2 outcome vs no override for at least one seed', () => {
    let anyDifference = false;
    for (let seed = 0; seed < 60; seed++) {
      const baseHalf = simulateFirstHalf(makeInput(72, 72, seed));
      const noOverride = resumeSecondHalf(baseHalf);

      // Re-run the first half fresh so the rng is at the same mid-stream point
      const ovHalf = simulateFirstHalf(makeInput(72, 72, seed));
      const aggressive: Tactic = {
        ...defaultTactic,
        mentality: 'attacking',
        tempo: 'fast',
        pressing: 'high',
        attackFocus: 'through_middle',
      };
      const withOverride = resumeSecondHalf(ovHalf, { homeTactic: aggressive });

      if (
        withOverride.homeGoals !== noOverride.homeGoals ||
        withOverride.awayGoals !== noOverride.awayGoals ||
        JSON.stringify(withOverride.events) !== JSON.stringify(noOverride.events)
      ) {
        anyDifference = true;
        break;
      }
    }
    expect(anyDifference).toBe(true);
  });

  it('a manual sub injects a substitution event at the start of H2', () => {
    const half = simulateFirstHalf(makeInput(72, 72, 5));
    // outId 10 (ST) on pitch, inId 200 (CM) on bench
    const overrides: SecondHalfOverrides = {
      homeSubs: [{ outId: 10, inId: 200 }],
    };
    const result = resumeSecondHalf(half, overrides);
    const manualSub = result.events.find(
      e => e.type === 'substitution' && e.playerId === 10 && e.secondaryPlayerId === 200,
    );
    expect(manualSub).toBeDefined();
    // It happens at the halftime boundary (minute for block 15 = 46..48)
    expect(manualSub!.minute).toBeGreaterThanOrEqual(46);
  });
});

describe('edge: invalid sub ids are skipped without throwing', () => {
  it('ignores out/in ids that are not on pitch / bench', () => {
    const half = simulateFirstHalf(makeInput(72, 72, 11));
    const overrides: SecondHalfOverrides = {
      homeSubs: [
        { outId: 99999, inId: 200 }, // outId not on pitch
        { outId: 10, inId: 88888 },  // inId not on bench
        { outId: 99998, inId: 88887 }, // both invalid
      ],
    };
    expect(() => resumeSecondHalf(half, overrides)).not.toThrow();
    const result = resumeSecondHalf(simulateFirstHalf(makeInput(72, 72, 11)), overrides);
    // No manual substitution events should have been injected for invalid ids
    const injectedSubs = result.events.filter(
      e => e.type === 'substitution' && e.minute >= 46 && e.minute <= 48 &&
        (e.playerId === 99999 || e.playerId === 99998 || e.secondaryPlayerId === 88888 || e.secondaryPlayerId === 88887),
    );
    expect(injectedSubs.length).toBe(0);
  });
});

describe('N-cuts arbitrários == simulateMatch (compose-equals-whole estendido)', () => {
  it('cortes irregulares (3,15,16,29,30) batem com o jogo inteiro', () => {
    for (const seed of [1, 7, 42, 99, 123, 777]) {
      const whole = simulateMatch(makeInput(72, 68, seed));
      let s = initLiveMatch(makeInput(72, 68, seed));
      for (const cut of [3, 15, 16, 29, 30]) s = simulateSegment(s, cut);
      const composed = finalizeMatchResult(s);
      expect(composed.events).toEqual(whole.events);
      expect(composed.homeGoals).toBe(whole.homeGoals);
      expect(composed.awayGoals).toBe(whole.awayGoals);
      expect(composed.stats).toEqual(whole.stats);
      expect(composed.homeRatings).toEqual(whole.homeRatings);
      expect(composed.awayRatings).toEqual(whole.awayRatings);
    }
  });
});
