import { DbHandle } from '@/database/queries/players';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import {
  pickStartingEleven,
  buildSquadFromSavedIds,
  buildBenchFromSavedIds,
  buildBench,
  PlayerForPick,
} from '@/engine/simulation/squad-selection';
import {
  getFixturesByWeek,
  updateFixtureResult,
  addMatchEvent,
} from '@/database/queries/fixtures';
import { getClubById } from '@/database/queries/clubs';
import { getActiveTactic, getTacticLineup } from '@/database/queries/tactics';
import { getSetPieceTakers } from '@/database/queries/set-piece-takers';
import { getLastNMatchForm } from '@/database/queries/player-stats';
import { computeFormModifier } from '@/engine/simulation/form';
import { SeededRng } from '@/engine/rng';
import { MatchResult } from '@/engine/simulation/match-engine';
import { simulateWeekFixtures, ClubMatchData, FixtureSimInput } from '@/engine/simulation/match-runner';
import { getRivalry } from '@/database/queries/legacy';
import { deriveDerbyBonus } from '@/engine/legacy/derby-bonus';
import { Fixture } from '@/types';
import { MatchSetup } from './week-context';

// ─── Persist per-match player stats ──────────────────────────────────────────

async function persistMatchStats(
  db: DbHandle,
  saveId: number,
  fixture: Fixture,
  result: MatchResult,
): Promise<void> {
  // Derive per-player tallies from the match events (PlayerRating only carries
  // playerId + rating; goals/assists/cards must be counted from events).
  const tallyFor = (playerId: number) => {
    let goals = 0;
    let assists = 0;
    let yellowCards = 0;
    let redCards = 0;
    let minutesPlayed = 90; // default; subtract from red-card minute if red
    for (const e of result.events) {
      if (e.playerId === playerId) {
        switch (e.type) {
          case 'goal':
          case 'penalty_scored':
          case 'free_kick_scored':
            goals++;
            break;
          case 'assist':
            assists++;
            break;
          case 'yellow':
            yellowCards++;
            break;
          case 'red':
            redCards++;
            minutesPlayed = Math.min(minutesPlayed, e.minute);
            break;
          case 'substitution':
            // player subbed off — use event minute as minutes played
            minutesPlayed = Math.min(minutesPlayed, e.minute);
            break;
        }
      }
    }
    return { goals, assists, yellowCards, redCards, minutesPlayed };
  };

  const allRatings = [...result.homeRatings, ...result.awayRatings];
  if (allRatings.length === 0) return;

  // One batched upsert per match instead of a SELECT+UPSERT per player. On
  // expo-sqlite web each await is a worker round-trip; routing ALL fixtures through
  // the real engine means ~20 matches × 22 players/week, so per-player awaits made a
  // week-advance take ~minutes. ON CONFLICT accumulates with a minutes-weighted avg.
  const params: unknown[] = [];
  const rowsSql: string[] = [];
  for (const r of allRatings) {
    const t = tallyFor(r.playerId);
    rowsSql.push('(?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)');
    params.push(
      saveId, r.playerId, fixture.season, fixture.competitionId,
      t.goals, t.assists, t.yellowCards, t.redCards, r.rating, t.minutesPlayed,
    );
  }
  await db.prepare(
    `INSERT INTO player_stats
       (save_id, player_id, season, competition_id, appearances, goals, assists,
        yellow_cards, red_cards, avg_rating, minutes_played)
     VALUES ${rowsSql.join(',')}
     ON CONFLICT(player_id, season, competition_id) DO UPDATE SET
       appearances    = appearances + excluded.appearances,
       goals          = goals + excluded.goals,
       assists        = assists + excluded.assists,
       yellow_cards   = yellow_cards + excluded.yellow_cards,
       red_cards      = red_cards + excluded.red_cards,
       avg_rating     = CASE WHEN (minutes_played + excluded.minutes_played) > 0
                          THEN (avg_rating * minutes_played + excluded.avg_rating * excluded.minutes_played)
                               / (minutes_played + excluded.minutes_played)
                          ELSE avg_rating END,
       minutes_played = minutes_played + excluded.minutes_played`,
  ).run(...params);
}

// ─── Player data helpers ──────────────────────────────────────────────────────

// Compartilhado com human-match-consequences (recarrega o elenco completo p/ deltas).
export async function loadSquadWithAttributes(db: DbHandle, saveId: number, clubId: number): Promise<PlayerForPick[]> {
  // 2 queries (players + attributes batched) instead of the old 1+N getPlayerById
  // loop — critical on expo-sqlite web where every await is a worker round-trip and
  // the weekly loop loads ~40 clubs.
  const players = await getPlayersWithAttributesByClub(db, saveId, clubId);
  return players.map((p) => ({
    id: p.id,
    position: p.position,
    secondaryPosition: p.secondaryPosition,
    attributes: p.attributes,
    morale: p.morale,
    fitness: p.fitness,
    injuryWeeksLeft: p.injuryWeeksLeft,
    suspensionWeeksLeft: p.suspensionWeeksLeft,
  }));
}

