import { getPositionColor, getOverallColor, getBarColor } from '@/utils/player-colors';
import { colors } from '@/theme/tokens';
import { Position } from '@/types/player';

describe('getPositionColor', () => {
  it('GK → positionGK', () => {
    expect(getPositionColor('GK')).toBe(colors.positionGK);
  });
  it('defenders → positionDef', () => {
    (['CB', 'LB', 'RB'] as Position[]).forEach((p) =>
      expect(getPositionColor(p)).toBe(colors.positionDef));
  });
  it('midfielders → positionMid', () => {
    (['CDM', 'CM', 'CAM', 'LM', 'RM'] as Position[]).forEach((p) =>
      expect(getPositionColor(p)).toBe(colors.positionMid));
  });
  it('attackers → positionAtk', () => {
    (['LW', 'RW', 'ST'] as Position[]).forEach((p) =>
      expect(getPositionColor(p)).toBe(colors.positionAtk));
  });
});

describe('getOverallColor — canonical tiers', () => {
  it('maps every tier boundary', () => {
    expect(getOverallColor(85)).toBe(colors.ratingElite);
    expect(getOverallColor(84)).toBe(colors.ratingGood);
    expect(getOverallColor(75)).toBe(colors.ratingGood);
    expect(getOverallColor(74)).toBe(colors.ratingAverage);
    expect(getOverallColor(60)).toBe(colors.ratingAverage);
    expect(getOverallColor(59)).toBe(colors.ratingPoor);
    expect(getOverallColor(40)).toBe(colors.ratingPoor);
    expect(getOverallColor(39)).toBe(colors.ratingBad);
  });
  it('handles out-of-range extremes', () => {
    expect(getOverallColor(99)).toBe(colors.ratingElite);
    expect(getOverallColor(0)).toBe(colors.ratingBad);
    expect(getOverallColor(-5)).toBe(colors.ratingBad);
  });
  // Anti-regression for the FreeAgents drift: it dropped the >=40 tier, so OVR 50
  // showed danger there but #ff9800 elsewhere. After consolidation it is ratingPoor everywhere.
  it('OVR 50 is ratingPoor (not ratingBad) — unifies the FreeAgents drift', () => {
    expect(getOverallColor(50)).toBe(colors.ratingPoor);
  });
});

describe('getBarColor — must equal getOverallColor (no future drift)', () => {
  it('is identical to getOverallColor across the full range', () => {
    for (let v = 0; v <= 99; v++) {
      expect(getBarColor(v)).toBe(getOverallColor(v));
    }
  });
});
