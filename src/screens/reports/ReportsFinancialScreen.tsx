import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getClubById } from '@/database/queries/clubs';
import { getFinancesBySeason } from '@/database/queries/finances';
import { getPlayersByClub } from '@/database/queries/players';
import { buildFinancialReport, FinancialReport } from '@/engine/reports/financial-report';
import { RootStackParamList } from '@/navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_LABELS: Record<string, string> = {
  ticket: 'Bilheteria',
  tv: 'TV',
  sponsor: 'Patrocínio',
  transfer_in: 'Vendas',
  transfer_out: 'Compras',
  wages: 'Salários',
  maintenance: 'Manutenção',
  bonus: 'Bônus',
  upgrade: 'Melhorias',
};
const labelFor = (type: string) => CATEGORY_LABELS[type] ?? type;

function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function ReportsFinancialScreen() {
  const navigation = useNavigation<NavProp>();
  const { playerClubId, season, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<FinancialReport | null>(null);

  const load = React.useCallback(async () => {
    if (!dbHandle || !playerClubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const club = await getClubById(dbHandle, playerClubId);
      if (!club) return;

      const entries = await getFinancesBySeason(dbHandle, playerClubId, season);
      const prevEntries = season > 1
        ? await getFinancesBySeason(dbHandle, playerClubId, season - 1)
        : [];
      const squad = await getPlayersByClub(dbHandle, playerClubId);
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
  }, [dbHandle, playerClubId, season, week]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.subtitle}>Sem dados financeiros ainda.</Text>
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Budget highlight */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>CAIXA ATUAL</Text>
        <Text style={styles.budgetAmount}>{formatMoney(report.budget)}</Text>
      </View>

      {/* Season summary */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>TEMPORADA</Text>
        <StatRow label="Receita" value={formatMoney(report.seasonIncome)} color={colors.success} />
        <StatRow label="Despesa" value={formatMoney(-report.seasonExpenses)} color={colors.danger} />
        <View style={styles.divider} />
        <StatRow label="Saldo" value={formatMoney(report.seasonNet)} color={netColor} emphasis />
      </View>

      {/* Transfer balance */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>TRANSFERÊNCIAS</Text>
        <StatRow
          label="Saldo de transferências"
          value={formatMoney(report.transferBalance)}
          color={tbColor}
          emphasis
        />
      </View>

      {/* Payroll */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>FOLHA SALARIAL</Text>
        <StatRow label="Folha semanal" value={`${formatMoney(report.weeklyPayroll)}/sem`} color={colors.text} />
        <StatRow label="Orçamento" value={`${formatMoney(report.wageBudget)}/sem`} color={colors.textSecondary} />
        <View style={styles.divider} />
        <StatRow
          label="Uso do orçamento"
          value={`${Math.round(report.payrollRatio * 100)}%`}
          color={payrollColor}
          emphasis
        />
      </View>

      {/* Projection */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>PROJEÇÃO</Text>
        <StatRow
          label="Caixa em 10 semanas"
          value={formatMoney(report.projectedBudgetIn10Weeks)}
          color={report.projectedBudgetIn10Weeks >= report.budget ? colors.success : colors.warning}
        />
      </View>

      {/* Category breakdown */}
      {(report.breakdown.income.length > 0 || report.breakdown.expenses.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>POR CATEGORIA</Text>
          {report.breakdown.income.length > 0 && (
            <>
              <Text style={styles.subSection}>Receitas</Text>
              {report.breakdown.income.map((b) => (
                <StatRow
                  key={`in-${b.type}`}
                  label={labelFor(b.type)}
                  value={formatMoney(b.total)}
                  color={colors.success}
                />
              ))}
            </>
          )}
          {report.breakdown.expenses.length > 0 && (
            <>
              <Text style={[styles.subSection, { marginTop: 8 }]}>Despesas</Text>
              {report.breakdown.expenses.map((b) => (
                <StatRow
                  key={`out-${b.type}`}
                  label={labelFor(b.type)}
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
          <Text style={styles.cardLabel}>VS. TEMPORADA ANTERIOR</Text>
          <DeltaRow label="Receita" delta={report.previousSeason.incomeDelta} positiveIsGood />
          <DeltaRow label="Despesa" delta={report.previousSeason.expensesDelta} positiveIsGood={false} />
          <View style={styles.divider} />
          <DeltaRow label="Saldo" delta={report.previousSeason.netDelta} positiveIsGood emphasis />
        </View>
      )}

      {/* Top salaries */}
      {report.topSalaries.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>MAIORES SALÁRIOS</Text>
          {report.topSalaries.map((s) => (
            <Pressable
              key={s.playerId}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: s.playerId })}
              style={({ pressed }) => [styles.salaryRow, pressed && { opacity: 0.6 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.salaryName}>{s.name}</Text>
                <Text style={styles.salaryMeta}>
                  {s.position} · {Math.round(s.shareOfPayroll * 100)}% da folha
                </Text>
              </View>
              <Text style={styles.salaryValue}>{formatMoney(s.wage)}/sem</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Suggestions */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>RECOMENDAÇÕES</Text>
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
    borderRadius: 12,
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
    paddingVertical: 4,
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
    paddingVertical: 4,
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
    marginBottom: 4,
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
    marginTop: 2,
  },
  salaryValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
