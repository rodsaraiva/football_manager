import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import {
  processPendingOffers,
  acceptCounterOffer,
  acceptIncomingOffer,
  rejectIncomingOffer,
  counterIncomingOffer,
  executeAcceptedTransfer,
} from '@/engine/transfer/offer-processor';
import { createOffer, getOfferById, getOffersByOfferingClub } from '@/database/queries/transfers';

function seedMinimal(db: import('better-sqlite3').Database): void {
  db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)').run(
    1,
    'X',
    'XX',
    'Europe',
  );
  db.prepare(
    `INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 'L', 1, 1, 2, 0, 0);
  db.prepare(
    `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
      primary_color, secondary_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(10, 'Buyer FC', 'BUY', 1, 1, 70, 100_000_000, 1_000_000, 'S1', 20000, 3, 3, 3, '#1', '#2');
  db.prepare(
    `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
      primary_color, secondary_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(20, 'Seller FC', 'SEL', 1, 1, 60, 50_000_000, 500_000, 'S2', 15000, 3, 3, 3, '#1', '#2');
}

function insertPlayer(
  db: import('better-sqlite3').Database,
  params: {
    id: number;
    name?: string;
    position?: string;
    clubId: number | null;
    marketValue: number;
    wage?: number;
    age?: number;
    contractEnd?: number;
    isFreeAgent?: boolean;
  },
): void {
  const {
    id,
    name = `Player ${id}`,
    position = 'ST',
    clubId,
    marketValue,
    wage = 20_000,
    age = 26,
    contractEnd = 3,
    isFreeAgent = false,
  } = params;
  db.prepare(
    `INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage,
      contract_end, market_value, base_potential, effective_potential, morale, fitness,
      injury_weeks_left, is_free_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    name,
    'X',
    age,
    position,
    null,
    clubId,
    wage,
    contractEnd,
    marketValue,
    75,
    75,
    70,
    90,
    0,
    isFreeAgent ? 1 : 0,
  );
}

