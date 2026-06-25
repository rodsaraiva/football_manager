import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../database/test-helpers';
import { generateClubYouth } from '@/engine/season/end-of-season-ops';
import { derivePersonality, toPersonalityScale } from '@/engine/morale/personality';
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

  it('C5: intake deriva personalidade dos atributos (não fica default cego)', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const club = raw.prepare('SELECT id FROM clubs WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number };
    const ids = await generateClubYouth(db, TEST_SAVE_ID, club.id, 2, new SeededRng(7));
    const rows = raw.prepare(
      `SELECT p.id AS id, p.personality AS personality, a.leadership AS leadership, a.composure AS composure, a.aggression AS aggression, a.decisions AS decisions
         FROM players p JOIN player_attributes a ON a.player_id=p.id AND a.save_id=p.save_id
        WHERE p.save_id=? AND p.id IN (${ids.map(() => '?').join(',')})`,
    ).all(TEST_SAVE_ID, ...ids) as Array<{ id: number; personality: string; leadership: number; composure: number; aggression: number; decisions: number }>;
    expect(rows.length).toBe(ids.length);
    for (const r of rows) {
      const expected = derivePersonality(
        toPersonalityScale({ leadership: r.leadership, composure: r.composure, aggression: r.aggression, decisions: r.decisions }),
        r.id,
      );
      expect(r.personality).toBe(expected);
    }
    raw.close();
  });
});
