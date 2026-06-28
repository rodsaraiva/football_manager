import {
  archetypeMultiplier,
  archetypeAccuracyBonus,
  SCOUT_ARCHETYPES,
  ArchetypeTarget,
  ArchetypeContext,
} from '@/engine/scouting/scout-archetypes';

const ctx = (region: string): ArchetypeContext => ({ scoutRegionCode: region });
const tgt = (over: Partial<ArchetypeTarget> = {}): ArchetypeTarget => ({
  age: 24, position: 'CM', regionCode: 'BR', ...over,
});

describe('archetypeMultiplier', () => {
  it('generalista é neutro (1.0) para qualquer alvo', () => {
    expect(archetypeMultiplier('generalist', tgt(), ctx('BR'))).toBe(1.0);
    expect(archetypeMultiplier('generalist', tgt({ age: 16, position: 'GK' }), ctx('DE'))).toBe(1.0);
  });

  it('youth specialist rende mais em jovem e menos em veterano', () => {
    const young = archetypeMultiplier('youth', tgt({ age: 16 }), ctx('BR'));
    const old = archetypeMultiplier('youth', tgt({ age: 31 }), ctx('BR'));
    expect(young).toBeGreaterThan(1.0);
    expect(young).toBeGreaterThan(archetypeMultiplier('generalist', tgt({ age: 16 }), ctx('BR')));
    expect(old).toBeLessThan(1.0);
  });

  it('defenders rende mais em defensores e menos em atacantes', () => {
    expect(archetypeMultiplier('defenders', tgt({ position: 'CB' }), ctx('BR'))).toBeGreaterThan(1.0);
    expect(archetypeMultiplier('defenders', tgt({ position: 'ST' }), ctx('BR'))).toBeLessThan(1.0);
  });

  it('regional rende mais quando a região casa e neutro quando difere', () => {
    expect(archetypeMultiplier('regional', tgt({ regionCode: 'BR' }), ctx('BR'))).toBeGreaterThan(1.0);
    expect(archetypeMultiplier('regional', tgt({ regionCode: 'DE' }), ctx('BR'))).toBe(1.0);
  });

  it('mantém o multiplicador na faixa 0.7–1.6', () => {
    for (const a of SCOUT_ARCHETYPES) {
      for (const age of [16, 24, 33]) {
        for (const pos of ['GK', 'CB', 'ST'] as const) {
          const m = archetypeMultiplier(a, tgt({ age, position: pos }), ctx('BR'));
          expect(m).toBeGreaterThanOrEqual(0.7);
          expect(m).toBeLessThanOrEqual(1.6);
        }
      }
    }
  });

  it('região vazia não casa regional (sem crash)', () => {
    expect(archetypeMultiplier('regional', tgt({ regionCode: '' }), ctx(''))).toBe(1.0);
  });
});

describe('archetypeAccuracyBonus', () => {
  it('dá bônus 0–0.15 quando o alvo casa a especialidade, 0 caso contrário', () => {
    expect(archetypeAccuracyBonus('youth', tgt({ age: 16 }), ctx('BR'))).toBeGreaterThan(0);
    expect(archetypeAccuracyBonus('youth', tgt({ age: 30 }), ctx('BR'))).toBe(0);
    expect(archetypeAccuracyBonus('generalist', tgt(), ctx('BR'))).toBe(0);
    expect(archetypeAccuracyBonus('regional', tgt({ regionCode: 'BR' }), ctx('BR'))).toBeLessThanOrEqual(0.15);
  });
});
