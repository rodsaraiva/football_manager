export interface ClubAccent {
  accent: string;
  onAccent: string;
}

const MIN_LUM = 60;
const TEXT_FLIP_LUM = 140;
const DEFAULT_ACCENT = '#4361ee';

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

export function mixWithWhite(hex: string, t: number): string {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const mix = rgb.map((c) => Math.round(c + (255 - c) * t));
  return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('');
}

export function deriveClubAccent(
  club: { primaryColor: string; secondaryColor: string } | null,
): ClubAccent {
  if (!club) return { accent: DEFAULT_ACCENT, onAccent: '#ffffff' };
  let accent: string;
  if (luminance(club.primaryColor) >= MIN_LUM) accent = club.primaryColor;
  else if (luminance(club.secondaryColor) >= MIN_LUM) accent = club.secondaryColor;
  else accent = mixWithWhite(club.primaryColor, 0.65);
  const onAccent = luminance(accent) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff';
  return { accent, onAccent };
}
