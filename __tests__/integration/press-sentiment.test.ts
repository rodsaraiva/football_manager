import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { applyPressSentiment } from '@/engine/press/apply-press-sentiment';
import { getMediaSentiment } from '@/database/queries/save';

it('coletiva confiante após vitória sobe o sentimento', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const next = await applyPressSentiment(db, TEST_SAVE_ID, 80 /* rep global */, 'confident', 'win');
  expect(next).toBeGreaterThan(0);
  expect(await getMediaSentiment(db, TEST_SAVE_ID)).toBe(next);
});

it('coletiva confiante após derrota desce o sentimento', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const next = await applyPressSentiment(db, TEST_SAVE_ID, 80, 'confident', 'loss');
  expect(next).toBeLessThan(0);
});
