import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import {
  insertYouthLoan, getActiveYouthLoans, getYouthLoanById,
  promotePlayerTier, getPlayersByClubAndTier, getAcademyReputationRanking,
} from '@/database/queries/youth';

describe('youth queries (SQLite real)', () => {
  it('insertYouthLoan + getActiveYouthLoans + getYouthLoanById', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const player = raw.prepare('SELECT id, club_id FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number; club_id: number };
    const otherClub = raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, player.club_id) as { id: number };
    const id = await insertYouthLoan(db, TEST_SAVE_ID, {
      playerId: player.id, parentClubId: player.club_id, loanClubId: otherClub.id, startSeason: 1, loanEnd: 1,
    });
    const active = await getActiveYouthLoans(db, TEST_SAVE_ID, player.club_id);
    expect(active.some((l) => l.id === id && l.recalled === 0 && l.settled === 0)).toBe(true);
    const byId = await getYouthLoanById(db, TEST_SAVE_ID, id);
    expect(byId?.parentClubId).toBe(player.club_id);
    raw.close();
  });

  it('promotePlayerTier + getPlayersByClubAndTier filtra por tier', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const player = raw.prepare('SELECT id, club_id FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number; club_id: number };
    await promotePlayerTier(db, TEST_SAVE_ID, player.id, 'reserve');
    const reserves = await getPlayersByClubAndTier(db, TEST_SAVE_ID, player.club_id, 'reserve');
    expect(reserves.some((p) => p.id === player.id && p.squadTier === 'reserve')).toBe(true);
    const firsts = await getPlayersByClubAndTier(db, TEST_SAVE_ID, player.club_id, 'first');
    expect(firsts.some((p) => p.id === player.id)).toBe(false);
    raw.close();
  });

  it('getAcademyReputationRanking ordena DESC com rank e tie-break por clubId', async () => {
    const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
    const clubs = raw.prepare('SELECT id, country_id FROM clubs WHERE save_id = ? ORDER BY id LIMIT 3').all(TEST_SAVE_ID) as Array<{ id: number; country_id: number }>;
    raw.prepare('UPDATE clubs SET academy_reputation = ? WHERE save_id = ? AND id = ?').run(90, TEST_SAVE_ID, clubs[0].id);
    raw.prepare('UPDATE clubs SET academy_reputation = ? WHERE save_id = ? AND id = ?').run(90, TEST_SAVE_ID, clubs[1].id);
    raw.prepare('UPDATE clubs SET academy_reputation = ? WHERE save_id = ? AND id = ?').run(40, TEST_SAVE_ID, clubs[2].id);
    const ranking = await getAcademyReputationRanking(db, TEST_SAVE_ID, clubs[0].country_id);
    expect(ranking[0].rank).toBe(1);
    // empate 90/90 → menor clubId primeiro
    const top2 = ranking.filter((r) => r.academyReputation === 90).map((r) => r.clubId);
    expect(top2[0]).toBeLessThan(top2[1]);
    raw.close();
  });
});
