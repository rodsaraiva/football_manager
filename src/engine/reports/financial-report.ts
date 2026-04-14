/**
 * Assistente Financeiro.
 *
 * Aggregates finance entries + club + payroll into a narrative: profit,
 * transfer balance, payroll health, and suggestions.
 */

export interface FinanceEntry {
  type: string;
  amount: number;
}

export interface FinancialInput {
  clubBudget: number;
  clubWageBudget: number; // weekly wage budget
  totalPlayerWages: number; // sum of wages across the active squad
  seasonEntries: FinanceEntry[]; // all club_finances rows of the season
  currentWeek: number;
}

export interface FinancialReport {
  budget: number;
  seasonIncome: number;
  seasonExpenses: number;
  seasonNet: number;
  transferBalance: number; // transfer_in − transfer_out
  weeklyPayroll: number;
  wageBudget: number;
  payrollRatio: number; // payroll / wage budget
  projectedBudgetIn10Weeks: number;
  suggestions: string[];
}

function formatMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function buildFinancialReport(input: FinancialInput): FinancialReport {
  const { clubBudget, clubWageBudget, totalPlayerWages, seasonEntries, currentWeek } = input;

  let income = 0;
  let expenses = 0;
  let transferIn = 0;
  let transferOut = 0;
  for (const e of seasonEntries) {
    if (e.amount > 0) income += e.amount;
    else expenses += Math.abs(e.amount);
    if (e.type === 'transfer_in') transferIn += e.amount;
    if (e.type === 'transfer_out') transferOut += Math.abs(e.amount);
  }

  const net = income - expenses;
  const transferBalance = transferIn - transferOut;

  // Simple projection: extrapolate the season's average weekly net over 10
  // more weeks. If we haven't played any weeks yet, fall back to 0.
  const weeksElapsed = Math.max(1, currentWeek - 1);
  const avgWeeklyNet = net / weeksElapsed;
  const projected = Math.round(clubBudget + avgWeeklyNet * 10);

  const payrollRatio = clubWageBudget > 0 ? totalPlayerWages / clubWageBudget : 0;

  const suggestions: string[] = [];
  if (payrollRatio > 1.1) {
    suggestions.push(
      `A folha salarial (${formatMoney(totalPlayerWages)}/sem) está ${Math.round(payrollRatio * 100)}% do orçamento. Considere vender algum jogador ou renegociar contratos.`,
    );
  } else if (payrollRatio < 0.7) {
    suggestions.push(
      `Folha salarial confortável (${Math.round(payrollRatio * 100)}% do orçamento) — há espaço para contratações.`,
    );
  }

  if (transferBalance > 5_000_000) {
    suggestions.push(
      `Saldo de transferências positivo em ${formatMoney(transferBalance)}. Use para reforçar o elenco.`,
    );
  } else if (transferBalance < -10_000_000) {
    suggestions.push(
      `Gastou ${formatMoney(-transferBalance)} a mais do que arrecadou em transferências. Atenção ao caixa.`,
    );
  }

  if (projected < clubBudget * 0.3 && avgWeeklyNet < 0) {
    suggestions.push(
      `Ao ritmo atual, o caixa pode cair para ${formatMoney(projected)} em 10 semanas. Busque receitas ou corte custos.`,
    );
  }

  if (avgWeeklyNet > 0) {
    suggestions.push(
      `Média de lucro semanal: ${formatMoney(avgWeeklyNet)}. Projeção saudável para o período.`,
    );
  }

  if (suggestions.length === 0) {
    suggestions.push('Situação financeira equilibrada no momento.');
  }

  return {
    budget: clubBudget,
    seasonIncome: income,
    seasonExpenses: expenses,
    seasonNet: net,
    transferBalance,
    weeklyPayroll: totalPlayerWages,
    wageBudget: clubWageBudget,
    payrollRatio,
    projectedBudgetIn10Weeks: projected,
    suggestions,
  };
}
