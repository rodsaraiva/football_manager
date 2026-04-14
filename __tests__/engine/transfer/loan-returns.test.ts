import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { returnExpiredLoans } from '@/engine/transfer/loan-returns';
import { createTransfer } from '@/database/queries/transfers';

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
  for (const id of [1, 2]) {
    db.prepare(
      `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
        stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
        primary_color, secondary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, `Club ${id}`, `C${id}`, 1, 1, 60, 10_000_000, 500_000, 'S', 20000, 3, 3, 3, '#1', '#2');
  }
}

function insertPlayer(
  db: import('better-sqlite3').Database,
  id: number,
  clubId: number,
): void {
  db.prepare(
    `INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage,
      contract_end, market_value, base_potential, effective_potential, morale, fitness,
      injury_weeks_left, is_free_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `P${id}`, 'X', 25, 'ST', null, clubId, 50_000, 5, 5_000_000, 75, 75, 70, 90, 0, 0);
}

describe('returnExpiredLoans', () => {
  it('returns a player to the parent club at end of loan', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    // Player 1 starts at club 1 (parent), loaned to club 2 for season 1
    insertPlayer(db, 1, 2);
    await createTransfer(h, {
      playerId: 1,
      season: 1,
      fromClubId: 1,
      toClubId: 2,
      fee: 0,
      wageOffered: 30_000,
      type: 'loan',
      loanEnd: 1, // ends this season
    });

    const returned = await returnExpiredLoans(h, 1);
    expect(returned).toBe(1);

    const player = db.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
    expect(player.club_id).toBe(1); // back with parent
  });

  it('does not return future loans', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    insertPlayer(db, 1, 2);
    await createTransfer(h, {
      playerId: 1,
      season: 1,
      fromClubId: 1,
      toClubId: 2,
      fee: 0,
      wageOffered: 30_000,
      type: 'loan',
      loanEnd: 3, // ends in season 3
    });

    const returned = await returnExpiredLoans(h, 1);
    expect(returned).toBe(0);

    const player = db.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
    expect(player.club_id).toBe(2); // still at loan club
  });

  it('ignores already-processed loans (loan_end=NULL)', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    insertPlayer(db, 1, 1);
    // Already returned: loan_end cleared
    await createTransfer(h, {
      playerId: 1,
      season: 1,
      fromClubId: 1,
      toClubId: 2,
      fee: 0,
      wageOffered: 30_000,
      type: 'loan',
      loanEnd: null,
    });

    const returned = await returnExpiredLoans(h, 2);
    expect(returned).toBe(0);
  });

  it('skips loans where the player has moved elsewhere', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    // Third club — player ended up there via another transfer
    db.prepare(
      `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
        stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
        primary_color, secondary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(3, 'Club 3', 'C3', 1, 1, 60, 10_000_000, 500_000, 'S', 20000, 3, 3, 3, '#1', '#2');
    insertPlayer(db, 1, 3); // now at club 3
    await createTransfer(h, {
      playerId: 1,
      season: 1,
      fromClubId: 1,
      toClubId: 2,
      fee: 0,
      wageOffered: 30_000,
      type: 'loan',
      loanEnd: 1,
    });

    const returned = await returnExpiredLoans(h, 1);
    expect(returned).toBe(0);

    const player = db.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
    expect(player.club_id).toBe(3);
  });

  it('marks loan as closed (loan_end=NULL) after returning', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    insertPlayer(db, 1, 2);
    await createTransfer(h, {
      playerId: 1,
      season: 1,
      fromClubId: 1,
      toClubId: 2,
      fee: 0,
      wageOffered: 30_000,
      type: 'loan',
      loanEnd: 1,
    });

    await returnExpiredLoans(h, 1);

    const tr = db.prepare('SELECT loan_end FROM transfers WHERE player_id = 1').get() as {
      loan_end: number | null;
    };
    expect(tr.loan_end).toBeNull();

    // Running again is a no-op
    const again = await returnExpiredLoans(h, 2);
    expect(again).toBe(0);
  });
});
