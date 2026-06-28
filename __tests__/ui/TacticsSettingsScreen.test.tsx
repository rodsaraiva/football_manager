import React from 'react';
import { TacticsSettingsScreen } from '@/screens/tactics/TacticsSettingsScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('TacticsSettingsScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<TacticsSettingsScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('expõe Chips de mentalidade e botão de salvar do kit', async () => {
    const r = await renderWithRealDb(<TacticsSettingsScreen />);
    expect(r.container.querySelector('[data-testid="tactics-mentality-balanced"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="tactics-settings-save"]')).toBeTruthy();
    r.unmount();
  });

  it('contém um rótulo i18n da tela', async () => {
    const r = await renderWithRealDb(<TacticsSettingsScreen />);
    expect(collectText(r).includes(translate('pt', 'tactics.label_mentality'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<TacticsSettingsScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
