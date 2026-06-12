/**
 * ROI de Transferências
 *
 * Two-tab view: Signings and Sales — showing the return on transfer investments.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
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
        <Text style={styles.emptyText}>{t('report.roi_no_data')}</Text>
      </View>
    );
  }

  const list = tab === 'signings' ? report.signings : report.sales;

  return (
    <View style={commonStyles.screen}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabBtn, tab === 'signings' && styles.tabBtnActive]}
          onPress={() => setTab('signings')}
        >
          <Text style={[styles.tabText, tab === 'signings' && styles.tabTextActive]}>
            {t('report.roi_tab_signings', { n: report.signings.length })}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === 'sales' && styles.tabBtnActive]}
          onPress={() => setTab('sales')}
        >
          <Text style={[styles.tabText, tab === 'sales' && styles.tabTextActive]}>
            {t('report.roi_tab_sales', { n: report.sales.length })}
          </Text>
        </Pressable>
      </View>

      {list.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {tab === 'signings' ? t('report.roi_empty_signings') : t('report.roi_empty_sales')}
          </Text>
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
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.playerName}>{entry.playerName}</Text>
          <Text style={styles.playerMeta}>
            {entry.position} · {t('report.roi_season', { season: entry.season })}
            {entry.isLoan ? ` · ${t('report.roi_loan')}` : ''}
            {!entry.stillAtClub && tab === 'signings' ? ` · ${t('report.roi_left_club')}` : ''}
          </Text>
        </View>
        <View style={styles.ovrBadge}>
          <Text style={styles.ovrText}>OVR {entry.currentOverall}</Text>
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
    </View>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
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
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.primary,
  },
  listContent: { paddingBottom: spacing.xl, paddingTop: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardInfo: { flex: 1 },
  playerName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  playerMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  ovrBadge: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ovrText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
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
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
});
