import {
  pickStartingEleven,
  buildSquadFromSavedIds,
  buildBench,
  PlayerForPick,
} from '@/engine/simulation/squad-selection';
import { PlayerAttributes } from '@/types';

const ATTRS: PlayerAttributes = {
  finishing: 60, passing: 60, crossing: 60, dribbling: 60, heading: 60,
  longShots: 60, freeKicks: 60, vision: 60, composure: 60, decisions: 60,
  positioning: 60, aggression: 60, leadership: 60, pace: 60, stamina: 60,
  strength: 60, agility: 60, jumping: 60,
};

function mk(id: number, position: PlayerForPick['position'], over: Partial<PlayerForPick> = {}): PlayerForPick {
  return {
    id, position, secondaryPosition: null, attributes: ATTRS,
    morale: 70, fitness: 100, injuryWeeksLeft: 0, suspensionWeeksLeft: 0, ...over,
  };
}

// 4-4-2 needs: 1 GK, 4 DEF, 4 MID, 2 FWD
const full = [
  mk(1, 'GK'),
  mk(2, 'CB'), mk(3, 'CB'), mk(4, 'LB'), mk(5, 'RB'),
  mk(6, 'CM'), mk(7, 'CM'), mk(8, 'LM'), mk(9, 'RM'),
  mk(10, 'ST'), mk(11, 'ST'),
  mk(12, 'CB'), mk(13, 'ST'), // extras for bench
];

describe('squad-selection', () => {
  it('pickStartingEleven returns 11 for a valid formation', () => {
    expect(pickStartingEleven(full, '4-4-2')).toHaveLength(11);
  });

  it('excludes injured, suspended and low-fitness players', () => {
    const squad = [...full];
    squad[0] = mk(1, 'GK', { injuryWeeksLeft: 2 });
    squad[1] = mk(2, 'CB', { fitness: 25 });
    squad[2] = mk(3, 'CB', { suspensionWeeksLeft: 1 });
    const eleven = pickStartingEleven(squad, '4-4-2');
    expect(eleven.find(p => p.id === 1)).toBeUndefined();
    expect(eleven.find(p => p.id === 2)).toBeUndefined();
    expect(eleven.find(p => p.id === 3)).toBeUndefined();
  });

  it('buildSquadFromSavedIds honours saved starter ids and falls back when ineligible', () => {
    const saved = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const built = buildSquadFromSavedIds(saved, full, '4-4-2');
    expect(built).toHaveLength(11);
    expect(built.map(p => p.id).sort((a, b) => a - b)).toEqual(saved);
  });

  it('buildBench excludes starters and caps at 8', () => {
    const eleven = pickStartingEleven(full, '4-4-2');
    const startIds = new Set(eleven.map(p => p.id));
    const bench = buildBench(full, startIds);
    expect(bench.length).toBeLessThanOrEqual(8);
    for (const b of bench) expect(startIds.has(b.id)).toBe(false);
  });
});
