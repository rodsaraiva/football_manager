import { useMemo } from 'react';
import { useGameStore } from '@/store/game-store';
import { deriveClubAccent, deriveAccentRamp, ClubAccentRamp } from './club-accent';

export function useClubAccent(): ClubAccentRamp {
  const club = useGameStore((s) => s.playerClub);
  return useMemo(() => {
    const base = deriveClubAccent(
      club ? { primaryColor: club.primaryColor, secondaryColor: club.secondaryColor } : null,
    );
    return deriveAccentRamp(base.accent);
  }, [club?.primaryColor, club?.secondaryColor]);
}
