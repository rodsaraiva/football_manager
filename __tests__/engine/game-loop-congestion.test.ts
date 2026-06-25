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
    season: 1, leagues, clubsByLeague, championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, 1, { id: comp.id, name: comp.name, type: comp.type, format: comp.format, season: comp.season, leagueId: comp.leagueId });
  }
  for (const entry of calendar.entries) await addCompetitionEntry(db, 1, entry);
  for (const fixture of calendar.fixtures) {
    await createFixture(db, 1, { id: fixture.id, competitionId: fixture.competitionId, season: fixture.season, week: fixture.week, round: fixture.round as string | null, homeClubId: fixture.homeClubId, awayClubId: fixture.awayClubId });
  }
}

// Avança a semana com a mesma seed/estado, opcionalmente marcando um jogo
// recente do clube 1 como já disputado (congestionamento). Retorna o pior drop
// de fitness entre os titulares do clube do usuário.
async function worstDropAfterWeek(markRecent: boolean): Promise<number> {
  const raw: Database.Database = createTestDb();
  seedTestDb(raw);
  const db = createTestDbHandle(raw);
  await buildCalendar(db);
  raw.prepare('UPDATE players SET fitness = 100 WHERE save_id = ? AND club_id = 1').run(TEST_SAVE_ID);
  if (markRecent) {
    // marca jogos do clube 1 na janela [week-3, week-1] = semanas 6..8 como disputados
    raw.prepare(
      "UPDATE fixtures SET played = 1, home_goals = 1, away_goals = 0 WHERE save_id = ? AND season = 1 AND week IN (7, 8) AND (home_club_id = 1 OR away_club_id = 1)",
    ).run(TEST_SAVE_ID);
  }
  const before = new Map(
    (raw.prepare('SELECT id, fitness FROM players WHERE save_id = ? AND club_id = 1').all(TEST_SAVE_ID) as Array<{ id: number; fitness: number }>).map((r) => [r.id, r.fitness]),
  );
  await advanceGameWeek({ dbHandle: db, season: 1, week: 9, playerClubId: 1, saveId: TEST_SAVE_ID, rng: new SeededRng(42) });
  const after = raw.prepare('SELECT id, fitness FROM players WHERE save_id = ? AND club_id = 1').all(TEST_SAVE_ID) as Array<{ id: number; fitness: number }>;
  let worst = 0;
  for (const r of after) {
    const drop = (before.get(r.id) ?? 100) - r.fitness;
    if (drop > worst) worst = drop;
  }
  return worst;
}

it('jogo recente na janela aumenta o drop de fitness vs. sem jogo recente', async () => {
  const noRecent = await worstDropAfterWeek(false);
  const withRecent = await worstDropAfterWeek(true);
  expect(withRecent).toBeGreaterThan(noRecent);
});
