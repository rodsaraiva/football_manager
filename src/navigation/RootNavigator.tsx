import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { MainMenuScreen } from '@/screens/MainMenuScreen';
import { NewGameScreen } from '@/screens/NewGameScreen';
import { EndOfSeasonScreen } from '@/screens/EndOfSeasonScreen';
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
    </Stack.Navigator>
  );
}
