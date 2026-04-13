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
};

function makeInput(homeOverall: number, awayOverall: number): MatchInput {
  return {
    fixtureId: 1,
    homeSquad: makeSquad(homeOverall),
    awaySquad: makeSquad(awayOverall).map((p, i) => ({ ...p, id: i + 100 })),
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
    const validTypes = ['goal', 'assist', 'yellow', 'red', 'substitution', 'injury', 'penalty_scored', 'penalty_missed'];
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

  it('number of goals matches goal events', () => {
    for (let seed = 0; seed < 50; seed++) {
      const input = makeInput(70, 70);
      input.rng = new SeededRng(seed);
      const result = simulateMatch(input);
      const homeGoalEvents = result.events.filter(e =>
        (e.type === 'goal' || e.type === 'penalty_scored') && input.homeSquad.some(p => p.id === e.playerId)
      ).length;
      const awayGoalEvents = result.events.filter(e =>
        (e.type === 'goal' || e.type === 'penalty_scored') && input.awaySquad.some(p => p.id === e.playerId)
      ).length;
      expect(homeGoalEvents).toBe(result.homeGoals);
      expect(awayGoalEvents).toBe(result.awayGoals);
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
