import React from 'react';
import { NationalCalendarScreen } from '@/screens/national/NationalCalendarScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText, wrapBetterSqlite } from './helpers';
import { seedNationalTeams } from '@/database/queries/national-teams';
import { ensureNationalFixtures } from '@/database/queries/national-fixtures';
import { TEST_SAVE_ID } from '../database/test-helpers';
import Database from 'better-sqlite3';

describe('NationalCalendarScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('sem seleções/fixtures: mostra o vazio i18n', async () => {
    const r = await renderWithRealDb(<NationalCalendarScreen />);
    expect(collectText(r).includes(translate('pt', 'national.calendar_empty'))).toBe(true);
    r.unmount();
  });

  it('com fixtures da temporada: renderiza eliminatórias/tabela', async () => {
    const db = wrapBetterSqlite(raw);
    await seedNationalTeams(db, TEST_SAVE_ID);
    await ensureNationalFixtures(db, TEST_SAVE_ID, 1);
    const r = await renderWithRealDb(<NationalCalendarScreen />);
    const text = collectText(r);
    expect(
      text.includes(translate('pt', 'national.qualifiers')) ||
        text.includes(translate('pt', 'national.standings')),
    ).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const db = wrapBetterSqlite(raw);
    await seedNationalTeams(db, TEST_SAVE_ID);
    await ensureNationalFixtures(db, TEST_SAVE_ID, 1);
    const r = await renderWithRealDb(<NationalCalendarScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
