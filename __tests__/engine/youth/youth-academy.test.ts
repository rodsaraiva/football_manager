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
    const avgPotential = (players: typeof lowAcademy) => players.reduce((s, p) => s + p.basePotential, 0) / players.length;
    expect(avgPotential(highAcademy)).toBeGreaterThan(avgPotential(lowAcademy));
  });

  it('youth players have valid positions', () => {
    const validPositions = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
    const players = generateYouthPlayers(base);
    for (const p of players) expect(validPositions).toContain(p.position);
  });

  it('youth have attributes between 1 and 99', () => {
    const players = generateYouthPlayers(base);
    for (const p of players) {
      const vals = Object.values(p.attributes);
      for (const v of vals) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(99); }
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
