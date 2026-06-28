import { simulateMatch, MatchInput } from '@/engine/simulation/match-engine';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { deriveDerbyBonus } from '@/engine/legacy/derby-bonus';

const makeAttrs = (base: number): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base,
  vision: base, composure: base, decisions: base,
  positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
});

const makeSquad = (idOffset: number) => Array.from({ length: 11 }, (_, i) => ({
  id: idOffset + i,
  position: (['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(70),
  morale: 70,
  fitness: 90,
}));

const baseTactic = (): Tactic => ({
  id: 1, clubId: 1, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
  attackFocus: 'balanced', subStrategy: 'balanced',
});

function input(derby?: ReturnType<typeof deriveDerbyBonus>): MatchInput {
  return {
    fixtureId: 1,
    homeSquad: makeSquad(1), awaySquad: makeSquad(100),
    homeTactic: baseTactic(), awayTactic: { ...baseTactic(), id: 2, clubId: 2 },
    homeClubReputation: 70, awayClubReputation: 70,
    derbyBonus: derby, rng: new SeededRng(123),
  };
}

it('bônus neutro == sem bônus (não-regressão, mesma seed)', () => {
  const a = simulateMatch(input(undefined));
  const b = simulateMatch(input(deriveDerbyBonus(null)));
  expect(b.homeGoals).toBe(a.homeGoals);
  expect(b.awayGoals).toBe(a.awayGoals);
  expect(b.stats.homeXG).toBe(a.stats.homeXG);
});

it('bônus de clássico altera o jogo de forma determinística', () => {
  const a = simulateMatch(input(deriveDerbyBonus(100)));
  const b = simulateMatch(input(deriveDerbyBonus(100)));
  expect(a.homeGoals).toBe(b.homeGoals);
});
