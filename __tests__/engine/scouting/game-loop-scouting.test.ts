import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import {
  generateSeasonCalendar,
} from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import {
  assignScout,
  getPlayerKnowledge,
  getScoutingRows,
} from '@/database/queries/scouting';
import { weeklyKnowledgeGain } from '@/engine/scouting/scouting-engine';

async function buildCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const league of leagues) {
    const clubs = await getClubsByLeague(db, 1, league.id);
    clubsByLeague[league.id] = clubs.map((c) => c.id);
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

describe('weekly scouting progression via advanceGameWeek', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  const playerClubId = 1;

  // Pick a scout from the player's club and a target player NOT in the club.
  let scoutId: number;
  let scoutAbility: number;
  let targetId: number;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await buildCalendar(db);

    // The seed assigns staff roles probabilistically, so the player club may have no
    // scout. Insert a deterministic one so the gain is predictable.
    const maxId = (rawDb.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM staff').get() as { m: number }).m;
    scoutId = maxId + 1;
    scoutAbility = 10; // weeklyKnowledgeGain(10) = 13
    rawDb
      .prepare(
        "INSERT INTO staff (id, save_id, name, role, club_id, ability, wage, contract_end) VALUES (?, ?, 'Test Scout', 'scout', ?, ?, 1000, 3)",
      )
      .run(scoutId, TEST_SAVE_ID, playerClubId, scoutAbility);

    const target = rawDb
      .prepare('SELECT id FROM players WHERE save_id = ? AND (club_id IS NULL OR club_id != ?) LIMIT 1')
      .get(TEST_SAVE_ID, playerClubId) as { id: number };
    targetId = target.id;
  });

  afterEach(() => rawDb.close());

  it('increases knowledge by the scout-ability gain after one week', async () => {
    await assignScout(db, TEST_SAVE_ID, targetId, scoutId);
    expect(await getPlayerKnowledge(db, TEST_SAVE_ID, targetId)).toBe(0);

    await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId,
      saveId: TEST_SAVE_ID,
      rng: new SeededRng(42),
    });

    expect(await getPlayerKnowledge(db, TEST_SAVE_ID, targetId)).toBe(weeklyKnowledgeGain(scoutAbility));
  });

  it('caps at 100 and frees the scout after enough weeks', async () => {
    await assignScout(db, TEST_SAVE_ID, targetId, scoutId);

    // Enough weeks to guarantee full knowledge (min gain 7/wk → <=15 weeks).
    let season = 1;
    let week = 7;
    for (let i = 0; i < 16; i++) {
      const r = await advanceGameWeek({
        dbHandle: db,
        season,
        week,
        playerClubId,
        saveId: TEST_SAVE_ID,
        rng: new SeededRng(100 + i),
      });
      season = r.newSeason;
      week = r.newWeek;
    }

    expect(await getPlayerKnowledge(db, TEST_SAVE_ID, targetId)).toBe(100);
    const rows = await getScoutingRows(db, TEST_SAVE_ID);
    const row = rows.find((x) => x.playerId === targetId);
    expect(row?.scoutId).toBeNull();
  });

  it('does nothing when no scout is assigned', async () => {
    await advanceGameWeek({
      dbHandle: db,
      season: 1,
      week: 7,
      playerClubId,
      saveId: TEST_SAVE_ID,
      rng: new SeededRng(42),
    });
    expect(await getScoutingRows(db, TEST_SAVE_ID)).toEqual([]);
  });
});
