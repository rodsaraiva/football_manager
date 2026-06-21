import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useTranslation } from '@/i18n';
import { RootStackParamList } from '@/navigation/types';
import { Card, Button } from '@/components/kit';
import { Title, Body, Label, Stat } from '@/components/typography';

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
      <Card variant="hero" style={styles.card}>
        <Title color={colors.danger} style={styles.center}>{t('gameover.title')}</Title>
        <Body color={colors.textSecondary} style={styles.center}>{t('gameover.dismissed')}</Body>

        <View style={styles.divider} />
        <Label>{t('gameover.reason_label')}</Label>
        <Body>{reason}</Body>

        <View style={styles.divider} />
        <Label>{t('gameover.objective_label')}</Label>
        <Body>{objectiveDescription}</Body>

        <View style={styles.divider} />
        <Label>{t('gameover.final_trust')}</Label>
        <Stat color={colors.danger}>{trust}</Stat>
      </Card>

      <Button
        label={t('gameover.back_to_menu')}
        variant="primary"
        onPress={handleBackToMenu}
        testID="gameover-back-to-menu"
        accessibilityLabel={t('gameover.back_to_menu')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.xl },
  card: { width: '100%', borderColor: colors.danger, gap: spacing.xs },
  center: { textAlign: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
});
