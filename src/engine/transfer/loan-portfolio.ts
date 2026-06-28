export interface LoanedPlayerRow {
  playerId: number;
  name: string;
  loanClubId: number;
  loanClubName: string;
  loanEnd: number;
  appearances: number;
  avgRating: number;
  minutesPlayed: number;
}

export interface LoanPortfolioEntry extends LoanedPlayerRow {
  recallEligible: boolean;
}

/** Mesma janela do game-loop: semanas 1–6 e 23–26. */
function isTransferWindow(week: number): boolean {
  return (week >= 1 && week <= 6) || (week >= 23 && week <= 26);
}

/**
 * Pure: anota cada empréstimo com elegibilidade de recall (janela aberta E ainda
 * na vigência: loanEnd > currentSeason). Sem RNG.
 */
export function buildLoanPortfolio(
  rows: LoanedPlayerRow[], currentSeason: number, currentWeek: number,
): LoanPortfolioEntry[] {
  const windowOpen = isTransferWindow(currentWeek);
  return rows.map((r) => ({
    ...r,
    recallEligible: windowOpen && r.loanEnd > currentSeason,
  }));
}
