import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { ACHIEVEMENTS } from '@/engine/achievements/achievements-catalog';
import { getUnlockedAchievements, UnlockedAchievement } from '@/database/queries/achievements';

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
        <Text style={styles.headerTitle}>{t('achievements.title')}</Text>
        <Text style={styles.headerSub}>{t('achievements.subtitle')}</Text>
        <Text style={styles.count}>
          {t('achievements.count', { unlocked: unlockedCount, total: ACHIEVEMENTS.length })}
        </Text>
      </View>

      {ACHIEVEMENTS.map((a) => {
        const row = unlocked.get(a.id);
        const isUnlocked = row != null;
        return (
          <View
            key={a.id}
            style={[styles.card, isUnlocked ? styles.cardUnlocked : styles.cardLocked]}
          >
            <Text style={[styles.icon, !isUnlocked && styles.iconLocked]}>
              {isUnlocked ? a.icon : '🔒'}
            </Text>
            <View style={styles.content}>
              <Text style={[styles.title, !isUnlocked && styles.textMuted]}>{t(a.titleKey)}</Text>
              <Text style={[styles.desc, !isUnlocked && styles.textMuted]}>{t(a.descKey)}</Text>
              {isUnlocked ? (
                <Text style={styles.unlockedAt}>
                  {t('achievements.unlocked_at', { season: row.season, week: row.week })}
                </Text>
              ) : (
                <Text style={styles.lockedLabel}>{t('achievements.locked')}</Text>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: 'bold' },
  headerSub: { color: colors.primary, fontSize: fontSize.sm, marginTop: spacing.xxs },
  count: { color: colors.gold, fontSize: fontSize.md, fontWeight: '700', marginTop: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  cardUnlocked: { borderLeftColor: colors.gold },
  cardLocked: { borderLeftColor: colors.border, opacity: 0.7 },
  icon: { fontSize: 28, width: 44, textAlign: 'center', marginRight: spacing.sm },
  iconLocked: { opacity: 0.6 },
  content: { flex: 1 },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  desc: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.xxs, lineHeight: 18 },
  textMuted: { color: colors.textMuted },
  unlockedAt: {
    color: colors.gold,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  lockedLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
});
