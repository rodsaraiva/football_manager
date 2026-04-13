import { create } from 'zustand';
import { SaveGame, Club, Player, Fixture, Competition } from '@/types';
import { MatchResult } from '@/engine/simulation/match-engine';
import { StandingsEntry } from '@/engine/competition/standings';

interface GameState {
  // Save
  currentSave: SaveGame | null;
  // Club
  playerClub: Club | null;
  playerClubId: number | null;
  // Season
  season: number;
  week: number;
  // Data (loaded from DB)
  squad: Player[];
  competitions: Competition[];
  standings: StandingsEntry[];
  recentResults: Fixture[];
  lastMatchResult: MatchResult | null;
  // UI flags
  isAdvancing: boolean;
  isNewSeason: boolean;
}

interface GameActions {
  // Save management
  startNewGame: (saveId: number, clubId: number, season: number, week: number) => void;
  loadSave: (save: SaveGame) => void;
  clearGame: () => void;
  // Week advancement
  setAdvancing: (advancing: boolean) => void;
  updateWeek: (season: number, week: number) => void;
  setLastMatchResult: (result: MatchResult | null) => void;
  setNewSeason: (isNew: boolean) => void;
  // Data loading
  setSquad: (squad: Player[]) => void;
  setCompetitions: (competitions: Competition[]) => void;
  setStandings: (standings: StandingsEntry[]) => void;
  setRecentResults: (results: Fixture[]) => void;
  setPlayerClub: (club: Club) => void;
}

type GameStore = GameState & GameActions;

const initialState: GameState = {
  currentSave: null,
  playerClub: null,
  playerClubId: null,
  season: 1,
  week: 1,
  squad: [],
  competitions: [],
  standings: [],
  recentResults: [],
  lastMatchResult: null,
  isAdvancing: false,
  isNewSeason: false,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,
  startNewGame: (saveId, clubId, season, week) =>
    set({
      currentSave: {
        id: saveId,
        name: '',
        currentSeason: season,
        currentWeek: week,
        playerClubId: clubId,
        difficulty: 'normal',
        createdAt: '',
        updatedAt: '',
      },
      playerClubId: clubId,
      season,
      week,
    }),
  loadSave: (save) =>
    set({
      currentSave: save,
      playerClubId: save.playerClubId,
      season: save.currentSeason,
      week: save.currentWeek,
    }),
  clearGame: () => set(initialState),
  setAdvancing: (advancing) => set({ isAdvancing: advancing }),
  updateWeek: (season, week) => set({ season, week }),
  setLastMatchResult: (result) => set({ lastMatchResult: result }),
  setNewSeason: (isNew) => set({ isNewSeason: isNew }),
  setSquad: (squad) => set({ squad }),
  setCompetitions: (competitions) => set({ competitions }),
  setStandings: (standings) => set({ standings }),
  setRecentResults: (results) => set({ recentResults: results }),
  setPlayerClub: (club) => set({ playerClub: club }),
}));
