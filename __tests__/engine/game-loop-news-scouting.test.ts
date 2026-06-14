import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import { getNewsItems } from '@/database/queries/news';

async function buildCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const league of leagues) {
    const clubs = await getClubsByLeague(db, 1, league.id);
    clubsByLeague[league.id] = clubs.map(c => c.id);
  }
  const calendar = generateSeasonCalendar({
    season: 1,
    leagues,
    clubsByLeague,
    championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, 1, {
      id: comp.id,
      name: comp.name,
      type: comp.type,
      format: comp.format,
      season: comp.season,
      leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) {
    await addCompetitionEntry(db, 1, entry);
  }
  for (const fixture of calendar.fixtures) {
    await createFixture(db, 1, {
      id: fixture.id,
      competitionId: fixture.competitionId,
      season: fixture.season,
      week: fixture.week,
      round: fixture.round as string | null,
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
    });
  }
}

// Picks a target player NOT on the user's club so the scouting row is realistic.
function targetPlayerId(rawDb: Database.Database): number {
  const row = rawDb
    .prepare('SELECT id FROM players WHERE club_id != 1 ORDER BY id ASC LIMIT 1')
    .get() as { id: number };
  return row.id;
}

// Inserts a high-ability scout for the user's club and returns its id.
function seedScout(rawDb: Database.Database): number {
  const result = rawDb
    .prepare(
      `INSERT INTO staff (save_id, name, role, club_id, ability, wage, contract_end)
       VALUES (1, 'Olheiro Teste', 'scout', 1, 20, 1000, 2030)`,
    )
    .run();
  return Number(result.lastInsertRowid);
}

describe('advanceGameWeek — scouting news producer', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await buildCalendar(db);
  });

  afterEach(() => rawDb.close());

  it('grava 1 news de scouting quando o relatório alcança 100 (reachedFull)', async () => {
    const scoutId = seedScout(rawDb);
    const target = targetPlayerId(rawDb);
    // knowledge 95 + ability-20 gain (20) => 100 => reachedFull
    rawDb
      .prepare('INSERT INTO scouting (save_id, player_id, knowledge, scout_id) VALUES (1, ?, 95, ?)')
      .run(target, scoutId);

    await advanceGameWeek({
      dbHandle: db, season: 1, week: 8, playerClubId: 1, saveId: 1, rng: new SeededRng(42),
    });

    const news = await getNewsItems(db, 1, 1);
    const scouting = news.filter(n => n.category === 'scouting');
    expect(scouting).toHaveLength(1);
    expect(scouting[0].title_key).toBe('news.persist_scouting_title');
  });

  it('NÃO grava news quando o knowledge não alcança 100', async () => {
    const scoutId = seedScout(rawDb);
    const target = targetPlayerId(rawDb);
    // knowledge 10 + 20 => 30 (< 100) => não dispara reachedFull
    rawDb
      .prepare('INSERT INTO scouting (save_id, player_id, knowledge, scout_id) VALUES (1, ?, 10, ?)')
      .run(target, scoutId);

    await advanceGameWeek({
      dbHandle: db, season: 1, week: 8, playerClubId: 1, saveId: 1, rng: new SeededRng(42),
    });

    const news = await getNewsItems(db, 1, 1);
    expect(news.filter(n => n.category === 'scouting')).toHaveLength(0);
  });
});
