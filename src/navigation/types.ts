export type RootStackParamList = {
  MainMenu: undefined;
  NewGame: undefined;
  Game: undefined;
  MatchResult: { fixtureId: number };
  PlayerDetail: { playerId: number };
  EndOfSeason: undefined;
};

export type TabParamList = {
  HomeTab: undefined;
  SquadTab: undefined;
  TacticsTab: undefined;
  ClubTab: undefined;
  LeagueTab: undefined;
};
