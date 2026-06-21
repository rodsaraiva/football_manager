import React from 'react';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('HomeScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<HomeScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('contém texto i18n incondicional do hub', async () => {
    const r = await renderWithRealDb(<HomeScreen />);
    const text = collectText(r);
    // 'home.manager_reputation' e os atalhos são renderizados sempre.
    expect(text.includes(translate('pt', 'home.manager_reputation'))).toBe(true);
    expect(text.includes(translate('pt', 'home.league_table_title'))).toBe(true);
    r.unmount();
  });

  it('expõe testID/accessibilityLabel estáveis no CTA de avançar', async () => {
    const r = await renderWithRealDb(<HomeScreen />);
    const cta = r.container.querySelector('[data-testid="home-advance-week"]');
    expect(cta).toBeTruthy();
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<HomeScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
