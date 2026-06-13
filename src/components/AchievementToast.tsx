import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius, alpha } from '@/theme';
import { useTranslation } from '@/i18n';
import { AchievementDef } from '@/engine/achievements/achievements-catalog';

interface Props {
  achievements: AchievementDef[];
  onDismiss: () => void;
}

/**
 * Non-blocking banner shown when one or more achievements unlock. Lists each unlocked
 * achievement (icon + title) and is dismissed by tapping anywhere on it.
 */
export function AchievementToast({ achievements, onDismiss }: Props) {
  const { t } = useTranslation();
  if (achievements.length === 0) return null;

  return (
    <TouchableOpacity style={styles.toast} activeOpacity={0.9} onPress={onDismiss}>
      <Text style={styles.title}>{t('achievements.toast_title')}</Text>
      {achievements.map((a) => (
        <View key={a.id} style={styles.row}>
          <Text style={styles.icon}>{a.icon}</Text>
          <Text style={styles.name} numberOfLines={1}>{t(a.titleKey)}</Text>
        </View>
      ))}
      <Text style={styles.dismiss}>{t('achievements.toast_dismiss')}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: alpha(colors.gold, 0.6),
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
  },
  title: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxs,
  },
  icon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
    marginRight: spacing.xs,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  dismiss: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
});
