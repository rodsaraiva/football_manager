import React from 'react';
import { View, ScrollView, Switch, StyleSheet } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { useI18nStore } from '@/store/i18n-store';
import { changeLanguage } from '@/i18n/persistence';
import { useDatabaseStore } from '@/store/database-store';
import {
  useSettingsStore,
  setReduceMotion,
  setHaptics,
  setFontScale,
  setDifficultyDefault,
} from '@/store/settings-store';
import { Difficulty } from '@/types/save';
import { Chip } from '@/components/kit';
import { Label, Body, Caption } from '@/components/typography';

const FONT_SCALES: { value: number; key: 'small' | 'medium' | 'large' }[] = [
  { value: 0.9, key: 'small' },
  { value: 1, key: 'medium' },
  { value: 1.15, key: 'large' },
];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export function SettingsScreen() {
  const { t } = useTranslation();
  const { dbHandle } = useDatabaseStore();
  const { accent } = useClubAccent();
  const language = useI18nStore((s) => s.language);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const haptics = useSettingsStore((s) => s.haptics);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const difficultyDefault = useSettingsStore((s) => s.difficultyDefault);

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.content} testID="settings-screen">
      <Label>{t('settings.language')}</Label>
      <View style={styles.segment}>
        {(['pt', 'en'] as const).map((lng) => (
          <Chip
            key={lng}
            label={lng.toUpperCase()}
            selected={language === lng}
            accent={accent}
            onPress={() => dbHandle && changeLanguage(dbHandle, lng)}
            testID={`settings-language-${lng}`}
            accessibilityLabel={t('settings.language')}
          />
        ))}
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelWrap}>
          <Body>{t('settings.reduce_motion')}</Body>
          <Caption color={colors.textSecondary}>{t('settings.reduce_motion_desc')}</Caption>
        </View>
        <Switch
          testID="settings-reduce-motion"
          accessibilityLabel={t('settings.reduce_motion')}
          value={reduceMotion}
          onValueChange={(v) => {
            if (dbHandle) setReduceMotion(dbHandle, v);
          }}
        />
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelWrap}>
          <Body>{t('settings.haptics')}</Body>
          <Caption color={colors.textSecondary}>{t('settings.haptics_desc')}</Caption>
        </View>
        <Switch
          testID="settings-haptics"
          accessibilityLabel={t('settings.haptics')}
          value={haptics}
          onValueChange={(v) => {
            if (dbHandle) setHaptics(dbHandle, v);
          }}
        />
      </View>

      <Label>{t('settings.font_scale')}</Label>
      <View style={styles.segment}>
        {FONT_SCALES.map(({ value, key }) => (
          <Chip
            key={key}
            label={t(`settings.font_scale_${key}`)}
            selected={fontScale === value}
            accent={accent}
            onPress={() => dbHandle && setFontScale(dbHandle, value)}
            testID={`settings-font-scale-${key}`}
            accessibilityLabel={t(`settings.font_scale_${key}`)}
          />
        ))}
      </View>

      <Label>{t('settings.difficulty')}</Label>
      <Caption color={colors.textSecondary}>{t('settings.difficulty_desc')}</Caption>
      <View style={styles.segment}>
        {DIFFICULTIES.map((d) => (
          <Chip
            key={d}
            label={t(`settings.difficulty_${d}`)}
            selected={difficultyDefault === d}
            accent={accent}
            onPress={() => dbHandle && setDifficultyDefault(dbHandle, d)}
            testID={`settings-difficulty-${d}`}
            accessibilityLabel={t(`settings.difficulty_${d}`)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg },
  segment: { flexDirection: 'row', gap: spacing.sm },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleLabelWrap: { flex: 1 },
});
