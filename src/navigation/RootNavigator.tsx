import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { MainMenuScreen } from '@/screens/MainMenuScreen';
import { NewGameScreen } from '@/screens/NewGameScreen';
import { EndOfSeasonScreen } from '@/screens/EndOfSeasonScreen';
import { GameOverScreen } from '@/screens/GameOverScreen';
import { FinancesScreen } from '@/screens/club/FinancesScreen';
import { StaffScreen } from '@/screens/club/StaffScreen';
import { UpgradesScreen } from '@/screens/club/UpgradesScreen';
import { TrainingScreen } from '@/screens/tactics/TrainingScreen';
import { BoardScreen } from '@/screens/club/BoardScreen';
import { AssistantsScreen } from '@/screens/club/AssistantsScreen';
import { AssistantHiringScreen } from '@/screens/club/AssistantHiringScreen';
import { TransferMarketScreen } from '@/screens/club/transfers/TransferMarketScreen';
import { OffersSentScreen } from '@/screens/club/transfers/OffersSentScreen';
import { OffersReceivedScreen } from '@/screens/club/transfers/OffersReceivedScreen';
import { FreeAgentsScreen } from '@/screens/club/transfers/FreeAgentsScreen';
import { MyListingsScreen } from '@/screens/club/transfers/MyListingsScreen';
import { StandingsScreen } from '@/screens/league/StandingsScreen';
import { ReportsTechnicalScreen } from '@/screens/reports/ReportsTechnicalScreen';
import { ReportsFinancialScreen } from '@/screens/reports/ReportsFinancialScreen';
import { ReportsAnalyticsScreen } from '@/screens/reports/ReportsAnalyticsScreen';
import { ReportsYouthScreen } from '@/screens/reports/ReportsYouthScreen';
import { ReportsRadarScreen } from '@/screens/reports/ReportsRadarScreen';
import { ReportsOpponentScreen } from '@/screens/reports/ReportsOpponentScreen';
import { ReportsTransferROIScreen } from '@/screens/reports/ReportsTransferROIScreen';
import { ReportsProjectionScreen } from '@/screens/reports/ReportsProjectionScreen';
import { ReportsFreeAgentScoutScreen } from '@/screens/reports/ReportsFreeAgentScoutScreen';
import { ScoutingScreen } from '@/screens/reports/ScoutingScreen';
import { HistoryScreen } from '@/screens/history/HistoryScreen';
import { PlayerDetailRoute } from '@/screens/squad/PlayerDetailRoute';
import { TeamTalkScreen } from '@/screens/squad/TeamTalkScreen';
import { MatchResultScreen } from '@/screens/home/MatchResultScreen';
import { MatchHalftimeScreen } from '@/screens/home/MatchHalftimeScreen';
import { CalendarScreen } from '@/screens/home/CalendarScreen';
import { PreSeasonScreen } from '@/screens/home/PreSeasonScreen';
import { YouthAcademyScreen } from '@/screens/squad/YouthAcademyScreen';
import { TopScorersScreen } from '@/screens/league/TopScorersScreen';
import { CupBracketScreen } from '@/screens/league/CupBracketScreen';
import { TabNavigator } from './TabNavigator';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { accent } = useClubAccent();
  const { t } = useTranslation();
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: accent,
      contentStyle: { backgroundColor: colors.background },
    }}>
      <Stack.Screen name="MainMenu" component={MainMenuScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewGame" component={NewGameScreen} options={{ title: t('nav.new_game') }} />
      <Stack.Screen name="Game" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="EndOfSeason"
        component={EndOfSeasonScreen}
        options={{ title: t('nav.end_of_season'), headerShown: false }}
      />
      <Stack.Screen name="GameOver" component={GameOverScreen} options={{ headerShown: false }} />
      {/* Player detail + match result (reachable from reports, squad, results) */}
      <Stack.Screen name="PlayerDetail" component={PlayerDetailRoute} options={{ title: t('nav.player') }} />
      <Stack.Screen name="TeamTalk" component={TeamTalkScreen} options={{ title: t('nav.team_talk') }} />
      <Stack.Screen name="MatchResult" component={MatchResultScreen} options={{ title: t('nav.match_result') }} />
      <Stack.Screen name="MatchHalftime" component={MatchHalftimeScreen} options={{ title: t('nav.halftime') }} />
      {/* Club sub-screens */}
      <Stack.Screen name="ClubFinances" component={FinancesScreen} options={{ title: t('nav.finances') }} />
      <Stack.Screen name="ClubStaff" component={StaffScreen} options={{ title: t('nav.staff') }} />
      <Stack.Screen name="ClubUpgrades" component={UpgradesScreen} options={{ title: t('nav.upgrades') }} />
      <Stack.Screen name="Training" component={TrainingScreen} options={{ title: t('nav.training') }} />
      <Stack.Screen name="ClubBoard" component={BoardScreen} options={{ title: t('nav.board') }} />
      <Stack.Screen name="ClubAssistants" component={AssistantsScreen} options={{ title: t('nav.assistants') }} />
      <Stack.Screen name="ClubAssistantHiring" component={AssistantHiringScreen} options={{ title: t('nav.hire_assistant') }} />
      {/* Transfer sub-screens */}
      <Stack.Screen name="TransferMarket" component={TransferMarketScreen} options={{ title: t('nav.transfer_market') }} />
      <Stack.Screen name="OffersSent" component={OffersSentScreen} options={{ title: t('nav.offers_sent') }} />
      <Stack.Screen name="OffersReceived" component={OffersReceivedScreen} options={{ title: t('nav.offers_received') }} />
      <Stack.Screen name="FreeAgents" component={FreeAgentsScreen} options={{ title: t('nav.free_agents') }} />
      <Stack.Screen name="MyListings" component={MyListingsScreen} options={{ title: t('nav.my_listings') }} />
      {/* League table as a pushable screen */}
      <Stack.Screen name="LeagueStandings" component={StandingsScreen} options={{ title: t('nav.league_table') }} />
      {/* Reports sub-screens */}
      <Stack.Screen name="ReportsTechnical" component={ReportsTechnicalScreen} options={{ title: t('nav.reports_technical') }} />
      <Stack.Screen name="ReportsFinancial" component={ReportsFinancialScreen} options={{ title: t('nav.reports_financial') }} />
      <Stack.Screen name="ReportsAnalytics" component={ReportsAnalyticsScreen} options={{ title: t('nav.reports_analytics') }} />
      <Stack.Screen name="ReportsYouth" component={ReportsYouthScreen} options={{ title: t('nav.reports_youth') }} />
      <Stack.Screen name="ReportsRadar" component={ReportsRadarScreen} options={{ title: t('nav.reports_radar') }} />
      <Stack.Screen name="ReportsOpponent" component={ReportsOpponentScreen} options={{ title: t('nav.reports_opponent') }} />
      <Stack.Screen name="ReportsTransferROI" component={ReportsTransferROIScreen} options={{ title: t('nav.reports_transfer_roi') }} />
      <Stack.Screen name="ReportsProjection" component={ReportsProjectionScreen} options={{ title: t('nav.reports_projection') }} />
      <Stack.Screen name="ReportsFreeAgentScout" component={ReportsFreeAgentScoutScreen} options={{ title: t('nav.reports_free_agent_scout') }} />
      <Stack.Screen name="Scouting" component={ScoutingScreen} options={{ title: t('nav.scouting') }} />
      {/* History hub */}
      <Stack.Screen name="SeasonHistory" component={HistoryScreen} options={{ title: t('nav.history') }} />
      {/* Orphan screens wired in */}
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: t('nav.calendar') }} />
      <Stack.Screen name="PreSeason" component={PreSeasonScreen} options={{ title: t('nav.preseason') }} />
      <Stack.Screen name="YouthAcademy" component={YouthAcademyScreen} options={{ title: t('nav.youth_academy') }} />
      <Stack.Screen name="TopScorers" component={TopScorersScreen} options={{ title: t('nav.top_scorers') }} />
      <Stack.Screen name="CupBracket" component={CupBracketScreen} options={{ title: t('nav.cup_bracket') }} />
    </Stack.Navigator>
  );
}
