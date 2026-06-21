import React from 'react';
import { MatchResultScreen } from '@/screens/home/MatchResultScreen';
import { seedAndStartGame, renderWithRealDb } from './helpers';
import Database from 'better-sqlite3';

describe('MatchResultScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais (sem resultado pendente)', async () => {
    const r = await renderWithRealDb(<MatchResultScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<MatchResultScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
