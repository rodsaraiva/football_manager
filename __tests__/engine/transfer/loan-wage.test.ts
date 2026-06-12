import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { executeAcceptedTransfer } from '@/engine/transfer/offer-processor';
import { returnExpiredLoans } from '@/engine/transfer/loan-returns';

const S = TEST_SAVE_ID;

describe('loan wage split + restore', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let parentClub: number;
  let borrowClub: number;
  let playerId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const clubs = rawDb.prepare('SELECT id FROM clubs LIMIT 2').all() as { id: number }[];
    parentClub = clubs[0].id;
    borrowClub = clubs[1].id;
    const player = rawDb.prepare('SELECT id FROM players WHERE club_id = ? LIMIT 1').get(parentClub) as { id: number };
    playerId = player.id;
    rawDb.prepare('UPDATE players SET wage = 1000 WHERE id = ?').run(playerId);
    rawDb.prepare(
      `INSERT INTO transfer_offers (id, save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type, loan_end)
       VALUES (1, ?, ?, ?, ?, 0, 400, 'pending', 'loan', 2026)`,
    ).run(S, playerId, borrowClub, parentClub);
  });
  afterEach(() => rawDb.close());

  it('a loan stores loan_wage and preserves the parent wage; return restores it', async () => {
    await executeAcceptedTransfer(db, S, {
      offerId: 1,
      playerId,
      fromClubId: parentClub,
      toClubId: borrowClub,
      fee: 0,
      wageOffered: 400,
      season: 2025,
      week: 10,
      offerType: 'loan',
      loanEnd: 2026,
    });

    let p = rawDb.prepare('SELECT club_id, wage, loan_wage FROM players WHERE id = ?').get(playerId) as
      { club_id: number; wage: number; loan_wage: number | null };
    expect(p.club_id).toBe(borrowClub);
    expect(p.wage).toBe(1000);       // parent wage preserved, NOT overwritten with 400
    expect(p.loan_wage).toBe(400);   // borrowing club pays the loan share

    const returned = await returnExpiredLoans(db, S, 2026);
    expect(returned).toBe(1);

    p = rawDb.prepare('SELECT club_id, wage, loan_wage FROM players WHERE id = ?').get(playerId) as
      { club_id: number; wage: number; loan_wage: number | null };
    expect(p.club_id).toBe(parentClub);
    expect(p.wage).toBe(1000);
    expect(p.loan_wage).toBeNull();
  });

  it('a permanent transfer still overwrites wage and leaves loan_wage NULL', async () => {
    rawDb.prepare("UPDATE transfer_offers SET offer_type = 'transfer', wage_offered = 1200, loan_end = NULL WHERE id = 1").run();
    await executeAcceptedTransfer(db, S, {
      offerId: 1,
      playerId,
      fromClubId: parentClub,
      toClubId: borrowClub,
      fee: 5_000_000,
      wageOffered: 1200,
      season: 2025,
      week: 10,
      offerType: 'transfer',
      loanEnd: null,
    });
    const p = rawDb.prepare('SELECT wage, loan_wage FROM players WHERE id = ?').get(playerId) as
      { wage: number; loan_wage: number | null };
    expect(p.wage).toBe(1200);
    expect(p.loan_wage).toBeNull();
  });
});
