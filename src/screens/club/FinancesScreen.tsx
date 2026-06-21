import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getFinancesBySeason } from '@/database/queries/finances';
import { getClubById } from '@/database/queries/clubs';
import { ClubFinance, FinanceType } from '@/types';
import { Card, Icon, EmptyState } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Title, Body, Label, Caption, Stat } from '@/components/typography';

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

const FINANCE_TYPE_LABELS: Record<FinanceType, TKey> = {
  ticket: 'finances.type_ticket',
  tv: 'finances.type_tv',
  sponsor: 'finances.type_sponsor',
  transfer_in: 'finances.type_transfer_in',
  transfer_out: 'finances.type_transfer_out',
  wages: 'finances.type_wages',
  maintenance: 'finances.type_maintenance',
  bonus: 'finances.type_bonus',
  upgrade: 'finances.type_upgrade',
  assistant_wage: 'finances.type_assistant_wage',
  prize: 'finances.type_prize',
};

// Mapeia o tipo de lançamento para um ícone SVG do kit (substitui os emoji).
function typeIcon(type: FinanceType): IconName {
  switch (type) {
    case 'transfer_in':
    case 'transfer_out':
      return 'squad';
    case 'wages':
    case 'assistant_wage':
      return 'chart';
    default:
      return 'money';
  }
}

function TransactionItem({ item }: { item: ClubFinance }) {
  const { t } = useTranslation();
  const isPositive = item.amount >= 0;
  const amountColor = isPositive ? colors.success : colors.danger;
  const sign = isPositive ? '+' : '-';

  return (
    <Card variant="detail" style={styles.transactionRow}>
      <Icon name={typeIcon(item.type)} color={amountColor} size={20} />
      <View style={styles.txInfo}>
        <Body>{t(FINANCE_TYPE_LABELS[item.type])}</Body>
        {item.description ? (
          <Caption color={colors.textSecondary} numberOfLines={1}>{item.description}</Caption>
        ) : null}
        <Caption color={colors.textMuted}>{t('calendar.week', { n: item.week })}</Caption>
      </View>
      <Stat color={amountColor}>{sign}{formatCurrency(item.amount)}</Stat>
    </Card>
  );
}

export function FinancesScreen() {
  const { t } = useTranslation();
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
      <Card variant="summary" style={styles.balanceHeader}>
        <Label>{t('finances.current_budget')}</Label>
        <Stat color={budget >= 0 ? colors.success : colors.danger} style={styles.balanceAmount}>
          {budget < 0 ? '-' : ''}{formatBudget(budget)}
        </Stat>
        <Caption color={colors.textSecondary}>{t('standings.season', { season })}</Caption>
      </Card>

      <View style={styles.summaryRow}>
        <Card variant="summary" style={styles.summaryCard}>
          <Label>{t('finances.income')}</Label>
          <Stat color={colors.success}>+{formatCurrency(totalIncome)}</Stat>
        </Card>
        <Card variant="summary" style={styles.summaryCard}>
          <Label>{t('finances.expenses')}</Label>
          <Stat color={colors.danger}>-{formatCurrency(Math.abs(totalExpenses))}</Stat>
        </Card>
      </View>

      <Title style={styles.sectionTitle}>{t('finances.transactions')}</Title>

      {finances.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState art="inbox" title={t('finances.no_transactions')} />
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
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceAmount: { textAlign: 'center' },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  transactionRow: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  txInfo: {
    flex: 1,
  },
  emptyWrap: { marginHorizontal: spacing.md },
});
