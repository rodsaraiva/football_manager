import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { colors } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { SquadListScreen } from '@/screens/squad/SquadListScreen';
import { NewsScreen } from '@/screens/news/NewsScreen';
import { TacticsScreen } from '@/screens/tactics/TacticsScreen';
import { ClubOverviewScreen } from '@/screens/club/ClubOverviewScreen';
import { ReportsHubScreen } from '@/screens/reports/ReportsHubScreen';
import { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

export function TabNavigator() {
  const { accent } = useClubAccent();
  const { t } = useTranslation();
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
        options={{ title: t('nav.tab_matches'), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚽</Text> }}
      />
      <Tab.Screen
        name="SquadTab"
        component={SquadListScreen}
        options={{ title: t('nav.tab_squad'), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👥</Text> }}
      />
      <Tab.Screen
        name="NewsTab"
        component={NewsScreen}
        options={{ title: t('nav.tab_news'), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📰</Text> }}
      />
      <Tab.Screen
        name="TacticsTab"
        component={TacticsScreen}
        options={{ title: t('nav.tab_tactics'), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📋</Text> }}
      />
      <Tab.Screen
        name="ClubTab"
        component={ClubOverviewScreen}
        options={{ title: t('nav.tab_club'), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💰</Text> }}
      />
      <Tab.Screen
        name="ReportsTab"
        component={ReportsHubScreen}
        options={{ title: t('nav.tab_reports'), tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📈</Text> }}
      />
    </Tab.Navigator>
  );
}
