import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { MainMenuScreen } from '@/screens/MainMenuScreen';
import { NewGameScreen } from '@/screens/NewGameScreen';
import { EndOfSeasonScreen } from '@/screens/EndOfSeasonScreen';
import { FinancesScreen } from '@/screens/club/FinancesScreen';
import { StaffScreen } from '@/screens/club/StaffScreen';
import { UpgradesScreen } from '@/screens/club/UpgradesScreen';
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
import { HistoryScreen } from '@/screens/history/HistoryScreen';
import { TabNavigator } from './TabNavigator';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.text,
      contentStyle: { backgroundColor: colors.background },
    }}>
      <Stack.Screen name="MainMenu" component={MainMenuScreen} options={{ headerShown: false }} />
      <Stack.Screen name="NewGame" component={NewGameScreen} options={{ title: 'New Game' }} />
      <Stack.Screen name="Game" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="EndOfSeason"
        component={EndOfSeasonScreen}
        options={{ title: 'End of Season', headerShown: false }}
      />
      {/* Club sub-screens */}
      <Stack.Screen name="ClubFinances" component={FinancesScreen} options={{ title: 'Finances' }} />
      <Stack.Screen name="ClubStaff" component={StaffScreen} options={{ title: 'Staff' }} />
      <Stack.Screen name="ClubUpgrades" component={UpgradesScreen} options={{ title: 'Upgrades' }} />
      <Stack.Screen name="ClubBoard" component={BoardScreen} options={{ title: 'Board' }} />
      <Stack.Screen name="ClubAssistants" component={AssistantsScreen} options={{ title: 'Assistants' }} />
      <Stack.Screen name="ClubAssistantHiring" component={AssistantHiringScreen} options={{ title: 'Hire Assistant' }} />
      {/* Transfer sub-screens */}
      <Stack.Screen name="TransferMarket" component={TransferMarketScreen} options={{ title: 'Transfer Market' }} />
      <Stack.Screen name="OffersSent" component={OffersSentScreen} options={{ title: 'Offers Sent' }} />
      <Stack.Screen name="OffersReceived" component={OffersReceivedScreen} options={{ title: 'Offers Received' }} />
      <Stack.Screen name="FreeAgents" component={FreeAgentsScreen} options={{ title: 'Free Agents' }} />
      <Stack.Screen name="MyListings" component={MyListingsScreen} options={{ title: 'Listagens' }} />
      {/* League table as a pushable screen */}
      <Stack.Screen name="LeagueStandings" component={StandingsScreen} options={{ title: 'League Table' }} />
      {/* Reports sub-screens */}
      <Stack.Screen name="ReportsTechnical" component={ReportsTechnicalScreen} options={{ title: 'Assistente Técnico' }} />
      <Stack.Screen name="ReportsFinancial" component={ReportsFinancialScreen} options={{ title: 'Assistente Financeiro' }} />
      <Stack.Screen name="ReportsAnalytics" component={ReportsAnalyticsScreen} options={{ title: 'Analista de Dados' }} />
      <Stack.Screen name="ReportsYouth" component={ReportsYouthScreen} options={{ title: 'Analista Sub-21' }} />
      <Stack.Screen name="ReportsRadar" component={ReportsRadarScreen} options={{ title: 'Radar de Atributos' }} />
      <Stack.Screen name="ReportsOpponent" component={ReportsOpponentScreen} options={{ title: 'Próximo Adversário' }} />
      <Stack.Screen name="ReportsTransferROI" component={ReportsTransferROIScreen} options={{ title: 'ROI de Transferências' }} />
      <Stack.Screen name="ReportsProjection" component={ReportsProjectionScreen} options={{ title: 'Projeção de Classificação' }} />
      <Stack.Screen name="ReportsFreeAgentScout" component={ReportsFreeAgentScoutScreen} options={{ title: 'Scouting de Free Agents' }} />
      {/* History hub */}
      <Stack.Screen name="SeasonHistory" component={HistoryScreen} options={{ title: 'History' }} />
    </Stack.Navigator>
  );
}
