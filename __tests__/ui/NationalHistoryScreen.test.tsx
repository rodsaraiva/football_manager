import React from 'react';
import { NationalHistoryScreen } from '@/screens/national/NationalHistoryScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText, wrapBetterSqlite } from './helpers';
import { seedNationalTeams, loadNationalTeams } from '@/database/queries/national-teams';
import { recordNationalTitle } from '@/database/queries/national-titles';
import { incrementCaps, addGoals } from '@/database/queries/national-caps';
import { TEST_SAVE_ID } from '../database/test-helpers';
import Database from 'better-sqlite3';

describe('NationalHistoryScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('sem títulos/caps: mostra os vazios i18n', async () => {
    const r = await renderWithRealDb(<NationalHistoryScreen />);
    const text = collectText(r);
    expect(text.includes(translate('pt', 'national.no_titles'))).toBe(true);
    expect(text.includes(translate('pt', 'national.no_leaders'))).toBe(true);
    r.unmount();
  });

  it('com título registrado: mostra a campeã', async () => {
    const db = wrapBetterSqlite(raw);
    await seedNationalTeams(db, TEST_SAVE_ID);
    const teams = await loadNationalTeams(db, TEST_SAVE_ID);
    await recordNationalTitle(db, TEST_SAVE_ID, {
      competitionId: 1,
      season: 1,
      championNationalId: teams[0].id,
      runnerUpNationalId: teams[1].id,
      userManagedWon: true,
    });
    const pid = (raw.prepare('SELECT id FROM players WHERE save_id = 1 LIMIT 1').get() as { id: number }).id;
    await incrementCaps(db, TEST_SAVE_ID, [pid]);
    await addGoals(db, TEST_SAVE_ID, pid, 2);

    const r = await renderWithRealDb(<NationalHistoryScreen />);
    const text = collectText(r);
    expect(text.includes(teams[0].name)).toBe(true);
    expect(text.includes(translate('pt', 'national.you_won'))).toBe(true);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<NationalHistoryScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
