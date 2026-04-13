import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { colors } from '@/theme';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { SquadListScreen } from '@/screens/squad/SquadListScreen';
import { TacticsScreen } from '@/screens/tactics/TacticsScreen';
import { ClubOverviewScreen } from '@/screens/club/ClubOverviewScreen';
import { StandingsScreen } from '@/screens/league/StandingsScreen';
import { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.text,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
    }}>
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: 'Matches', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚽</Text> }}
      />
      <Tab.Screen
        name="SquadTab"
        component={SquadListScreen}
        options={{ title: 'Squad', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👥</Text> }}
      />
      <Tab.Screen
        name="TacticsTab"
        component={TacticsScreen}
        options={{ title: 'Tactics', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📋</Text> }}
      />
      <Tab.Screen
        name="ClubTab"
        component={ClubOverviewScreen}
        options={{ title: 'Club', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💰</Text> }}
      />
      <Tab.Screen
        name="LeagueTab"
        component={StandingsScreen}
        options={{ title: 'League', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏆</Text> }}
      />
    </Tab.Navigator>
  );
}
