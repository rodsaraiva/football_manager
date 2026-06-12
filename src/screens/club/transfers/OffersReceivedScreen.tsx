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
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getOffersBySellingClub, deleteOffer } from '@/database/queries/transfers';
import { getPlayerById } from '@/database/queries/players';
import { getClubById } from '@/database/queries/clubs';
import {
  acceptIncomingOffer,
  rejectIncomingOffer,
  counterIncomingOffer,
} from '@/engine/transfer/offer-processor';
import { TransferOffer, OfferStatus } from '@/types';

interface OfferRow {
  offer: TransferOffer;
  playerName: string;
  playerPosition: string;
  playerAge: number;
  playerOverall: number;
  offeringClubName: string;
  marketValue: number;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function parseNumber(input: string): number {
  const cleaned = input.replace(/[^0-9]/g, '');
  return cleaned === '' ? 0 : parseInt(cleaned, 10);
}

const STATUS_META: Record<OfferStatus, { labelKey: TKey; color: string; icon: string }> = {
  pending: { labelKey: 'offers.status_new', color: colors.warning, icon: '📥' },
  accepted: { labelKey: 'offers.status_accepted', color: colors.success, icon: '✅' },
  rejected: { labelKey: 'offers.status_rejected', color: colors.danger, icon: '❌' },
  countered: { labelKey: 'offers.status_awaiting', color: colors.accent, icon: '💬' },
};

export function OffersReceivedScreen() {
  const { t } = useTranslation();
  const { playerClubId, season, week, currentSave } = useGameStore();
  const saveId = currentSave?.id;
  const { dbHandle } = useDatabaseStore();
  const [rows, setRows] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [counterRow, setCounterRow] = useState<OfferRow | null>(null);
  const [counterFeeStr, setCounterFeeStr] = useState('');

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId === null || saveId == null) {
      setLoading(false);
      return;
    }
    const offers = await getOffersBySellingClub(dbHandle, saveId, playerClubId);
    const hydrated: OfferRow[] = [];
    for (const o of offers) {
      const player = await getPlayerById(dbHandle, saveId, o.playerId);
      const suitor = await getClubById(dbHandle, saveId, o.offeringClubId);
      hydrated.push({
        offer: o,
        playerName: player?.name ?? `Player #${o.playerId}`,
        playerPosition: player?.position ?? '—',
        playerAge: player?.age ?? 0,
        playerOverall: 0, // computing overall needs attributes; skip for brevity
        offeringClubName: suitor?.shortName ?? `Club #${o.offeringClubId}`,
        marketValue: player?.marketValue ?? 0,
      });
    }
    setRows(hydrated);
    setLoading(false);
  }, [dbHandle, playerClubId, saveId]);

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

  const handleAccept = useCallback(
    (row: OfferRow) => {
      if (!dbHandle || saveId == null) return;
      Alert.alert(
        t('offers.accept_offer_title'),
        t('offers.accept_offer_msg', { player: row.playerName, club: row.offeringClubName, fee: formatMoney(row.offer.feeOffered) }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('offers.sell'),
            style: 'destructive',
            onPress: async () => {
              const res = await acceptIncomingOffer(dbHandle, saveId, row.offer.id, season, week);
              if (!res.success) {
                Alert.alert(t('transfer.error'), res.reason ?? t('offers.transfer_failed'));
              } else {
                Alert.alert(t('offers.player_sold'), t('offers.player_left', { name: row.playerName }));
              }
              await load();
            },
          },
        ],
      );
    },
    [dbHandle, saveId, season, week, load],
  );

  const handleReject = useCallback(
    async (row: OfferRow) => {
      if (!dbHandle || saveId == null) return;
      await rejectIncomingOffer(dbHandle, saveId, row.offer.id, week);
      await load();
    },
    [dbHandle, saveId, week, load],
  );

  const openCounter = useCallback((row: OfferRow) => {
    setCounterRow(row);
    setCounterFeeStr(String(Math.round(row.marketValue * 1.15)));
  }, []);

  const submitCounter = useCallback(async () => {
    if (!dbHandle || !counterRow || saveId == null) return;
    const newFee = parseNumber(counterFeeStr);
    if (newFee <= counterRow.offer.feeOffered) {
      Alert.alert(t('offers.invalid_counter'), t('offers.invalid_counter_msg'));
      return;
    }
    await counterIncomingOffer(dbHandle, saveId, counterRow.offer.id, newFee);
    setCounterRow(null);
    setCounterFeeStr('');
    Alert.alert(t('offers.counter_sent'), t('offers.counter_sent_msg'));
    await load();
  }, [dbHandle, saveId, counterRow, counterFeeStr, load]);

  const handleDismiss = useCallback(
    async (row: OfferRow) => {
      if (!dbHandle || saveId == null) return;
      await deleteOffer(dbHandle, saveId, row.offer.id);
      await load();
    },
    [dbHandle, saveId, load],
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
        <Text style={styles.emptyTitle}>{t('offers.none_received')}</Text>
        <Text style={styles.emptyText}>{t('offers.none_received_sub')}</Text>
      </View>
    );
  }

  // Sort: pending first, then countered, then finalized
  const sorted = [...rows].sort((a, b) => {
    const rank: Record<OfferStatus, number> = { pending: 0, countered: 1, accepted: 2, rejected: 3 };
    return rank[a.offer.status] - rank[b.offer.status];
  });

  return (
    <>
      <FlatList
        style={commonStyles.screen}
        data={sorted}
        keyExtractor={(item) => String(item.offer.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const meta = STATUS_META[item.offer.status];
          const ratio = item.marketValue > 0 ? item.offer.feeOffered / item.marketValue : 0;
          const ratioColor =
            ratio >= 1.1 ? colors.success : ratio >= 0.9 ? colors.warning : colors.danger;
          const isActionable = item.offer.status === 'pending';
          const isFinal = item.offer.status === 'accepted' || item.offer.status === 'rejected';
          return (
            <View style={[styles.card, { borderLeftColor: meta.color }]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.cardTitle}>{item.playerName}</Text>
                  <Text style={styles.cardSubtitle}>
                    {t('offers.received_meta', { position: item.playerPosition, age: item.playerAge, club: item.offeringClubName })}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: meta.color + '22', borderColor: meta.color }]}>
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.icon} {t(meta.labelKey)}</Text>
                </View>
              </View>

              <View style={styles.row}>
                <Text style={styles.fieldLabel}>{t('offers.offered_fee')}</Text>
                <Text style={styles.fieldValue}>{formatMoney(item.offer.feeOffered)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.fieldLabel}>{t('transfer.market_value')}</Text>
                <Text style={styles.fieldValueMuted}>{formatMoney(item.marketValue)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.fieldLabel}>vs Market</Text>
                <Text style={[styles.fieldValue, { color: ratioColor }]}>
                  {Math.round(ratio * 100)}%
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.fieldLabel}>{t('offers.wage_offered')}</Text>
                <Text style={styles.fieldValue}>{formatMoney(item.offer.wageOffered)}/wk</Text>
              </View>

              {isActionable && (
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.btn, styles.btnSecondary]}
                    onPress={() => handleReject(item)}
                  >
                    <Text style={styles.btnSecondaryText}>{t('offers.reject')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnWarning]}
                    onPress={() => openCounter(item)}
                  >
                    <Text style={styles.btnPrimaryText}>{t('offers.counter')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={() => handleAccept(item)}
                  >
                    <Text style={styles.btnPrimaryText}>{t('offers.accept')}</Text>
                  </Pressable>
                </View>
              )}

              {item.offer.status === 'countered' && (
                <Text style={styles.hint}>Your counter is on the table — the buying club responds next week.</Text>
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
            </View>
          );
        }}
      />

      {/* Counter dialog */}
      <Modal
        visible={counterRow !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCounterRow(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.counterSheet}>
            <Text style={styles.counterTitle}>{t('offers.counter_offer')}</Text>
            {counterRow && (
              <>
                <Text style={styles.counterMeta}>{counterRow.playerName}</Text>
                <Text style={styles.counterMetaSub}>
                  {t('offers.current_vs_market', { offer: formatMoney(counterRow.offer.feeOffered), market: formatMoney(counterRow.marketValue) })}
                </Text>
                <Text style={styles.fieldLabel}>{t('offers.asking_price')}</Text>
                <TextInput
                  style={styles.input}
                  value={counterFeeStr}
                  onChangeText={setCounterFeeStr}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.helperText}>{formatMoney(parseNumber(counterFeeStr))}</Text>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.btn, styles.btnSecondary]}
                    onPress={() => setCounterRow(null)}
                  >
                    <Text style={styles.btnSecondaryText}>{t('common.cancel')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnPrimary]}
                    onPress={submitCounter}
                  >
                    <Text style={styles.btnPrimaryText}>{t('offers.send_counter')}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
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
  btnWarning: {
    backgroundColor: colors.accent,
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  counterSheet: {
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  counterTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  counterMeta: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  counterMetaSub: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: fontSize.md,
    marginTop: 4,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 4,
  },
});
