import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, Badge, Button, Sheet, useConfirm } from '@/components/kit';
import type { BadgeTone } from '@/components/kit';
import { Title, Body, Label } from '@/components/typography';
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

const STATUS_META: Record<OfferStatus, { labelKey: TKey; tone: BadgeTone; color: string }> = {
  pending: { labelKey: 'offers.status_new', tone: 'warning', color: colors.warning },
  accepted: { labelKey: 'offers.status_accepted', tone: 'success', color: colors.success },
  rejected: { labelKey: 'offers.status_rejected', tone: 'danger', color: colors.danger },
  countered: { labelKey: 'offers.status_awaiting', tone: 'accent', color: colors.accent },
};

export function OffersReceivedScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const confirm = useConfirm();
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
    async (row: OfferRow) => {
      if (!dbHandle || saveId == null) return;
      const ok = await confirm({
        title: t('offers.accept_offer_title'),
        message: t('offers.accept_offer_msg', { player: row.playerName, club: row.offeringClubName, fee: formatMoney(row.offer.feeOffered) }),
        confirmLabel: t('offers.sell'),
        cancelLabel: t('common.cancel'),
        tone: 'danger',
      });
      if (!ok) return;
      const res = await acceptIncomingOffer(dbHandle, saveId, row.offer.id, season, week);
      if (!res.success) {
        await confirm({ title: t('transfer.error'), message: res.reason ?? t('offers.transfer_failed'), confirmLabel: t('kit.ok'), tone: 'danger' });
      } else {
        await confirm({ title: t('offers.player_sold'), message: t('offers.player_left', { name: row.playerName }), confirmLabel: t('kit.ok') });
      }
      await load();
    },
    [dbHandle, saveId, season, week, load, confirm, t],
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
      await confirm({ title: t('offers.invalid_counter'), message: t('offers.invalid_counter_msg'), confirmLabel: t('kit.ok'), tone: 'danger' });
      return;
    }
    await counterIncomingOffer(dbHandle, saveId, counterRow.offer.id, newFee);
    setCounterRow(null);
    setCounterFeeStr('');
    await confirm({ title: t('offers.counter_sent'), message: t('offers.counter_sent_msg'), confirmLabel: t('kit.ok') });
    await load();
  }, [dbHandle, saveId, counterRow, counterFeeStr, load, confirm, t]);

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
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Title style={styles.emptyTitle}>{t('offers.none_received')}</Title>
        <Body style={styles.emptyText}>{t('offers.none_received_sub')}</Body>
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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={accent.accent} />
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
            <Card variant="detail" accent={meta.color} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Body style={styles.cardTitle}>{item.playerName}</Body>
                  <Label>
                    {t('offers.received_meta', { position: item.playerPosition, age: item.playerAge, club: item.offeringClubName })}
                  </Label>
                </View>
                <Badge value={t(meta.labelKey)} tone={meta.tone} />
              </View>

              <View style={styles.row}>
                <Label>{t('offers.offered_fee')}</Label>
                <Body style={styles.fieldValue}>{formatMoney(item.offer.feeOffered)}</Body>
              </View>
              <View style={styles.row}>
                <Label>{t('transfer.market_value')}</Label>
                <Label>{formatMoney(item.marketValue)}</Label>
              </View>
              <View style={styles.row}>
                <Label>{t('offers.vs_market')}</Label>
                <Body style={[styles.fieldValue, { color: ratioColor }]}>
                  {Math.round(ratio * 100)}%
                </Body>
              </View>
              <View style={styles.row}>
                <Label>{t('offers.wage_offered')}</Label>
                <Body style={styles.fieldValue}>{formatMoney(item.offer.wageOffered)}/wk</Body>
              </View>

              {isActionable && (
                <View style={styles.actions}>
                  <Button
                    label={t('offers.reject')}
                    variant="secondary"
                    onPress={() => handleReject(item)}
                    testID={`offer-recv-reject-${item.offer.id}`}
                    accessibilityLabel={t('offers.reject')}
                  />
                  <Button
                    label={t('offers.counter')}
                    variant="secondary"
                    accent={colors.accent}
                    onPress={() => openCounter(item)}
                    testID={`offer-recv-counter-${item.offer.id}`}
                    accessibilityLabel={t('offers.counter')}
                  />
                  <Button
                    label={t('offers.accept')}
                    variant="primary"
                    onPress={() => handleAccept(item)}
                    testID={`offer-recv-accept-${item.offer.id}`}
                    accessibilityLabel={t('offers.accept')}
                  />
                </View>
              )}

              {item.offer.status === 'countered' && (
                <Label style={styles.hint}>{t('offers.counter_sent_msg')}</Label>
              )}

              {isFinal && (
                <View style={styles.actions}>
                  <Button
                    label={t('offers.dismiss')}
                    variant="ghost"
                    onPress={() => handleDismiss(item)}
                    testID={`offer-recv-dismiss-${item.offer.id}`}
                    accessibilityLabel={t('offers.dismiss')}
                  />
                </View>
              )}
            </Card>
          );
        }}
      />

      {/* Counter sheet */}
      <Sheet visible={counterRow !== null} onClose={() => setCounterRow(null)} testID="offer-counter-sheet">
        <Title style={styles.counterTitle}>{t('offers.counter_offer')}</Title>
        {counterRow && (
          <>
            <Body style={styles.counterMeta}>{counterRow.playerName}</Body>
            <Label style={styles.counterMetaSub}>
              {t('offers.current_vs_market', { offer: formatMoney(counterRow.offer.feeOffered), market: formatMoney(counterRow.marketValue) })}
            </Label>
            <Label>{t('offers.asking_price')}</Label>
            <TextInput
              style={styles.input}
              value={counterFeeStr}
              onChangeText={setCounterFeeStr}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
            />
            <Label style={styles.helperText}>{formatMoney(parseNumber(counterFeeStr))}</Label>
            <View style={styles.actions}>
              <Button
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => setCounterRow(null)}
                testID="offer-counter-cancel"
                accessibilityLabel={t('common.cancel')}
              />
              <Button
                label={t('offers.send_counter')}
                variant="primary"
                onPress={submitCounter}
                testID="offer-counter-send"
                accessibilityLabel={t('offers.send_counter')}
              />
            </View>
          </>
        )}
      </Sheet>
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
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
  },
  list: {
    padding: spacing.sm,
    paddingBottom: spacing.xl,
  },
  card: {
    marginVertical: spacing.xs,
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
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  fieldValue: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  hint: {
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  counterTitle: {
    marginBottom: spacing.sm,
  },
  counterMeta: {
    fontWeight: '600',
  },
  counterMetaSub: {
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  helperText: {
    marginTop: spacing.xs,
  },
});
