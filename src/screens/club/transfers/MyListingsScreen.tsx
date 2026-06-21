import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, Badge, Button, Chip, Sheet, Icon } from '@/components/kit';
import { Title, Body, Label, Caption, Stat } from '@/components/typography';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import {
  getPlayersWithAttributesByClub,
  getPlayerById,
  setTransferListing,
  setLoanListing,
} from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { Player, PlayerAttributes } from '@/types';

type PlayerWithOvr = Player & { attributes: PlayerAttributes; overall: number };
type FilterMode = 'all' | 'listed' | 'unlisted';
const FILTER_LABEL: Record<FilterMode, TKey> = {
  all: 'transfer.filter_all',
  listed: 'transfer.filter_listed',
  unlisted: 'transfer.filter_unlisted',
};

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function MyListingsScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const currentSave = useGameStore((s) => s.currentSave);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const saveId = currentSave?.id;

  const [players, setPlayers] = useState<PlayerWithOvr[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [editPlayer, setEditPlayer] = useState<PlayerWithOvr | null>(null);

  // Edit modal state
  const [isTransferListed, setIsTransferListedLocal] = useState(false);
  const [askingPriceText, setAskingPriceText] = useState('');
  const [isLoanListed, setIsLoanListedLocal] = useState(false);
  const [loanShareText, setLoanShareText] = useState('50');

  useEffect(() => {
    setIsTransferListedLocal(editPlayer?.isTransferListed ?? false);
    setAskingPriceText(editPlayer?.askingPrice != null ? String(editPlayer.askingPrice) : '');
    setIsLoanListedLocal(editPlayer?.isLoanListed ?? false);
    setLoanShareText(editPlayer?.loanWageShare != null ? String(Math.round(editPlayer.loanWageShare * 100)) : '50');
  }, [editPlayer?.id]);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId === null || saveId == null) { setLoading(false); return; }
    const base = await getPlayersWithAttributesByClub(dbHandle, saveId, playerClubId);
    const withOvr: PlayerWithOvr[] = base.map((p) => ({
      ...p,
      overall: calculateOverall(p.attributes, p.position),
    }));
    withOvr.sort((a, b) => b.overall - a.overall);
    setPlayers(withOvr);
    setLoading(false);
  }, [dbHandle, playerClubId, saveId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function refreshEditPlayer(id: number) {
    if (!dbHandle || saveId == null) return;
    const updated = await getPlayerById(dbHandle, saveId, id);
    if (updated) {
      const withOvr = { ...updated, overall: calculateOverall(updated.attributes, updated.position) };
      setEditPlayer(withOvr);
      setPlayers((prev) => prev.map((p) => (p.id === id ? withOvr : p)));
    }
  }

  async function handleToggleTransfer(next: boolean) {
    setIsTransferListedLocal(next);
    if (!dbHandle || !editPlayer || saveId == null) return;
    const price = askingPriceText.trim() ? parseInt(askingPriceText.replace(/\D/g, ''), 10) : null;
    await setTransferListing(dbHandle, saveId, editPlayer.id, next, Number.isFinite(price) ? price : null);
    await refreshEditPlayer(editPlayer.id);
  }

  async function handleBlurAskingPrice() {
    if (!dbHandle || !editPlayer || !isTransferListed || saveId == null) return;
    const price = askingPriceText.trim() ? parseInt(askingPriceText.replace(/\D/g, ''), 10) : null;
    await setTransferListing(dbHandle, saveId, editPlayer.id, true, Number.isFinite(price) ? price : null);
  }

  async function handleToggleLoan(next: boolean) {
    setIsLoanListedLocal(next);
    if (!dbHandle || !editPlayer || saveId == null) return;
    const sharePct = loanShareText.trim() ? parseInt(loanShareText.replace(/\D/g, ''), 10) : 50;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(sharePct) ? sharePct : 50));
    await setLoanListing(dbHandle, saveId, editPlayer.id, next, next ? clamped / 100 : null);
    await refreshEditPlayer(editPlayer.id);
  }

  async function handleBlurLoanShare() {
    if (!dbHandle || !editPlayer || !isLoanListed || saveId == null) return;
    const sharePct = loanShareText.trim() ? parseInt(loanShareText.replace(/\D/g, ''), 10) : 50;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(sharePct) ? sharePct : 50));
    await setLoanListing(dbHandle, saveId, editPlayer.id, true, clamped / 100);
  }

  const FILTERS: FilterMode[] = ['all', 'listed', 'unlisted'];

  const filtered = players.filter((p) => {
    if (filter === 'listed') return p.isTransferListed || p.isLoanListed;
    if (filter === 'unlisted') return !p.isTransferListed && !p.isLoanListed;
    return true;
  });

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={accent.accent} />
      </View>
    );
  }

  function renderItem({ item: p }: { item: PlayerWithOvr }) {
    const ovrColor = p.overall >= 75 ? colors.success : p.overall >= 60 ? colors.warning : colors.danger;
    return (
      <Pressable
        onPress={() => setEditPlayer(p)}
        testID={`listing-${p.id}`}
        accessibilityRole="button"
        accessibilityLabel={p.name}
      >
        <Card variant="detail" accent={accent.accent} style={styles.row}>
          <View style={styles.rowLeft}>
            <Body style={styles.rowName}>{p.name}</Body>
            <Label style={styles.rowMeta}>
              {p.position} · {t('transfer.age_years', { age: p.age })} · <Stat color={ovrColor} style={styles.inlineOvr}>{p.overall}</Stat>
            </Label>
            <View style={styles.badges}>
              {p.isTransferListed && (
                <Badge
                  value={p.askingPrice ? t('transfer.badge_sale_price', { price: formatMoney(p.askingPrice) }) : t('transfer.badge_sale')}
                  tone="warning"
                  size="sm"
                />
              )}
              {p.isLoanListed && (
                <Badge
                  value={p.loanWageShare != null ? t('transfer.badge_loan_pct', { pct: Math.round(p.loanWageShare * 100) }) : t('transfer.badge_loan')}
                  tone="primary"
                  size="sm"
                />
              )}
            </View>
          </View>
          <Icon name="arrowRight" color={colors.textMuted} size={20} />
        </Card>
      </Pressable>
    );
  }

  return (
    <View style={commonStyles.screen}>
      {/* Filter pills */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={t(FILTER_LABEL[f])}
            selected={filter === f}
            accent={accent.accent}
            onPress={() => setFilter(f)}
            testID={`chip-filter-${f}`}
          />
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent.accent} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Label style={styles.emptyText}>{t('transfer.no_players_found')}</Label>
          </View>
        }
      />

      {/* Edit sheet */}
      <Sheet visible={editPlayer !== null} onClose={() => setEditPlayer(null)} testID="listing-edit-sheet">
        {editPlayer && (
          <ScrollView nestedScrollEnabled>
            <Title style={styles.modalTitle}>{editPlayer.name}</Title>
            <Label style={styles.modalMeta}>{editPlayer.position} · {t('transfer.age_years', { age: editPlayer.age })} · OVR {editPlayer.overall}</Label>

            <Caption style={styles.sectionTitle}>{t('tactics.transfer_status_title')}</Caption>

            <View style={styles.listingRow}>
              <Body style={styles.listingLabel}>{t('tactics.list_for_sale')}</Body>
              <Switch value={isTransferListed} onValueChange={handleToggleTransfer} />
            </View>
            {isTransferListed && (
              <View style={styles.listingRow}>
                <Body style={styles.listingLabel}>{t('tactics.asking_price')}</Body>
                <TextInput
                  style={styles.listingInput}
                  value={askingPriceText}
                  onChangeText={setAskingPriceText}
                  onBlur={handleBlurAskingPrice}
                  keyboardType="numeric"
                  placeholder={t('tactics.asking_price_placeholder')}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            <View style={styles.listingRow}>
              <Body style={styles.listingLabel}>{t('tactics.list_for_loan')}</Body>
              <Switch value={isLoanListed} onValueChange={handleToggleLoan} />
            </View>
            {isLoanListed && (
              <View style={styles.listingRow}>
                <Body style={styles.listingLabel}>{t('tactics.loan_wage_share')}</Body>
                <TextInput
                  style={styles.listingInput}
                  value={loanShareText}
                  onChangeText={setLoanShareText}
                  onBlur={handleBlurLoanShare}
                  keyboardType="numeric"
                  placeholder="50"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            <View style={styles.closeBtn}>
              <Button
                label={t('tactics.close')}
                variant="primary"
                onPress={() => setEditPlayer(null)}
                testID="listing-edit-close"
                accessibilityLabel={t('tactics.close')}
              />
            </View>
          </ScrollView>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },

  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },

  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  rowLeft: { flex: 1 },
  rowName: { fontWeight: '600', marginBottom: spacing.xxs },
  rowMeta: { marginBottom: spacing.xs },
  inlineOvr: { fontWeight: '700' },
  badges: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },

  // Sheet
  modalTitle: { marginBottom: spacing.xs },
  modalMeta: { marginBottom: spacing.md },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  listingLabel: { flex: 1 },
  listingInput: {
    color: colors.text,
    fontSize: fontSize.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 120,
    textAlign: 'right',
  },
  closeBtn: { marginTop: spacing.md },
});
