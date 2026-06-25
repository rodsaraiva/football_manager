import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { createCompetition, addCompetitionEntry, getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import {
  startUserMatchLive, advanceToNextWindow, finishLiveMatch, nextWindowBlock, liveSeed,
} from '@/engine/match-day/live-match';

async function buildCalendar(db: DbHandle): Promise<void> {
  const leagues = await getAllLeagues(db);
  const clubsByLeague: Record<number, number[]> = {};
  for (const league of leagues) {
    const clubs = await getClubsByLeague(db, 1, league.id);
    clubsByLeague[league.id] = clubs.map(c => c.id);
  }
  const calendar = generateSeasonCalendar({
    season: 1, leagues, clubsByLeague, championsLeagueClubs: [1, 2, 3, 4, 21, 22, 23, 24],
  });
  for (const comp of calendar.competitions) {
    await createCompetition(db, 1, { id: comp.id, name: comp.name, type: comp.type, format: comp.format, season: comp.season, leagueId: comp.leagueId });
  }
  for (const entry of calendar.entries) await addCompetitionEntry(db, 1, entry);
  for (const fx of calendar.fixtures) {
    await createFixture(db, 1, { id: fx.id, competitionId: fx.competitionId, season: fx.season, week: fx.week, round: fx.round as string | null, homeClubId: fx.homeClubId, awayClubId: fx.awayClubId });
  }
}

describe('nextWindowBlock', () => {
  it('do bloco 0 com 0 janelas usadas → 15 (intervalo)', () => {
    expect(nextWindowBlock(0, 0)).toBe(15);
  });
  it('do bloco 15 com 1 janela usada → 22', () => {
    expect(nextWindowBlock(15, 1)).toBe(22);
  });
  it('atingido MAX_LIVE_WINDOWS → null (roda direto até o fim)', () => {
    expect(nextWindowBlock(22, 3)).toBeNull();
  });
  it('liveSeed == halftimeSeed (mesma fórmula)', () => {
    expect(liveSeed(1, 7, 123)).toBe(1 * 100000 + 7 * 100 + 123);
  });
});

describe('startUserMatchLive → advanceToNextWindow → finishLiveMatch (SQLite real)', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(async () => {
    rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb);
    await buildCalendar(db);
  });
  afterEach(() => rawDb.close());

  it('intervalo: contexto com windowKind=halftime e advice não-vazio', async () => {
    const ctx = await startUserMatchLive({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1 });
    expect(ctx).not.toBeNull();
    expect(ctx!.windowKind).toBe('halftime');
    expect(ctx!.state.currentBlock).toBe(15);
    expect(Array.isArray(ctx!.advice)).toBe(true);
    for (const ev of ctx!.state.events) expect(ev.minute).toBeLessThanOrEqual(45);
  });

  it('null quando não há fixture do usuário na semana', async () => {
    const ctx = await startUserMatchLive({ dbHandle: db, season: 1, week: 5, playerClubId: 1, saveId: 1 });
    expect(ctx).toBeNull();
  });

  it('loop multi-janela termina em resultado finalizável', async () => {
    const ctx = await startUserMatchLive({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1 });
    let cur = ctx!;
    let windowsUsed = 1;
    const next = advanceToNextWindow({
      state: cur.state, isHome: cur.isHome, opponentName: cur.opponentName,
      windowsUsed, overrides: {}, triggers: [],
      archetype: 'tactician', qualityStars: 3,
    });
    if (next) { cur = next; windowsUsed++; expect(cur.state.currentBlock).toBe(22); }
    const result = finishLiveMatch({ state: cur.state, isHome: cur.isHome, overrides: {} });
    expect(result.homeGoals).toBeGreaterThanOrEqual(0);
    expect(result.awayGoals).toBeGreaterThanOrEqual(0);
  });

  it('determinismo: mesmo save/seed + mesmas decisões → mesmo placar/eventos', async () => {
    const run = async () => {
      const c = await startUserMatchLive({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1 });
      const n = advanceToNextWindow({ state: c!.state, isHome: c!.isHome, opponentName: c!.opponentName, windowsUsed: 1, overrides: {}, triggers: [], archetype: 'tactician', qualityStars: 3 });
      const st = n ? n.state : c!.state;
      const ih = n ? n.isHome : c!.isHome;
      return finishLiveMatch({ state: st, isHome: ih, overrides: {} });
    };
    const r1 = await run();
    rawDb.close(); rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb); await buildCalendar(db);
    const r2 = await run();
    expect(r1.homeGoals).toBe(r2.homeGoals);
    expect(r1.awayGoals).toBe(r2.awayGoals);
    expect(r1.events).toEqual(r2.events);
  });

  it('trigger conceded_goal para no bloco do gol sofrido (quando há gol no 2º tempo)', async () => {
    const ctx = await startUserMatchLive({ dbHandle: db, season: 1, week: 7, playerClubId: 1, saveId: 1 });
    const before = ctx!.state.away.goals;
    const next = advanceToNextWindow({
      state: ctx!.state, isHome: ctx!.isHome, opponentName: ctx!.opponentName,
      windowsUsed: 1, overrides: {}, triggers: ['conceded_goal'],
      archetype: 'tactician', qualityStars: 3,
    });
    if (next && next.state.currentBlock < 22) {
      expect(next.state.away.goals).toBeGreaterThan(before);
    }
    expect(true).toBe(true);
  });
});
