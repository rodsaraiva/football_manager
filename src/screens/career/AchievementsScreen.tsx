import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { ACHIEVEMENTS } from '@/engine/achievements/achievements-catalog';
import { getUnlockedAchievements, UnlockedAchievement } from '@/database/queries/achievements';
import { Card, Badge } from '@/components/kit';
import { Headline, Body, Label, Caption, Stat } from '@/components/typography';

export function AchievementsScreen() {
  const { currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const saveId = currentSave?.id;

  const [unlocked, setUnlocked] = useState<Map<string, UnlockedAchievement>>(new Map());

  const load = useCallback(async () => {
    if (!dbHandle || saveId == null) return;
    const rows = await getUnlockedAchievements(dbHandle, saveId);
    setUnlocked(new Map(rows.map((r) => [r.achievementId, r])));
  }, [dbHandle, saveId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const unlockedCount = unlocked.size;

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Headline>{t('achievements.title')}</Headline>
        <Body color={colors.primary}>{t('achievements.subtitle')}</Body>
        <Label color={colors.gold}>
          {t('achievements.count', { unlocked: unlockedCount, total: ACHIEVEMENTS.length })}
        </Label>
      </View>

      {ACHIEVEMENTS.map((a) => {
        const row = unlocked.get(a.id);
        const isUnlocked = row != null;
        return (
          <Card
            key={a.id}
            variant="detail"
            accent={colors.gold}
            selected={isUnlocked}
            style={[styles.card, !isUnlocked && styles.cardLocked]}
            testID={`achievement-${a.id}`}
          >
            <Text style={[styles.icon, !isUnlocked && styles.iconLocked]}>{a.icon}</Text>
            <View style={styles.content}>
              <Body color={isUnlocked ? colors.text : colors.textMuted}>{t(a.titleKey)}</Body>
              <Caption color={isUnlocked ? colors.textSecondary : colors.textMuted}>
                {t(a.descKey)}
              </Caption>
              {isUnlocked ? (
                <Caption color={colors.gold}>
                  {t('achievements.unlocked_at', { season: row.season, week: row.week })}
                </Caption>
              ) : (
                <Badge value={t('achievements.locked')} tone="neutral" size="sm" />
              )}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.sm, gap: spacing.xs },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md },
  cardLocked: { opacity: 0.7 },
  icon: { fontSize: fontSize.xxl, width: 44, textAlign: 'center' },
  iconLocked: { opacity: 0.6 },
  content: { flex: 1, gap: spacing.xxs },
});
