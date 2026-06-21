import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getActiveTactic, updateTactic } from '@/database/queries/tactics';
import { Card, Chip, Button, useConfirm } from '@/components/kit';
import { Label } from '@/components/typography';
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
  accent: string;
  rowKey: string;
}

function SettingRow<T extends string>({
  label,
  options,
  value,
  onSelect,
  labelFor,
  accent,
  rowKey,
}: SettingRowProps<T>) {
  return (
    <View style={styles.settingRow}>
      <Label color={colors.textMuted} style={styles.settingLabel}>{label}</Label>
      <View style={styles.optionGroup}>
        {options.map((opt) => (
          <Chip
            key={opt}
            label={labelFor ? labelFor(opt) : opt.charAt(0).toUpperCase() + opt.slice(1)}
            selected={value === opt}
            accent={accent}
            onPress={() => onSelect(opt)}
            testID={`tactics-${rowKey}-${opt}`}
          />
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
  const accent = useClubAccent();
  const confirm = useConfirm();
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
      await confirm({ title: t('transfer.error'), message: t('tactics.no_active'), confirmLabel: t('kit.ok'), tone: 'danger' });
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
      await confirm({ title: t('tactics.saved'), message: t('tactics.saved_msg'), confirmLabel: t('kit.ok') });
    } catch {
      await confirm({ title: t('transfer.error'), message: t('tactics.save_failed'), confirmLabel: t('kit.ok'), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  }, [dbHandle, saveId, tactic, mentality, pressing, passingStyle, tempo, width, attackFocus, subStrategy, confirm, t]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.scrollContent}>
      <Card variant="detail" accent={accent.accent} style={styles.card}>
        <SettingRow
          rowKey="mentality"
          label={t('tactics.label_mentality')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={MENTALITY_OPTIONS}
          value={mentality}
          onSelect={setMentality}
          accent={accent.accent}
        />
        <View style={styles.divider} />
        <SettingRow
          rowKey="pressing"
          label={t('tactics.label_pressing')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={PRESSING_OPTIONS}
          value={pressing}
          onSelect={setPressing}
          accent={accent.accent}
        />
        <View style={styles.divider} />
        <SettingRow
          rowKey="passing"
          label={t('tactics.label_passing')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={PASSING_OPTIONS}
          value={passingStyle}
          onSelect={setPassingStyle}
          accent={accent.accent}
        />
        <View style={styles.divider} />
        <SettingRow
          rowKey="tempo"
          label={t('tactics.label_tempo')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={TEMPO_OPTIONS}
          value={tempo}
          onSelect={setTempo}
          accent={accent.accent}
        />
        <View style={styles.divider} />
        <SettingRow
          rowKey="width"
          label={t('tactics.label_width')}
          labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          options={WIDTH_OPTIONS}
          value={width}
          onSelect={setWidth}
          accent={accent.accent}
        />
        <View style={styles.divider} />
        <SettingRow
          rowKey="attackfocus"
          label={t('tactics.attack_focus_label')}
          options={ATTACK_FOCUS_OPTIONS}
          value={attackFocus}
          onSelect={setAttackFocus}
          labelFor={(o) => t(`tactics.attack_focus_${o}` as TKey)}
          accent={accent.accent}
        />
        <View style={styles.divider} />
        <SettingRow
          rowKey="substrategy"
          label={t('tactics.substitutions_label')}
          options={SUB_STRATEGY_OPTIONS}
          value={subStrategy}
          onSelect={setSubStrategy}
          labelFor={(o) => t(`tactics.sub_strategy_${o}` as TKey)}
          accent={accent.accent}
        />
      </Card>

      <View style={styles.saveButton}>
        <Button
          label={saving ? t('tactics.saving') : t('tactics.save_settings')}
          variant="primary"
          loading={saving}
          disabled={saving}
          onPress={handleSave}
          testID="tactics-settings-save"
          accessibilityLabel={t('tactics.save_settings')}
        />
      </View>
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
    marginHorizontal: spacing.md,
  },
  settingRow: {
    paddingVertical: spacing.sm,
  },
  settingLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xxs,
  },
  saveButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
});
