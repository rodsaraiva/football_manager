export interface DerbyBonus { atmosphereMult: number; homeMoraleBonus: number; awayMoraleBonus: number; }

export function deriveDerbyBonus(intensity: number | null): DerbyBonus {
  if (intensity == null) return { atmosphereMult: 1, homeMoraleBonus: 0, awayMoraleBonus: 0 };
  const f = Math.max(1, Math.min(100, intensity)) / 100;
  return {
    atmosphereMult: 1 + 0.05 * f,
    homeMoraleBonus: Math.round(4 * f),
    awayMoraleBonus: Math.round(2 * f),
  };
}
