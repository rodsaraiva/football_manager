import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import {
  blockClubFromPlayer,
  isClubBlocked,
  prunExpiredBlocks,
  expireStaleOffers,
  incrementOfferRound,
  hasExceededMaxRounds,
  MAX_NEGOTIATION_ROUNDS,
} from '@/engine/transfer/negotiation';
import { createOffer } from '@/database/queries/transfers';

function seed(db: import('better-sqlite3').Database) {
  db.pragma('foreign_keys = OFF');
  db.prepare(
    "INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1,'T',1,1,1,'normal',50,'','')",
  ).run();
  db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)').run(
    1, 'X', 'XX', 'Europe',
  );
  db.prepare(
    `INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 'L', 1, 1, 2, 0, 0);
  for (const id of [1, 2]) {
    db.prepare(
      `INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
        stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
        primary_color, secondary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, 1, `Club ${id}`, `C${id}`, 1, 1, 60, 10_000_000, 500_000, 'S', 20000, 3, 3, 3, '#1', '#2');
  }
  db.prepare(
    `INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
      contract_end, market_value, base_potential, effective_potential, morale, fitness,
      injury_weeks_left, is_free_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 1, 'Star', 'X', 25, 'ST', null, 2, 50_000, 5, 10_000_000, 80, 80, 70, 90, 0, 0);
}

describe('negotiation', () => {
  describe('blocks', () => {
    it('blocks a club from bidding on a player after rejection', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed(db);

      await blockClubFromPlayer(h, 1, 1, 1, 1, 10);

      const blocked = await isClubBlocked(h, 1, 1, 1, 1, 11);
      expect(blocked).toBe(true);
    });

    it('does not affect other club/player pairs', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed(db);

      await blockClubFromPlayer(h, 1, 1, 1, 1, 10);

      expect(await isClubBlocked(h, 1, 1, 2, 1, 11)).toBe(false);
    });

    it('expires after the block duration', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed(db);

      await blockClubFromPlayer(h, 1, 1, 1, 1, 10);

      // Block lasts 4 weeks → week 14+ should be free
      expect(await isClubBlocked(h, 1, 1, 1, 1, 15)).toBe(false);
    });

    it('prunes expired blocks from the table', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed(db);
      await blockClubFromPlayer(h, 1, 1, 1, 1, 10);

      await prunExpiredBlocks(h, 1, 1, 20);

      const count = (db.prepare('SELECT COUNT(*) as c FROM transfer_blocks').get() as { c: number }).c;
      expect(count).toBe(0);
    });
  });

  describe('offer expiration', () => {
    it('expires pending offers older than OFFER_EXPIRATION_WEEKS', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed(db);

      await createOffer(h, 1, {
        playerId: 1,
        offeringClubId: 1,
        sellingClubId: 2,
        feeOffered: 10_000_000,
        wageOffered: 30_000,
        createdSeason: 1,
        createdWeek: 1,
      });

      const n = await expireStaleOffers(h, 1, 1, 5);
      expect(n).toBe(1);

      const offer = db.prepare('SELECT status FROM transfer_offers WHERE id = 1').get() as {
        status: string;
      };
      expect(offer.status).toBe('rejected');
    });

    it('does not expire fresh offers', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed(db);

      await createOffer(h, 1, {
        playerId: 1,
        offeringClubId: 1,
        sellingClubId: 2,
        feeOffered: 10_000_000,
        wageOffered: 30_000,
        createdSeason: 1,
        createdWeek: 5,
      });

      const n = await expireStaleOffers(h, 1, 1, 6);
      expect(n).toBe(0);
    });

    it('ignores offers without creation metadata', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed(db);

      await createOffer(h, 1, {
        playerId: 1,
        offeringClubId: 1,
        sellingClubId: 2,
        feeOffered: 10_000_000,
        wageOffered: 30_000,
        // no createdSeason/Week
      });

      const n = await expireStaleOffers(h, 1, 1, 30);
      expect(n).toBe(0);
    });
  });

  describe('round counting', () => {
    it('increments and detects max rounds', async () => {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed(db);
      await createOffer(h, 1, {
        playerId: 1,
        offeringClubId: 1,
        sellingClubId: 2,
        feeOffered: 10_000_000,
        wageOffered: 30_000,
      });

      for (let i = 0; i < MAX_NEGOTIATION_ROUNDS - 1; i++) {
        await incrementOfferRound(h, 1, 1);
        expect(await hasExceededMaxRounds(h, 1, 1)).toBe(false);
      }
      await incrementOfferRound(h, 1, 1);
      expect(await hasExceededMaxRounds(h, 1, 1)).toBe(true);
    });
  });
});
