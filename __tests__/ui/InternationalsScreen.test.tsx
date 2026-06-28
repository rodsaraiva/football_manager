import React from 'react';
import { InternationalsScreen } from '@/screens/national/InternationalsScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText, wrapBetterSqlite } from './helpers';
import { seedNationalTeams, loadNationalTeams, setUserManagedNation } from '@/database/queries/national-teams';
import { TEST_SAVE_ID } from '../database/test-helpers';
import Database from 'better-sqlite3';

describe('InternationalsScreen (hub) smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  async function seedManagedNation() {
    const db = wrapBetterSqlite(raw);
    await seedNationalTeams(db, TEST_SAVE_ID);
    const teams = await loadNationalTeams(db, TEST_SAVE_ID);
    await setUserManagedNation(db, TEST_SAVE_ID, teams[0].countryId);
    return teams[0];
  }

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<InternationalsScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('expõe os 3 pontos de entrada para as telas da seleção', async () => {
    const r = await renderWithRealDb(<InternationalsScreen />);
    expect(r.container.querySelector('[data-testid="national-open-squad"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="national-open-calendar"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="national-open-history"]')).toBeTruthy();
    r.unmount();
  });

  it('com seleção dirigida: mostra o nome da nação', async () => {
    const nation = await seedManagedNation();
    const r = await renderWithRealDb(<InternationalsScreen />);
    expect(collectText(r).includes(nation.name)).toBe(true);
    r.unmount();
  });

  it('sem seleção dirigida: mostra o vazio i18n', async () => {
    const r = await renderWithRealDb(<InternationalsScreen />);
    expect(collectText(r).includes(translate('pt', 'national.no_nation'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<InternationalsScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
