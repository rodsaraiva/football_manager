import { useEffect } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from '@/navigation/RootNavigator';
import LoadingScreen from '@/components/LoadingScreen';
import { useDatabaseStore } from '@/store/database-store';
import { colors } from '@/theme';

export default function App() {
  const { isReady, initialize } = useDatabaseStore();

  useEffect(() => {
    initialize();
  }, []);

  if (!isReady) {
    return <LoadingScreen message="Initializing..." />;
  }

  return (
    <NavigationContainer theme={{
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.accent,
      },
    }}>
      <RootNavigator />
      <StatusBar style="light" />
    </NavigationContainer>
  );
}
