import { simulateWeekFixtures, ClubMatchData } from '@/engine/simulation/match-runner';
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

const baseTactic = (clubId: number): Tactic => ({
  id: clubId, clubId, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
  attackFocus: 'balanced', subStrategy: 'balanced',
});

const clubData = (): Map<number, ClubMatchData> => new Map([
  [1, { clubId: 1, reputation: 70, squad: makeSquad(1), bench: [], tactic: baseTactic(1) }],
  [2, { clubId: 2, reputation: 70, squad: makeSquad(100), bench: [], tactic: baseTactic(2) }],
]);

it('runner aceita derbyBonus por fixture (neutro == sem campo)', () => {
  const plain = simulateWeekFixtures({ fixtures: [{ fixtureId: 1, homeClubId: 1, awayClubId: 2 }], clubData: clubData(), rng: new SeededRng(9) });
  const neutral = simulateWeekFixtures({ fixtures: [{ fixtureId: 1, homeClubId: 1, awayClubId: 2, derbyBonus: deriveDerbyBonus(null) }], clubData: clubData(), rng: new SeededRng(9) });
  expect(neutral[0].result.homeGoals).toBe(plain[0].result.homeGoals);
  expect(neutral[0].result.awayGoals).toBe(plain[0].result.awayGoals);
});
