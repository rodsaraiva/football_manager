import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle, seedTestDb, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { processPendingOffers } from '@/engine/transfer/offer-processor';

const S = TEST_SAVE_ID;

describe('afford gate on AI-accepts-human-bid', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let buyerClub: number; // poor buyer
  let sellerClub: number; // AI seller
  let playerId: number;

  beforeEach(() => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    const clubs = rawDb.prepare('SELECT id FROM clubs LIMIT 2').all() as { id: number }[];
    buyerClub = clubs[0].id;
    sellerClub = clubs[1].id;
    const player = rawDb
      .prepare('SELECT id, position FROM players WHERE club_id = ? LIMIT 1')
      .get(sellerClub) as { id: number; position: string };
    playerId = player.id;
    // Easy accept: low market value + a same-position teammate (replacement exists)
    // + a fee well above value, so evaluateOffer returns 'accept'.
    rawDb.prepare('UPDATE players SET market_value = 1000000 WHERE id = ?').run(playerId);
    const teammate = rawDb
      .prepare('SELECT id FROM players WHERE club_id = ? AND id != ? LIMIT 1')
      .get(sellerClub, playerId) as { id: number };
    rawDb.prepare('UPDATE players SET position = ? WHERE id = ?').run(player.position, teammate.id);
    // Poor buyer: 50k budget, bids 2,000,000.
    rawDb.prepare('UPDATE clubs SET budget = 50000 WHERE id = ?').run(buyerClub);
    rawDb
      .prepare(
        `INSERT INTO transfer_offers (id, save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type, loan_end)
         VALUES (1, ?, ?, ?, ?, 2000000, 5000, 'pending', 'transfer', NULL)`,
      )
      .run(S, playerId, buyerClub, sellerClub);
  });
  afterEach(() => rawDb.close());

  it('rejects the offer and moves no money/player when the buyer cannot afford the fee', async () => {
    // playerClubId = 999999 → neither buyer nor seller is the user, so the AI processes it.
    await processPendingOffers(db, S, 2025, 10, 999999);

    const offer = rawDb.prepare('SELECT status FROM transfer_offers WHERE id = 1').get() as { status: string };
    expect(offer.status).toBe('rejected');

    const player = rawDb.prepare('SELECT club_id FROM players WHERE id = ?').get(playerId) as { club_id: number };
    expect(player.club_id).toBe(sellerClub); // did not move

    const buyer = rawDb.prepare('SELECT budget FROM clubs WHERE id = ?').get(buyerClub) as { budget: number };
    expect(buyer.budget).toBe(50000); // unchanged
  });
});
