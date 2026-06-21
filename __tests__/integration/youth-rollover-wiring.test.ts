import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { generateClubYouth } from '@/engine/season/end-of-season-ops';
import { SeededRng } from '@/engine/rng';

describe('intake grava squad_tier=youth', () => {
  it('jovens gerados nascem no tier youth', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const club = raw.prepare('SELECT id FROM clubs WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number };
    const ids = await generateClubYouth(db, TEST_SAVE_ID, club.id, 2, new SeededRng(7));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const tiers = raw.prepare(
      `SELECT squad_tier FROM players WHERE save_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    ).all(TEST_SAVE_ID, ...ids) as Array<{ squad_tier: string }>;
    expect(tiers.every((t) => t.squad_tier === 'youth')).toBe(true);
    raw.close();
  });
});
