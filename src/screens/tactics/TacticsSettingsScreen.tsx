import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getActiveTactic, updateTactic } from '@/database/queries/tactics';
import {
  Mentality,
  Pressing,
  PassingStyle,
  Tempo,
  Width,
  AttackFocus,
  SubstitutionStrategy,
  Tactic,
} from '@/types';

interface SettingRowProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onSelect: (value: T) => void;
  labelFor?: (v: T) => string;
}

function SettingRow<T extends string>({
  label,
  options,
  value,
  onSelect,
  labelFor,
}: SettingRowProps<T>) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.optionGroup}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.optionButton, value === opt && styles.optionButtonActive]}
            onPress={() => onSelect(opt)}
          >
            <Text
              style={[
                styles.optionButtonText,
                value === opt && styles.optionButtonTextActive,
              ]}
            >
              {labelFor ? labelFor(opt) : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const MENTALITY_OPTIONS: Mentality[] = ['defensive', 'balanced', 'attacking'];
const PRESSING_OPTIONS: Pressing[] = ['low', 'medium', 'high'];
const PASSING_OPTIONS: PassingStyle[] = ['short', 'mixed', 'direct'];
const TEMPO_OPTIONS: Tempo[] = ['slow', 'normal', 'fast'];
const WIDTH_OPTIONS: Width[] = ['narrow', 'normal', 'wide'];
const ATTACK_FOCUS_OPTIONS: AttackFocus[] = [
  'balanced',
  'through_middle',
  'down_the_flanks',
  'counter_attack',
  'possession',
];
const SUB_STRATEGY_OPTIONS: SubstitutionStrategy[] = [
  'balanced',
  'minimal',
  'heavy_rotation',
  'youth_chances',
  'chase_the_game',
];

export function TacticsSettingsScreen() {
  const { t } = useTranslation();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const currentSave = useGameStore((s) => s.currentSave);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const saveId = currentSave?.id;

  const [tactic, setTactic] = useState<Tactic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mentality, setMentality] = useState<Mentality>('balanced');
  const [pressing, setPressing] = useState<Pressing>('medium');
  const [passingStyle, setPassingStyle] = useState<PassingStyle>('mixed');
  const [tempo, setTempo] = useState<Tempo>('normal');
  const [width, setWidth] = useState<Width>('normal');
  const [attackFocus, setAttackFocus] = useState<AttackFocus>('balanced');
  const [subStrategy, setSubStrategy] = useState<SubstitutionStrategy>('balanced');

  useEffect(() => {
    if (!dbHandle || playerClubId === null || saveId == null) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const activeTactic = await getActiveTactic(dbHandle, saveId, playerClubId);
        if (activeTactic) {
          setTactic(activeTactic);
          setMentality(activeTactic.mentality);
          setPressing(activeTactic.pressing);
          setPassingStyle(activeTactic.passingStyle);
          setTempo(activeTactic.tempo);
          setWidth(activeTactic.width);
          setAttackFocus(activeTactic.attackFocus);
          setSubStrategy(activeTactic.subStrategy);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [dbHandle, playerClubId]);

  const handleSave = useCallback(async () => {
    if (!dbHandle || !tactic || saveId == null) {
      Alert.alert(t('transfer.error'), t('tactics.no_active'));
      return;
    }
    setSaving(true);
    try {
      await updateTactic(dbHandle, saveId, tactic.id, {
        mentality,
        pressing,
        passingStyle,
        tempo,
        width,
        attackFocus,
        subStrategy,
      });
      Alert.alert(t('tactics.saved'), t('tactics.saved_msg'));
    } catch {
      Alert.alert(t('transfer.error'), t('tactics.save_failed'));
    } finally {
      setSaving(false);
    }
  }, [dbHandle, saveId, tactic, mentality, pressing, passingStyle, tempo, width, attackFocus, subStrategy]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <SettingRow
          label={t('tactics.label_mentality')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={MENTALITY_OPTIONS}
          value={mentality}
          onSelect={setMentality}
        />
        <View style={styles.divider} />
        <SettingRow
          label={t('tactics.label_pressing')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={PRESSING_OPTIONS}
          value={pressing}
          onSelect={setPressing}
        />
        <View style={styles.divider} />
        <SettingRow
          label={t('tactics.label_passing')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={PASSING_OPTIONS}
          value={passingStyle}
          onSelect={setPassingStyle}
        />
        <View style={styles.divider} />
        <SettingRow
          label={t('tactics.label_tempo')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={TEMPO_OPTIONS}
          value={tempo}
          onSelect={setTempo}
        />
        <View style={styles.divider} />
        <SettingRow
          label={t('tactics.label_width')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={WIDTH_OPTIONS}
          value={width}
          onSelect={setWidth}
        />
        <View style={styles.divider} />
        <SettingRow
          label={t('tactics.attack_focus_label')}
          options={ATTACK_FOCUS_OPTIONS}
          value={attackFocus}
          onSelect={setAttackFocus}
          labelFor={(o) => t(`tactics.attack_focus_${o}` as TKey)}
        />
        <View style={styles.divider} />
        <SettingRow
          label={t('tactics.substitutions_label')}
          options={SUB_STRATEGY_OPTIONS}
          value={subStrategy}
          onSelect={setSubStrategy}
          labelFor={(o) => t(`tactics.sub_strategy_${o}` as TKey)}
        />
      </View>

      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? t('tactics.saving') : t('tactics.save_settings')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    padding: spacing.md,
  },
  settingRow: {
    paddingVertical: spacing.sm,
  },
  settingLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  optionGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  optionButtonTextActive: {
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xxs,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
