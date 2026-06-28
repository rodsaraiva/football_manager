import { generateYouthProspect } from '@/engine/scouting/youth-prospects';
import { SeededRng } from '@/engine/rng';

describe('generateYouthProspect', () => {
  it('determinístico: mesma seed/região/slot ⇒ prospecto idêntico', () => {
    const a = generateYouthProspect(1, 'BR', 0, new SeededRng(42));
    const b = generateYouthProspect(1, 'BR', 0, new SeededRng(42));
    expect(a).toEqual(b);
  });

  it('seeds diferentes ⇒ variam', () => {
    const a = generateYouthProspect(1, 'BR', 0, new SeededRng(1));
    const b = generateYouthProspect(1, 'BR', 0, new SeededRng(2));
    expect(a).not.toEqual(b);
  });

  it('respeita faixas: idade 15–17, potencial e máscara coerente', () => {
    const p = generateYouthProspect(7, 'DE', 3, new SeededRng(99));
    expect(p.age).toBeGreaterThanOrEqual(15);
    expect(p.age).toBeLessThanOrEqual(17);
    expect(p.regionCode).toBe('DE');
    expect(p.maskedPotentialLo).toBeLessThanOrEqual(p.basePotential);
    expect(p.maskedPotentialHi).toBeGreaterThanOrEqual(p.basePotential);
    expect(p.name.length).toBeGreaterThan(0);
  });
});
