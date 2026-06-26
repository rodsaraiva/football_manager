import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture, getFixturesByWeek, getMatchEvents } from '@/database/queries/fixtures';
import { MatchEvent } from '@/types/match';

// Cobertura de integração da cola L2 (simulate-and-persist.ts:253-281): garante que,
// numa semana real avançada pelo game-loop, a geometria derivada (x/y/phase) e o xG
// realmente são gravados em match_events da partida do usuário, alinhados aos eventos.
// As peças (deriveMatchGeometry puro, addMatchEvent round-trip) já têm unit; aqui é o WIRING.

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

// Avança a semana 7 (1ª rodada de liga) com o clube 1 = usuário e devolve os eventos
// persistidos da partida do usuário.
async function userMatchEventsAfterWeek7(seed: number): Promise<MatchEvent[]> {
  const raw: Database.Database = createTestDb();
  seedTestDb(raw);
  const db = createTestDbHandle(raw);
  await buildCalendar(db);
  await advanceGameWeek({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: TEST_SAVE_ID, rng: new SeededRng(seed) });
  const fixtures = await getFixturesByWeek(db, TEST_SAVE_ID, 1, 7);
  const userFixture = fixtures.find((f) => f.homeClubId === 1 || f.awayClubId === 1);
  expect(userFixture).toBeDefined();
  const events = await getMatchEvents(db, userFixture!.id);
  raw.close();
  return events;
}

describe('L2 — persistência de geometria pela cola do game-loop', () => {
  it('grava x/y/phase e xG nos eventos da partida do usuário', async () => {
    const events = await userMatchEventsAfterWeek7(42);
    expect(events.length).toBeGreaterThan(0);

    // Toda linha de evento recebe geometria derivada (deriveMatchGeometry mapeia 1:1).
    for (const e of events) {
      expect(typeof e.x).toBe('number');
      expect(typeof e.y).toBe('number');
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x).toBeLessThanOrEqual(1);
      expect(e.y).toBeGreaterThanOrEqual(0);
      expect(e.y).toBeLessThanOrEqual(1);
      expect(typeof e.phase).toBe('string');
      expect((e.phase as string).length).toBeGreaterThan(0);
    }

    // Pelo menos um evento de chance carrega xG (a cola repassa event.xg).
    expect(events.some((e) => typeof e.xg === 'number')).toBe(true);
  });

  it('a geometria persistida é determinística pela mesma seed', async () => {
    const a = await userMatchEventsAfterWeek7(42);
    const b = await userMatchEventsAfterWeek7(42);
    const geo = (evs: MatchEvent[]) => evs.map((e) => ({ minute: e.minute, type: e.type, x: e.x, y: e.y, phase: e.phase, xg: e.xg }));
    expect(geo(a)).toEqual(geo(b));
  });
});
