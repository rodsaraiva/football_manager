import { generateYouthPlayers, YouthGenerationInput } from '@/engine/youth/youth-academy';
import { SeededRng } from '@/engine/rng';

const base = (over: Partial<YouthGenerationInput> = {}): YouthGenerationInput => ({
  clubId: 1, academyLevel: 4, youthCoachBonus: 6, academyReputation: 70,
  specialization: 'balanced', countryCode: 'EN', rng: new SeededRng(11), ...over,
});

describe('generateYouthPlayers — specialization & levers', () => {
  it('mesma seed + mesmo input estendido ⇒ jogadores idênticos', () => {
    const a = generateYouthPlayers(base({ rng: new SeededRng(11) }));
    const b = generateYouthPlayers(base({ rng: new SeededRng(11) }));
    expect(a).toEqual(b);
  });

  it('seeds diferentes divergem', () => {
    const a = generateYouthPlayers(base({ rng: new SeededRng(11) }));
    const b = generateYouthPlayers(base({ rng: new SeededRng(99) }));
    expect(a).not.toEqual(b);
  });

  it("specialization 'physical' eleva atributos físicos agregados vs 'balanced' na mesma seed", () => {
    const physKeys = ['pace', 'stamina', 'strength', 'agility', 'jumping'] as const;
    const sum = (ps: ReturnType<typeof generateYouthPlayers>) =>
      ps.reduce((acc, p) => acc + physKeys.reduce((s, k) => s + p.attributes[k], 0), 0);
    const balanced = generateYouthPlayers(base({ specialization: 'balanced', rng: new SeededRng(11) }));
    const physical = generateYouthPlayers(base({ specialization: 'physical', rng: new SeededRng(11) }));
    expect(sum(physical)).toBeGreaterThan(sum(balanced));
  });

  it('input legado sem academyReputation/specialization ainda funciona (defaults)', () => {
    const legacy = generateYouthPlayers({
      clubId: 1, academyLevel: 3, youthCoachBonus: 5, countryCode: 'EN', rng: new SeededRng(42),
    } as YouthGenerationInput);
    expect(legacy.length).toBeGreaterThanOrEqual(2);
    expect(legacy.length).toBeLessThanOrEqual(5);
  });
});
