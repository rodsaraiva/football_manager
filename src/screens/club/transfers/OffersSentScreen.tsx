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
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
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

const STATUS_META: Record<OfferStatus, { labelKey: TKey; color: string; icon: string }> = {
  pending: { labelKey: 'offers.status_pending', color: colors.warning, icon: '⏳' },
  accepted: { labelKey: 'offers.status_accepted', color: colors.success, icon: '✅' },
  rejected: { labelKey: 'offers.status_rejected', color: colors.danger, icon: '❌' },
  countered: { labelKey: 'offers.status_counter', color: colors.accent, icon: '💬' },
};

export function OffersSentScreen() {
  const { t } = useTranslation();
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
        t('offers.accept_counter_title'),
        t('offers.accept_counter_msg', { club: row.sellingClubName, fee: formatMoney(row.offer.feeOffered), player: row.playerName }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('offers.accept'),
            onPress: async () => {
              const res = await acceptCounterOffer(dbHandle, saveId, row.offer.id, season, week);
              if (!res.success) {
                Alert.alert(t('offers.unable_accept'), res.reason ?? t('transfer.unknown_error'));
              } else {
                Alert.alert(t('offers.deal_closed'), t('transfer.signed_msg', { name: row.playerName }));
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
        <Text style={styles.emptyTitle}>{t('offers.none_sent')}</Text>
        <Text style={styles.emptyText}>{t('offers.none_sent_sub')}</Text>
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
                  {t('offers.from_club', { position: item.playerPosition, club: item.sellingClubName })}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: meta.color + '22', borderColor: meta.color }]}>
                <Text style={[styles.statusText, { color: meta.color }]}>{meta.icon} {t(meta.labelKey)}</Text>
              </View>
            </View>

            <View style={styles.row}>
              <Text style={styles.fieldLabel}>
                {isCountered ? t('offers.counter_fee') : t('offers.your_fee')}
              </Text>
              <Text style={styles.fieldValue}>{formatMoney(item.offer.feeOffered)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.fieldLabel}>{t('offers.wage_offered')}</Text>
              <Text style={styles.fieldValue}>{formatMoney(item.offer.wageOffered)}/wk</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.fieldLabel}>{t('transfer.market_value')}</Text>
              <Text style={styles.fieldValueMuted}>{formatMoney(item.marketValue)}</Text>
            </View>

            {isCountered && (
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => handleRejectCounter(item)}
                >
                  <Text style={styles.btnSecondaryText}>{t('offers.walk_away')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => handleAcceptCounter(item)}
                >
                  <Text style={styles.btnPrimaryText}>{t('offers.accept_counter_btn')}</Text>
                </Pressable>
              </View>
            )}

            {isFinal && (
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={() => handleDismiss(item)}
                >
                  <Text style={styles.btnSecondaryText}>{t('offers.dismiss')}</Text>
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
    borderRadius: radius.lg,
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
    marginTop: spacing.xxs,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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
    paddingVertical: spacing.xs,
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
    borderRadius: radius.md,
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
