import { calculateOverall, POSITION_WEIGHTS } from '@/utils/overall';
import { PlayerAttributes, Position } from '@/types';

const makeAttributes = (base: number): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base,
  vision: base, composure: base, decisions: base,
  positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
});

describe('calculateOverall', () => {
  it('returns the base value when all attributes are equal', () => {
    const attrs = makeAttributes(70);
    const overall = calculateOverall(attrs, 'ST');
    expect(overall).toBeGreaterThanOrEqual(68);
    expect(overall).toBeLessThanOrEqual(72);
  });

  it('weights finishing higher for ST than for CB', () => {
    const attrs = makeAttributes(50);
    attrs.finishing = 90;
    const stOverall = calculateOverall(attrs, 'ST');
    const cbOverall = calculateOverall(attrs, 'CB');
    expect(stOverall).toBeGreaterThan(cbOverall);
  });

  it('weights strength higher for CB than for CAM', () => {
    const attrs = makeAttributes(50);
    attrs.strength = 90;
    const cbOverall = calculateOverall(attrs, 'CB');
    const camOverall = calculateOverall(attrs, 'CAM');
    expect(cbOverall).toBeGreaterThan(camOverall);
  });

  it('returns a value between 1 and 99', () => {
    const low = makeAttributes(1);
    const high = makeAttributes(99);
    expect(calculateOverall(low, 'GK')).toBeGreaterThanOrEqual(1);
    expect(calculateOverall(high, 'GK')).toBeLessThanOrEqual(99);
  });

  it('has weight definitions for all positions', () => {
    const positions: Position[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
    for (const pos of positions) {
      expect(POSITION_WEIGHTS[pos]).toBeDefined();
    }
  });
});
