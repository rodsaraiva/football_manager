import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { advanceGameWeek } from '@/engine/game-loop';
import { SeededRng } from '@/engine/rng';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import { getNewsItems, toNewsItem } from '@/database/queries/news';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { selectCallUps } from '@/engine/national/international-duty';
import { calculateOverall } from '@/utils/overall';

// Mirrors the game-loop's call-up selection so the test asserts the EXACT count
// the producer will persist, regardless of how many seed players already qualify.
async function expectedCallUpCount(db: DbHandle): Promise<number> {
  const squad = await getPlayersWithAttributesByClub(db, 1, 1);
  const candidates = squad
    .filter(p => !p.isFreeAgent)
    .map(p => ({ id: p.id, nationality: p.nationality, overall: calculateOverall(p.attributes, p.position) }));
  return selectCallUps(candidates).length;
}

const ATTR_COLS = [
  'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'long_shots',
  'free_kicks', 'vision', 'composure', 'decisions', 'positioning', 'aggression',
  'leadership', 'pace', 'stamina', 'strength', 'agility', 'jumping',
] as const;

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

// Forces the given player to overall >= 75 (all attributes 90) so selectCallUps
// reliably calls them up, and stamps a distinct nationality.
function makeStar(rawDb: Database.Database, playerId: number, nationality: string): void {
  const setClause = ATTR_COLS.map(c => `${c} = 90`).join(', ');
  rawDb.prepare(`UPDATE player_attributes SET ${setClause} WHERE player_id = ?`).run(playerId);
  rawDb.prepare('UPDATE players SET nationality = ? WHERE id = ?').run(nationality, playerId);
}

describe('advanceGameWeek — international call-up news producer', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await buildCalendar(db);
  });

  afterEach(() => rawDb.close());

  it('grava 1 news de callup numa pausa FIFA, com count = nº de convocados', async () => {
    const stars = rawDb
      .prepare('SELECT id FROM players WHERE club_id = 1 AND is_free_agent = 0 ORDER BY id ASC LIMIT 2')
      .all() as { id: number }[];
    makeStar(rawDb, stars[0].id, 'Atlantis');
    makeStar(rawDb, stars[1].id, 'Pacifica'); // nacionalidades distintas => >= 2 convocados

    const expected = await expectedCallUpCount(db);
    expect(expected).toBeGreaterThanOrEqual(2);

    await advanceGameWeek({
      dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1, rng: new SeededRng(42),
    });

    const news = await getNewsItems(db, 1, 1);
    const callups = news.filter(n => n.category === 'callup');
    expect(callups).toHaveLength(1);
    const item = toNewsItem(callups[0]);
    expect(item.title.key).toBe('news.persist_callup_title');
    expect(item.body.vars?.count).toBe(expected);
    expect(item.body.key).toBe('news.persist_callup_body_other');
  });

  it('count=1 usa o body _one (singular)', async () => {
    const star = rawDb
      .prepare('SELECT id FROM players WHERE club_id = 1 AND is_free_agent = 0 ORDER BY id ASC LIMIT 1')
      .get() as { id: number };
    makeStar(rawDb, star.id, 'Solitaria');
    // Rebaixa todos os demais jogadores do clube para garantir que só 1 é convocado.
    const setClause = ATTR_COLS.map(c => `${c} = 30`).join(', ');
    rawDb
      .prepare(
        `UPDATE player_attributes SET ${setClause}
         WHERE player_id IN (SELECT id FROM players WHERE club_id = 1 AND id != ?)`,
      )
      .run(star.id);

    await advanceGameWeek({
      dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1, rng: new SeededRng(42),
    });

    const news = await getNewsItems(db, 1, 1);
    const callups = news.filter(n => n.category === 'callup');
    expect(callups).toHaveLength(1);
    const item = toNewsItem(callups[0]);
    expect(item.body.key).toBe('news.persist_callup_body_one');
    expect(item.body.vars?.count).toBe(1);
  });

  it('NÃO grava news fora de pausa FIFA', async () => {
    const stars = rawDb
      .prepare('SELECT id FROM players WHERE club_id = 1 AND is_free_agent = 0 ORDER BY id ASC LIMIT 2')
      .all() as { id: number }[];
    makeStar(rawDb, stars[0].id, 'Atlantis');
    makeStar(rawDb, stars[1].id, 'Pacifica');

    await advanceGameWeek({
      dbHandle: db, season: 1, week: 8, playerClubId: 1, saveId: 1, rng: new SeededRng(42),
    });

    const news = await getNewsItems(db, 1, 1);
    expect(news.filter(n => n.category === 'callup')).toHaveLength(0);
  });
});