// Loads one club's XI + bench (saved lineup or best-available) + tactic +
// reputation as the engine needs it. Shared by the weekly batch loader and the
// P4 halftime helper. Touches DB, so it lives in the loop file.
export async function loadClubMatchData(
  db: DbHandle,
  saveId: number,
  clubId: number,
): Promise<ClubMatchData> {
  const raw = await loadSquadWithAttributes(db, saveId, clubId);
  const club = await getClubById(db, saveId, clubId);
  const tactic = await getActiveTactic(db, saveId, clubId);
  const formation = tactic?.formation ?? '4-4-2';
  const lineup = tactic ? await getTacticLineup(db, saveId, tactic.id) : null;

  const squad = lineup
    ? buildSquadFromSavedIds(lineup.starterIds, raw, formation)
    : pickStartingEleven(raw, formation);
  const startIds = new Set(squad.map(p => p.id));
  const bench = lineup
    ? buildBenchFromSavedIds(lineup.benchIds, raw, startIds)
    : buildBench(raw, startIds);

  const resolvedTactic = tactic ?? {
    id: 0, clubId, name: 'Default', isActive: true,
    formation: '4-4-2' as const, mentality: 'balanced' as const,
    pressing: 'medium' as const, passingStyle: 'mixed' as const,
    tempo: 'normal' as const, width: 'normal' as const,
    attackFocus: 'balanced' as const, subStrategy: 'balanced' as const,
  };

  // P7: designated set-piece takers (null when no row — AI clubs and any club the
  // user never configured → undefined → engine auto-picks = legacy behavior).
  const setPieceTakers = (await getSetPieceTakers(db, saveId, clubId)) ?? undefined;

  return { clubId, reputation: club?.reputation ?? 50, squad, bench, tactic: resolvedTactic, setPieceTakers };
}

// Loads each club appearing in this week's fixtures once, keyed by clubId. Feeds
// the real engine for every match (human + AI).
async function loadWeekClubData(
  db: DbHandle,
  saveId: number,
  fixtures: Fixture[],
): Promise<Map<number, ClubMatchData>> {
  const clubIds = new Set<number>();
  for (const f of fixtures) { clubIds.add(f.homeClubId); clubIds.add(f.awayClubId); }

  const map = new Map<number, ClubMatchData>();
  for (const clubId of clubIds) {
    map.set(clubId, await loadClubMatchData(db, saveId, clubId));
  }
  return map;
}

// ─── Fase: simulação + persistência ──────────────────────────────────────────

export interface SimulateAndPersistInput {
  db: DbHandle;
  saveId: number;
  season: number;
  week: number;
  playerClubId: number;
  rng: SeededRng;
  userMatchResultOverride?: MatchResult;
}

export async function simulateAndPersist(input: SimulateAndPersistInput): Promise<MatchSetup> {
  const { db, saveId, season, week, playerClubId, rng, userMatchResultOverride } = input;

  // 1. Fixtures + batch-load every club playing this week (one query set per club).
  const fixtures = await getFixturesByWeek(db, saveId, season, week);
  const clubData = await loadWeekClubData(db, saveId, fixtures);

  // C8-e: recent-form modifier por jogador — só p/ o clube do usuário (custo
  // baixo). AI clubs ficam sem formModifiers ⇒ rating legado byte-for-byte. Não
  // consome RNG (formModifier é somado ao rating sem rolagem).
  const userClubData = clubData.get(playerClubId);
  if (userClubData) {
    const formMods = new Map<number, number>();
    for (const p of userClubData.squad) {
      const recent = await getLastNMatchForm(db, saveId, p.id, season, 5);
      const mod = computeFormModifier(recent);
      if (mod !== 0) formMods.set(p.id, mod);
    }
    if (formMods.size > 0) userClubData.formModifiers = formMods;
  }

  const playerFixture = fixtures.find(
    f => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  );

  // 2. Simulate fixtures with the real engine (human + AI, same engine — no
  //    reputation coin-flip). The runner sorts by fixture id for determinism.
  //    When the user's match was watched and resumed elsewhere, its result is
  //    supplied via userMatchResultOverride; we exclude that fixture from the
  //    batch (so the week rng stream is identical to the AI-only path) and inject
  //    the override into the result map afterwards.
  const useOverride = userMatchResultOverride != null && playerFixture != null;
  const simInputs: FixtureSimInput[] = fixtures
    .filter(f => !(useOverride && f.id === playerFixture!.id))
    .map(f => ({ fixtureId: f.id, homeClubId: f.homeClubId, awayClubId: f.awayClubId }));
  // C1: derby atmosphere per fixture. getRivalry does not consume the rng and the
  // fixture order is unchanged, so the match rng stream is identical when no rivalry
  // exists (deriveDerbyBonus(null) ⇒ neutral).
  const simInputsWithDerby: FixtureSimInput[] = [];
  for (const f of simInputs) {
    const rivalry = await getRivalry(db, saveId, f.homeClubId, f.awayClubId);
    simInputsWithDerby.push({ ...f, derbyBonus: deriveDerbyBonus(rivalry?.intensity ?? null) });
  }
  const simulated = simulateWeekFixtures({ fixtures: simInputsWithDerby, clubData, rng });
  const resultByFixture = new Map(simulated.map(s => [s.fixtureId, s.result]));
  if (useOverride) {
    resultByFixture.set(playerFixture!.id, userMatchResultOverride!);
  }

  let playerMatchResult: MatchResult | null = null;

  // 3. Persist every fixture; player_stats for ALL clubs; full event log only for
  //    the human match (the UI consumes it).
  for (const fixture of fixtures) {
    const result = resultByFixture.get(fixture.id);
    if (!result) continue;
    await updateFixtureResult(db, saveId, fixture.id, result.homeGoals, result.awayGoals, result.attendance);
    await persistMatchStats(db, saveId, fixture, result);
    if (playerFixture && fixture.id === playerFixture.id) {
      playerMatchResult = result;
      for (const event of result.events) {
        await addMatchEvent(db, {
          fixtureId: fixture.id,
          minute: event.minute,
          type: event.type,
          playerId: event.playerId,
          secondaryPlayerId: event.secondaryPlayerId,
        });
      }
    }
  }

  return { fixtures, clubData, playerFixture, resultByFixture, playerMatchResult };
}
