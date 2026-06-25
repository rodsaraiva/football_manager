import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { getMediaSentiment, setMediaSentiment } from '@/database/queries/save';

it('default 0; set/get round-trip', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  expect(await getMediaSentiment(db, TEST_SAVE_ID)).toBe(0);
  await setMediaSentiment(db, TEST_SAVE_ID, 42);
  expect(await getMediaSentiment(db, TEST_SAVE_ID)).toBe(42);
});

it('clamp em ±100', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  await setMediaSentiment(db, TEST_SAVE_ID, 250);
  expect(await getMediaSentiment(db, TEST_SAVE_ID)).toBe(100);
  await setMediaSentiment(db, TEST_SAVE_ID, -250);
  expect(await getMediaSentiment(db, TEST_SAVE_ID)).toBe(-100);
});

it('SCHEMA_SQL declara save_games.media_sentiment default 0', () => {
  const db = createTestDb();
  const col = (db.prepare('PRAGMA table_info(save_games)').all() as Array<{ name: string; dflt_value: string | null }>).find((c) => c.name === 'media_sentiment');
  expect(col).toBeDefined();
  expect(col!.dflt_value).toBe('0');
});
