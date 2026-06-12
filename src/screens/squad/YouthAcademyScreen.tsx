import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, commonStyles, fontSize, spacing } from '@/theme';
import { useTranslation } from '@/i18n';

export function YouthAcademyScreen() {
  const { t } = useTranslation();
  return (
    <View style={commonStyles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('youth.title')}</Text>
        <Text style={styles.subtitle}>{t('youth.subtitle')}</Text>
      </View>

      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🌱</Text>
        <Text style={styles.emptyText}>{t('youth.empty')}</Text>
        <Text style={styles.emptyHint}>{t('youth.empty_hint')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
