import React from 'react';
import { TacticsScreen } from '@/screens/tactics/TacticsScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('TacticsScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<TacticsScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('expõe Chips de formação do kit com testID estável', async () => {
    const r = await renderWithRealDb(<TacticsScreen />);
    expect(r.container.querySelector('[data-testid="tactics-formation-4-4-2"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="tactics-setpieces-link"]')).toBeTruthy();
    r.unmount();
  });

  it('contém um rótulo i18n da tela', async () => {
    const r = await renderWithRealDb(<TacticsScreen />);
    expect(collectText(r).includes(translate('pt', 'tactics.formation_label'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<TacticsScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
