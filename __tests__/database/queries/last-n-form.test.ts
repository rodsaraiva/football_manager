import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { getLastNMatchForm } from '@/database/queries/player-stats';

it('retorna avg_ratings recentes (até N) do jogador na temporada', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const pid = (raw.prepare('SELECT id FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number }).id;
  raw.prepare("INSERT INTO competitions (id, save_id, name, type, format, season) VALUES (1, ?, 'L', 'league', 'round_robin', 1)").run(TEST_SAVE_ID);
  raw.prepare("INSERT INTO competitions (id, save_id, name, type, format, season) VALUES (2, ?, 'C', 'cup', 'knockout', 1)").run(TEST_SAVE_ID);
  raw.prepare('INSERT INTO player_stats (save_id, player_id, season, competition_id, appearances, minutes_played, avg_rating) VALUES (?,?,?,?,?,?,?)').run(TEST_SAVE_ID, pid, 1, 1, 3, 270, 7.5);
  raw.prepare('INSERT INTO player_stats (save_id, player_id, season, competition_id, appearances, minutes_played, avg_rating) VALUES (?,?,?,?,?,?,?)').run(TEST_SAVE_ID, pid, 1, 2, 2, 180, 6.0);
  const form = await getLastNMatchForm(db, TEST_SAVE_ID, pid, 1, 5);
  expect(form.length).toBeGreaterThan(0);
  expect(form).toContain(7.5);
});

it('sem jogos → array vazio', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const pid = (raw.prepare('SELECT id FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number }).id;
  expect(await getLastNMatchForm(db, TEST_SAVE_ID, pid, 1, 5)).toEqual([]);
});
