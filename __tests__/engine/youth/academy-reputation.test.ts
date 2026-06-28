import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { computeAcademyReputationDelta, applyAcademyReputation } from '@/engine/youth/academy-reputation';

describe('academy-reputation', () => {
  it('delta sobe com produtos da base e cai/estagna sem nada', () => {
    const up = computeAcademyReputationDelta(50, { promotedToFirstTeam: 2, graduatesSoldForProfit: 1, graduateStarterCount: 3 });
    const flat = computeAcademyReputationDelta(50, { promotedToFirstTeam: 0, graduatesSoldForProfit: 0, graduateStarterCount: 0 });
    expect(up).toBeGreaterThan(0);
    expect(flat).toBeLessThanOrEqual(0);
  });

  it('applyAcademyReputation grava clubs.academy_reputation novo + linha única em history', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const club = raw.prepare('SELECT id FROM clubs WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number };
    // dá ao clube 2 jovens promovidos a first nesta temporada
    const pids = raw.prepare('SELECT id FROM players WHERE save_id = ? AND club_id = ? LIMIT 2').all(TEST_SAVE_ID, club.id) as Array<{ id: number }>;
    for (const p of pids) raw.prepare('UPDATE players SET squad_tier = ?, age = ? WHERE save_id = ? AND id = ?').run('first', 20, TEST_SAVE_ID, p.id);
    await applyAcademyReputation(db, TEST_SAVE_ID, 1);
    const hist = raw.prepare('SELECT COUNT(*) AS n FROM academy_reputation_history WHERE save_id = ? AND club_id = ? AND season = 1').get(TEST_SAVE_ID, club.id) as { n: number };
    expect(hist.n).toBe(1);
    const rep = raw.prepare('SELECT academy_reputation FROM clubs WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, club.id) as { academy_reputation: number };
    expect(rep.academy_reputation).toBeGreaterThanOrEqual(1);
    expect(rep.academy_reputation).toBeLessThanOrEqual(100);
    // idempotente por UNIQUE(save,club,season)
    await applyAcademyReputation(db, TEST_SAVE_ID, 1);
    const hist2 = raw.prepare('SELECT COUNT(*) AS n FROM academy_reputation_history WHERE save_id = ? AND club_id = ? AND season = 1').get(TEST_SAVE_ID, club.id) as { n: number };
    expect(hist2.n).toBe(1);
    raw.close();
  });
});
