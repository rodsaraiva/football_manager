import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from '../../database/test-helpers';
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { createCompetition } from '@/database/queries/leagues';
import { createFixture, getMatchEvents, addMatchEvent } from '@/database/queries/fixtures';
import { loadClubMatchData } from '@/engine/game-loop/simulate-and-persist';
import { simulateMatch } from '@/engine/simulation/match-engine';
import { MatchEventType } from '@/types/match';

const PHASE_TYPES = new Set<MatchEventType>(['tackle', 'key_pass', 'recovery', 'possession_change']);

// Integração L2 Fase 6: com emitPhaseEvents ON, os eventos de fase produzidos pelo
// engine round-trip em match_events (a coluna `phase` já existe; os novos tipos são
// strings, aceitos pelo schema). better-sqlite3 REAL — nada de mock.
async function persistedPhaseEvents(seed: number): Promise<Awaited<ReturnType<typeof getMatchEvents>>> {
  const raw: Database.Database = createTestDb();
  seedTestDb(raw);
  const db: DbHandle = createTestDbHandle(raw);

  const clubs = raw.prepare('SELECT id, league_id FROM clubs ORDER BY id LIMIT 2').all() as { id: number; league_id: number }[];
  const [homeC, awayC] = clubs;

  await createCompetition(db, TEST_SAVE_ID, {
    id: 9001, name: 'Test League', type: 'league', format: 'round_robin', season: 1, leagueId: homeC.league_id,
  });
  const fixtureId = 90001;
  await createFixture(db, TEST_SAVE_ID, {
    id: fixtureId, competitionId: 9001, season: 1, week: 1, round: null,
    homeClubId: homeC.id, awayClubId: awayC.id,
  });

  const home = await loadClubMatchData(db, TEST_SAVE_ID, homeC.id);
  const away = await loadClubMatchData(db, TEST_SAVE_ID, awayC.id);

  const result = simulateMatch({
    fixtureId,
    homeSquad: home.squad, awaySquad: away.squad,
    homeBench: home.bench, awayBench: away.bench,
    homeTactic: home.tactic, awayTactic: away.tactic,
    homeClubReputation: home.reputation, awayClubReputation: away.reputation,
    emitPhaseEvents: true,
    rng: new SeededRng(seed),
  });

  for (const e of result.events) {
    await addMatchEvent(db, {
      fixtureId,
      minute: e.minute,
      type: e.type,
      playerId: e.playerId,
      secondaryPlayerId: e.secondaryPlayerId,
      xg: e.xg ?? null,
      phase: e.phase ?? null,
    });
  }

  const events = await getMatchEvents(db, fixtureId);
  raw.close();
  return events;
}

describe('L2 Fase 6 — persistência dos eventos de fase (flag ON)', () => {
  it('grava os 4 tipos de evento de fase em match_events da partida', async () => {
    const events = await persistedPhaseEvents(42);
    const phaseRows = events.filter(e => PHASE_TYPES.has(e.type));
    expect(phaseRows.length).toBeGreaterThan(0);
    for (const t of PHASE_TYPES) {
      expect(events.some(e => e.type === t)).toBe(true);
    }
    // A coluna phase descreve o contexto do lance (open_play/corner/foul/...).
    for (const e of phaseRows) {
      expect(typeof e.phase).toBe('string');
      expect((e.phase as string).length).toBeGreaterThan(0);
    }
  });
});
