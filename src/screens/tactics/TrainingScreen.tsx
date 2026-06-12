import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, commonStyles, fontSize, spacing, radius } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { TrainingFocus } from '@/engine/training/progression';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { useTrainingStore, setTrainingFocus, loadTrainingFocus } from '@/store/training-store';

interface TrainingCard {
  focus: TrainingFocus;
  icon: string;
  labelKey: TKey;
  descKey: TKey;
}

const TRAINING_CARDS: TrainingCard[] = [
  { focus: 'technical', icon: '⚽', labelKey: 'training.focus_technical', descKey: 'training.desc_technical' },
  { focus: 'tactical', icon: '🧠', labelKey: 'training.focus_tactical', descKey: 'training.desc_tactical' },
  { focus: 'physical', icon: '💪', labelKey: 'training.focus_physical', descKey: 'training.desc_physical' },
  { focus: 'balanced', icon: '⚖️', labelKey: 'training.focus_balanced', descKey: 'training.desc_balanced' },
];

export function TrainingScreen() {
  const { t } = useTranslation();
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const playerClubId = useGameStore((s) => s.playerClubId);
  const selectedFocus = useTrainingStore((s) => s.focus);

  useEffect(() => {
    if (dbHandle && playerClubId) loadTrainingFocus(dbHandle, playerClubId);
  }, [dbHandle, playerClubId]);

  function handleSelect(focus: TrainingFocus) {
    if (dbHandle && playerClubId) setTrainingFocus(dbHandle, playerClubId, focus);
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.pageTitle}>{t('training.title')}</Text>
      <Text style={styles.pageSubtitle}>{t('training.subtitle')}</Text>

      <View style={styles.grid}>
        {TRAINING_CARDS.map(({ focus, icon, labelKey, descKey }) => {
          const isSelected = selectedFocus === focus;
          return (
            <Pressable
              key={focus}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => handleSelect(focus)}
            >
              <Text style={styles.cardIcon}>{icon}</Text>
              <Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]}>
                {t(labelKey)}
              </Text>
              <Text style={styles.cardDescription}>{t(descKey)}</Text>
              {isSelected && (
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeText}>{t('training.active')}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.md },
  pageTitle: { fontSize: fontSize.xxl, fontWeight: 'bold', color: colors.text, marginBottom: spacing.xs },
  pageSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  grid: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceLight },
  cardIcon: { fontSize: fontSize.xxl, marginBottom: spacing.sm },
  cardTitle: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.text },
  cardTitleSelected: { color: colors.primaryLight },
  cardDescription: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  selectedBadge: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectedBadgeText: { fontSize: fontSize.xs, color: colors.text, fontWeight: 'bold' },
});

export default TrainingScreen;
