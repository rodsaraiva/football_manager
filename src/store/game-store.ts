import { create } from 'zustand';
import { SaveGame, Club, Player, Fixture, Competition } from '@/types';
import { MatchResult, HalftimeState } from '@/engine/simulation/match-engine';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic } from '@/types/tactic';
import { StandingsEntry } from '@/engine/competition/standings';
import { useBoardStore } from '@/store/board-store';
import { useAssistantStore } from '@/store/assistant-store';
import { countUnread } from '@/database/queries/news';
import { countUnreadThreads, countActionableThreads } from '@/database/queries/inbox';
import type { DbHandle } from '@/database/queries/players';

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
  // W2 career: manager dismissed at season-end, routed to smaller-club rescue offers
  unemployed: boolean;
  // P6 career: career-wide MANAGER reputation (persists across club switches)
  managerReputation: number;
  // P8 onboarding: one-time welcome gate (per save). False = show welcome once.
  onboardingSeen: boolean;
  // P8 achievements: ids unlocked at the last checkpoint, awaiting a toast on Home.
  pendingAchievementToastIds: string[];
  // P9 international duty: count of players called up on the last advance, awaiting a
  // notice on Home (0 = nothing pending). Survives the halftime-resume navigation.
  pendingInternationalCallUpCount: number;
  // Retirement: IDs aposentados na última virada de temporada
  lastRetiredPlayerIds: number[];
  // IDs com aposentadoria anunciada nesta semana
  pendingAnnouncedRetirementIds: number[];
  // W3 news: contador de notícias não-lidas (badge na NewsTab)
  unreadNewsCount: number;
  // C6 inbox: badges. actionable tem prioridade na aba.
  unreadInboxCount: number;
  actionableInboxCount: number;
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
  setUnemployed: (unemployed: boolean) => void;
  setManagerReputation: (rep: number) => void;
  setOnboardingSeen: (seen: boolean) => void;
  setPendingAchievementToastIds: (ids: string[]) => void;
  setPendingInternationalCallUpCount: (count: number) => void;
  setLastRetiredPlayerIds: (ids: number[]) => void;
  setPendingAnnouncedRetirementIds: (ids: number[]) => void;
  setUnreadNewsCount: (n: number) => void;
  refreshUnreadNewsCount: (db: DbHandle) => Promise<void>;
  setInboxCounts: (counts: { unread: number; actionable: number }) => void;
  refreshInboxCounts: (db: DbHandle) => Promise<void>;
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
  unemployed: false,
  managerReputation: 50,
  onboardingSeen: false,
  pendingAchievementToastIds: [],
  pendingInternationalCallUpCount: 0,
  lastRetiredPlayerIds: [],
  pendingAnnouncedRetirementIds: [],
  unreadNewsCount: 0,
  unreadInboxCount: 0,
  actionableInboxCount: 0,
};

export const useGameStore = create<GameStore>((set, get) => ({
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
        unemployed: false,
        managerReputation: 50,
        onboardingSeen: false,
        createdAt: '',
        updatedAt: '',
      },
      playerClubId: clubId,
      season,
      week,
      managerReputation: 50,
      jobOffersPending: false,
      unemployed: false,
      onboardingSeen: false,
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
      unemployed: save.unemployed,
      managerReputation: save.managerReputation,
      onboardingSeen: save.onboardingSeen,
      unreadNewsCount: 0,
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
  setUnemployed: (unemployed) => set({ unemployed }),
  setManagerReputation: (rep) => set({ managerReputation: rep }),
  setOnboardingSeen: (seen) => set({ onboardingSeen: seen }),
  setPendingAchievementToastIds: (ids) => set({ pendingAchievementToastIds: ids }),
  setPendingInternationalCallUpCount: (count) => set({ pendingInternationalCallUpCount: count }),
  setLastRetiredPlayerIds: (ids) => set({ lastRetiredPlayerIds: ids }),
  setPendingAnnouncedRetirementIds: (ids) => set({ pendingAnnouncedRetirementIds: ids }),
  setUnreadNewsCount: (n) => set({ unreadNewsCount: n }),
  refreshUnreadNewsCount: async (db) => {
    const save = get().currentSave;
    if (!save) return;
    const n = await countUnread(db, save.id);
    set({ unreadNewsCount: n });
  },
  setInboxCounts: ({ unread, actionable }) => set({ unreadInboxCount: unread, actionableInboxCount: actionable }),
  refreshInboxCounts: async (db) => {
    const save = get().currentSave;
    if (!save) return;
    const [unread, actionable] = await Promise.all([
      countUnreadThreads(db, save.id),
      countActionableThreads(db, save.id),
    ]);
    set({ unreadInboxCount: unread, actionableInboxCount: actionable });
  },
  setSquad: (squad) => set({ squad }),
  setCompetitions: (competitions) => set({ competitions }),
  setStandings: (standings) => set({ standings }),
  setRecentResults: (results) => set({ recentResults: results }),
  setPlayerClub: (club) => set({ playerClub: club }),
}));
