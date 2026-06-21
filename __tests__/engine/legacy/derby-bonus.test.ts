import { deriveDerbyBonus } from '@/engine/legacy/derby-bonus';

describe('deriveDerbyBonus', () => {
  it('intensity null → neutro', () => {
    expect(deriveDerbyBonus(null)).toEqual({ atmosphereMult: 1, homeMoraleBonus: 0, awayMoraleBonus: 0 });
  });
  it('intensity alta → atmosfera > 1 e bônus de moral > 0', () => {
    const b = deriveDerbyBonus(100);
    expect(b.atmosphereMult).toBeGreaterThan(1);
    expect(b.homeMoraleBonus).toBeGreaterThan(0);
    expect(b.awayMoraleBonus).toBeGreaterThanOrEqual(0);
    expect(b.homeMoraleBonus).toBeGreaterThanOrEqual(b.awayMoraleBonus);
  });
  it('monotônico: intensity maior ⇒ atmosfera/bônus ≥', () => {
    const lo = deriveDerbyBonus(20), hi = deriveDerbyBonus(80);
    expect(hi.atmosphereMult).toBeGreaterThanOrEqual(lo.atmosphereMult);
    expect(hi.homeMoraleBonus).toBeGreaterThanOrEqual(lo.homeMoraleBonus);
  });
});
