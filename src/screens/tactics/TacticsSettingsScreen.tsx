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
import { colors, commonStyles, fontSize, spacing } from '@/theme';
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

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TacticsSettingsScreen() {
  const playerClubId = useGameStore((s) => s.playerClubId);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);

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
    if (!dbHandle || playerClubId === null) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const activeTactic = await getActiveTactic(dbHandle, playerClubId);
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
    if (!dbHandle || !tactic) {
      Alert.alert('Error', 'No active tactic found.');
      return;
    }
    setSaving(true);
    try {
      await updateTactic(dbHandle, tactic.id, {
        mentality,
        pressing,
        passingStyle,
        tempo,
        width,
        attackFocus,
        subStrategy,
      });
      Alert.alert('Saved', 'Tactic settings saved successfully!');
    } catch {
      Alert.alert('Error', 'Failed to save tactic settings.');
    } finally {
      setSaving(false);
    }
  }, [dbHandle, tactic, mentality, pressing, passingStyle, tempo, width, attackFocus, subStrategy]);

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
          label="Mentality"
          options={MENTALITY_OPTIONS}
          value={mentality}
          onSelect={setMentality}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Pressing"
          options={PRESSING_OPTIONS}
          value={pressing}
          onSelect={setPressing}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Passing"
          options={PASSING_OPTIONS}
          value={passingStyle}
          onSelect={setPassingStyle}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Tempo"
          options={TEMPO_OPTIONS}
          value={tempo}
          onSelect={setTempo}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Width"
          options={WIDTH_OPTIONS}
          value={width}
          onSelect={setWidth}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Attack Focus"
          options={ATTACK_FOCUS_OPTIONS}
          value={attackFocus}
          onSelect={setAttackFocus}
          labelFor={humanize}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Substitutions"
          options={SUB_STRATEGY_OPTIONS}
          value={subStrategy}
          onSelect={setSubStrategy}
          labelFor={humanize}
        />
      </View>

      <Pressable
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Settings'}</Text>
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
    borderRadius: 12,
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
    paddingVertical: 8,
    borderRadius: 8,
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
    marginVertical: 2,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
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
