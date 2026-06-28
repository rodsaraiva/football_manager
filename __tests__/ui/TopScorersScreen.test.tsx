import React from 'react';
import { TopScorersScreen } from '@/screens/league/TopScorersScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('TopScorersScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<TopScorersScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('exibe artilheiros ou o empty-state i18n', async () => {
    const r = await renderWithRealDb(<TopScorersScreen />);
    const text = collectText(r);
    const empty = translate('pt', 'topscorers.empty');
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes(empty) || /\d/.test(text)).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<TopScorersScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
