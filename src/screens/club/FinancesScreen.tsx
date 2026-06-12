import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getFinancesBySeason } from '@/database/queries/finances';
import { getClubById } from '@/database/queries/clubs';
import { ClubFinance, FinanceType } from '@/types';

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `$${(abs / 1_000).toFixed(0)}K`;
  }
  return `$${abs.toLocaleString()}`;
}

function formatBudget(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return `$${(abs / 1_000_000).toFixed(2)}M`;
  }
  return `$${abs.toLocaleString()}`;
}

const FINANCE_TYPE_LABELS: Record<FinanceType, string> = {
  ticket: 'Ticket Sales',
  tv: 'TV Rights',
  sponsor: 'Sponsorship',
  transfer_in: 'Transfer Income',
  transfer_out: 'Transfer Fee',
  wages: 'Wages',
  maintenance: 'Maintenance',
  bonus: 'Bonus',
  upgrade: 'Facility Upgrade',
  assistant_wage: 'Assistant Wages',
  prize: 'Prize Money',
};

function typeIcon(type: FinanceType): string {
  switch (type) {
    case 'ticket': return '🎟';
    case 'tv': return '📺';
    case 'sponsor': return '🤝';
    case 'transfer_in': return '📥';
    case 'transfer_out': return '📤';
    case 'wages': return '💼';
    case 'maintenance': return '🔧';
    case 'bonus': return '⭐';
    case 'upgrade': return '🏗';
    case 'assistant_wage': return '🧠';
    default: return '💰';
  }
}

function TransactionItem({ item }: { item: ClubFinance }) {
  const isPositive = item.amount >= 0;
  const amountColor = isPositive ? colors.success : colors.danger;
  const sign = isPositive ? '+' : '-';
  const label = FINANCE_TYPE_LABELS[item.type] ?? item.type;

  return (
    <View style={styles.transactionRow}>
      <Text style={styles.txIcon}>{typeIcon(item.type)}</Text>
      <View style={styles.txInfo}>
        <Text style={styles.txLabel}>{label}</Text>
        {item.description ? (
          <Text style={styles.txDesc} numberOfLines={1}>{item.description}</Text>
        ) : null}
        <Text style={styles.txWeek}>Week {item.week}</Text>
      </View>
      <Text style={[styles.txAmount, { color: amountColor }]}>
        {sign}{formatCurrency(item.amount)}
      </Text>
    </View>
  );
}

export function FinancesScreen() {
  const { playerClubId, playerClub, setPlayerClub, season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [finances, setFinances] = useState<ClubFinance[]>([]);
  const [liveBudget, setLiveBudget] = useState<number | null>(null);
  const saveId = currentSave?.id;

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId == null || saveId == null) return;
    // Re-fetch the club so the budget figure is always fresh, even if the
    // user came here without hitting Home (where the store is refreshed).
    const club = await getClubById(dbHandle, saveId, playerClubId);
    if (club) {
      setLiveBudget(club.budget);
      setPlayerClub(club);
    }
    const entries = await getFinancesBySeason(dbHandle, saveId, playerClubId, season);
    // Sort ascending by week so the "Transactions" list reads chronologically
    // when reversed at render time.
    entries.sort((a, b) => a.week - b.week);
    setFinances(entries);
  }, [dbHandle, playerClubId, saveId, season, setPlayerClub]);

  // Run on mount and whenever any of the inputs change (incl. week, so the
  // screen refreshes after the user advances time while it was still on the
  // navigation stack).
  useEffect(() => {
    load();
  }, [load, week]);

  // Also reload whenever the screen regains focus — covers the case where the
  // user navigates away, advances weeks, and comes back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const totalIncome = finances.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const totalExpenses = finances.filter((f) => f.amount < 0).reduce((s, f) => s + f.amount, 0);
  const budget = liveBudget ?? playerClub?.budget ?? 0;

  function renderItem({ item }: ListRenderItemInfo<ClubFinance>) {
    return <TransactionItem item={item} />;
  }

  return (
    <View style={commonStyles.screen}>
      {/* Balance Header */}
      <View style={styles.balanceHeader}>
        <Text style={styles.balanceLabel}>CURRENT BUDGET</Text>
        <Text style={[styles.balanceAmount, { color: budget >= 0 ? colors.success : colors.danger }]}>
          {budget < 0 ? '-' : ''}{formatBudget(budget)}
        </Text>
        <Text style={styles.balanceSeason}>Season {season}</Text>
      </View>

      {/* Season Summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, styles.summaryLeft]}>
          <Text style={styles.summaryLabel}>INCOME</Text>
          <Text style={[styles.summaryAmount, { color: colors.success }]}>
            +{formatCurrency(totalIncome)}
          </Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryRight]}>
          <Text style={styles.summaryLabel}>EXPENSES</Text>
          <Text style={[styles.summaryAmount, { color: colors.danger }]}>
            -{formatCurrency(Math.abs(totalExpenses))}
          </Text>
        </View>
      </View>

      {/* Transaction List */}
      <Text style={styles.sectionTitle}>Transactions</Text>

      {finances.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No transactions yet this season</Text>
        </View>
      ) : (
        <FlatList
          data={[...finances].reverse()}
          keyExtractor={(item, index) => `${item.week}-${item.type}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  balanceHeader: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: spacing.xs,
  },
  balanceSeason: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLeft: {},
  summaryRight: {},
  summaryLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryAmount: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  transactionRow: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  txIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  txInfo: {
    flex: 1,
  },
  txLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  txDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  txWeek: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  txAmount: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    marginLeft: spacing.sm,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
