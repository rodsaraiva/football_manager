import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';

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
      id: comp.id, name: comp.name, type: comp.type, format: comp.format, season: comp.season, leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) await addCompetitionEntry(db, 1, entry);
  for (const fixture of calendar.fixtures) {
    await createFixture(db, 1, {
      id: fixture.id, competitionId: fixture.competitionId, season: fixture.season, week: fixture.week,
      round: fixture.round as string | null, homeClubId: fixture.homeClubId, awayClubId: fixture.awayClubId,
    });
  }
}

it('ao recuperar, fitness não excede injury_return_fitness e cai mais rápido com physio', async () => {
  const raw: Database.Database = createTestDb();
  seedTestDb(raw);
  const db = createTestDbHandle(raw);
  await buildCalendar(db);
  const clubId = 1;

  raw.prepare(
    "UPDATE staff SET ability = 20 WHERE save_id = ? AND club_id = ? AND role = 'physio'",
  ).run(TEST_SAVE_ID, clubId);

  // jogador reserva (não titular) p/ evitar ser re-lesionado nesta partida
  const pid = (raw.prepare('SELECT id FROM players WHERE save_id = ? AND club_id = ? ORDER BY id DESC LIMIT 1').get(TEST_SAVE_ID, clubId) as { id: number }).id;
  raw.prepare(
    "UPDATE players SET injury_weeks_left = 1, injury_severity = 'moderate', injury_return_fitness = 70, fitness = 100 WHERE save_id = ? AND id = ?",
  ).run(TEST_SAVE_ID, pid);

  await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: clubId, saveId: TEST_SAVE_ID, rng: new SeededRng(42) });

  const after = raw.prepare('SELECT injury_weeks_left, fitness, injury_severity, injury_return_fitness FROM players WHERE save_id = ? AND id = ?').get(TEST_SAVE_ID, pid) as {
    injury_weeks_left: number; fitness: number; injury_severity: string | null; injury_return_fitness: number | null;
  };
  expect(after.injury_weeks_left).toBe(0);
  expect(after.fitness).toBeLessThanOrEqual(70);
  expect(after.injury_severity).toBeNull();
  expect(after.injury_return_fitness).toBeNull();
});
