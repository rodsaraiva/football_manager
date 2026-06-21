import React from 'react';
import { StandingsScreen } from '@/screens/league/StandingsScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('StandingsScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<StandingsScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('exibe a tabela ou o empty-state i18n', async () => {
    const r = await renderWithRealDb(<StandingsScreen />);
    const text = collectText(r);
    // Seed sem jogos disputados → empty-state; com tabela populada → linhas (pts/jogos).
    const empty = translate('pt', 'standings.empty_title');
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes(empty) || /\d/.test(text)).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<StandingsScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
