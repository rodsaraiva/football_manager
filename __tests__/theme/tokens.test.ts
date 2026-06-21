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

import { neutral } from '@/theme/tokens';
import { luminance } from '@/theme/club-accent';

describe('neutral ramp', () => {
  it('exposes 10 steps 50→900', () => {
    const keys = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
    for (const k of keys) {
      expect(typeof neutral[k]).toBe('string');
      expect(neutral[k]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('is monotonically decreasing in luminance (50 lightest → 900 darkest)', () => {
    const keys = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
    for (let i = 1; i < keys.length; i++) {
      expect(luminance(neutral[keys[i]])).toBeLessThan(luminance(neutral[keys[i - 1]]));
    }
  });

  it('keeps background/surface/surfaceLight as backward-compatible aliases', () => {
    expect(colors.background).toBe('#0f0f1a');   // = neutral[900], unchanged value
    expect(colors.surface).toBe('#1a1a2e');      // = neutral[800], unchanged value
    expect(colors.surfaceLight).toBe('#252540'); // = neutral[700], unchanged value
    expect(colors.background).toBe(neutral[900]);
    expect(colors.surface).toBe(neutral[800]);
    expect(colors.surfaceLight).toBe(neutral[700]);
  });
});
