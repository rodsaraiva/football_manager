import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { playFriendly } from '@/engine/preseason/preseason-runner';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';

it('amistoso muda moral E afiação dos titulares; suplentes inalterados', async () => {
  const raw = createTestDb();
  seedTestDb(raw);
  const db = createTestDbHandle(raw);
  const clubId = (raw.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(TEST_SAVE_ID) as { c: number }).c;
  const oppId = (raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, clubId) as { id: number }).id;
  raw.prepare("INSERT INTO friendlies (id, save_id, season, home_club_id, away_club_id, played) VALUES (900, ?, 1, ?, ?, 0)").run(TEST_SAVE_ID, clubId, oppId);
  // Pré-condição realista: enferrujados na pré-temporada — amistosos reconstroem a afiação.
  raw.prepare('UPDATE players SET match_sharpness = 60 WHERE save_id = ? AND club_id = ?').run(TEST_SAVE_ID, clubId);

  const before = await getPlayersByClub(db, TEST_SAVE_ID, clubId);
  await playFriendly({ dbHandle: db, saveId: TEST_SAVE_ID, season: 1, friendlyId: 900, playerClubId: clubId, rng: new SeededRng(7) });
  const after = await getPlayersByClub(db, TEST_SAVE_ID, clubId);

  // Titulares (participantes) reconstroem afiação acima de 60; reservas ficam em 60.
  const gained = raw.prepare('SELECT match_sharpness AS s FROM players WHERE save_id = ? AND club_id = ? AND match_sharpness > 60').all(TEST_SAVE_ID, clubId) as Array<{ s: number }>;
  const rested = raw.prepare('SELECT match_sharpness AS s FROM players WHERE save_id = ? AND club_id = ? AND match_sharpness = 60').all(TEST_SAVE_ID, clubId) as Array<{ s: number }>;
  expect(gained.length).toBeGreaterThan(0);
  expect(rested.length).toBeGreaterThan(0);
  // Afiação dos titulares = 60 + 8 (afiação fixa por jogo disputado).
  expect(gained.every((g) => g.s === 68)).toBe(true);
});

it('determinístico: mesma seed → mesmo estado final', async () => {
  const run = async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const clubId = (raw.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(TEST_SAVE_ID) as { c: number }).c;
    const oppId = (raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, clubId) as { id: number }).id;
    raw.prepare("INSERT INTO friendlies (id, save_id, season, home_club_id, away_club_id, played) VALUES (901, ?, 1, ?, ?, 0)").run(TEST_SAVE_ID, clubId, oppId);
    await playFriendly({ dbHandle: db, saveId: TEST_SAVE_ID, season: 1, friendlyId: 901, playerClubId: clubId, rng: new SeededRng(11) });
    return raw.prepare('SELECT id, morale, fitness, match_sharpness FROM players WHERE save_id = ? AND club_id = ? ORDER BY id').all(TEST_SAVE_ID, clubId);
  };
  expect(await run()).toEqual(await run());
});
