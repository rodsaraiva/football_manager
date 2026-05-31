import { colors, spacing, radius, fontSize } from '@/theme/tokens';

describe('semantic position tokens', () => {
  it('exposes named position colors (GK off-palette promoted)', () => {
    expect(colors.positionGK).toBe('#f4a261');
    expect(colors.positionDef).toBe('#4361ee'); // = primary
    expect(colors.positionMid).toBe('#06d6a0'); // = success
    expect(colors.positionAtk).toBe('#f72585'); // = accent
  });
});

describe('semantic rating ramp tokens', () => {
  it('exposes the five rating tiers (elite/poor off-palette promoted)', () => {
    expect(colors.ratingElite).toBe('#00e676');
    expect(colors.ratingGood).toBe('#06d6a0'); // = success
    expect(colors.ratingAverage).toBe('#ffd166'); // = warning
    expect(colors.ratingPoor).toBe('#ff9800');
    expect(colors.ratingBad).toBe('#ef476f'); // = danger
  });
});

describe('spacing scale', () => {
  it('adds xxs degree for the marginTop:2 literals', () => {
    expect(spacing.xxs).toBe(2);
    expect(spacing.xs).toBe(4); // unchanged baseline
  });
});

describe('radius scale', () => {
  it('covers the common borderRadius literals (4/8/12/20/round)', () => {
    expect(radius.sm).toBe(4);
    expect(radius.md).toBe(8);
    expect(radius.lg).toBe(12);
    expect(radius.pill).toBe(20);
    expect(radius.round).toBe(999);
  });
});

describe('fontSize scale', () => {
  it('adds micro (RadarChart) and display (BoardScreen bigNumber)', () => {
    expect(fontSize.micro).toBe(8);
    expect(fontSize.display).toBe(56);
    expect(fontSize.xs).toBe(10); // unchanged
  });
});
