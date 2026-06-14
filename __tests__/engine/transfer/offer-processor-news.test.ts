import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { executeAcceptedTransfer } from '@/engine/transfer/offer-processor';
import { getNewsItems } from '@/database/queries/news';

function seedClubsAndPlayer(db: import('better-sqlite3').Database): void {
  db.pragma('foreign_keys = OFF');
  db.prepare(
    "INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1,'T',1,1,10,'normal',50,'','')",
  ).run();
  db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (?, ?, ?, ?)').run(1, 'X', 'XX', 'Europe');
  db.prepare(
    `INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(1, 'L', 1, 1, 3, 0, 0);
  for (const [id, name, short] of [
    [10, 'My Club', 'MYC'],
    [20, 'Other A', 'OTA'],
    [30, 'Other B', 'OTB'],
  ] as const) {
    db.prepare(
      `INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
        stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department,
        primary_color, secondary_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, 1, name, short, 1, 1, 70, 100_000_000, 1_000_000, 'S', 20000, 3, 3, 3, '#1', '#2');
  }
  const insertPlayer = (id: number, name: string, clubId: number): void => {
    db.prepare(
      `INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
        contract_end, market_value, base_potential, effective_potential, morale, fitness,
        injury_weeks_left, is_free_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, 1, name, 'X', 26, 'ST', null, clubId, 20_000, 3, 10_000_000, 75, 75, 70, 90, 0, 0);
  };
  insertPlayer(1, 'Silva', 20); // will be signed by my club (in)
  insertPlayer(2, 'Souza', 10); // will leave my club (out)
  insertPlayer(3, 'Costa', 20); // unrelated transfer (no news)
}

describe('offer-processor news producer', () => {
  it('persists a transfer-in news when the player joins the user club', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seedClubsAndPlayer(db);

    await executeAcceptedTransfer(h, 1, {
      offerId: 0,
      playerId: 1,
      fromClubId: 20,
      toClubId: 10,
      fee: 5_000_000,
      wageOffered: 30_000,
      season: 1,
      week: 5,
      playerClubId: 10,
    });

    const news = await getNewsItems(h, 1, 1);
    const transferNews = news.filter((n) => n.category === 'transfer');
    expect(transferNews).toHaveLength(1);
    expect(transferNews[0].title_key).toBe('news.persist_transfer_in_title');
    expect(JSON.parse(transferNews[0].title_vars)).toEqual({ player: 'Silva' });
    const bodyVars = JSON.parse(transferNews[0].body_vars);
    expect(bodyVars.from).toBe('OTA');
    expect(bodyVars.fee).toBe('$5.0M');
  });

  it('persists a transfer-out news when the player leaves the user club', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seedClubsAndPlayer(db);

    await executeAcceptedTransfer(h, 1, {
      offerId: 0,
      playerId: 2,
      fromClubId: 10,
      toClubId: 20,
      fee: 8_000_000,
      wageOffered: 40_000,
      season: 1,
      week: 6,
      playerClubId: 10,
    });

    const news = (await getNewsItems(h, 1, 1)).filter((n) => n.category === 'transfer');
    expect(news).toHaveLength(1);
    expect(news[0].title_key).toBe('news.persist_transfer_out_title');
    expect(JSON.parse(news[0].title_vars)).toEqual({ player: 'Souza' });
    expect(JSON.parse(news[0].body_vars).to).toBe('OTA');
  });

  it('does not persist news for transfers between two clubs unrelated to the user', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seedClubsAndPlayer(db);

    await executeAcceptedTransfer(h, 1, {
      offerId: 0,
      playerId: 3,
      fromClubId: 20,
      toClubId: 30,
      fee: 4_000_000,
      wageOffered: 25_000,
      season: 1,
      week: 7,
      playerClubId: 10,
    });

    const news = (await getNewsItems(h, 1, 1)).filter((n) => n.category === 'transfer');
    expect(news).toHaveLength(0);
  });

  it('does not persist news when playerClubId is not provided', async () => {
    const db = createTestDb();
    const h = createTestDbHandle(db);
    seedClubsAndPlayer(db);

    await executeAcceptedTransfer(h, 1, {
      offerId: 0,
      playerId: 1,
      fromClubId: 20,
      toClubId: 10,
      fee: 5_000_000,
      wageOffered: 30_000,
      season: 1,
      week: 5,
    });

    const news = (await getNewsItems(h, 1, 1)).filter((n) => n.category === 'transfer');
    expect(news).toHaveLength(0);
  });
});
