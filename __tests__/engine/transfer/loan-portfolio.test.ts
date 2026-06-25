import { buildLoanPortfolio, LoanedPlayerRow } from '@/engine/transfer/loan-portfolio';

const row = (over: Partial<LoanedPlayerRow> = {}): LoanedPlayerRow => ({
  playerId: 1, name: 'X', loanClubId: 2, loanClubName: 'B', loanEnd: 2,
  appearances: 5, avgRating: 7.1, minutesPlayed: 400, ...over,
});

it('vigente + janela aberta → recallEligible true', () => {
  const [e] = buildLoanPortfolio([row({ loanEnd: 2 })], 1, 3);
  expect(e.recallEligible).toBe(true);
});

it('empréstimo já expirado (loanEnd <= currentSeason) → não elegível', () => {
  const [e] = buildLoanPortfolio([row({ loanEnd: 1 })], 1, 3);
  expect(e.recallEligible).toBe(false);
});

it('fora da janela de transferências → não elegível', () => {
  const [e] = buildLoanPortfolio([row({ loanEnd: 2 })], 1, 15);
  expect(e.recallEligible).toBe(false);
});

it('preserva os campos de stats da linha', () => {
  const [e] = buildLoanPortfolio([row({ avgRating: 6.5, appearances: 9 })], 1, 3);
  expect(e.avgRating).toBe(6.5);
  expect(e.appearances).toBe(9);
});
