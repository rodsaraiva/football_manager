import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { generateAiOffersForPlayerClub } from '@/engine/transfer/ai-offer-generator';
import { SeededRng } from '@/engine/rng';
import { getOffersBySellingClub } from '@/database/queries/transfers';

function seed(db: import('better-sqlite3').Database): void {
  db.pragma('foreign_keys = OFF');
  db.prepare(
    "INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1,'T',1,1,1,'normal',50,'','')",
  ).run();
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
    `INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
      primary_color, secondary_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 1, 'User FC', 'USR', 1, 1, 70, 100_000_000, 1_000_000, 'S', 20000, 3, 3, 3, '#1', '#2');

  // Several rival clubs with big budgets
  for (let i = 2; i <= 8; i++) {
    db.prepare(
      `INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
        stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
        primary_color, secondary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(i, 1, `Rival ${i}`, `R${i}`, 1, 1, 75, 200_000_000, 2_000_000, 'S', 20000, 3, 3, 3, '#1', '#2');
  }
}

function insertPlayer(
  db: import('better-sqlite3').Database,
  id: number,
  clubId: number,
  overallValue: number,
): void {
  db.prepare(
    `INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
      contract_end, market_value, base_potential, effective_potential, morale, fitness,
      injury_weeks_left, is_free_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, 1, `Player ${id}`, 'X', 25, 'ST', null, clubId, 50_000, 3, 15_000_000, 85, 85, 70, 90, 0, 0);

  db.prepare(
    `INSERT INTO player_attributes (player_id, save_id, finishing, passing, crossing, dribbling, heading,
      long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
      pace, stamina, strength, agility, jumping)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, 1, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue);
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
      await generateAiOffersForPlayerClub(h, 1, 1, rng);

      const offers = await getOffersBySellingClub(h, 1, 1);
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
      await generateAiOffersForPlayerClub(h, 1, 1, rng);
    }

    const offers = await getOffersBySellingClub(h, 1, 1);
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
      await generateAiOffersForPlayerClub(h, 1, 1, rng);
    }

    const offers = await getOffersBySellingClub(h, 1, 1);
    expect(offers).toHaveLength(0);
  });
});

describe('generateAiOffersForPlayerClub – listing behaviour', () => {
  function insertPlayerWithListing(
    db: import('better-sqlite3').Database,
    id: number,
    clubId: number,
    overallValue: number,
    opts: {
      isTransferListed?: boolean;
      isLoanListed?: boolean;
      askingPrice?: number | null;
      loanWageShare?: number | null;
    } = {},
  ): void {
    db.prepare(
      `INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
        contract_end, market_value, base_potential, effective_potential, morale, fitness,
        injury_weeks_left, is_free_agent, is_transfer_listed, is_loan_listed, asking_price, loan_wage_share)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, 1, `Player ${id}`, 'X', 25, 'ST', null, clubId, 50_000, 3, 15_000_000, 85, 85, 70, 90, 0, 0,
      opts.isTransferListed ? 1 : 0,
      opts.isLoanListed ? 1 : 0,
      opts.askingPrice ?? null,
      opts.loanWageShare ?? null,
    );

    db.prepare(
      `INSERT INTO player_attributes (player_id, save_id, finishing, passing, crossing, dribbling, heading,
        long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership,
        pace, stamina, strength, agility, jumping)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, 1, overallValue, overallValue, overallValue, overallValue, overallValue,
      overallValue, overallValue, overallValue, overallValue, overallValue, overallValue,
      overallValue, overallValue, overallValue, overallValue, overallValue, overallValue, overallValue,
    );
  }

  it('listed players receive offers at a higher rate than unlisted players', async () => {
    const N = 60; // seeds to try
    let listedOffers = 0;
    let unlistedOffers = 0;

    for (let s = 0; s < N; s++) {
      // Listed player run
      const db1 = createTestDb();
      const h1 = createTestDbHandle(db1);
      seed_(db1);
      insertPlayerWithListing(db1, 1, 1, 80, { isTransferListed: true });
      await generateAiOffersForPlayerClub(h1, 1, 1, new SeededRng(s));
      const listed = await getOffersBySellingClub(h1, 1, 1);
      listedOffers += listed.filter(o => o.offerType !== 'loan').length;

      // Unlisted player run — identical seed, same overall
      const db2 = createTestDb();
      const h2 = createTestDbHandle(db2);
      seed_(db2);
      insertPlayerWithListing(db2, 1, 1, 80);
      await generateAiOffersForPlayerClub(h2, 1, 1, new SeededRng(s));
      const unlisted = await getOffersBySellingClub(h2, 1, 1);
      unlistedOffers += unlisted.filter(o => o.offerType !== 'loan').length;
    }

    // Listed rate should be at least 1.5× the unlisted rate over N runs
    expect(listedOffers).toBeGreaterThan(unlistedOffers * 1.5);
  });

  it('bids for transfer-listed players with an asking price fall within [0.7, 1.0] × askingPrice', async () => {
    const askingPrice = 10_000_000;
    const allFees: number[] = [];

    for (let s = 0; s < 80; s++) {
      const db = createTestDb();
      const h = createTestDbHandle(db);
      seed_(db);
      insertPlayerWithListing(db, 1, 1, 80, {
        isTransferListed: true,
        askingPrice,
      });
      // Make all rivals very wealthy so budget gating is never the limiter
      db.prepare('UPDATE clubs SET budget = 100_000_000 WHERE id != 1').run();
      await generateAiOffersForPlayerClub(h, 1, 1, new SeededRng(s));
      const offers = await getOffersBySellingClub(h, 1, 1);
      for (const o of offers) {
        if (o.offerType !== 'loan') allFees.push(o.feeOffered);
      }
    }

    // We should have seen at least some offers
    expect(allFees.length).toBeGreaterThan(0);
    const low = Math.round(askingPrice * 0.7);
    const high = askingPrice; // 1.0 × asking price
    for (const fee of allFees) {
      expect(fee).toBeGreaterThanOrEqual(low);
      expect(fee).toBeLessThanOrEqual(high);
    }
  });

  it('loan-listed players receive loan offers; equivalent unlisted players do not', async () => {
    let loanOffersForListed = 0;
    let loanOffersForUnlisted = 0;

    for (let s = 0; s < 80; s++) {
      // Loan-listed player
      const db1 = createTestDb();
      const h1 = createTestDbHandle(db1);
      seed_(db1);
      insertPlayerWithListing(db1, 1, 1, 80, { isLoanListed: true, loanWageShare: 0.5 });
      await generateAiOffersForPlayerClub(h1, 1, 1, new SeededRng(s));
      const offers1 = await getOffersBySellingClub(h1, 1, 1);
      loanOffersForListed += offers1.filter(o => o.offerType === 'loan').length;

      // Unlisted player — same seed, same overall
      const db2 = createTestDb();
      const h2 = createTestDbHandle(db2);
      seed_(db2);
      insertPlayerWithListing(db2, 1, 1, 80);
      await generateAiOffersForPlayerClub(h2, 1, 1, new SeededRng(s));
      const offers2 = await getOffersBySellingClub(h2, 1, 1);
      loanOffersForUnlisted += offers2.filter(o => o.offerType === 'loan').length;
    }

    expect(loanOffersForListed).toBeGreaterThan(0);
    expect(loanOffersForUnlisted).toBe(0);
  });
});

// Renamed to avoid clash with imported `seed` helper in other files
function seed_(db: import('better-sqlite3').Database) {
  seed(db);
}
