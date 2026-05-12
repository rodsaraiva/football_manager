import { create } from 'zustand';
import { SaveGame, Club, Player, Fixture, Competition } from '@/types';
import { MatchResult } from '@/engine/simulation/match-engine';
import { StandingsEntry } from '@/engine/competition/standings';
import { useBoardStore } from '@/store/board-store';
import { useAssistantStore } from '@/store/assistant-store';

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
  lastMatchIsHome: boolean | null;
  lastMatchOpponentName: string | null;
  // UI flags
  isAdvancing: boolean;
  isNewSeason: boolean;
  // Retirement: IDs aposentados na última virada de temporada
  lastRetiredPlayerIds: number[];
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
  setLastMatchContext: (isHome: boolean | null, opponentName: string | null) => void;
  setNewSeason: (isNew: boolean) => void;
  setLastRetiredPlayerIds: (ids: number[]) => void;
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
  lastMatchIsHome: null,
  lastMatchOpponentName: null,
  isAdvancing: false,
  isNewSeason: false,
  lastRetiredPlayerIds: [],
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
  loadSave: (save) => {
    useBoardStore.getState().reset();
    useAssistantStore.getState().reset();
    set({
      currentSave: save,
      playerClubId: save.playerClubId,
      season: save.currentSeason,
      week: save.currentWeek,
      recentResults: [],
      lastMatchResult: null,
      lastMatchIsHome: null,
      lastMatchOpponentName: null,
      playerClub: null,
      isNewSeason: false,
    });
  },
  clearGame: () => {
    useBoardStore.getState().reset();
    useAssistantStore.getState().reset();
    set(initialState);
  },
  setAdvancing: (advancing) => set({ isAdvancing: advancing }),
  updateWeek: (season, week) => set({ season, week }),
  setLastMatchResult: (result) => set({ lastMatchResult: result }),
  setLastMatchContext: (isHome, opponentName) =>
    set({ lastMatchIsHome: isHome, lastMatchOpponentName: opponentName }),
  setNewSeason: (isNew) => set({ isNewSeason: isNew }),
  setLastRetiredPlayerIds: (ids) => set({ lastRetiredPlayerIds: ids }),
  setSquad: (squad) => set({ squad }),
  setCompetitions: (competitions) => set({ competitions }),
  setStandings: (standings) => set({ standings }),
  setRecentResults: (results) => set({ recentResults: results }),
  setPlayerClub: (club) => set({ playerClub: club }),
}));
