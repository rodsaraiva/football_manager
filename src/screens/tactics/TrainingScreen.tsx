import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { TrainingFocus } from '@/engine/training/progression';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { useTrainingStore, setTrainingFocus, loadTrainingFocus } from '@/store/training-store';
import { Card, Badge, Icon } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Display, Title, Body, Label } from '@/components/typography';

interface TrainingCard {
  focus: TrainingFocus;
  icon: IconName;
  labelKey: TKey;
  descKey: TKey;
}

const TRAINING_CARDS: TrainingCard[] = [
  { focus: 'technical', icon: 'goal', labelKey: 'training.focus_technical', descKey: 'training.desc_technical' },
  { focus: 'tactical', icon: 'tactics', labelKey: 'training.focus_tactical', descKey: 'training.desc_tactical' },
  { focus: 'physical', icon: 'target', labelKey: 'training.focus_physical', descKey: 'training.desc_physical' },
  { focus: 'balanced', icon: 'shield', labelKey: 'training.focus_balanced', descKey: 'training.desc_balanced' },
];

export function TrainingScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
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
      <Display style={styles.pageTitle}>{t('training.title')}</Display>
      <Body color={colors.textSecondary} style={styles.pageSubtitle}>{t('training.subtitle')}</Body>

      <View style={styles.grid}>
        {TRAINING_CARDS.map(({ focus, icon, labelKey, descKey }) => {
          const isSelected = selectedFocus === focus;
          return (
            <Pressable
              key={focus}
              onPress={() => handleSelect(focus)}
              testID={`training-focus-${focus}`}
              accessibilityRole="button"
              accessibilityLabel={t(labelKey)}
              accessibilityState={{ selected: isSelected }}
            >
              <Card variant="summary" accent={accent.accent} selected={isSelected}>
                <Icon name={icon} color={isSelected ? accent.accent : colors.textSecondary} size={28} />
                <Title color={isSelected ? accent.accent : colors.text} style={styles.cardTitle}>
                  {t(labelKey)}
                </Title>
                <Body color={colors.textSecondary} style={styles.cardDescription}>{t(descKey)}</Body>
                {isSelected && (
                  <View style={styles.selectedBadge}>
                    <Badge value={t('training.active')} tone="accent" accent={accent.accent} size="sm" />
                  </View>
                )}
              </Card>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.md },
  pageTitle: { marginBottom: spacing.xs },
  pageSubtitle: { marginBottom: spacing.lg },
  grid: { gap: spacing.md },
  cardTitle: { marginTop: spacing.sm },
  cardDescription: { marginTop: spacing.xs },
  selectedBadge: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
});

export default TrainingScreen;
