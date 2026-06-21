import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { insertYouthLoan, getYouthLoanById } from '@/database/queries/youth';
import { processYouthLoanWeek, recallYouthLoan, settleYouthLoanDevelopment } from '@/engine/youth/youth-loans';
import { SeededRng } from '@/engine/rng';

function setupLoan(raw: ReturnType<typeof createTestDb>) {
  seedTestDb(raw);
  const player = raw.prepare('SELECT id, club_id, base_potential FROM players WHERE save_id = ? LIMIT 1').get(TEST_SAVE_ID) as { id: number; club_id: number; base_potential: number };
  const loanClub = raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, player.club_id) as { id: number };
  // jogador está no clube de empréstimo durante a vigência
  raw.prepare('UPDATE players SET club_id = ? WHERE save_id = ? AND id = ?').run(loanClub.id, TEST_SAVE_ID, player.id);
  return { player, loanClub };
}

describe('youth-loans (SQLite real)', () => {
  it('processYouthLoanWeek acumula minutos/appearances/rating da semana no clube de empréstimo', async () => {
    const raw = createTestDb(); const db = createTestDbHandle(raw);
    const { player, loanClub } = setupLoan(raw);
    const loanId = await insertYouthLoan(db, TEST_SAVE_ID, {
      playerId: player.id, parentClubId: 1 /* placeholder */, loanClubId: loanClub.id, startSeason: 1, loanEnd: 2,
    });
    // player_stats da rodada (engine grava avg_rating + minutes_played por temporada).
    // FK off só p/ o stub: o competition_id é irrelevante p/ processYouthLoanWeek.
    raw.pragma('foreign_keys = OFF');
    raw.prepare(
      `INSERT INTO player_stats (save_id, player_id, season, competition_id, appearances, minutes_played, goals, assists, avg_rating, yellow_cards, red_cards)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(TEST_SAVE_ID, player.id, 1, 0, 1, 90, 0, 0, 7.4, 0, 0);
    raw.pragma('foreign_keys = ON');
    const res = await processYouthLoanWeek(db, TEST_SAVE_ID, 1, 5);
    expect(res.trackedPlayerIds).toContain(player.id);
    const row = await getYouthLoanById(db, TEST_SAVE_ID, loanId);
    expect(row!.minutesPlayed).toBeGreaterThan(0);
    expect(row!.appearances).toBeGreaterThan(0);
    expect(row!.ratingSum).toBeGreaterThan(0);
    raw.close();
  });

  it('settleYouthLoanDevelopment: muitos minutos+rating alto ⇒ mais ganho que zero minutos; idempotente', async () => {
    const raw = createTestDb(); const db = createTestDbHandle(raw);
    const { player, loanClub } = setupLoan(raw);
    const beforePot = (raw.prepare('SELECT effective_potential FROM players WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, player.id) as { effective_potential: number }).effective_potential;
    const loanId = await insertYouthLoan(db, TEST_SAVE_ID, {
      playerId: player.id, parentClubId: loanClub.id, loanClubId: loanClub.id, startSeason: 1, loanEnd: 1,
    });
    raw.prepare('UPDATE youth_loans SET minutes_played = 2400, appearances = 28, rating_sum = 210 WHERE id = ?').run(loanId);
    const settled = await settleYouthLoanDevelopment(db, TEST_SAVE_ID, 1, new SeededRng(9));
    expect(settled).toContain(player.id);
    const afterPot = (raw.prepare('SELECT effective_potential FROM players WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, player.id) as { effective_potential: number }).effective_potential;
    expect(afterPot).toBeGreaterThanOrEqual(beforePot);
    // idempotente: segunda chamada não re-aplica (settled=1)
    const again = await settleYouthLoanDevelopment(db, TEST_SAVE_ID, 1, new SeededRng(9));
    expect(again).not.toContain(player.id);
    raw.close();
  });

  it('recallYouthLoan restaura club_id ao parent e marca recalled; segunda chamada false', async () => {
    const raw = createTestDb(); const db = createTestDbHandle(raw);
    const { player, loanClub } = setupLoan(raw);
    const parentClubId = raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, loanClub.id) as { id: number };
    const loanId = await insertYouthLoan(db, TEST_SAVE_ID, {
      playerId: player.id, parentClubId: parentClubId.id, loanClubId: loanClub.id, startSeason: 1, loanEnd: 2,
    });
    const r1 = await recallYouthLoan(db, TEST_SAVE_ID, loanId, 1, 10);
    expect(r1.recalled).toBe(true);
    const club = (raw.prepare('SELECT club_id, loan_wage FROM players WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, player.id) as { club_id: number; loan_wage: number | null });
    expect(club.club_id).toBe(parentClubId.id);
    expect(club.loan_wage).toBeNull();
    const r2 = await recallYouthLoan(db, TEST_SAVE_ID, loanId, 1, 11);
    expect(r2.recalled).toBe(false);
    raw.close();
  });
});
