import { useMemo } from 'react';
import { useGameStore } from '@/store/game-store';
import { deriveClubAccent, ClubAccent } from './club-accent';

export function useClubAccent(): ClubAccent {
  const club = useGameStore((s) => s.playerClub);
  return useMemo(
    () =>
      deriveClubAccent(
        club ? { primaryColor: club.primaryColor, secondaryColor: club.secondaryColor } : null,
      ),
    [club?.primaryColor, club?.secondaryColor],
  );
}
