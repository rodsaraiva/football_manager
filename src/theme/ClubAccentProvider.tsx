import React, { createContext, useContext } from 'react';
import { ClubAccentRamp } from './club-accent';
import { useClubAccent } from './useClubAccent';

const ClubAccentContext = createContext<ClubAccentRamp | null>(null);

export function ClubAccentProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const ramp = useClubAccent();
  return <ClubAccentContext.Provider value={ramp}>{children}</ClubAccentContext.Provider>;
}

export function useClubAccentContext(): ClubAccentRamp {
  const ramp = useContext(ClubAccentContext);
  if (!ramp) {
    throw new Error('useClubAccentContext deve ser usado dentro de <ClubAccentProvider>.');
  }
  return ramp;
}

// Variante que não lança: retorna null fora do provider. Para componentes do kit que
// herdam o accent quando dentro da árvore, mas têm fallback próprio fora dela.
export function useClubAccentRampOptional(): ClubAccentRamp | null {
  return useContext(ClubAccentContext);
}
