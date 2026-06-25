import React from 'react';
import { LoanPortfolioScreen } from '@/screens/club/transfers/LoanPortfolioScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('LoanPortfolioScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<LoanPortfolioScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('sem empréstimos: mostra o vazio i18n', async () => {
    const r = await renderWithRealDb(<LoanPortfolioScreen />);
    expect(collectText(r).includes(translate('pt', 'loan_portfolio.empty'))).toBe(true);
    r.unmount();
  });

  it('com empréstimo na janela: expõe o botão Recall', async () => {
    const parent = (raw.prepare('SELECT player_club_id AS c FROM save_games WHERE id = 1').get() as { c: number }).c;
    const borrower = (raw.prepare('SELECT id FROM clubs WHERE save_id = 1 AND id != ? LIMIT 1').get(parent) as { id: number }).id;
    const pid = (raw.prepare('SELECT id FROM players WHERE save_id = 1 AND club_id = ? LIMIT 1').get(parent) as { id: number }).id;
    raw.prepare('UPDATE players SET club_id = ?, loan_wage = 1000 WHERE save_id = 1 AND id = ?').run(borrower, pid);
    raw.prepare("INSERT INTO transfers (save_id, player_id, from_club_id, to_club_id, type, loan_end, fee, wage_offered, season) VALUES (1, ?, ?, ?, 'loan', 2, 0, 1000, 1)").run(pid, parent, borrower);
    const r = await renderWithRealDb(<LoanPortfolioScreen />);
    expect(r.container.querySelector(`[data-testid="loan-recall-${pid}"]`)).toBeTruthy();
    r.unmount();
  });
});
