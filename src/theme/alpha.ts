/** Apply opacity t∈[0,1] to a 6-digit hex, returning #RRGGBBAA. Invalid hex → input unchanged. */
export function alpha(hex: string, t: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, t)) * 255)
    .toString(16)
    .padStart(2, '0');
  return '#' + h + a;
}
