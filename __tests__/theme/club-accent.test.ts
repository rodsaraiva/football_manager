import { deriveClubAccent, luminance, mixWithWhite } from '@/theme/club-accent';

describe('luminance', () => {
  it('is 0 for black and 255 for white', () => {
    expect(Math.round(luminance('#000000'))).toBe(0);
    expect(Math.round(luminance('#FFFFFF'))).toBe(255);
  });
  it('treats invalid input as 0', () => {
    expect(luminance('nope')).toBe(0);
  });
});

describe('mixWithWhite', () => {
  it('blends black toward white by t', () => {
    expect(mixWithWhite('#000000', 0.65)).toBe('#a6a6a6');
  });
});

describe('deriveClubAccent', () => {
  it('null club → default blue accent, white text', () => {
    expect(deriveClubAccent(null)).toEqual({ accent: '#4361ee', onAccent: '#ffffff' });
  });

  it('bright primary → uses primary; black text when light', () => {
    expect(deriveClubAccent({ primaryColor: '#FFFFFF', secondaryColor: '#000000' }))
      .toEqual({ accent: '#FFFFFF', onAccent: '#000000' });
  });

  it('dark primary + bright secondary → uses secondary', () => {
    expect(deriveClubAccent({ primaryColor: '#241F20', secondaryColor: '#FFFFFF' }))
      .toEqual({ accent: '#FFFFFF', onAccent: '#000000' });
  });

  it('mid-dark primary → keeps primary with white text', () => {
    expect(deriveClubAccent({ primaryColor: '#DA291C', secondaryColor: '#FFE500' }))
      .toEqual({ accent: '#DA291C', onAccent: '#ffffff' });
  });

  it('both colors too dark → lightens to a readable accent', () => {
    const r = deriveClubAccent({ primaryColor: '#101010', secondaryColor: '#050505' });
    expect(luminance(r.accent)).toBeGreaterThanOrEqual(60);
  });
});

import { mixWithBlack, deriveAccentRamp } from '@/theme/club-accent';

describe('mixWithBlack', () => {
  it('blends white toward black by t (mirror of mixWithWhite)', () => {
    expect(mixWithBlack('#ffffff', 0.65)).toBe('#595959'); // round(255*(1-0.65))=89=0x59
  });
  it('black stays black', () => {
    expect(mixWithBlack('#000000', 0.5)).toBe('#000000');
  });
});

describe('deriveAccentRamp', () => {
  it('keeps base accent unchanged and derives dim/bright + readable onAccent', () => {
    const r = deriveAccentRamp('#4361ee');
    expect(r.accent).toBe('#4361ee');
    expect(r.onAccent).toBe('#ffffff'); // dark accent → white text
  });

  it('orders the ramp by luminance: dim < base < bright', () => {
    const r = deriveAccentRamp('#4361ee');
    expect(luminance(r.accentDim)).toBeLessThan(luminance(r.accent));
    expect(luminance(r.accent)).toBeLessThan(luminance(r.accentBright));
  });

  it('flips onAccent to black for a very light accent', () => {
    const r = deriveAccentRamp('#FFE500'); // bright yellow
    expect(r.onAccent).toBe('#000000');
    expect(luminance(r.accentDim)).toBeLessThan(luminance(r.accentBright));
  });
});