describe('offer-processor', () => {
  describe('processPendingOffers', () => {
    it('accepts an offer that meets/exceeds market value when club has a replacement', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      // Two STs on seller → clubHasReplacement = true
      insertPlayer(db, { id: 1, clubId: 20, marketValue: 10_000_000, position: 'ST' });
      insertPlayer(db, { id: 2, clubId: 20, marketValue: 8_000_000, position: 'ST' });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 10,
        sellingClubId: 20,
        feeOffered: 11_000_000,
        wageOffered: 30_000,
      });

      await processPendingOffers(h, 1, 5);

      const offers = await getOffersByOfferingClub(h, 10);
      expect(offers[0].status).toBe('accepted');

      // Player should now belong to buyer
      const player = db.prepare('SELECT club_id, wage, is_free_agent FROM players WHERE id = 1').get() as {
        club_id: number;
        wage: number;
        is_free_agent: number;
      };
      expect(player.club_id).toBe(10);
      expect(player.wage).toBe(30_000);
      expect(player.is_free_agent).toBe(0);

      // Budgets adjusted
      const buyer = db.prepare('SELECT budget FROM clubs WHERE id = 10').get() as { budget: number };
      const seller = db.prepare('SELECT budget FROM clubs WHERE id = 20').get() as { budget: number };
      expect(buyer.budget).toBe(100_000_000 - 11_000_000);
      expect(seller.budget).toBe(50_000_000 + 11_000_000);

      // Transfer record created
      const tr = db.prepare('SELECT * FROM transfers').all();
      expect(tr).toHaveLength(1);
    });

    it('counters a low but reasonable offer', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      // Only one ST → starter, no replacement
      insertPlayer(db, { id: 1, clubId: 20, marketValue: 10_000_000, position: 'ST' });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 10,
        sellingClubId: 20,
        feeOffered: 8_500_000, // 85% of market
        wageOffered: 30_000,
      });

      await processPendingOffers(h, 1, 5);

      const offer = await getOfferById(h, 1);
      expect(offer!.status).toBe('countered');
      // Counter should be ~110% of market value
      expect(offer!.feeOffered).toBeGreaterThan(10_000_000);

      // Player did NOT move
      const player = db.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
      expect(player.club_id).toBe(20);
    });

    it('rejects a lowball bid for a starter with no replacement', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      insertPlayer(db, { id: 1, clubId: 20, marketValue: 10_000_000, position: 'ST' });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 10,
        sellingClubId: 20,
        feeOffered: 5_000_000, // 50% of market
        wageOffered: 30_000,
      });

      await processPendingOffers(h, 1, 5);

      const offer = await getOfferById(h, 1);
      expect(offer!.status).toBe('rejected');
    });

    it('rejects offers for free agents (wrong flow)', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      insertPlayer(db, { id: 1, clubId: null, marketValue: 5_000_000, isFreeAgent: true });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 10,
        sellingClubId: 20, // irrelevant here
        feeOffered: 5_000_000,
        wageOffered: 20_000,
      });

      await processPendingOffers(h, 1, 5);
      const offer = await getOfferById(h, 1);
      expect(offer!.status).toBe('rejected');
    });
  });

  describe('acceptCounterOffer', () => {
    it('executes the counter-offer and moves player + money', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      insertPlayer(db, { id: 1, clubId: 20, marketValue: 10_000_000, position: 'ST' });

      // Create offer and process it → will become 'countered'
      await createOffer(h, {
        playerId: 1,
        offeringClubId: 10,
        sellingClubId: 20,
        feeOffered: 8_500_000,
        wageOffered: 30_000,
      });
      await processPendingOffers(h, 1, 5);

      const result = await acceptCounterOffer(h, 1, 1, 6);
      expect(result.success).toBe(true);

      const player = db.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
      expect(player.club_id).toBe(10);
    });

    it('fails when buyer lacks budget to meet counter', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      insertPlayer(db, { id: 1, clubId: 20, marketValue: 10_000_000, position: 'ST' });

      // Submit 85% offer → will be countered at 11M
      await createOffer(h, {
        playerId: 1,
        offeringClubId: 10,
        sellingClubId: 20,
        feeOffered: 8_500_000,
        wageOffered: 30_000,
      });
      await processPendingOffers(h, 1, 5);

      // Reduce buyer budget below counter amount
      db.prepare('UPDATE clubs SET budget = 9000000 WHERE id = 10').run();

      const result = await acceptCounterOffer(h, 1, 1, 6);
      expect(result.success).toBe(false);
      expect(result.reason).toMatch(/budget/i);
    });
  });

  describe('incoming offers (user is seller)', () => {
    it('skips offers where user is the seller in processPendingOffers', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      // User is club 10; a rival (club 20) bids for user's player
      insertPlayer(db, { id: 1, clubId: 10, marketValue: 10_000_000, position: 'ST' });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 20,
        sellingClubId: 10,
        feeOffered: 12_000_000,
        wageOffered: 30_000,
      });

      // Process with user as club 10 — should NOT auto-resolve
      await processPendingOffers(h, 1, 5, 10);

      const offer = await getOfferById(h, 1);
      expect(offer!.status).toBe('pending');
    });

    it('acceptIncomingOffer executes the sale immediately', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      insertPlayer(db, { id: 1, clubId: 10, marketValue: 10_000_000, position: 'ST' });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 20,
        sellingClubId: 10,
        feeOffered: 12_000_000,
        wageOffered: 30_000,
      });

      const res = await acceptIncomingOffer(h, 1, 1, 5);
      expect(res.success).toBe(true);

      const player = db.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
      expect(player.club_id).toBe(20);
    });

    it('rejectIncomingOffer marks as rejected', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      insertPlayer(db, { id: 1, clubId: 10, marketValue: 10_000_000, position: 'ST' });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 20,
        sellingClubId: 10,
        feeOffered: 8_000_000,
        wageOffered: 30_000,
      });

      await rejectIncomingOffer(h, 1, 5);
      const offer = await getOfferById(h, 1);
      expect(offer!.status).toBe('rejected');
    });

    it('counter + buyer re-evaluation closes the deal when price is reasonable', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      insertPlayer(db, { id: 1, clubId: 10, marketValue: 10_000_000, position: 'ST' });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 20,
        sellingClubId: 10,
        feeOffered: 9_000_000,
        wageOffered: 30_000,
      });

      // User counters at 12M (120% of market — within 140% threshold)
      await counterIncomingOffer(h, 1, 12_000_000);

      // Buyer has 50M budget so can afford. Re-evaluate.
      await processPendingOffers(h, 1, 6, 10);

      const player = db.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
      expect(player.club_id).toBe(20);
    });

    it('counter is rejected when asking price is too high', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      insertPlayer(db, { id: 1, clubId: 10, marketValue: 10_000_000, position: 'ST' });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 20,
        sellingClubId: 10,
        feeOffered: 9_000_000,
        wageOffered: 30_000,
      });

      // User counters at 20M (200% of market — over threshold)
      await counterIncomingOffer(h, 1, 20_000_000);

      await processPendingOffers(h, 1, 6, 10);

      const offer = await getOfferById(h, 1);
      expect(offer!.status).toBe('rejected');

      const player = db.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
      expect(player.club_id).toBe(10); // unchanged
    });
  });

  describe('executeAcceptedTransfer', () => {
    it('creates a transfers row and finance entries', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seedMinimal(db);
      insertPlayer(db, { id: 1, clubId: 20, marketValue: 10_000_000 });

      await createOffer(h, {
        playerId: 1,
        offeringClubId: 10,
        sellingClubId: 20,
        feeOffered: 10_000_000,
        wageOffered: 30_000,
      });

      await executeAcceptedTransfer(h, {
        offerId: 1,
        playerId: 1,
        fromClubId: 20,
        toClubId: 10,
        fee: 10_000_000,
        wageOffered: 30_000,
        season: 1,
        week: 5,
      });

      const transfers = db.prepare('SELECT * FROM transfers').all();
      expect(transfers).toHaveLength(1);

      const finances = db.prepare('SELECT * FROM club_finances').all() as Array<{
        club_id: number;
        type: string;
        amount: number;
      }>;
      const buyerEntry = finances.find((f) => f.club_id === 10);
      const sellerEntry = finances.find((f) => f.club_id === 20);
      expect(buyerEntry?.type).toBe('transfer_out');
      expect(buyerEntry?.amount).toBe(-10_000_000);
      expect(sellerEntry?.type).toBe('transfer_in');
      expect(sellerEntry?.amount).toBe(10_000_000);
    });
  });
});
