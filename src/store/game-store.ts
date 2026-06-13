import { create } from 'zustand';
import { SaveGame, Club, Player, Fixture, Competition } from '@/types';
import { MatchResult, HalftimeState } from '@/engine/simulation/match-engine';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic } from '@/types/tactic';
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
  // P4 (halftime): live in-memory halftime snapshot of the user's watched match.
  // Holds the LIVE rng instance — transient for a single in-session interaction;
  // a page reload mid-halftime discards it (acceptable for MVP).
  halftime: HalftimeState | null;
  halftimeIsHome: boolean | null;
  halftimeOpponentName: string | null;
  halftimeBench: PlayerForStrength[];
  halftimeTactic: Tactic | null;
  halftimeFixtureId: number | null;
  // UI flags
  isAdvancing: boolean;
  isNewSeason: boolean;
  // Pre-season window pending (player should play friendlies before round 1)
  preseasonPending: boolean;
  // P5 press conference pending (set after a user match, cleared on the press screen)
  pressPending: boolean;
  // P6 career: rival job offers pending at season-end (resolved before pre-season)
  jobOffersPending: boolean;
  // P6 career: career-wide MANAGER reputation (persists across club switches)
  managerReputation: number;
  // Retirement: IDs aposentados na última virada de temporada
  lastRetiredPlayerIds: number[];
  // IDs com aposentadoria anunciada nesta semana
  pendingAnnouncedRetirementIds: number[];
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
  setHalftime: (ctx: {
    halftime: HalftimeState;
    isHome: boolean;
    opponentName: string;
    bench: PlayerForStrength[];
    tactic: Tactic;
    fixtureId: number;
  } | null) => void;
  setNewSeason: (isNew: boolean) => void;
  setPreseasonPending: (pending: boolean) => void;
  setPressPending: (pending: boolean) => void;
  setJobOffersPending: (pending: boolean) => void;
  setManagerReputation: (rep: number) => void;
  setLastRetiredPlayerIds: (ids: number[]) => void;
  setPendingAnnouncedRetirementIds: (ids: number[]) => void;
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
  halftime: null,
  halftimeIsHome: null,
  halftimeOpponentName: null,
  halftimeBench: [],
  halftimeTactic: null,
  halftimeFixtureId: null,
  isAdvancing: false,
  isNewSeason: false,
  preseasonPending: false,
  pressPending: false,
  jobOffersPending: false,
  managerReputation: 50,
  lastRetiredPlayerIds: [],
  pendingAnnouncedRetirementIds: [],
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
        preseasonPending: false,
        pressPending: false,
        jobOffersPending: false,
        managerReputation: 50,
        createdAt: '',
        updatedAt: '',
      },
      playerClubId: clubId,
      season,
      week,
      managerReputation: 50,
      jobOffersPending: false,
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
      halftime: null,
      halftimeIsHome: null,
      halftimeOpponentName: null,
      halftimeBench: [],
      halftimeTactic: null,
      halftimeFixtureId: null,
      playerClub: null,
      isNewSeason: false,
      preseasonPending: save.preseasonPending,
      pressPending: save.pressPending,
      jobOffersPending: save.jobOffersPending,
      managerReputation: save.managerReputation,
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
  setHalftime: (ctx) =>
    set(ctx
      ? {
          halftime: ctx.halftime,
          halftimeIsHome: ctx.isHome,
          halftimeOpponentName: ctx.opponentName,
          halftimeBench: ctx.bench,
          halftimeTactic: ctx.tactic,
          halftimeFixtureId: ctx.fixtureId,
        }
      : {
          halftime: null,
          halftimeIsHome: null,
          halftimeOpponentName: null,
          halftimeBench: [],
          halftimeTactic: null,
          halftimeFixtureId: null,
        }),
  setNewSeason: (isNew) => set({ isNewSeason: isNew }),
  setPreseasonPending: (pending) => set({ preseasonPending: pending }),
  setPressPending: (pending) => set({ pressPending: pending }),
  setJobOffersPending: (pending) => set({ jobOffersPending: pending }),
  setManagerReputation: (rep) => set({ managerReputation: rep }),
  setLastRetiredPlayerIds: (ids) => set({ lastRetiredPlayerIds: ids }),
  setPendingAnnouncedRetirementIds: (ids) => set({ pendingAnnouncedRetirementIds: ids }),
  setSquad: (squad) => set({ squad }),
  setCompetitions: (competitions) => set({ competitions }),
  setStandings: (standings) => set({ standings }),
  setRecentResults: (results) => set({ recentResults: results }),
  setPlayerClub: (club) => set({ playerClub: club }),
}));
