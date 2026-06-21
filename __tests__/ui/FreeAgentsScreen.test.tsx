import React from 'react';
import { FreeAgentsScreen } from '@/screens/club/transfers/FreeAgentsScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('FreeAgentsScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw', async () => {
    const r = await renderWithRealDb(<FreeAgentsScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('contém texto i18n esperado', async () => {
    const r = await renderWithRealDb(<FreeAgentsScreen />);
    const text = collectText(r);
    // 'transfer.position_label' é renderizado incondicionalmente no header da tela.
    const expected = translate('pt', 'transfer.position_label');
    expect(text.length).toBeGreaterThan(0);
    // header i18n presente; OU empty state de agentes livres; OU valores ($..).
    const emptyState = translate('pt', 'transfer.no_free_agents');
    expect(text.includes(expected) || text.includes(emptyState) || /\$/.test(text)).toBe(true);
    r.unmount();
  });

  it('snapshot estável', async () => {
    const r = await renderWithRealDb(<FreeAgentsScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
