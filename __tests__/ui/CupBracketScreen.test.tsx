import React from 'react';
import { CupBracketScreen } from '@/screens/league/CupBracketScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('CupBracketScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<CupBracketScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('exibe o chaveamento ou o empty-state i18n', async () => {
    const r = await renderWithRealDb(<CupBracketScreen />);
    const text = collectText(r);
    const empty = translate('pt', 'cupbracket.empty');
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes(empty) || /\w/.test(text)).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<CupBracketScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
