import {
  simulateMatch, initLiveMatch, simulateSegment, finalizeMatchResult,
  MatchInput,
} from '@/engine/simulation/match-engine';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';

const makeAttrs = (base: number): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base, vision: base, composure: base,
  decisions: base, positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
});
const makeSquad = (overall: number) => Array.from({ length: 11 }, (_, i) => ({
  id: i + 1,
  position: (['GK','CB','CB','LB','RB','CM','CM','LM','RM','ST','ST'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall), morale: 70, fitness: 90,
}));
const makeBench = (overall: number, off: number) => Array.from({ length: 5 }, (_, i) => ({
  id: off + i,
  position: (['CM','ST','LW','CB','GK'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall), morale: 70, fitness: 95,
}));
const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'D', isActive: true, formation: '4-4-2',
  mentality: 'balanced', pressing: 'medium', passingStyle: 'mixed',
  tempo: 'normal', width: 'normal', attackFocus: 'balanced', subStrategy: 'balanced',
};
const makeInput = (seed: number): MatchInput => ({
  fixtureId: 1,
  homeSquad: makeSquad(72),
  awaySquad: makeSquad(68).map((p, i) => ({ ...p, id: i + 100 })),
  homeBench: makeBench(72, 200), awayBench: makeBench(68, 300),
  homeTactic: defaultTactic, awayTactic: { ...defaultTactic, id: 2, clubId: 2 },
  homeClubReputation: 80, awayClubReputation: 80,
  rng: new SeededRng(seed),
});

describe('simulateSegment compõe o jogo inteiro em N cortes', () => {
  it('cortes [15,22,25,30] sem overrides == simulateMatch (byte-idêntico)', () => {
    for (const seed of [1, 7, 42, 99, 2024]) {
      const whole = simulateMatch(makeInput(seed));
      let state = initLiveMatch(makeInput(seed));
      for (const cut of [15, 22, 25, 30]) state = simulateSegment(state, cut);
      const composed = finalizeMatchResult(state);
      expect(composed.homeGoals).toBe(whole.homeGoals);
      expect(composed.awayGoals).toBe(whole.awayGoals);
      expect(composed.events).toEqual(whole.events);
      expect(composed.stats).toEqual(whole.stats);
      expect(composed.homeRatings).toEqual(whole.homeRatings);
      expect(composed.awayRatings).toEqual(whole.awayRatings);
    }
  });

  it('initLiveMatch começa em currentBlock 0 sem rodar bloco', () => {
    const s = initLiveMatch(makeInput(3));
    expect(s.currentBlock).toBe(0);
    expect(s.events).toHaveLength(0);
    expect(s.home.goals).toBe(0);
  });

  it('simulateSegment avança currentBlock e clampa untilBlock no teto', () => {
    let s = initLiveMatch(makeInput(5));
    s = simulateSegment(s, 15);
    expect(s.currentBlock).toBe(15);
    s = simulateSegment(s, 999); // clampa em TOTAL_BLOCKS=30
    expect(s.currentBlock).toBe(30);
  });

  it('untilBlock <= currentBlock é no-op (não roda nem regride)', () => {
    let s = initLiveMatch(makeInput(9));
    s = simulateSegment(s, 15);
    const before = s.events.length;
    s = simulateSegment(s, 10);
    expect(s.currentBlock).toBe(15);
    expect(s.events.length).toBe(before);
  });

  it('finalizeMatchResult lança se o jogo não chegou ao fim', () => {
    let s = initLiveMatch(makeInput(2));
    s = simulateSegment(s, 15);
    expect(() => finalizeMatchResult(s)).toThrow();
  });
});
