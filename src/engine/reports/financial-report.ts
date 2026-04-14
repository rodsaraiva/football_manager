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

export interface TopSalary {
  playerId: number;
  name: string;
  position: string;
  wage: number;
  shareOfPayroll: number; // 0..1
}

export interface FinancialInput {
  clubBudget: number;
  clubWageBudget: number; // weekly wage budget
  totalPlayerWages: number; // sum of wages across the active squad
  seasonEntries: FinanceEntry[]; // all club_finances rows of the season
  /** Optional previous season entries — enables Δ comparison. */
  previousSeasonEntries?: FinanceEntry[];
  /** Optional list of (playerId, name, position, wage) for top salaries. */
  squadWages?: { playerId: number; name: string; position: string; wage: number }[];
  currentWeek: number;
}

export interface CategoryBreakdown {
  income: { type: string; total: number }[];
  expenses: { type: string; total: number }[];
}

export interface SeasonComparison {
  prevIncome: number;
  prevExpenses: number;
  prevNet: number;
  incomeDelta: number;   // current - prev
  expensesDelta: number; // current - prev
  netDelta: number;      // current - prev
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
  breakdown: CategoryBreakdown;
  topSalaries: TopSalary[];
  previousSeason: SeasonComparison | null;
  suggestions: string[];
}

function formatMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function aggregateByCategory(entries: FinanceEntry[]): CategoryBreakdown {
  const incomeMap = new Map<string, number>();
  const expenseMap = new Map<string, number>();
  for (const e of entries) {
    if (e.amount >= 0) {
      incomeMap.set(e.type, (incomeMap.get(e.type) ?? 0) + e.amount);
    } else {
      expenseMap.set(e.type, (expenseMap.get(e.type) ?? 0) + Math.abs(e.amount));
    }
  }
  const income = [...incomeMap.entries()]
    .map(([type, total]) => ({ type, total }))
    .sort((a, b) => b.total - a.total);
  const expenses = [...expenseMap.entries()]
    .map(([type, total]) => ({ type, total }))
    .sort((a, b) => b.total - a.total);
  return { income, expenses };
}

function totalsOf(entries: FinanceEntry[]): { income: number; expenses: number } {
  let income = 0;
  let expenses = 0;
  for (const e of entries) {
    if (e.amount >= 0) income += e.amount;
    else expenses += Math.abs(e.amount);
  }
  return { income, expenses };
}

export function buildFinancialReport(input: FinancialInput): FinancialReport {
  const {
    clubBudget,
    clubWageBudget,
    totalPlayerWages,
    seasonEntries,
    previousSeasonEntries,
    squadWages,
    currentWeek,
  } = input;

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
  const breakdown = aggregateByCategory(seasonEntries);

  let previousSeason: SeasonComparison | null = null;
  if (previousSeasonEntries && previousSeasonEntries.length > 0) {
    const prev = totalsOf(previousSeasonEntries);
    const prevNet = prev.income - prev.expenses;
    previousSeason = {
      prevIncome: prev.income,
      prevExpenses: prev.expenses,
      prevNet,
      incomeDelta: income - prev.income,
      expensesDelta: expenses - prev.expenses,
      netDelta: net - prevNet,
    };
  }

  const topSalaries: TopSalary[] = (squadWages ?? [])
    .slice()
    .sort((a, b) => b.wage - a.wage)
    .slice(0, 5)
    .map((s) => ({
      playerId: s.playerId,
      name: s.name,
      position: s.position,
      wage: s.wage,
      shareOfPayroll: totalPlayerWages > 0 ? s.wage / totalPlayerWages : 0,
    }));

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
    breakdown,
    topSalaries,
    previousSeason,
    suggestions,
  };
}
