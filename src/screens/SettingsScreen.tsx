import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
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

const FONT_SCALES: { value: number; key: 'small' | 'medium' | 'large' }[] = [
  { value: 0.9, key: 'small' },
  { value: 1, key: 'medium' },
  { value: 1.15, key: 'large' },
];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export function SettingsScreen() {
  const { t } = useTranslation();
  const { dbHandle } = useDatabaseStore();
  const language = useI18nStore((s) => s.language);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const haptics = useSettingsStore((s) => s.haptics);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const difficultyDefault = useSettingsStore((s) => s.difficultyDefault);

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.content} testID="settings-screen">
      {/* Idioma */}
      <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
      <View style={styles.segment}>
        {(['pt', 'en'] as const).map((lng) => (
          <TouchableOpacity
            key={lng}
            testID={`settings-language-${lng}`}
            accessibilityRole="button"
            accessibilityLabel={t('settings.language')}
            accessibilityState={{ selected: language === lng }}
            style={[styles.segmentItem, language === lng && styles.segmentItemActive]}
            onPress={() => dbHandle && changeLanguage(dbHandle, lng)}
          >
            <Text style={[styles.segmentText, language === lng && styles.segmentTextActive]}>
              {lng.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reduce motion */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelWrap}>
          <Text style={styles.rowLabel}>{t('settings.reduce_motion')}</Text>
          <Text style={styles.rowDesc}>{t('settings.reduce_motion_desc')}</Text>
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

      {/* Haptics */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabelWrap}>
          <Text style={styles.rowLabel}>{t('settings.haptics')}</Text>
          <Text style={styles.rowDesc}>{t('settings.haptics_desc')}</Text>
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

      {/* Font scale */}
      <Text style={styles.sectionLabel}>{t('settings.font_scale')}</Text>
      <View style={styles.segment}>
        {FONT_SCALES.map(({ value, key }) => (
          <TouchableOpacity
            key={key}
            testID={`settings-font-scale-${key}`}
            accessibilityRole="button"
            accessibilityLabel={t(`settings.font_scale_${key}`)}
            accessibilityState={{ selected: fontScale === value }}
            style={[styles.segmentItem, fontScale === value && styles.segmentItemActive]}
            onPress={() => dbHandle && setFontScale(dbHandle, value)}
          >
            <Text style={[styles.segmentText, fontScale === value && styles.segmentTextActive]}>
              {t(`settings.font_scale_${key}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Difficulty default */}
      <Text style={styles.sectionLabel}>{t('settings.difficulty')}</Text>
      <Text style={styles.rowDesc}>{t('settings.difficulty_desc')}</Text>
      <View style={styles.segment}>
        {DIFFICULTIES.map((d) => (
          <TouchableOpacity
            key={d}
            testID={`settings-difficulty-${d}`}
            accessibilityRole="button"
            accessibilityLabel={t(`settings.difficulty_${d}`)}
            accessibilityState={{ selected: difficultyDefault === d }}
            style={[styles.segmentItem, difficultyDefault === d && styles.segmentItemActive]}
            onPress={() => dbHandle && setDifficultyDefault(dbHandle, d)}
          >
            <Text style={[styles.segmentText, difficultyDefault === d && styles.segmentTextActive]}>
              {t(`settings.difficulty_${d}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  segmentItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  segmentTextActive: { color: colors.text },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleLabelWrap: { flex: 1 },
  rowLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowDesc: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
});
