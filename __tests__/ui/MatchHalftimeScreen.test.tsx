import React from 'react';
import { MatchHalftimeScreen } from '@/screens/home/MatchHalftimeScreen';
import { seedAndStartGame, renderWithRealDb } from './helpers';
import Database from 'better-sqlite3';

describe('MatchHalftimeScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza sem throw com store/DB reais (sem halftime armado)', async () => {
    const r = await renderWithRealDb(<MatchHalftimeScreen />);
    expect(r.container).toBeTruthy();
    expect(r.html.length).toBeGreaterThan(0);
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const r = await renderWithRealDb(<MatchHalftimeScreen />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
