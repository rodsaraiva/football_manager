import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, Badge, Button, useConfirm } from '@/components/kit';
import type { BadgeTone } from '@/components/kit';
import { Title, Body, Label } from '@/components/typography';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useCelebrationStore } from '@/store/celebration-store';
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

const STATUS_META: Record<OfferStatus, { labelKey: TKey; tone: BadgeTone; color: string }> = {
  pending: { labelKey: 'offers.status_pending', tone: 'warning', color: colors.warning },
  accepted: { labelKey: 'offers.status_accepted', tone: 'success', color: colors.success },
  rejected: { labelKey: 'offers.status_rejected', tone: 'danger', color: colors.danger },
  countered: { labelKey: 'offers.status_counter', tone: 'accent', color: colors.accent },
};

export function OffersSentScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const confirm = useConfirm();
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
      const ok = await confirm({
        title: t('offers.accept_counter_title'),
        message: t('offers.accept_counter_msg', { club: row.sellingClubName, fee: formatMoney(row.offer.feeOffered), player: row.playerName }),
        confirmLabel: t('offers.accept'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
      const res = await acceptCounterOffer(dbHandle, saveId, row.offer.id, season, week);
      if (!res.success) {
        await confirm({ title: t('offers.unable_accept'), message: res.reason ?? t('transfer.unknown_error'), confirmLabel: t('kit.ok'), tone: 'danger' });
      } else {
        useCelebrationStore.getState().push({
          kind: 'transfer',
          titleKey: 'celebration.transfer',
          detail: row.playerName,
        });
        await confirm({ title: t('offers.deal_closed'), message: t('transfer.signed_msg', { name: row.playerName }), confirmLabel: t('kit.ok') });
      }
      await load();
    },
    [dbHandle, saveId, season, week, load, confirm, t],
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
        <Title style={styles.emptyTitle}>{t('offers.none_sent')}</Title>
        <Body style={styles.emptyText}>{t('offers.none_sent_sub')}</Body>
      </View>
    );
  }

  return (
    <FlatList
      style={commonStyles.screen}
      data={rows}
      keyExtractor={(item) => String(item.offer.id)}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={accent.accent} />
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const meta = STATUS_META[item.offer.status];
        const isCountered = item.offer.status === 'countered';
        const isFinal = item.offer.status === 'accepted' || item.offer.status === 'rejected';
        return (
          <Card variant="detail" accent={meta.color} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Body style={styles.cardTitle}>{item.playerName}</Body>
                <Label>
                  {t('offers.from_club', { position: item.playerPosition, club: item.sellingClubName })}
                </Label>
              </View>
              <Badge value={t(meta.labelKey)} tone={meta.tone} />
            </View>

            <View style={styles.row}>
              <Label>{isCountered ? t('offers.counter_fee') : t('offers.your_fee')}</Label>
              <Body style={styles.fieldValue}>{formatMoney(item.offer.feeOffered)}</Body>
            </View>
            <View style={styles.row}>
              <Label>{t('offers.wage_offered')}</Label>
              <Body style={styles.fieldValue}>{formatMoney(item.offer.wageOffered)}/wk</Body>
            </View>
            <View style={styles.row}>
              <Label>{t('transfer.market_value')}</Label>
              <Label>{formatMoney(item.marketValue)}</Label>
            </View>

            {isCountered && (
              <View style={styles.actions}>
                <Button
                  label={t('offers.walk_away')}
                  variant="secondary"
                  onPress={() => handleRejectCounter(item)}
                  testID={`offer-sent-walk-${item.offer.id}`}
                  accessibilityLabel={t('offers.walk_away')}
                />
                <Button
                  label={t('offers.accept_counter_btn')}
                  variant="primary"
                  onPress={() => handleAcceptCounter(item)}
                  testID={`offer-sent-accept-${item.offer.id}`}
                  accessibilityLabel={t('offers.accept_counter_btn')}
                />
              </View>
            )}

            {isFinal && (
              <View style={styles.actions}>
                <Button
                  label={t('offers.dismiss')}
                  variant="ghost"
                  onPress={() => handleDismiss(item)}
                  testID={`offer-sent-dismiss-${item.offer.id}`}
                  accessibilityLabel={t('offers.dismiss')}
                />
              </View>
            )}

            {item.offer.status === 'pending' && (
              <Label style={styles.hint}>{t('offers.hint_respond_next_week')}</Label>
            )}
          </Card>
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
});
