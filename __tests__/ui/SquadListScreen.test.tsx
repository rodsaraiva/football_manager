import React from 'react';
import { SquadListScreen } from '@/screens/squad/SquadListScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('SquadListScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<SquadListScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('expõe Chips de filtro do kit com testID estável', async () => {
    const r = await renderWithRealDb(<SquadListScreen />);
    expect(r.container.querySelector('[data-testid="squad-filter-All"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="squad-filter-GK"]')).toBeTruthy();
    r.unmount();
  });

  it('contém ao menos um texto i18n esperado da tela', async () => {
    const r = await renderWithRealDb(<SquadListScreen />);
    const text = collectText(r);
    expect(text.includes(translate('pt', 'transfer.filter_all'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<SquadListScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
