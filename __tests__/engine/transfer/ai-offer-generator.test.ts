import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { generateAiOffersForPlayerClub } from '@/engine/transfer/ai-offer-generator';
import { SeededRng } from '@/engine/rng';
import { getOffersBySellingClub } from '@/database/queries/transfers';

function seed(db: import('better-sqlite3').Database): void {
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

  // User club
  db.prepare(
    `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
      primary_color, secondary_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 'User FC', 'USR', 1, 1, 70, 100_000_000, 1_000_000, 'S', 20000, 3, 3, 3, '#1', '#2');

  // Several rival clubs with big budgets
  for (let i = 2; i <= 8; i++) {
    db.prepare(
      `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
        stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
        primary_color, secondary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(i, `Rival ${i}`, `R${i}`, 1, 1, 75, 200_000_000, 2_000_000, 'S', 20000, 3, 3, 3, '#1', '#2');
  }
}

function insertPlayer(
  db: import('better-sqlite3').Database,
  id: number,
  clubId: number,
  overallValue: number,
): void {
  db.prepare(
    `INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage,
      contract_end, market_value, base_potential, effective_potential, morale, fitness,
      injury_weeks_left, is_free_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `Player ${id}`, 'X', 25, 'ST', null, clubId, 50_000, 3, 15_000_000, 85, 85, 70, 90, 0, 0);

  db.prepare(
    `INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading,
      long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
      pace, stamina, strength, agility, jumping)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue);
}

describe('generateAiOffersForPlayerClub', () => {
  it('creates at least one offer for a high-overall star over many seeds', async () => {
    // Try several seeds until we see an offer — probability per (player, rival) per week is low
    let gotOffer = false;
    for (let seed = 0; seed < 50 && !gotOffer; seed++) {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed_(db);
      insertPlayer(db, 1, 1, 85);

      const rng = new SeededRng(seed);
      await generateAiOffersForPlayerClub(h, 1, rng);

      const offers = await getOffersBySellingClub(h, 1);
      if (offers.length > 0) gotOffer = true;
    }
    expect(gotOffer).toBe(true);
  });

  it('does not duplicate pending offers from the same club', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed_(db);
    insertPlayer(db, 1, 1, 90);

    // Run many times with high-rated player — no matter how many offers are
    // generated, there should never be two active (pending/countered) from
    // the same (player, offering_club) pair.
    for (let i = 0; i < 10; i++) {
      const rng = new SeededRng(i);
      await generateAiOffersForPlayerClub(h, 1, rng);
    }

    const offers = await getOffersBySellingClub(h, 1);
    const seen = new Set<string>();
    for (const o of offers) {
      if (o.status !== 'pending' && o.status !== 'countered') continue;
      const key = `${o.playerId}-${o.offeringClubId}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('skips clubs whose budget is below 80% of the market value', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed_(db);
    // Make all rivals poor
    db.prepare('UPDATE clubs SET budget = 500000 WHERE id != 1').run();
    insertPlayer(db, 1, 1, 85);

    for (let i = 0; i < 20; i++) {
      const rng = new SeededRng(i);
      await generateAiOffersForPlayerClub(h, 1, rng);
    }

    const offers = await getOffersBySellingClub(h, 1);
    expect(offers).toHaveLength(0);
  });
});

// Renamed to avoid clash with imported `seed` helper in other files
function seed_(db: import('better-sqlite3').Database) {
  seed(db);
}
