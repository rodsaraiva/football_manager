import React from 'react';
import { PressConferenceScreen } from '@/screens/match/PressConferenceScreen';
import { seedAndStartGame, renderWithRealDb } from './helpers';
import Database from 'better-sqlite3';

describe('PressConferenceScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais', async () => {
    const r = await renderWithRealDb(<PressConferenceScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<PressConferenceScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
