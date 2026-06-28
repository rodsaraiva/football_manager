import React from 'react';
import { PreSeasonScreen } from '@/screens/home/PreSeasonScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import Database from 'better-sqlite3';

describe('PreSeasonScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<PreSeasonScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('contém o título i18n da pré-temporada', async () => {
    const r = await renderWithRealDb(<PreSeasonScreen />);
    const text = collectText(r);
    expect(text.includes(translate('pt', 'preseason.title'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<PreSeasonScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
