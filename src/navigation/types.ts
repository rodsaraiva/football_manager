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
  // Transfer sub-screens
  TransferMarket: undefined;
  OffersSent: undefined;
  OffersReceived: undefined;
  FreeAgents: undefined;
};

export type TabParamList = {
  HomeTab: undefined;
  NewsTab: undefined;
  TacticsTab: undefined;
  ClubTab: undefined;
  LeagueTab: undefined;
};
