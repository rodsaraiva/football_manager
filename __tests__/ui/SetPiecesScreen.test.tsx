import React from 'react';
import { SetPiecesScreen } from '@/screens/tactics/SetPiecesScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('SetPiecesScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<SetPiecesScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('expõe os seletores de cobrador com testID estável', async () => {
    const r = await renderWithRealDb(<SetPiecesScreen />);
    expect(r.container.querySelector('[data-testid="setpieces-selector-penalty"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="setpieces-selector-corner"]')).toBeTruthy();
    r.unmount();
  });

  it('contém o texto introdutório i18n', async () => {
    const r = await renderWithRealDb(<SetPiecesScreen />);
    expect(collectText(r).includes(translate('pt', 'setpieces.intro'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<SetPiecesScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
