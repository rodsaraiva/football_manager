import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { MainMenuScreen } from '@/screens/MainMenuScreen';
import { NewGameScreen } from '@/screens/NewGameScreen';
import { EndOfSeasonScreen } from '@/screens/EndOfSeasonScreen';
import { FinancesScreen } from '@/screens/club/FinancesScreen';
import { StaffScreen } from '@/screens/club/StaffScreen';
import { UpgradesScreen } from '@/screens/club/UpgradesScreen';
import { TransferMarketScreen } from '@/screens/club/transfers/TransferMarketScreen';
import { OffersSentScreen } from '@/screens/club/transfers/OffersSentScreen';
import { OffersReceivedScreen } from '@/screens/club/transfers/OffersReceivedScreen';
import { FreeAgentsScreen } from '@/screens/club/transfers/FreeAgentsScreen';
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
      {/* Transfer sub-screens */}
      <Stack.Screen name="TransferMarket" component={TransferMarketScreen} options={{ title: 'Transfer Market' }} />
      <Stack.Screen name="OffersSent" component={OffersSentScreen} options={{ title: 'Offers Sent' }} />
      <Stack.Screen name="OffersReceived" component={OffersReceivedScreen} options={{ title: 'Offers Received' }} />
      <Stack.Screen name="FreeAgents" component={FreeAgentsScreen} options={{ title: 'Free Agents' }} />
    </Stack.Navigator>
  );
}
