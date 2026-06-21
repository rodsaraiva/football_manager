import React from 'react';
import { TransferMarketScreen } from '@/screens/club/transfers/TransferMarketScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('TransferMarketScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<TransferMarketScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('contém ao menos um texto i18n esperado da tela', async () => {
    const r = await renderWithRealDb(<TransferMarketScreen />);
    const text = collectText(r);
    // 'transfer.position_label' é renderizado incondicionalmente no header da tela.
    const expected = translate('pt', 'transfer.position_label');
    expect(text.length).toBeGreaterThan(0);
    // header i18n sempre presente; OU valores de mercado ($..) quando a lista popula.
    expect(text.includes(expected) || /\$/.test(text)).toBe(true);
    r.unmount();
  });

  it('expõe testID/accessibilityLabel estáveis no filtro (queries de acessibilidade)', async () => {
    const r = await renderWithRealDb(<TransferMarketScreen />);
    const filter = r.container.querySelector('[data-testid="transfer-position-filter"]');
    expect(filter).toBeTruthy();
    expect(filter?.getAttribute('aria-label')).toBe(translate('pt', 'transfer.position_label'));
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<TransferMarketScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
