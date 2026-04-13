import { calculateTeamStrength } from '@/engine/simulation/team-strength';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';

const makePlayer = (id: number, position: Position, overall: number, morale: number = 70, fitness: number = 90) => {
  const attrs: PlayerAttributes = {
    finishing: overall, passing: overall, crossing: overall, dribbling: overall,
    heading: overall, longShots: overall, freeKicks: overall,
    vision: overall, composure: overall, decisions: overall,
    positioning: overall, aggression: overall, leadership: overall,
    pace: overall, stamina: overall, strength: overall, agility: overall, jumping: overall,
  };
  return { id, position, secondaryPosition: null as Position | null, attributes: attrs, morale, fitness };
};

const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
};

describe('calculateTeamStrength', () => {
  it('returns a positive strength value', () => {
    const players = [
      makePlayer(1, 'GK', 70), makePlayer(2, 'CB', 70), makePlayer(3, 'CB', 70),
      makePlayer(4, 'LB', 70), makePlayer(5, 'RB', 70), makePlayer(6, 'CM', 70),
      makePlayer(7, 'CM', 70), makePlayer(8, 'LM', 70), makePlayer(9, 'RM', 70),
      makePlayer(10, 'ST', 70), makePlayer(11, 'ST', 70),
    ];
    const result = calculateTeamStrength({ players, tactic: defaultTactic, isHome: false });
    expect(result.overall).toBeGreaterThan(0);
    expect(result.attack).toBeGreaterThan(0);
    expect(result.midfield).toBeGreaterThan(0);
    expect(result.defense).toBeGreaterThan(0);
  });

  it('stronger squad produces higher strength', () => {
    const weak = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 50));
    const strong = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 85));
    const weakStr = calculateTeamStrength({ players: weak, tactic: defaultTactic, isHome: false });
    const strongStr = calculateTeamStrength({ players: strong, tactic: defaultTactic, isHome: false });
    expect(strongStr.overall).toBeGreaterThan(weakStr.overall);
  });

  it('home advantage adds bonus', () => {
    const players = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70));
    const home = calculateTeamStrength({ players, tactic: defaultTactic, isHome: true });
    const away = calculateTeamStrength({ players, tactic: defaultTactic, isHome: false });
    expect(home.overall).toBeGreaterThan(away.overall);
  });

  it('high morale increases strength', () => {
    const lowMorale = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70, 30, 90));
    const highMorale = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70, 90, 90));
    const low = calculateTeamStrength({ players: lowMorale, tactic: defaultTactic, isHome: false });
    const high = calculateTeamStrength({ players: highMorale, tactic: defaultTactic, isHome: false });
    expect(high.overall).toBeGreaterThan(low.overall);
  });

  it('low fitness decreases strength', () => {
    const fit = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70, 70, 100));
    const tired = Array.from({ length: 11 }, (_, i) => makePlayer(i, 'CM', 70, 70, 40));
    const fitStr = calculateTeamStrength({ players: fit, tactic: defaultTactic, isHome: false });
    const tiredStr = calculateTeamStrength({ players: tired, tactic: defaultTactic, isHome: false });
    expect(fitStr.overall).toBeGreaterThan(tiredStr.overall);
  });

  it('separates attack/midfield/defense based on positions', () => {
    const players = [
      makePlayer(1, 'GK', 70), makePlayer(2, 'CB', 90), makePlayer(3, 'CB', 90),
      makePlayer(4, 'LB', 90), makePlayer(5, 'RB', 90), makePlayer(6, 'CM', 50),
      makePlayer(7, 'CM', 50), makePlayer(8, 'LM', 50), makePlayer(9, 'RM', 50),
      makePlayer(10, 'ST', 50), makePlayer(11, 'ST', 50),
    ];
    const result = calculateTeamStrength({ players, tactic: defaultTactic, isHome: false });
    expect(result.defense).toBeGreaterThan(result.attack);
  });
});
