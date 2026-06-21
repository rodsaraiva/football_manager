/**
 * ROI de Transferências
 *
 * Two-tab view: Signings and Sales — showing the return on transfer investments.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { Card, TabIndicator } from '@/components/kit';
import { Body, Label, Caption } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getTransfersByClub } from '@/database/queries/transfers';
import { getPlayerStatsForPlayer } from '@/database/queries/player-stats';
import { getPlayerById } from '@/database/queries/players';
import {
  buildTransferROIReport,
  TransferROIReport,
  TransferROIEntry,
  PlayerForROI,
} from '@/engine/reports/transfer-roi-report';
import { PlayerStats } from '@/types/player';

type Tab = 'signings' | 'sales';

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

export function ReportsTransferROIScreen() {
  const { t } = useTranslation();
  const { playerClubId, currentSave } = useGameStore();
  const saveId = currentSave?.id;
  const { dbHandle } = useDatabaseStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<TransferROIReport | null>(null);
  const [tab, setTab] = useState<Tab>('signings');

  const load = useCallback(async () => {
    if (!dbHandle || !playerClubId || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const transfers = await getTransfersByClub(dbHandle, saveId, playerClubId);
      if (transfers.length === 0) {
        setReport({ signings: [], sales: [] });
        return;
      }

      // Get unique player ids from transfers
      const playerIds = [...new Set(transfers.map((t) => t.playerId))];

      // Load player data — preferring club players, then individual lookups
      const currentSquad = await getPlayersWithAttributesByClub(dbHandle, saveId, playerClubId);
      const playersById = new Map<number, PlayerForROI>();

      for (const p of currentSquad) {
        playersById.set(p.id, {
          id: p.id,
          name: p.name,
          position: p.position,
          clubId: p.clubId,
          marketValue: p.marketValue,
          attributes: p.attributes,
        });
      }

      // For players not in current squad, do individual lookup
      const missing = playerIds.filter((id) => !playersById.has(id));
      await Promise.all(
        missing.map(async (id) => {
          const full = await getPlayerById(dbHandle, saveId, id);
          if (full) {
            playersById.set(full.id, {
              id: full.id,
              name: full.name,
              position: full.position,
              clubId: full.clubId,
              marketValue: full.marketValue,
              attributes: full.attributes,
            });
          }
        }),
      );

      // Load stats for each unique player
      const statsByPlayerId = new Map<number, PlayerStats[]>();
      await Promise.all(
        playerIds.map(async (id) => {
          const stats = await getPlayerStatsForPlayer(dbHandle, saveId, id);
          statsByPlayerId.set(id, stats);
        }),
      );

      const r = buildTransferROIReport(transfers, playerClubId, playersById, statsByPlayerId);
      setReport(r);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.reportROI} size="large" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Body color={colors.textMuted}>{t('report.roi_no_data')}</Body>
      </View>
    );
  }

  const list = tab === 'signings' ? report.signings : report.sales;

  return (
    <View style={commonStyles.screen}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        <Pressable
          style={styles.tabBtn}
          onPress={() => setTab('signings')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'signings' }}
          accessibilityLabel={t('report.roi_tab_signings', { n: report.signings.length })}
          testID="roi-tab-signings"
        >
          <Label color={tab === 'signings' ? colors.reportROI : colors.textSecondary}>
            {t('report.roi_tab_signings', { n: report.signings.length })}
          </Label>
          <TabIndicator active={tab === 'signings'} accent={colors.reportROI} />
        </Pressable>
        <Pressable
          style={styles.tabBtn}
          onPress={() => setTab('sales')}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'sales' }}
          accessibilityLabel={t('report.roi_tab_sales', { n: report.sales.length })}
          testID="roi-tab-sales"
        >
          <Label color={tab === 'sales' ? colors.reportROI : colors.textSecondary}>
            {t('report.roi_tab_sales', { n: report.sales.length })}
          </Label>
          <TabIndicator active={tab === 'sales'} accent={colors.reportROI} />
        </Pressable>
      </View>

      {list.length === 0 ? (
        <View style={styles.center}>
          <Body color={colors.textMuted}>
            {tab === 'signings' ? t('report.roi_empty_signings') : t('report.roi_empty_sales')}
          </Body>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => `${item.transfer.id}`}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.reportROI} />
          }
          renderItem={({ item }) => <ROICard entry={item} tab={tab} />}
        />
      )}
    </View>
  );
}

function ROICard({ entry, tab }: { entry: TransferROIEntry; tab: Tab }) {
  const { t } = useTranslation();
  const deltaColor =
    !entry.stillAtClub ? colors.textMuted
    : entry.valueDelta >= 0 ? colors.success
    : colors.danger;

  return (
    <Card variant="summary" style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Body style={styles.playerName}>{entry.playerName}</Body>
          <Caption color={colors.textSecondary}>
            {entry.position} · {t('report.roi_season', { season: entry.season })}
            {entry.isLoan ? ` · ${t('report.roi_loan')}` : ''}
            {!entry.stillAtClub && tab === 'signings' ? ` · ${t('report.roi_left_club')}` : ''}
          </Caption>
        </View>
        <View style={styles.ovrBadge}>
          <Label color={colors.primary}>OVR {entry.currentOverall}</Label>
        </View>
      </View>

      <View style={styles.statsRow}>
        {tab === 'signings' ? (
          <>
            <StatCell
              label={t('report.roi_cost')}
              value={entry.feePaid === 0 ? 'Free' : formatCurrency(entry.feePaid)}
              color={colors.textSecondary}
            />
            <StatCell
              label={t('report.roi_current_value')}
              value={entry.stillAtClub ? formatCurrency(entry.currentMarketValue) : 'N/A'}
              color={colors.textSecondary}
            />
            {!entry.isLoan && (
              <StatCell
                label="ROI"
                value={
                  entry.stillAtClub
                    ? `${entry.valueDelta >= 0 ? '+' : ''}${formatCurrency(entry.valueDelta)}`
                    : '—'
                }
                color={deltaColor}
              />
            )}
            <StatCell
              label="G+A"
              value={String(entry.goalsAndAssists)}
              color={colors.primary}
            />
          </>
        ) : (
          <>
            <StatCell
              label={t('report.roi_fee_received')}
              value={entry.feePaid === 0 ? 'Free' : formatCurrency(entry.feePaid)}
              color={colors.success}
            />
            <StatCell
              label={t('report.roi_value_approx')}
              value={formatCurrency(entry.currentMarketValue)}
              color={colors.textSecondary}
            />
            <StatCell
              label="G+A"
              value={String(entry.goalsAndAssists)}
              color={colors.primary}
            />
          </>
        )}
      </View>
    </Card>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statCell}>
      <Label color={color} style={styles.statValue}>{value}</Label>
      <Caption color={colors.textMuted} style={styles.statLabel}>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  listContent: { paddingBottom: spacing.xl, paddingTop: spacing.xs },
  card: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardInfo: { flex: 1 },
  playerName: {
    fontWeight: '700',
  },
  ovrBadge: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontWeight: '700',
  },
  statLabel: {
    marginTop: spacing.xxs,
  },
});
