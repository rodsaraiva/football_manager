import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { colors } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { NewsScreen } from '@/screens/news/NewsScreen';
import { TacticsScreen } from '@/screens/tactics/TacticsScreen';
import { ClubOverviewScreen } from '@/screens/club/ClubOverviewScreen';
import { ReportsHubScreen } from '@/screens/reports/ReportsHubScreen';
import { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  const { accent } = useClubAccent();
  return (
    <Tab.Navigator screenOptions={{
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.text,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      tabBarActiveTintColor: accent,
      tabBarInactiveTintColor: colors.textMuted,
    }}>
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: 'Matches', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚽</Text> }}
      />
      <Tab.Screen
        name="NewsTab"
        component={NewsScreen}
        options={{ title: 'News', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📰</Text> }}
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
        name="ReportsTab"
        component={ReportsHubScreen}
        options={{ title: 'Reports', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📈</Text> }}
      />
    </Tab.Navigator>
  );
}
