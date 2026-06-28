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
import { createMission, getActiveMissions } from '@/database/queries/scout-missions';
import { getPlayerKnowledge } from '@/database/queries/scouting';

async function buildCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const league of leagues) {
    const clubs = await getClubsByLeague(db, 1, league.id);
    clubsByLeague[league.id] = clubs.map((c) => c.id);
  }
  const calendar = generateSeasonCalendar({
    season: 1, leagues, clubsByLeague,
    championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, 1, {
      id: comp.id, name: comp.name, type: comp.type, format: comp.format,
      season: comp.season, leagueId: comp.leagueId,
    });
  }
  for (const entry of calendar.entries) await addCompetitionEntry(db, 1, entry);
  for (const fixture of calendar.fixtures) {
    await createFixture(db, 1, {
      id: fixture.id, competitionId: fixture.competitionId, season: fixture.season,
      week: fixture.week, round: fixture.round as string | null,
      homeClubId: fixture.homeClubId, awayClubId: fixture.awayClubId,
    });
  }
}

function targetPlayer(rawDb: Database.Database): { id: number; name: string } {
  return rawDb
    .prepare('SELECT id, name FROM players WHERE club_id != 1 ORDER BY id ASC LIMIT 1')
    .get() as { id: number; name: string };
}

function seedScout(rawDb: Database.Database, archetype = 'generalist'): number {
  const result = rawDb
    .prepare(
      `INSERT INTO staff (save_id, name, role, club_id, ability, wage, contract_end, archetype)
       VALUES (1, 'Olheiro C3', 'scout', 1, 20, 1000, 2030, ?)`,
    )
    .run(archetype);
  return Number(result.lastInsertRowid);
}

async function newsScouting(db: DbHandle) {
  const news = await getNewsItems(db, 1, 1);
  return news.filter((n) => n.category === 'scouting');
}

describe('advanceGameWeek — C3 scout missions', () => {
  let rawDb: Database.Database;
  let db: DbHandle;

  beforeEach(async () => {
    rawDb = createTestDb();
    seedTestDb(rawDb);
    db = createTestDbHandle(rawDb);
    await buildCalendar(db);
  });

  afterEach(() => rawDb.close());

  it('short_eval revela jogador e gera news com nome real ao completar', async () => {
    const scoutId = seedScout(rawDb);
    const tgt = targetPlayer(rawDb);
    await createMission(db, 1, {
      scoutId, type: 'short_eval', targetPlayerId: tgt.id,
      targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1,
    });

    let week = 2;
    let completed = false;
    for (let i = 0; i < 4 && !completed; i++, week++) {
      await advanceGameWeek({ dbHandle: db, season: 1, week, playerClubId: 1, saveId: 1, rng: new SeededRng(42) });
      completed = (await getActiveMissions(db, 1)).length === 0;
    }

    expect(completed).toBe(true);
    expect(await getPlayerKnowledge(db, 1, tgt.id)).toBeGreaterThan(0);

    const scouting = await newsScouting(db);
    const persist = scouting.find((n) => n.title_key === 'news.persist_scouting_title');
    expect(persist).toBeDefined();
    expect(JSON.parse(persist!.body_vars).name).toBe(tgt.name);
    // verdict travels as a translation KEY (resolved at render).
    expect(JSON.parse(persist!.body_vars).verdict).toMatch(/^verdict\./);
  });

  it('olheiro removido mid-missão ⇒ missão vira expired + news de interrupção', async () => {
    const scoutId = seedScout(rawDb);
    const tgt = targetPlayer(rawDb);
    await createMission(db, 1, {
      scoutId, type: 'long_project', targetPlayerId: tgt.id,
      targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1,
    });
    rawDb.prepare('DELETE FROM staff WHERE id = ?').run(scoutId);

    await advanceGameWeek({ dbHandle: db, season: 1, week: 2, playerClubId: 1, saveId: 1, rng: new SeededRng(42) });

    expect((await getActiveMissions(db, 1)).length).toBe(0);
    const scouting = await newsScouting(db);
    expect(scouting.some((n) => n.title_key === 'news.scouting_interrupted_title')).toBe(true);
  });

  it('opponent_intel completa em 1 semana e dispara news de intel', async () => {
    const scoutId = seedScout(rawDb);
    await createMission(db, 1, {
      scoutId, type: 'opponent_intel', targetPlayerId: null,
      targetClubId: 2, regionCode: null, createdSeason: 1, createdWeek: 1,
    });

    await advanceGameWeek({ dbHandle: db, season: 1, week: 2, playerClubId: 1, saveId: 1, rng: new SeededRng(42) });

    expect((await getActiveMissions(db, 1)).length).toBe(0);
    const scouting = await newsScouting(db);
    expect(scouting.some((n) => n.title_key === 'news.scouting_intel_title')).toBe(true);
  });

  it('determinismo: mesma seed ⇒ mesmo knowledge após K semanas', async () => {
    const run = async (): Promise<number> => {
      const r = createTestDb();
      seedTestDb(r);
      const h = createTestDbHandle(r);
      await buildCalendar(h);
      const sId = seedScout(r);
      const tgt = targetPlayer(r);
      await createMission(h, 1, {
        scoutId: sId, type: 'long_project', targetPlayerId: tgt.id,
        targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1,
      });
      for (let w = 2; w <= 4; w++) {
        await advanceGameWeek({ dbHandle: h, season: 1, week: w, playerClubId: 1, saveId: 1, rng: new SeededRng(7) });
      }
      const k = await getPlayerKnowledge(h, 1, tgt.id);
      r.close();
      return k;
    };
    expect(await run()).toBe(await run());
  });
});
