import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubById } from '@/database/queries/clubs';
import { DbHandle } from '@/database/queries/players';
import { calculateUpgradeCost, FacilityType } from '@/engine/finance/finance-engine';
import { applyUpgrade } from '@/engine/finance/upgrades';
import { Club } from '@/types';

const MAX_LEVEL = 5;

function formatCost(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

interface FacilityConfig {
  type: FacilityType;
  labelKey: TKey;
  icon: string;
  descKey: TKey;
  currentLevel: number;
}

function LevelBar({ current, max = MAX_LEVEL }: { current: number; max?: number }) {
  return (
    <View style={styles.levelBarRow}>
      {Array.from({ length: max }).map((_, i) => (
        <View
          key={i}
          style={[styles.levelSegment, i < current ? styles.levelSegmentFilled : styles.levelSegmentEmpty]}
        />
      ))}
    </View>
  );
}

interface UpgradeCardProps {
  config: FacilityConfig;
  budget: number;
  clubId: number;
  saveId: number;
  season: number;
  week: number;
  dbHandle: DbHandle;
  onUpgradeComplete: () => void;
}

function UpgradeCard({ config, budget, clubId, saveId, season, week, dbHandle, onUpgradeComplete }: UpgradeCardProps) {
  const { t } = useTranslation();
  const isMaxed = config.currentLevel >= MAX_LEVEL;
  const upgradeCost = isMaxed ? null : calculateUpgradeCost(config.type, config.currentLevel);
  const canAfford = !isMaxed && upgradeCost != null && budget >= upgradeCost.cost;

  async function handleUpgrade() {
    if (isMaxed || !upgradeCost) return;
    if (budget < upgradeCost.cost) {
      Alert.alert(t('upgrades.insufficient_budget'), t('upgrades.insufficient_budget_msg', { cost: formatCost(upgradeCost.cost), facility: t(config.labelKey) }));
      return;
    }
    const result = await applyUpgrade(dbHandle, saveId, clubId, config.type, config.currentLevel, season, week);
    if (!result.success) {
      Alert.alert(t('upgrades.failed'), result.reason ?? t('transfer.unknown_error'));
      return;
    }
    onUpgradeComplete();
    Alert.alert(
      t('upgrades.complete'),
      t('upgrades.complete_msg', { facility: t(config.labelKey), level: result.newLevel ?? 0, cost: formatCost(result.cost ?? 0) }),
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{config.icon}</Text>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{t(config.labelKey)}</Text>
          <Text style={styles.cardDesc}>{t(config.descKey)}</Text>
        </View>
      </View>

      <View style={styles.levelRow}>
        <Text style={styles.levelLabel}>{t('upgrades.level', { current: config.currentLevel, max: MAX_LEVEL })}</Text>
        <LevelBar current={config.currentLevel} />
      </View>

      {isMaxed ? (
        <View style={styles.maxedBadge}>
          <Text style={styles.maxedText}>{t('upgrades.max_level')}</Text>
        </View>
      ) : (
        <View style={styles.upgradeRow}>
          <View style={styles.costBlock}>
            <Text style={styles.costLabel}>{t('upgrades.cost')}</Text>
            <Text style={styles.costValue}>{upgradeCost ? formatCost(upgradeCost.cost) : '—'}</Text>
          </View>
          <View style={styles.costBlock}>
            <Text style={styles.costLabel}>{t('upgrades.duration')}</Text>
            <Text style={styles.costValue}>{upgradeCost ? t('upgrades.weeks', { n: upgradeCost.weeks }) : '—'}</Text>
          </View>
          <TouchableOpacity
            style={[styles.upgradeButton, !canAfford && styles.upgradeButtonDisabled]}
            onPress={handleUpgrade}
            disabled={!canAfford}
            activeOpacity={0.8}
          >
            <Text style={styles.upgradeButtonText}>{t('upgrades.upgrade_btn')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isMaxed && !canAfford && (
        <Text style={styles.insufficientFunds}>{t('upgrades.insufficient_funds')}</Text>
      )}
    </View>
  );
}

export function UpgradesScreen() {
  const { t } = useTranslation();
  const { playerClubId, season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [club, setClub] = useState<Club | null>(null);
  const saveId = currentSave?.id;

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId == null || saveId == null) return;
    const loaded = await getClubById(dbHandle, saveId, playerClubId);
    setClub(loaded);
  }, [dbHandle, playerClubId, saveId]);

  useEffect(() => {
    load();
  }, [load, week]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!club) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.emptyText}>{t('newgame.loading')}</Text>
      </View>
    );
  }

  const facilities: FacilityConfig[] = [
    {
      type: 'stadium',
      labelKey: 'upgrades.fac_stadium',
      icon: '🏟',
      descKey: 'upgrades.fac_stadium_desc',
      currentLevel: Math.min(club.stadiumCapacity > 60000 ? 5 : club.stadiumCapacity > 45000 ? 4 : club.stadiumCapacity > 30000 ? 3 : club.stadiumCapacity > 15000 ? 2 : 1, MAX_LEVEL),
    },
    {
      type: 'training',
      labelKey: 'upgrades.fac_training',
      icon: '⚽',
      descKey: 'upgrades.fac_training_desc',
      currentLevel: Math.min(club.trainingFacilities, MAX_LEVEL),
    },
    {
      type: 'youth',
      labelKey: 'upgrades.fac_youth',
      icon: '🌱',
      descKey: 'upgrades.fac_youth_desc',
      currentLevel: Math.min(club.youthAcademy, MAX_LEVEL),
    },
    {
      type: 'medical',
      labelKey: 'upgrades.fac_medical',
      icon: '🏥',
      descKey: 'upgrades.fac_medical_desc',
      currentLevel: Math.min(club.medicalDepartment, MAX_LEVEL),
    },
  ];

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.budgetBanner}>
        <Text style={styles.budgetLabel}>{t('upgrades.available_budget')}</Text>
        <Text style={[styles.budgetAmount, { color: club.budget >= 0 ? colors.success : colors.danger }]}>
          {club.budget < 0 ? '-' : ''}${Math.abs(club.budget).toLocaleString()}
        </Text>
      </View>

      {facilities.map((fac) => (
        <UpgradeCard
          key={fac.type}
          config={fac}
          budget={club.budget}
          clubId={playerClubId!}
          saveId={saveId!}
          season={season}
          week={week}
          dbHandle={dbHandle!}
          onUpgradeComplete={load}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  budgetBanner: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  budgetLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  budgetAmount: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardIcon: {
    fontSize: 28,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  cardDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  levelLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  levelBarRow: {
    flexDirection: 'row',
    gap: 4,
  },
  levelSegment: {
    width: 28,
    height: 8,
    borderRadius: 4,
  },
  levelSegmentFilled: {
    backgroundColor: colors.primary,
  },
  levelSegmentEmpty: {
    backgroundColor: colors.border,
  },
  upgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  costBlock: {
    flex: 1,
  },
  costLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  costValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  upgradeButtonDisabled: {
    backgroundColor: colors.surfaceLight,
    opacity: 0.6,
  },
  upgradeButtonText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  maxedBadge: {
    backgroundColor: `${colors.gold}22`,
    borderRadius: 6,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${colors.gold}44`,
  },
  maxedText: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  insufficientFunds: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
});
