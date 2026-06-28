import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, commonStyles } from '@/theme';
import { Card } from '@/components/kit';
import { Caption, Body, Label, Stat } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getClubById } from '@/database/queries/clubs';
import { getFinancesBySeason } from '@/database/queries/finances';
import { getPlayersByClub } from '@/database/queries/players';
import { buildFinancialReport, FinancialReport } from '@/engine/reports/financial-report';
import { RootStackParamList } from '@/navigation/types';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_LABEL_KEYS: Record<string, TKey> = {
  ticket: 'report.fin_cat_ticket',
  tv: 'report.fin_cat_tv',
  sponsor: 'report.fin_cat_sponsor',
  transfer_in: 'report.fin_cat_transfer_in',
  transfer_out: 'report.fin_cat_transfer_out',
  wages: 'report.fin_cat_wages',
  maintenance: 'report.fin_cat_maintenance',
  bonus: 'report.fin_cat_bonus',
  upgrade: 'report.fin_cat_upgrade',
  prize: 'report.fin_cat_prize',
  assistant_wage: 'report.fin_cat_assistant_wage',
};
const labelFor = (t: (k: TKey) => string, type: string): string => {
  const key = CATEGORY_LABEL_KEYS[type];
  return key ? t(key) : type;
};

function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function ReportsFinancialScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { playerClubId, season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<FinancialReport | null>(null);

  const load = React.useCallback(async () => {
    if (!dbHandle || !playerClubId || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const club = await getClubById(dbHandle, saveId, playerClubId);
      if (!club) return;

      const entries = await getFinancesBySeason(dbHandle, saveId, playerClubId, season);
      const prevEntries = season > 1
        ? await getFinancesBySeason(dbHandle, saveId, playerClubId, season - 1)
        : [];
      const squad = await getPlayersByClub(dbHandle, saveId, playerClubId);
      const totalWages = squad.reduce((sum, p) => sum + p.wage, 0);

      const r = buildFinancialReport({
        clubBudget: club.budget,
        clubWageBudget: club.wageBudget,
        totalPlayerWages: totalWages,
        currentWeek: week,
        seasonEntries: entries.map((e) => ({ type: e.type, amount: e.amount })),
        previousSeasonEntries: prevEntries.map((e) => ({ type: e.type, amount: e.amount })),
        squadWages: squad.map((p) => ({
          playerId: p.id,
          name: p.name,
          position: p.position,
          wage: p.wage,
        })),
      });
      setReport(r);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, season, week, saveId]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.reportFinancial} size="large" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Body color={colors.textMuted}>{t('report.fin_no_data')}</Body>
      </View>
    );
  }

  const netColor = report.seasonNet >= 0 ? colors.success : colors.danger;
  const tbColor = report.transferBalance >= 0 ? colors.success : colors.danger;
  const payrollColor =
    report.payrollRatio > 1.1 ? colors.danger
    : report.payrollRatio > 0.9 ? colors.warning
    : colors.success;

  return (
    <ScrollView
      style={commonStyles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.reportFinancial} />
      }
    >
      {/* Budget highlight */}
      <Card variant="summary" style={styles.card}>
        <Caption style={styles.cardLabel}>{t('report.fin_current_cash')}</Caption>
        <Stat color={colors.success} style={styles.budgetAmount}>{formatMoney(report.budget)}</Stat>
      </Card>

      {/* Season summary */}
      <Card variant="summary" style={styles.card}>
        <Caption style={styles.cardLabel}>{t('report.fin_season')}</Caption>
        <StatRow label={t('report.fin_revenue')} value={formatMoney(report.seasonIncome)} color={colors.success} />
        <StatRow label={t('report.fin_expense')} value={formatMoney(-report.seasonExpenses)} color={colors.danger} />
        <View style={styles.divider} />
        <StatRow label={t('report.fin_balance')} value={formatMoney(report.seasonNet)} color={netColor} emphasis />
      </Card>

      {/* Transfer balance */}
      <Card variant="summary" style={styles.card}>
        <Caption style={styles.cardLabel}>{t('report.fin_transfers')}</Caption>
        <StatRow
          label={t('report.fin_transfer_balance')}
          value={formatMoney(report.transferBalance)}
          color={tbColor}
          emphasis
        />
      </Card>

      {/* Payroll */}
      <Card variant="summary" style={styles.card}>
        <Caption style={styles.cardLabel}>{t('report.fin_payroll')}</Caption>
        <StatRow label={t('report.fin_weekly_payroll')} value={`${formatMoney(report.weeklyPayroll)}${t('report.fin_per_week')}`} color={colors.text} />
        <StatRow label={t('report.fin_budget')} value={`${formatMoney(report.wageBudget)}${t('report.fin_per_week')}`} color={colors.textSecondary} />
        <View style={styles.divider} />
        <StatRow
          label={t('report.fin_budget_usage')}
          value={`${Math.round(report.payrollRatio * 100)}%`}
          color={payrollColor}
          emphasis
        />
      </Card>

      {/* Projection */}
      <Card variant="summary" style={styles.card}>
        <Caption style={styles.cardLabel}>{t('report.fin_projection')}</Caption>
        <StatRow
          label={t('report.fin_cash_in_10_weeks')}
          value={formatMoney(report.projectedBudgetIn10Weeks)}
          color={report.projectedBudgetIn10Weeks >= report.budget ? colors.success : colors.warning}
        />
      </Card>

      {/* Category breakdown */}
      {(report.breakdown.income.length > 0 || report.breakdown.expenses.length > 0) && (
        <Card variant="summary" style={styles.card}>
          <Caption style={styles.cardLabel}>{t('report.fin_by_category')}</Caption>
          {report.breakdown.income.length > 0 && (
            <>
              <Label style={styles.subSection}>{t('report.fin_revenues')}</Label>
              {report.breakdown.income.map((b) => (
                <StatRow
                  key={`in-${b.type}`}
                  label={labelFor(t, b.type)}
                  value={formatMoney(b.total)}
                  color={colors.success}
                />
              ))}
            </>
          )}
          {report.breakdown.expenses.length > 0 && (
            <>
              <Label style={[styles.subSection, { marginTop: spacing.sm }]}>{t('report.fin_expenses')}</Label>
              {report.breakdown.expenses.map((b) => (
                <StatRow
                  key={`out-${b.type}`}
                  label={labelFor(t, b.type)}
                  value={formatMoney(-b.total)}
                  color={colors.danger}
                />
              ))}
            </>
          )}
        </Card>
      )}

      {/* Previous season comparison */}
      {report.previousSeason && (
        <Card variant="summary" style={styles.card}>
          <Caption style={styles.cardLabel}>{t('report.fin_vs_previous_season')}</Caption>
          <DeltaRow label={t('report.fin_revenue')} delta={report.previousSeason.incomeDelta} positiveIsGood />
          <DeltaRow label={t('report.fin_expense')} delta={report.previousSeason.expensesDelta} positiveIsGood={false} />
          <View style={styles.divider} />
          <DeltaRow label={t('report.fin_balance')} delta={report.previousSeason.netDelta} positiveIsGood emphasis />
        </Card>
      )}

      {/* Top salaries */}
      {report.topSalaries.length > 0 && (
        <Card variant="summary" style={styles.card}>
          <Caption style={styles.cardLabel}>{t('report.fin_top_salaries')}</Caption>
          {report.topSalaries.map((s) => (
            <Pressable
              key={s.playerId}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: s.playerId })}
              style={({ pressed }) => [styles.salaryRow, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={s.name}
              testID={`salary-row-${s.playerId}`}
            >
              <View style={{ flex: 1 }}>
                <Body style={styles.salaryName}>{s.name}</Body>
                <Caption>
                  {s.position} · {t('report.fin_share_of_payroll', { pct: Math.round(s.shareOfPayroll * 100) })}
                </Caption>
              </View>
              <Label style={styles.salaryValue}>{formatMoney(s.wage)}{t('report.fin_per_week')}</Label>
            </Pressable>
          ))}
        </Card>
      )}

      {/* Suggestions */}
      <Card variant="summary" style={styles.card}>
        <Caption style={styles.cardLabel}>{t('report.fin_recommendations')}</Caption>
        {report.suggestions.map((s, i) => (
          <View key={i} style={styles.suggestionLine}>
            <Body style={styles.suggestionBullet}>•</Body>
            <Body style={styles.suggestionText}>{s}</Body>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function StatRow({
  label,
  value,
  color,
  emphasis = false,
}: {
  label: string;
  value: string;
  color: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.statRow}>
      <Label style={styles.statLabel}>{label}</Label>
      {emphasis
        ? <Stat color={color} style={styles.statValueEmphasis}>{value}</Stat>
        : <Body style={[styles.statValue, { color }]}>{value}</Body>}
    </View>
  );
}

function DeltaRow({
  label,
  delta,
  positiveIsGood,
  emphasis = false,
}: {
  label: string;
  delta: number;
  positiveIsGood: boolean;
  emphasis?: boolean;
}) {
  const isPositive = delta >= 0;
  const isGood = positiveIsGood ? isPositive : !isPositive;
  const color = delta === 0 ? colors.textSecondary : isGood ? colors.success : colors.danger;
  const sign = delta > 0 ? '+' : '';
  return (
    <View style={styles.statRow}>
      <Label style={styles.statLabel}>{label}</Label>
      {emphasis
        ? <Stat color={color} style={styles.statValueEmphasis}>{sign}{formatMoney(delta)}</Stat>
        : <Body style={[styles.statValue, { color }]}>{sign}{formatMoney(delta)}</Body>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  cardLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  budgetAmount: {
    fontWeight: 'bold',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  statLabel: {
    flex: 1,
  },
  statValue: {
    fontWeight: '600',
  },
  statValueEmphasis: {
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  suggestionLine: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  suggestionBullet: {
    color: colors.primary,
    marginRight: spacing.xs,
  },
  suggestionText: {
    flex: 1,
  },
  subSection: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  salaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  salaryName: {
    fontWeight: '600',
  },
  salaryValue: {
    fontWeight: '700',
  },
});
