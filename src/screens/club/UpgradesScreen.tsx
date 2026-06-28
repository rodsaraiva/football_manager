import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubById } from '@/database/queries/clubs';
import { DbHandle } from '@/database/queries/players';
import { calculateUpgradeCost, FacilityType } from '@/engine/finance/finance-engine';
import { applyUpgrade } from '@/engine/finance/upgrades';
import { Club } from '@/types';
import { Card, Button, Badge, Icon, useConfirm } from '@/components/kit';
import type { IconName } from '@/components/kit';
import StatBar from '@/components/StatBar';
import { Title, Body, Label, Caption, Stat } from '@/components/typography';

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
  icon: IconName;
  descKey: TKey;
  currentLevel: number;
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
  const confirm = useConfirm();
  const isMaxed = config.currentLevel >= MAX_LEVEL;
  const upgradeCost = isMaxed ? null : calculateUpgradeCost(config.type, config.currentLevel);
  const canAfford = !isMaxed && upgradeCost != null && budget >= upgradeCost.cost;

  async function handleUpgrade() {
    if (isMaxed || !upgradeCost) return;
    if (budget < upgradeCost.cost) {
      await confirm({
        title: t('upgrades.insufficient_budget'),
        message: t('upgrades.insufficient_budget_msg', { cost: formatCost(upgradeCost.cost), facility: t(config.labelKey) }),
        confirmLabel: t('kit.ok'),
        tone: 'danger',
      });
      return;
    }
    const result = await applyUpgrade(dbHandle, saveId, clubId, config.type, config.currentLevel, season, week);
    if (!result.success) {
      await confirm({
        title: t('upgrades.failed'),
        message: result.reason ?? t('transfer.unknown_error'),
        confirmLabel: t('kit.ok'),
        tone: 'danger',
      });
      return;
    }
    onUpgradeComplete();
    await confirm({
      title: t('upgrades.complete'),
      message: t('upgrades.complete_msg', { facility: t(config.labelKey), level: result.newLevel ?? 0, cost: formatCost(result.cost ?? 0) }),
      confirmLabel: t('kit.ok'),
    });
  }

  return (
    <Card variant="detail" style={styles.card}>
      <View style={styles.cardHeader}>
        <Icon name={config.icon} color={colors.primary} size={28} />
        <View style={styles.cardHeaderText}>
          <Title>{t(config.labelKey)}</Title>
          <Caption color={colors.textSecondary}>{t(config.descKey)}</Caption>
        </View>
      </View>

      <View style={styles.levelRow}>
        <Body color={colors.textSecondary}>{t('upgrades.level', { current: config.currentLevel, max: MAX_LEVEL })}</Body>
        <View style={styles.levelBar}>
          <StatBar value={config.currentLevel} maxValue={MAX_LEVEL} color={colors.primary} barOnly />
        </View>
      </View>

      {isMaxed ? (
        <View style={styles.maxedBadge}>
          <Badge value={t('upgrades.max_level')} tone="accent" accent={colors.gold} />
        </View>
      ) : (
        <View style={styles.upgradeRow}>
          <View style={styles.costBlock}>
            <Label>{t('upgrades.cost')}</Label>
            <Stat>{upgradeCost ? formatCost(upgradeCost.cost) : '—'}</Stat>
          </View>
          <View style={styles.costBlock}>
            <Label>{t('upgrades.duration')}</Label>
            <Stat>{upgradeCost ? t('upgrades.weeks', { n: upgradeCost.weeks }) : '—'}</Stat>
          </View>
          <Button
            label={t('upgrades.upgrade_btn')}
            variant="primary"
            disabled={!canAfford}
            onPress={handleUpgrade}
            testID={`upgrade-${config.type}`}
            accessibilityLabel={t('upgrades.upgrade_btn')}
          />
        </View>
      )}

      {!isMaxed && !canAfford && (
        <Caption color={colors.danger} style={styles.insufficientFunds}>{t('upgrades.insufficient_funds')}</Caption>
      )}
    </Card>
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
        <Body color={colors.textMuted}>{t('newgame.loading')}</Body>
      </View>
    );
  }

  const facilities: FacilityConfig[] = [
    {
      type: 'stadium',
      labelKey: 'upgrades.fac_stadium',
      icon: 'shield',
      descKey: 'upgrades.fac_stadium_desc',
      currentLevel: Math.min(club.stadiumCapacity > 60000 ? 5 : club.stadiumCapacity > 45000 ? 4 : club.stadiumCapacity > 30000 ? 3 : club.stadiumCapacity > 15000 ? 2 : 1, MAX_LEVEL),
    },
    {
      type: 'training',
      labelKey: 'upgrades.fac_training',
      icon: 'tactics',
      descKey: 'upgrades.fac_training_desc',
      currentLevel: Math.min(club.trainingFacilities, MAX_LEVEL),
    },
    {
      type: 'youth',
      labelKey: 'upgrades.fac_youth',
      icon: 'squad',
      descKey: 'upgrades.fac_youth_desc',
      currentLevel: Math.min(club.youthAcademy, MAX_LEVEL),
    },
    {
      type: 'medical',
      labelKey: 'upgrades.fac_medical',
      icon: 'injury',
      descKey: 'upgrades.fac_medical_desc',
      currentLevel: Math.min(club.medicalDepartment, MAX_LEVEL),
    },
  ];

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <Card variant="summary" style={styles.budgetBanner}>
        <Label>{t('upgrades.available_budget')}</Label>
        <Stat color={club.budget >= 0 ? colors.success : colors.danger}>
          {club.budget < 0 ? '-' : ''}${Math.abs(club.budget).toLocaleString()}
        </Stat>
      </Card>

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
  budgetBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardHeaderText: {
    flex: 1,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  levelBar: { flex: 1 },
  upgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  costBlock: {
    flex: 1,
  },
  maxedBadge: {
    alignItems: 'center',
  },
  insufficientFunds: {
    textAlign: 'right',
  },
});
