import { DbHandle, getPlayersWithAttributesByClub, getPlayersByClub } from '@/database/queries/players';
import { getClubById } from '@/database/queries/clubs';
import { getActiveTactic, getTacticLineup } from '@/database/queries/tactics';
import { addFinanceEntry } from '@/database/queries/finances';
import { updateFriendlyResult, getFriendliesBySeason } from '@/database/queries/friendlies';
import {
  pickStartingEleven,
  buildSquadFromSavedIds,
  buildBenchFromSavedIds,
  buildBench,
  PlayerForPick,
} from '@/engine/simulation/squad-selection';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';
import { simulateMatch, MatchResult } from '@/engine/simulation/match-engine';
import { calculateWeeklyIncome } from '@/engine/finance/finance-engine';
import { applyFriendlyFitnessGain } from './preseason-engine';
import { computeFriendlyEffect } from './preseason-effects';
import { applyMoraleDelta } from '@/engine/morale/morale-engine';

interface LoadedClub {
  reputation: number;
  squad: PlayerForStrength[];
  bench: PlayerForStrength[];
  tactic: Tactic;
  startingIds: Set<number>;
}

const DEFAULT_TACTIC = (clubId: number): Tactic => ({
  id: 0, clubId, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced',
  pressing: 'medium', passingStyle: 'mixed',
  tempo: 'normal', width: 'normal',
  attackFocus: 'balanced', subStrategy: 'balanced',
});

async function loadClub(db: DbHandle, saveId: number, clubId: number): Promise<LoadedClub> {
  const players = await getPlayersWithAttributesByClub(db, saveId, clubId);
  const raw: PlayerForPick[] = players.map((p) => ({
    id: p.id,
    position: p.position,
    secondaryPosition: p.secondaryPosition,
    attributes: p.attributes,
    morale: p.morale,
    fitness: p.fitness,
    injuryWeeksLeft: p.injuryWeeksLeft,
    suspensionWeeksLeft: p.suspensionWeeksLeft,
  }));

  const club = await getClubById(db, saveId, clubId);
  const tactic = await getActiveTactic(db, saveId, clubId);
  const formation = tactic?.formation ?? '4-4-2';
  const lineup = tactic ? await getTacticLineup(db, saveId, tactic.id) : null;

  const squad = lineup
    ? buildSquadFromSavedIds(lineup.starterIds, raw, formation)
    : pickStartingEleven(raw, formation);
  const startingIds = new Set(squad.map((p) => p.id));
  const bench = lineup
    ? buildBenchFromSavedIds(lineup.benchIds, raw, startingIds)
    : buildBench(raw, startingIds);

  return {
    reputation: club?.reputation ?? 50,
    squad,
    bench,
    tactic: tactic ?? DEFAULT_TACTIC(clubId),
    startingIds,
  };
}

export interface PlayFriendlyParams {
  dbHandle: DbHandle;
  saveId: number;
  season: number;
  friendlyId: number;
  playerClubId: number;
  rng: SeededRng;
}

export interface PlayFriendlyResult {
  result: MatchResult;
  isHome: boolean;
}

/**
 * Simulates one pre-season friendly with the REAL match engine, then:
 *  - persists the score/attendance to the `friendlies` row (never `fixtures`),
 *  - books ticket revenue for the HOME club (category 'ticket'),
 *  - grants a small fitness boost to the player squad members who started.
 * No standings, no player_stats, no fixtures — nothing official is touched.
 */
export async function playFriendly(p: PlayFriendlyParams): Promise<PlayFriendlyResult> {
  const { dbHandle: db, saveId, season, friendlyId, playerClubId, rng } = p;

  const friendlies = await getFriendliesBySeason(db, saveId, season);
  const friendly = friendlies.find((f) => f.id === friendlyId);
  if (!friendly) throw new Error(`Friendly ${friendlyId} not found for save ${saveId}/season ${season}`);

  const home = await loadClub(db, saveId, friendly.homeClubId);
  const away = await loadClub(db, saveId, friendly.awayClubId);

  const result = simulateMatch({
    fixtureId: friendlyId,
    homeSquad: home.squad,
    awaySquad: away.squad,
    homeBench: home.bench,
    awayBench: away.bench,
    homeTactic: home.tactic,
    awayTactic: away.tactic,
    homeClubReputation: home.reputation,
    awayClubReputation: away.reputation,
    rng,
  });

  await updateFriendlyResult(db, saveId, friendlyId, result.homeGoals, result.awayGoals, result.attendance);

  // Ticket revenue for the home club — friendlies draw a gate too. Reuses the
  // weekly income model with the actual attendance the engine produced.
  const homeClub = await getClubById(db, saveId, friendly.homeClubId);
  if (homeClub) {
    const income = calculateWeeklyIncome({
      clubReputation: homeClub.reputation,
      stadiumCapacity: homeClub.stadiumCapacity,
      hasHomeMatch: true,
      leaguePosition: 1,
      season,
      week: 0,
      actualAttendance: result.attendance,
      competitionType: 'league',
    });
    if (income.ticket > 0) {
      await addFinanceEntry(db, saveId, {
        clubId: friendly.homeClubId,
        season,
        week: 0,
        type: 'ticket',
        amount: income.ticket,
        description: 'Pre-season friendly gate receipts',
      });
    }
  }

  // Fitness boost + morale/sharpness for the player squad's starters
  // (participants). Morale escala pela força do adversário; afiação é fixa por
  // jogo. applyFriendlyFitnessGain consome o RNG na MESMA posição do baseline
  // (1 roll por participante); computeFriendlyEffect não usa RNG.
  const isHome = friendly.homeClubId === playerClubId;
  const playerStartingIds = isHome ? home.startingIds : away.startingIds;
  const myGoals = isHome ? result.homeGoals : result.awayGoals;
  const oppGoals = isHome ? result.awayGoals : result.homeGoals;
  const myReputation = isHome ? home.reputation : away.reputation;
  const oppReputation = isHome ? away.reputation : home.reputation;
  const squad = await getPlayersByClub(db, saveId, playerClubId);
  for (const player of squad) {
    const participated = playerStartingIds.has(player.id);
    const nextFitness = applyFriendlyFitnessGain(player.fitness, participated, rng);
    const eff = computeFriendlyEffect({ myGoals, oppGoals, myReputation, oppReputation, participated });
    const nextMorale = applyMoraleDelta(player.morale, eff.moraleDelta);
    const sharpRow = (await db
      .prepare('SELECT match_sharpness AS s FROM players WHERE save_id = ? AND id = ?')
      .get(saveId, player.id)) as { s: number } | undefined;
    const nextSharp = Math.max(1, Math.min(100, (sharpRow?.s ?? 100) + eff.sharpnessDelta));
    await db
      .prepare('UPDATE players SET fitness = ?, morale = ?, match_sharpness = ? WHERE save_id = ? AND id = ?')
      .run(nextFitness, nextMorale, nextSharp, saveId, player.id);
  }

  return { result, isHome };
}
