export type RootStackParamList = {
  MainMenu: undefined;
  NewGame: undefined;
  Game: undefined;
  Settings: undefined;
  MatchResult: { fixtureId: number };
  MatchHalftime: undefined;
  PressConference: undefined;
  PlayerDetail: { playerId: number };
  MoraleBreakdown: { playerId: number };
  EndOfSeason: undefined;
  TeamTalk: undefined;
  SetPieces: undefined;
  GameOver: { reason: string; trust: number; objectiveDescription: string };
  // Club sub-screens
  ClubFinances: undefined;
  ClubStaff: undefined;
  ClubUpgrades: undefined;
  Training: undefined;
  ClubBoard: undefined;
  ClubAssistants: undefined;
  ClubAssistantHiring: { role: import('@/types/assistant').AssistantRole };
  // Transfer sub-screens
  TransferMarket: undefined;
  OffersSent: undefined;
  OffersReceived: undefined;
  FreeAgents: undefined;
  // League standings (reachable from Matches and Reports hub)
  LeagueStandings: undefined;
  // Reports sub-screens
  ReportsTechnical: undefined;
  ReportsFinancial: undefined;
  ReportsAnalytics: undefined;
  ReportsYouth: undefined;
  ReportsRadar: { playerAId?: number };
  ReportsOpponent: undefined;
  ReportsTransferROI: undefined;
  ReportsProjection: undefined;
  ReportsFreeAgentScout: undefined;
  Scouting: undefined;
  // International duty (club-side): squad members at national-team level
  Internationals: undefined;
  // My listings
  MyListings: undefined;
  // History hub
  SeasonHistory: undefined;
  // Orphan screens wired in
  Calendar: undefined;
  YouthAcademy: undefined;
  TopScorers: undefined;
  CupBracket: undefined;
  // Pre-season friendlies window
  PreSeason: undefined;
  // Career: rival job offers at season-end
  JobOffers: undefined;
  // C4 career: manager profile (reputation, contract, savings)
  ManagerProfile: undefined;
  // Career: achievements / milestones
  Achievements: undefined;
  // C1 dynasty/legacy
  HallOfFame: undefined;
  Records: undefined;
  ManagerTimeline: undefined;
  Rivalries: undefined;
};

export type TabParamList = {
  HomeTab: undefined;
  SquadTab: undefined;
  NewsTab: undefined;
  TacticsTab: undefined;
  ClubTab: undefined;
  ReportsTab: undefined;
};
