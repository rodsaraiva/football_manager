import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useTranslation } from '@/i18n';
import { RootStackParamList } from '@/navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'GameOver'>;
type GameOverRoute = RouteProp<RootStackParamList, 'GameOver'>;

export function GameOverScreen() {
  const navigation = useNavigation<NavProp>();
  const { reason, trust, objectiveDescription } = useRoute<GameOverRoute>().params;
  const clearGame = useGameStore((s) => s.clearGame);
  const { t } = useTranslation();

  function handleBackToMenu() {
    clearGame();
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'MainMenu' }] }),
    );
  }

  return (
    <View style={[commonStyles.screen, styles.container]}>
      <View style={styles.card}>
        <Text style={styles.heading}>{t('gameover.title')}</Text>
        <Text style={styles.subtitle}>{t('gameover.dismissed')}</Text>

        <View style={styles.divider} />
        <Text style={styles.label}>{t('gameover.reason_label')}</Text>
        <Text style={styles.reason}>{reason}</Text>

        <View style={styles.divider} />
        <Text style={styles.label}>{t('gameover.objective_label')}</Text>
        <Text style={styles.reason}>{objectiveDescription}</Text>

        <View style={styles.divider} />
        <Text style={styles.label}>{t('gameover.final_trust')}</Text>
        <Text style={styles.trust}>{trust}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleBackToMenu} activeOpacity={0.8}>
        <Text style={styles.buttonText}>{t('gameover.back_to_menu')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: colors.surface, borderRadius: 12, padding: spacing.xl,
    width: '100%', borderWidth: 1, borderColor: colors.danger, marginBottom: spacing.xl,
  },
  heading: {
    color: colors.danger, fontSize: fontSize.title, fontWeight: 'bold',
    textAlign: 'center', marginBottom: spacing.xs,
  },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  label: {
    color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.xs,
  },
  reason: { color: colors.text, fontSize: fontSize.md },
  trust: { color: colors.danger, fontSize: fontSize.xxl, fontWeight: 'bold' },
  button: {
    backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16,
    paddingHorizontal: spacing.xl, alignItems: 'center', width: '100%',
  },
  buttonText: { color: colors.text, fontSize: fontSize.lg, fontWeight: 'bold', letterSpacing: 1 },
});
