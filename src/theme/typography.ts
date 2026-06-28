import type { TextStyle } from 'react-native';
import { typography, type TypographyToken } from './tokens';

export type TypographyVariant = keyof typeof typography;

// Resolve um TextStyle a partir do token semântico. `overrides` (cor, size pontual,
// alinhamento) têm precedência. Único ponto que traduz TypographyToken → TextStyle RN.
export function textStyle(variant: TypographyVariant, overrides?: Partial<TextStyle>): TextStyle {
  const t: TypographyToken = typography[variant];
  const base: TextStyle = {
    fontSize: t.size,
    lineHeight: t.lineHeight,
    fontWeight: t.weight,
    fontFamily: t.family,
  };
  if (t.letterSpacing !== undefined) base.letterSpacing = t.letterSpacing;
  if (t.tabular) base.fontVariant = ['tabular-nums'];
  return { ...base, ...overrides };
}
