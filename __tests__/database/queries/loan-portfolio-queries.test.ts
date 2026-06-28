import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../test-helpers';
import { getActiveLoansByParent, recallLoan } from '@/database/queries/transfers';

it('lista emprestados vivos do clube-pai e recall traz de volta', async () => {
  const raw = createTestDb(); seedTestDb(raw); const db = createTestDbHandle(raw);
  const parent = (raw.prepare('SELECT player_club_id AS c FROM save_games WHERE id = ?').get(TEST_SAVE_ID) as { c: number }).c;
  const borrower = (raw.prepare('SELECT id FROM clubs WHERE save_id = ? AND id != ? LIMIT 1').get(TEST_SAVE_ID, parent) as { id: number }).id;
  const pid = (raw.prepare('SELECT id FROM players WHERE save_id = ? AND club_id = ? LIMIT 1').get(TEST_SAVE_ID, parent) as { id: number }).id;

  raw.prepare('UPDATE players SET club_id = ?, loan_wage = 1000 WHERE save_id = ? AND id = ?').run(borrower, TEST_SAVE_ID, pid);
  raw.prepare("INSERT INTO transfers (save_id, player_id, from_club_id, to_club_id, type, loan_end, fee, wage_offered, season) VALUES (?, ?, ?, ?, 'loan', 2, 0, 1000, 1)").run(TEST_SAVE_ID, pid, parent, borrower);

  const loans = await getActiveLoansByParent(db, TEST_SAVE_ID, parent);
  expect(loans.some((l) => l.playerId === pid && l.loanClubId === borrower)).toBe(true);

  await recallLoan(db, TEST_SAVE_ID, pid, parent);
  const after = raw.prepare('SELECT club_id, loan_wage FROM players WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, pid) as { club_id: number; loan_wage: number | null };
  expect(after.club_id).toBe(parent);
  expect(after.loan_wage).toBeNull();
  const stillListed = await getActiveLoansByParent(db, TEST_SAVE_ID, parent);
  expect(stillListed.some((l) => l.playerId === pid)).toBe(false);
});
