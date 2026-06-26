import React from 'react';
import { NationalSquadScreen } from '@/screens/national/NationalSquadScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText, wrapBetterSqlite } from './helpers';
import { seedNationalTeams, loadNationalTeams, setUserManagedNation } from '@/database/queries/national-teams';
import { TEST_SAVE_ID } from '../database/test-helpers';
import Database from 'better-sqlite3';

describe('NationalSquadScreen smoke', () => {
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

  it('sem seleção dirigida: mostra o vazio i18n', async () => {
    const r = await renderWithRealDb(<NationalSquadScreen />);
    expect(collectText(r).includes(translate('pt', 'national.no_nation'))).toBe(true);
    r.unmount();
  });

  it('com seleção dirigida: renderiza o título de convocação', async () => {
    await seedManagedNation();
    const r = await renderWithRealDb(<NationalSquadScreen />);
    expect(r.html.length).toBeGreaterThan(0);
    expect(collectText(r).includes(translate('pt', 'national.squad_title'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    await seedManagedNation();
    const r = await renderWithRealDb(<NationalSquadScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
