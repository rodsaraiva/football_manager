import React from 'react';
import { MatchResultScreen } from '@/screens/home/MatchResultScreen';
import { seedAndStartGame, renderWithRealDb } from './helpers';
import { useGameStore } from '@/store/game-store';
import { useSettingsStore, setShow2D } from '@/store/settings-store';
import { addMatchEvent, getMatchEvents } from '@/database/queries/fixtures';
import { getSetting } from '@/database/queries/settings';
import type { DbHandle } from '@/database/queries/players';
import type { MatchResult } from '@/engine/simulation/match-engine';
import { MatchEvent } from '@/types';
import Database from 'better-sqlite3';

describe('MatchResultScreen smoke', () => {
  let raw: Database.Database;
  beforeEach(async () => { ({ raw } = await seedAndStartGame()); useSettingsStore.setState({ show2D: false }); });
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

const FIXTURE_ID = 4242;

function ev(p: Partial<MatchEvent>): MatchEvent {
  return { fixtureId: FIXTURE_ID, minute: 10, type: 'shot_off_target', playerId: 1, secondaryPlayerId: null, ...p };
}

// Resultado in-memory: carrega fixtureId nos eventos, mas SEM x/y (igual ao real).
const RESULT: MatchResult = {
  homeGoals: 2,
  awayGoals: 1,
  events: [
    ev({ type: 'goal', minute: 12, playerId: 1, xg: 0.4 }),
    ev({ type: 'shot_on_target', minute: 30, playerId: 2, xg: 0.2 }),
    ev({ type: 'goal', minute: 70, playerId: 3, xg: 0.5 }),
  ],
  homeRatings: [],
  awayRatings: [],
  stats: {
    homePossession: 55, awayPossession: 45,
    homeShots: 8, awayShots: 5,
    homeShotsOnTarget: 4, awayShotsOnTarget: 2,
    homeFouls: 10, awayFouls: 12,
    homeCorners: 6, awayCorners: 3,
    homeXG: 1.4, awayXG: 0.7,
  },
  attendance: 30000,
};

describe('MatchResultScreen — 2D opt-in', () => {
  let raw: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    ({ raw, db } = await seedAndStartGame());
    // match_events.fixture_id é FK; este teste foca no render, não no fixture real.
    raw.pragma('foreign_keys = OFF');
    // Persiste a geometria da partida do usuário (só ela tem x/y).
    await addMatchEvent(db, { fixtureId: FIXTURE_ID, minute: 12, type: 'goal', playerId: 1, secondaryPlayerId: null, xg: 0.4, x: 0.9, y: 0.5 });
    await addMatchEvent(db, { fixtureId: FIXTURE_ID, minute: 30, type: 'shot_on_target', playerId: 2, secondaryPlayerId: null, xg: 0.2, x: 0.78, y: 0.42 });
    await addMatchEvent(db, { fixtureId: FIXTURE_ID, minute: 70, type: 'goal', playerId: 3, secondaryPlayerId: null, xg: 0.5, x: 0.12, y: 0.5 });
    useGameStore.setState({ lastMatchResult: RESULT, lastMatchIsHome: true, lastMatchOpponentName: 'Rivais FC' });
    useSettingsStore.setState({ show2D: false });
  });
  afterEach(() => raw.close());

  it('toggle OFF: resumo intacto, sem mapas (snapshot)', async () => {
    const r = await renderWithRealDb(<MatchResultScreen />);
    expect(r.container.querySelector('[data-testid="matchresult-2d-toggle"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="matchresult-2d-maps"]')).toBeNull();
    expect(r.text).toContain('Estatísticas');
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });

  it('toggle ON: renderiza ShotMap + HeatMap a partir da geometria do DB', async () => {
    useSettingsStore.setState({ show2D: true });
    const r = await renderWithRealDb(<MatchResultScreen />);
    expect(r.container.querySelector('[data-testid="matchresult-2d-maps"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="matchresult-shotmap"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="matchresult-heatmap"]')).toBeTruthy();
    r.unmount();
  });

  it('setShow2D persiste a preferência e a geometria está legível', async () => {
    await setShow2D(db, true);
    expect(await getSetting(db, 'show_2d')).toBe('1');
    const rows = await getMatchEvents(db, FIXTURE_ID);
    expect(rows.filter((e) => e.x != null && e.y != null)).toHaveLength(3);
  });
});
