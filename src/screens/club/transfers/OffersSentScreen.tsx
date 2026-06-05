import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import {
  getOffersByOfferingClub,
  updateOfferStatus,
  deleteOffer,
} from '@/database/queries/transfers';
import { getPlayerById } from '@/database/queries/players';
import { getClubById } from '@/database/queries/clubs';
import { acceptCounterOffer } from '@/engine/transfer/offer-processor';
import { TransferOffer, OfferStatus } from '@/types';

interface OfferRow {
  offer: TransferOffer;
  playerName: string;
  playerPosition: string;
  sellingClubName: string;
  marketValue: number;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const STATUS_META: Record<OfferStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: colors.warning, icon: '⏳' },
  accepted: { label: 'Accepted', color: colors.success, icon: '✅' },
  rejected: { label: 'Rejected', color: colors.danger, icon: '❌' },
  countered: { label: 'Counter', color: colors.accent, icon: '💬' },
};

export function OffersSentScreen() {
  const { playerClubId, season, week, currentSave } = useGameStore();
  const saveId = currentSave?.id;
  const { dbHandle } = useDatabaseStore();
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId === null || saveId == null) {
      setLoading(false);
      return;
    }
    const offers = await getOffersByOfferingClub(dbHandle, saveId, playerClubId);
    const hydrated: OfferRow[] = [];
    for (const o of offers) {
      const player = await getPlayerById(dbHandle, saveId, o.playerId);
      const sellingClub = await getClubById(dbHandle, saveId, o.sellingClubId);
      hydrated.push({
        offer: o,
        playerName: player?.name ?? `Player #${o.playerId}`,
        playerPosition: player?.position ?? '—',
        sellingClubName: sellingClub?.shortName ?? `Club #${o.sellingClubId}`,
        marketValue: player?.marketValue ?? 0,
      });
    }
    setRows(hydrated);
    setLoading(false);
  }, [dbHandle, playerClubId, saveId]);

  // Reload whenever the screen is focused (e.g. returning after advancing week)
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleAcceptCounter = useCallback(
    async (row: OfferRow) => {
      if (!dbHandle || saveId == null) return;
      Alert.alert(
        'Accept counter-offer?',
        `${row.sellingClubName} countered with ${formatMoney(row.offer.feeOffered)} for ${row.playerName}. Accept?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Accept',
            onPress: async () => {
              const res = await acceptCounterOffer(dbHandle, saveId, row.offer.id, season, week);
              if (!res.success) {
                Alert.alert('Unable to accept', res.reason ?? 'Unknown error');
              } else {
                Alert.alert('Deal closed', `${row.playerName} has joined your club.`);
              }
              await load();
            },
          },
        ],
      );
    },
    [dbHandle, saveId, season, week, load],
  );

  const handleRejectCounter = useCallback(
    async (row: OfferRow) => {
      if (!dbHandle || saveId == null) return;
      await updateOfferStatus(dbHandle, saveId, row.offer.id, 'rejected', week);
      await load();
    },
    [dbHandle, saveId, week, load],
  );

  const handleDismiss = useCallback(
    async (row: OfferRow) => {
      if (!dbHandle || saveId == null) return;
      await deleteOffer(dbHandle, saveId, row.offer.id);
      await load();
    },
    [dbHandle, load],
  );

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.emptyTitle}>No offers sent</Text>
        <Text style={styles.emptyText}>Submit offers from the Transfer Market.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={commonStyles.screen}
      data={rows}
      keyExtractor={(item) => String(item.offer.id)}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const meta = STATUS_META[item.offer.status];
        const isCountered = item.offer.status === 'countered';
        const isFinal = item.offer.status === 'accepted' || item.offer.status === 'rejected';
        return (
          <View style={[styles.card, { borderLeftColor: meta.color }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Text style={styles.cardTitle}>{item.playerName}</Text>
                <Text style={styles.cardSubtitle}>
                  {item.playerPosition} · from {item.sellingClubName}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: meta.color + '22', borderColor: meta.color }]}>
                <Text style={[styles.statusText, { color: meta.color }]}>{meta.icon} {meta.label}</Text>
              </View>
            </View>

            <View style={styles.row}>
              <Text style={styles.fieldLabel}>
                {isCountered ? 'Counter Fee' : 'Your Fee'}
              </Text>
              <Text style={styles.fieldValue}>{formatMoney(item.offer.feeOffered)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.fieldLabel}>Wage Offered</Text>
              <Text style={styles.fieldValue}>{formatMoney(item.offer.wageOffered)}/wk</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.fieldLabel}>Market Value</Text>
              <Text style={styles.fieldValueMuted}>{formatMoney(item.marketValue)}</Text>
            </View>

            {isCountered && (
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => handleRejectCounter(item)}
                >
                  <Text style={styles.btnSecondaryText}>Walk Away</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => handleAcceptCounter(item)}
                >
                  <Text style={styles.btnPrimaryText}>Accept Counter</Text>
                </Pressable>
              </View>
            )}

            {isFinal && (
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => handleDismiss(item)}
                >
                  <Text style={styles.btnSecondaryText}>Dismiss</Text>
                </Pressable>
              </View>
            )}

            {item.offer.status === 'pending' && (
              <Text style={styles.hint}>The selling club will respond next week.</Text>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  list: {
    padding: spacing.sm,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginVertical: spacing.xs,
    borderLeftWidth: 4,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  fieldValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  fieldValueMuted: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnSecondaryText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
});
