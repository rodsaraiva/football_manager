// D1/D4 estão prontos: @/theme exporta elevation/luminance; accent é string base (não rampa).
import { colors } from '@/theme';
import { luminance } from '@/theme/club-accent';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonState = 'default' | 'pressed' | 'disabled' | 'loading';

export interface ButtonResolved {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  opacity: number;
  showSpinner: boolean;
}

const TEXT_FLIP_LUM = 140; // espelha club-accent.ts

function onColor(bg: string): string {
  return luminance(bg) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff';
}

export function resolveButtonStyle(
  variant: ButtonVariant,
  state: ButtonState,
  accent: string,
): ButtonResolved {
  const base: ButtonResolved = {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    textColor: accent,
    opacity: 1,
    showSpinner: false,
  };

  switch (variant) {
    case 'primary':
      base.backgroundColor = accent;
      base.textColor = onColor(accent);
      break;
    case 'secondary':
      base.borderColor = accent;
      base.borderWidth = 1;
      base.textColor = accent;
      break;
    case 'ghost':
      base.textColor = accent;
      break;
    case 'danger':
      base.backgroundColor = colors.danger;
      base.textColor = onColor(colors.danger);
      break;
  }

  if (state === 'disabled') base.opacity = 0.4;
  else if (state === 'pressed') base.opacity = 0.85;
  else if (state === 'loading') base.showSpinner = true;

  return base;
}
