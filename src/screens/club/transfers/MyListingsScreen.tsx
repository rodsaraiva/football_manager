import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Modal,
  ScrollView,
  Switch,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
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
type FilterMode = 'Todos' | 'Listados' | 'Não listados';

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function MyListingsScreen() {
  const playerClubId = useGameStore((s) => s.playerClubId);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);

  const [players, setPlayers] = useState<PlayerWithOvr[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('Todos');
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
    if (!dbHandle || playerClubId === null) { setLoading(false); return; }
    const base = await getPlayersWithAttributesByClub(dbHandle, playerClubId);
    const withOvr: PlayerWithOvr[] = base.map((p) => ({
      ...p,
      overall: calculateOverall(p.attributes, p.position),
    }));
    withOvr.sort((a, b) => b.overall - a.overall);
    setPlayers(withOvr);
    setLoading(false);
  }, [dbHandle, playerClubId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function refreshEditPlayer(id: number) {
    if (!dbHandle) return;
    const updated = await getPlayerById(dbHandle, id);
    if (updated) {
      const withOvr = { ...updated, overall: calculateOverall(updated.attributes, updated.position) };
      setEditPlayer(withOvr);
      setPlayers((prev) => prev.map((p) => (p.id === id ? withOvr : p)));
    }
  }

  async function handleToggleTransfer(next: boolean) {
    setIsTransferListedLocal(next);
    if (!dbHandle || !editPlayer) return;
    const price = askingPriceText.trim() ? parseInt(askingPriceText.replace(/\D/g, ''), 10) : null;
    await setTransferListing(dbHandle, editPlayer.id, next, Number.isFinite(price) ? price : null);
    await refreshEditPlayer(editPlayer.id);
  }

  async function handleBlurAskingPrice() {
    if (!dbHandle || !editPlayer || !isTransferListed) return;
    const price = askingPriceText.trim() ? parseInt(askingPriceText.replace(/\D/g, ''), 10) : null;
    await setTransferListing(dbHandle, editPlayer.id, true, Number.isFinite(price) ? price : null);
  }

  async function handleToggleLoan(next: boolean) {
    setIsLoanListedLocal(next);
    if (!dbHandle || !editPlayer) return;
    const sharePct = loanShareText.trim() ? parseInt(loanShareText.replace(/\D/g, ''), 10) : 50;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(sharePct) ? sharePct : 50));
    await setLoanListing(dbHandle, editPlayer.id, next, next ? clamped / 100 : null);
    await refreshEditPlayer(editPlayer.id);
  }

  async function handleBlurLoanShare() {
    if (!dbHandle || !editPlayer || !isLoanListed) return;
    const sharePct = loanShareText.trim() ? parseInt(loanShareText.replace(/\D/g, ''), 10) : 50;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(sharePct) ? sharePct : 50));
    await setLoanListing(dbHandle, editPlayer.id, true, clamped / 100);
  }

  const FILTERS: FilterMode[] = ['Todos', 'Listados', 'Não listados'];

  const filtered = players.filter((p) => {
    if (filter === 'Listados') return p.isTransferListed || p.isLoanListed;
    if (filter === 'Não listados') return !p.isTransferListed && !p.isLoanListed;
    return true;
  });

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  function renderItem({ item: p }: { item: PlayerWithOvr }) {
    const ovrColor = p.overall >= 75 ? colors.success : p.overall >= 60 ? colors.warning : colors.danger;
    return (
      <Pressable style={styles.row} onPress={() => setEditPlayer(p)}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowName}>{p.name}</Text>
          <Text style={styles.rowMeta}>{p.position} · {p.age} anos · <Text style={{ color: ovrColor, fontWeight: '700' }}>{p.overall}</Text></Text>
          <View style={styles.badges}>
            {p.isTransferListed && (
              <View style={styles.badgeSale}>
                <Text style={styles.badgeText}>
                  {p.askingPrice ? `VENDA ${formatMoney(p.askingPrice)}` : 'VENDA'}
                </Text>
              </View>
            )}
            {p.isLoanListed && (
              <View style={styles.badgeLoan}>
                <Text style={styles.badgeText}>
                  {p.loanWageShare != null ? `EMPRÉSTIMO ${Math.round(p.loanWageShare * 100)}%` : 'EMPRÉSTIMO'}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  }

  return (
    <View style={commonStyles.screen}>
      {/* Filter pills */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.filterPill, filter === f && styles.filterPillActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Nenhum jogador encontrado.</Text>
          </View>
        }
      />

      {/* Edit modal */}
      <Modal visible={editPlayer !== null} transparent animationType="slide" onRequestClose={() => setEditPlayer(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {editPlayer && (
              <ScrollView nestedScrollEnabled>
                <Text style={styles.modalTitle}>{editPlayer.name}</Text>
                <Text style={styles.modalMeta}>{editPlayer.position} · {editPlayer.age} anos · OVR {editPlayer.overall}</Text>

                <Text style={styles.sectionTitle}>Status de Transferência</Text>

                <View style={styles.listingRow}>
                  <Text style={styles.listingLabel}>Listar para venda</Text>
                  <Switch value={isTransferListed} onValueChange={handleToggleTransfer} />
                </View>
                {isTransferListed && (
                  <View style={styles.listingRow}>
                    <Text style={styles.listingLabel}>Preço pedido</Text>
                    <TextInput
                      style={styles.listingInput}
                      value={askingPriceText}
                      onChangeText={setAskingPriceText}
                      onBlur={handleBlurAskingPrice}
                      keyboardType="numeric"
                      placeholder="Aberto a propostas"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                )}

                <View style={styles.listingRow}>
                  <Text style={styles.listingLabel}>Listar para empréstimo</Text>
                  <Switch value={isLoanListed} onValueChange={handleToggleLoan} />
                </View>
                {isLoanListed && (
                  <View style={styles.listingRow}>
                    <Text style={styles.listingLabel}>Tomador paga (%)</Text>
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
              </ScrollView>
            )}
            <Pressable style={styles.closeBtn} onPress={() => setEditPlayer(null)}>
              <Text style={styles.closeBtnText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.xl },

  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
  filterPillTextActive: { color: colors.text },

  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowLeft: { flex: 1 },
  rowName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginBottom: 2 },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.sm, marginBottom: spacing.xs },
  badges: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  badgeSale: {
    backgroundColor: colors.warning,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeLoan: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  chevron: { color: colors.textMuted, fontSize: fontSize.xl, marginLeft: spacing.sm },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', paddingHorizontal: spacing.md },
  modalContent: { backgroundColor: colors.surface, borderRadius: 16, padding: spacing.lg, maxHeight: '80%' },
  modalTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: 'bold', marginBottom: 4 },
  modalMeta: { color: colors.textMuted, fontSize: fontSize.sm, marginBottom: spacing.md },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
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
  listingLabel: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  listingInput: {
    color: colors.text,
    fontSize: fontSize.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 120,
    textAlign: 'right',
  },
  closeBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: spacing.md },
  closeBtnText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
});
