import Database from 'better-sqlite3';
import { DbHandle } from '@/database/queries/players';
import { createTestDb } from '../database/test-helpers';
import { processAiTransfers } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';

/**
 * Seed the minimum tables needed for processAiTransfers to run.
 *
 * Creates:
 *  - Two countries (id 1, 2)
 *  - Two clubs (id 100 = buyer, id 200 = seller)
 *  - One player belonging to the seller (id 9001, position ST)
 *
 * The buyer has exactly zero ST players (neededPositions = {'ST'}).
 * The player's market value is well within the buyer's budget.
 * The seller's reputation is not more than buyer rep + 10.
 */
function seedMinimalTransferDb(rawDb: Database.Database): void {
  // Countries
  rawDb
    .prepare('INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)')
    .run(1, 'Country A', 'CA', 'Europe');
  rawDb
    .prepare('INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)')
    .run(2, 'Country B', 'CB', 'Europe');

  // Leagues (required FK)
  rawDb
    .prepare(
      `INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(1, 'League A', 1, 1, 20, 3, 3);

  // Buyer club — reputation 60, budget 100M, only 1 GK (so ST is needed)
  rawDb
    .prepare(
      `INSERT INTO clubs
         (id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
          stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
          primary_color, secondary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(100, 'Buyer FC', 'BUY', 1, 1, 60, 100_000_000, 5_000_000, 'Buyer Stadium', 30000, 3, 3, 3, '#fff', '#000');

  // Seller club — reputation 65 (buyer rep + 5 — within the +10 threshold)
  rawDb
    .prepare(
      `INSERT INTO clubs
         (id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
          stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
          primary_color, secondary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(200, 'Seller FC', 'SEL', 1, 1, 65, 5_000_000, 500_000, 'Seller Stadium', 20000, 2, 2, 2, '#00f', '#fff');

  // One ST at the buyer club — this means ST has count=1 (< 2), so ST is a
  // "needed" position and Alice ST from the seller becomes a valid candidate.
  rawDb
    .prepare(
      `INSERT INTO players
         (id, name, nationality, age, position, secondary_position, club_id, wage,
          contract_end, market_value, base_potential, effective_potential, morale, fitness,
          injury_weeks_left, is_free_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(8001, 'Charlie ST', 'CA', 25, 'ST', null, 100, 2000, 3, 500_000, 65, 65, 70, 80, 0, 0);

  rawDb
    .prepare(
      `INSERT INTO player_attributes
         (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks,
          vision, composure, decisions, positioning, aggression, leadership,
          pace, stamina, strength, agility, jumping)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(8001, 60, 50, 40, 55, 50, 45, 35, 50, 55, 50, 60, 45, 40, 65, 70, 60, 55, 60);

  // The available ST player — belongs to seller, affordable, correct rep
  rawDb
    .prepare(
      `INSERT INTO players
         (id, name, nationality, age, position, secondary_position, club_id, wage,
          contract_end, market_value, base_potential, effective_potential, morale, fitness,
          injury_weeks_left, is_free_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(9001, 'Alice ST', 'CB', 24, 'ST', null, 200, 3000, 3, 2_000_000, 70, 70, 75, 90, 0, 0);

  rawDb
    .prepare(
      `INSERT INTO player_attributes
         (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks,
          vision, composure, decisions, positioning, aggression, leadership,
          pace, stamina, strength, agility, jumping)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(9001, 70, 60, 50, 65, 60, 55, 40, 55, 65, 60, 65, 50, 45, 70, 75, 65, 60, 68);
}

describe('processAiTransfers — finance ledger', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(() => {
    rawDb = createTestDb();
    seedMinimalTransferDb(rawDb);
    db = rawDb as unknown as DbHandle;
  });

  afterEach(() => rawDb.close());

  it('writes transfer_in and transfer_out entries when an AI transfer completes', async () => {
    // The processAiTransfers picks RANDOM() LIMIT 5 clubs, so we call it
    // enough times with a fixed RNG until the transfer fires.
    // Given only 2 clubs in this DB, club 100 will almost always appear.
    // Run up to 20 times across different seeds to get at least one transfer.
    let foundTransferIn = false;
    let foundTransferOut = false;

    for (let seed = 0; seed < 20; seed++) {
      await processAiTransfers(db, 1, 3, new SeededRng(seed));
      const entries = rawDb
        .prepare('SELECT * FROM club_finances')
        .all() as Array<{ club_id: number; type: string; amount: number }>;

      const transferIn = entries.find(e => e.type === 'transfer_in');
      const transferOut = entries.find(e => e.type === 'transfer_out');

      if (transferIn && transferOut) {
        foundTransferIn = true;
        foundTransferOut = true;
        // Validate amounts match (fee is player's market_value = 2_000_000)
        expect(transferIn.amount).toBe(2_000_000);
        expect(transferOut.amount).toBe(-2_000_000);
        // Validate clubs
        expect(transferIn.club_id).toBe(200);  // seller receives
        expect(transferOut.club_id).toBe(100); // buyer pays
        break;
      }

      // Reset after each dry run (player may not have moved yet)
      rawDb.prepare('DELETE FROM club_finances').run();
      rawDb.prepare('UPDATE players SET club_id = 200 WHERE id = 9001').run();
      rawDb.prepare('UPDATE clubs SET budget = 100000000 WHERE id = 100').run();
      rawDb.prepare('UPDATE clubs SET budget = 5000000 WHERE id = 200').run();
    }

    expect(foundTransferIn).toBe(true);
    expect(foundTransferOut).toBe(true);
  });
});
