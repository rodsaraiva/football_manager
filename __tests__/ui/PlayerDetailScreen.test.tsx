import React from 'react';
import PlayerDetailScreen from '@/screens/squad/PlayerDetailScreen';
import { translate } from '@/i18n';
import { seedAndStartGame, renderWithRealDb, collectText } from './helpers';
import { useGameStore } from '@/store/game-store';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import Database from 'better-sqlite3';
import type { DbHandle } from '@/database/queries/players';

async function loadFirstOwnPlayer(db: DbHandle) {
  const clubId = useGameStore.getState().playerClubId!;
  const saveId = useGameStore.getState().currentSave!.id;
  const base = await getPlayersByClub(db, saveId, clubId);
  const full = await getPlayerById(db, saveId, base[0].id);
  return full!;
}

describe('PlayerDetailScreen smoke', () => {
  let raw: Database.Database;
  let db: DbHandle;
  beforeEach(async () => { ({ raw, db } = await seedAndStartGame()); });
  afterEach(() => { raw.close(); });

  it('renderiza estado not-found sem throw', async () => {
    const r = await renderWithRealDb(<PlayerDetailScreen player={null} onBack={() => {}} />);
    expect(collectText(r).includes(translate('pt', 'playerdetail.not_found'))).toBe(true);
    r.unmount();
  });

  it('renderiza um jogador real com Card hero + botões do kit', async () => {
    const player = await loadFirstOwnPlayer(db);
    const r = await renderWithRealDb(<PlayerDetailScreen player={player} onBack={() => {}} />);
    const text = collectText(r);
    expect(text.includes(player.name)).toBe(true);
    expect(r.container.querySelector('[data-testid="playerdetail-radar"]')).toBeTruthy();
    expect(r.container.querySelector('[data-testid="playerdetail-back"]')).toBeTruthy();
    r.unmount();
  });

  it('snapshot estável (detector de drift)', async () => {
    const player = await loadFirstOwnPlayer(db);
    const r = await renderWithRealDb(<PlayerDetailScreen player={player} onBack={() => {}} />);
    expect(r.html).toMatchSnapshot();
    r.unmount();
  });
});
