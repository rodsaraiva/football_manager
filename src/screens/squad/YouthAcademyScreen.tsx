import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { EmptyState } from '@/components/kit';
import { Title, Body } from '@/components/typography';

export function YouthAcademyScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  return (
    <View style={commonStyles.screen}>
      <View style={styles.header}>
        <Title style={styles.title}>{t('youth.title')}</Title>
        <Body color={colors.textSecondary}>{t('youth.subtitle')}</Body>
      </View>

      <View style={styles.body}>
        <EmptyState
          art="squad"
          title={t('youth.empty')}
          description={t('youth.empty_hint')}
          accent={accent.accent}
        />
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
    marginBottom: spacing.xs,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
});
