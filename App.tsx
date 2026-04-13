import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from '@/navigation/RootNavigator';
import LoadingScreen from '@/components/LoadingScreen';
import { useDatabaseStore } from '@/store/database-store';
import { colors, fontSize } from '@/theme';

export default function App() {
  const { isReady, error, initialize } = useDatabaseStore();

  useEffect(() => {
    initialize();
  }, []);

  if (error) {
    return (
      <View style={errorStyles.container}>
        <Text style={errorStyles.title}>Database Error</Text>
        <Text style={errorStyles.message}>{error}</Text>
        <Text style={errorStyles.hint}>expo-sqlite may not work on web. Try running on a native device or emulator.</Text>
      </View>
    );
  }

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

const errorStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: colors.danger, fontSize: fontSize.xxl, fontWeight: 'bold', marginBottom: 16 },
  message: { color: colors.text, fontSize: fontSize.md, textAlign: 'center', marginBottom: 16 },
  hint: { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center' },
});
