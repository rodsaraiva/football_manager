export type RootStackParamList = {
  MainMenu: undefined;
  NewGame: undefined;
  Game: undefined;
  MatchResult: { fixtureId: number };
  PlayerDetail: { playerId: number };
  EndOfSeason: undefined;
  // Club sub-screens
  ClubFinances: undefined;
  ClubStaff: undefined;
  ClubUpgrades: undefined;
  ClubBoard: undefined;
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
  // My listings
  MyListings: undefined;
  // History hub
  SeasonHistory: undefined;
};

export type TabParamList = {
  HomeTab: undefined;
  NewsTab: undefined;
  TacticsTab: undefined;
  ClubTab: undefined;
  ReportsTab: undefined;
};
