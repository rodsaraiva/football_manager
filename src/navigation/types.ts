export type RootStackParamList = {
  MainMenu: undefined;
  NewGame: undefined;
  Game: undefined;
  MatchResult: { fixtureId: number };
  MatchHalftime: undefined;
  PressConference: undefined;
  PlayerDetail: { playerId: number };
  EndOfSeason: undefined;
  TeamTalk: undefined;
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
};

export type TabParamList = {
  HomeTab: undefined;
  SquadTab: undefined;
  NewsTab: undefined;
  TacticsTab: undefined;
  ClubTab: undefined;
  ReportsTab: undefined;
};
