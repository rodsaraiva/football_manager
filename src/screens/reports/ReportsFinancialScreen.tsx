import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
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
        <Text style={styles.subtitle}>{t('report.fin_no_data')}</Text>
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
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('report.fin_current_cash')}</Text>
        <Text style={styles.budgetAmount}>{formatMoney(report.budget)}</Text>
      </View>

      {/* Season summary */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('report.fin_season')}</Text>
        <StatRow label={t('report.fin_revenue')} value={formatMoney(report.seasonIncome)} color={colors.success} />
        <StatRow label={t('report.fin_expense')} value={formatMoney(-report.seasonExpenses)} color={colors.danger} />
        <View style={styles.divider} />
        <StatRow label={t('report.fin_balance')} value={formatMoney(report.seasonNet)} color={netColor} emphasis />
      </View>

      {/* Transfer balance */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('report.fin_transfers')}</Text>
        <StatRow
          label={t('report.fin_transfer_balance')}
          value={formatMoney(report.transferBalance)}
          color={tbColor}
          emphasis
        />
      </View>

      {/* Payroll */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('report.fin_payroll')}</Text>
        <StatRow label={t('report.fin_weekly_payroll')} value={`${formatMoney(report.weeklyPayroll)}${t('report.fin_per_week')}`} color={colors.text} />
        <StatRow label={t('report.fin_budget')} value={`${formatMoney(report.wageBudget)}${t('report.fin_per_week')}`} color={colors.textSecondary} />
        <View style={styles.divider} />
        <StatRow
          label={t('report.fin_budget_usage')}
          value={`${Math.round(report.payrollRatio * 100)}%`}
          color={payrollColor}
          emphasis
        />
      </View>

      {/* Projection */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('report.fin_projection')}</Text>
        <StatRow
          label={t('report.fin_cash_in_10_weeks')}
          value={formatMoney(report.projectedBudgetIn10Weeks)}
          color={report.projectedBudgetIn10Weeks >= report.budget ? colors.success : colors.warning}
        />
      </View>

      {/* Category breakdown */}
      {(report.breakdown.income.length > 0 || report.breakdown.expenses.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('report.fin_by_category')}</Text>
          {report.breakdown.income.length > 0 && (
            <>
              <Text style={styles.subSection}>{t('report.fin_revenues')}</Text>
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
              <Text style={[styles.subSection, { marginTop: spacing.sm }]}>{t('report.fin_expenses')}</Text>
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
        </View>
      )}

      {/* Previous season comparison */}
      {report.previousSeason && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('report.fin_vs_previous_season')}</Text>
          <DeltaRow label={t('report.fin_revenue')} delta={report.previousSeason.incomeDelta} positiveIsGood />
          <DeltaRow label={t('report.fin_expense')} delta={report.previousSeason.expensesDelta} positiveIsGood={false} />
          <View style={styles.divider} />
          <DeltaRow label={t('report.fin_balance')} delta={report.previousSeason.netDelta} positiveIsGood emphasis />
        </View>
      )}

      {/* Top salaries */}
      {report.topSalaries.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('report.fin_top_salaries')}</Text>
          {report.topSalaries.map((s) => (
            <Pressable
              key={s.playerId}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: s.playerId })}
              style={({ pressed }) => [styles.salaryRow, pressed && { opacity: 0.6 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.salaryName}>{s.name}</Text>
                <Text style={styles.salaryMeta}>
                  {s.position} · {t('report.fin_share_of_payroll', { pct: Math.round(s.shareOfPayroll * 100) })}
                </Text>
              </View>
              <Text style={styles.salaryValue}>{formatMoney(s.wage)}{t('report.fin_per_week')}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Suggestions */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('report.fin_recommendations')}</Text>
        {report.suggestions.map((s, i) => (
          <View key={i} style={styles.suggestionLine}>
            <Text style={styles.suggestionBullet}>•</Text>
            <Text style={styles.suggestionText}>{s}</Text>
          </View>
        ))}
      </View>
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
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }, emphasis && styles.statValueEmphasis]}>{value}</Text>
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
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }, emphasis && styles.statValueEmphasis]}>
        {sign}{formatMoney(delta)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  subtitle: { color: colors.textMuted, fontSize: fontSize.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  budgetAmount: {
    color: colors.success,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  statValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  statValueEmphasis: {
    fontSize: fontSize.lg,
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
    fontSize: fontSize.md,
    marginRight: spacing.xs,
    width: 12,
  },
  suggestionText: {
    color: colors.text,
    fontSize: fontSize.sm,
    flex: 1,
    lineHeight: 20,
  },
  subSection: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  salaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  salaryName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  salaryMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  salaryValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
