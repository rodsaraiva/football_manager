import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { signFreeAgent, freeAgentExpectedWage } from '@/engine/transfer/free-agent-signing';

function seed(db: import('better-sqlite3').Database): void {
  // Circular world FK (clubs.save_id <-> save_games.player_club_id): seed with FK off.
  db.pragma('foreign_keys = OFF');
  db.prepare(
    "INSERT OR IGNORE INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1,'T',1,1,10,'normal',50,'','')",
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
  db.prepare(
    `INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
      primary_color, secondary_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(10, 1, 'Buyer FC', 'BUY', 1, 1, 70, 10_000_000, 500_000, 'S', 20000, 3, 3, 3, '#1', '#2');
}

function insertFreeAgent(
  db: import('better-sqlite3').Database,
  params: { id: number; age?: number; free?: boolean },
): void {
  const { id, age = 28, free = true } = params;
  db.prepare(
    `INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
      contract_end, market_value, base_potential, effective_potential, morale, fitness,
      injury_weeks_left, is_free_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, 1, `FA ${id}`, 'X', age, 'ST', null, free ? null : 10, 0, 0, 5_000_000, 75, 75, 70, 90, 0, free ? 1 : 0);
}

describe('signFreeAgent', () => {
  it('signs when wage meets expectation', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    insertFreeAgent(db, { id: 1 });

    const expected = freeAgentExpectedWage(70);
    const res = await signFreeAgent(h, 1, {
      playerId: 1,
      clubId: 10,
      wageOffered: expected,
      contractYears: 3,
      playerOverall: 70,
      season: 1,
      week: 2,
    });
    expect(res.success).toBe(true);

    const player = db
      .prepare('SELECT club_id, wage, contract_end, is_free_agent FROM players WHERE id = 1')
      .get() as { club_id: number; wage: number; contract_end: number; is_free_agent: number };
    expect(player.club_id).toBe(10);
    expect(player.wage).toBe(expected);
    expect(player.contract_end).toBe(4); // season 1 + 3 yrs
    expect(player.is_free_agent).toBe(0);

    // Transfer record with type 'free'
    const tr = db.prepare('SELECT * FROM transfers').all() as Array<{ type: string; fee: number }>;
    expect(tr).toHaveLength(1);
    expect(tr[0].type).toBe('free');
    expect(tr[0].fee).toBe(0);
  });

  it('rejects when wage is below expectation', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    insertFreeAgent(db, { id: 1 });

    const expected = freeAgentExpectedWage(70);
    const res = await signFreeAgent(h, 1, {
      playerId: 1,
      clubId: 10,
      wageOffered: Math.floor(expected * 0.5),
      contractYears: 3,
      playerOverall: 70,
      season: 1,
      week: 2,
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/expect/i);

    const player = db.prepare('SELECT is_free_agent FROM players WHERE id = 1').get() as {
      is_free_agent: number;
    };
    expect(player.is_free_agent).toBe(1);
  });

  it('rejects non-free-agent players', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    insertFreeAgent(db, { id: 1, free: false });

    const res = await signFreeAgent(h, 1, {
      playerId: 1,
      clubId: 10,
      wageOffered: 50_000,
      contractYears: 3,
      playerOverall: 70,
      season: 1,
      week: 2,
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/not a free agent/i);
  });

  it('rejects when budget is too low', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    db.prepare('UPDATE clubs SET budget = 1000 WHERE id = 10').run();
    insertFreeAgent(db, { id: 1 });

    const res = await signFreeAgent(h, 1, {
      playerId: 1,
      clubId: 10,
      wageOffered: freeAgentExpectedWage(70),
      contractYears: 3,
      playerOverall: 70,
      season: 1,
      week: 2,
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/budget/i);
  });

  it('rejects invalid contract lengths', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    insertFreeAgent(db, { id: 1 });

    const res1 = await signFreeAgent(h, 1, {
      playerId: 1,
      clubId: 10,
      wageOffered: 50_000,
      contractYears: 0,
      playerOverall: 70,
      season: 1,
      week: 2,
    });
    expect(res1.success).toBe(false);

    const res2 = await signFreeAgent(h, 1, {
      playerId: 1,
      clubId: 10,
      wageOffered: 50_000,
      contractYears: 6,
      playerOverall: 70,
      season: 1,
      week: 2,
    });
    expect(res2.success).toBe(false);
  });

  it('deducts signing bonus from budget', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seed(db);
    insertFreeAgent(db, { id: 1 });

    const wage = freeAgentExpectedWage(70);
    const budgetBefore = (db.prepare('SELECT budget FROM clubs WHERE id = 10').get() as {
      budget: number;
    }).budget;

    const res = await signFreeAgent(h, 1, {
      playerId: 1,
      clubId: 10,
      wageOffered: wage,
      contractYears: 3,
      playerOverall: 70,
      season: 1,
      week: 2,
    });
    expect(res.success).toBe(true);

    const budgetAfter = (db.prepare('SELECT budget FROM clubs WHERE id = 10').get() as {
      budget: number;
    }).budget;
    expect(budgetAfter).toBe(budgetBefore - wage * 4);
  });
});

describe('freeAgentExpectedWage', () => {
  it('scales with overall', () => {
    const w50 = freeAgentExpectedWage(50);
    const w70 = freeAgentExpectedWage(70);
    const w85 = freeAgentExpectedWage(85);
    expect(w70).toBeGreaterThan(w50);
    expect(w85).toBeGreaterThan(w70);
  });

  it('returns positive values even for low overall', () => {
    expect(freeAgentExpectedWage(40)).toBeGreaterThan(0);
  });
});
