import React from 'react';
import { CalendarScreen } from '@/screens/home/CalendarScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('CalendarScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<CalendarScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('contém o header i18n da temporada', async () => {
    const r = await renderWithRealDb(<CalendarScreen />);
    const text = collectText(r);
    // header_title é renderizado incondicionalmente no Card de cabeçalho.
    expect(text.includes(translate('pt', 'calendar.header_title', { season: 1 }))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<CalendarScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
