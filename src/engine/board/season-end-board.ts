import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { computeReputationDelta } from '@/engine/board/reputation-engine';
import { generateObjective } from '@/engine/board/objective-generator';
import { computeTrustDelta } from '@/engine/board/trust-engine';
import {
  insertReputationHistory, getReputationHistory, upsertBoardObjective, getBoardObjective,
  insertTrustHistory, getSaveBoardTrust, updateSaveBoardTrust,
} from '@/database/queries/board';
import { BoardObjective, ReputationHistoryEntry, TrustConsequence, TrustOutcome } from '@/types/board';

export interface SeasonEndBoardParams {
  dbHandle: DbHandle;
  clubId: number;
  saveId: number;
  endedSeason: number;
  newSeason: number;
  leaguePosition: number | null;
  totalTeams: number;
  currentReputation: number;
  budgetBalance: number;
  wasRelegated: boolean;
  wasPromoted: boolean;
  wonLeague: boolean;
  wonCup: boolean;
}

export interface SeasonEndBoardResult {
  oldReputation: number;
  newReputation: number;
  reputationDelta: number;
  newTrust: number;
  outcome: TrustOutcome;
  consequence: TrustConsequence;
  newObjective: BoardObjective | null;
  objectiveDescription: string;
  reputationHistory: ReputationHistoryEntry[];
}

/**
 * Board season-end pipeline extracted verbatim from EndOfSeasonScreen.processSeasonEndBoard,
 * with the store callbacks removed: returns a plain result the screen applies. Pure of React —
 * the engine computes/persists, the caller wires stores. Covers the null-objective loop case.
 */
export async function processSeasonEndBoard(p: SeasonEndBoardParams): Promise<SeasonEndBoardResult> {
  const { dbHandle: db, clubId, saveId, endedSeason, newSeason, leaguePosition, totalTeams, currentReputation, budgetBalance, wasRelegated, wasPromoted, wonLeague, wonCup } = p;

  // 1. Reputation delta.
  const repResult = computeReputationDelta({
    currentReputation,
    leaguePosition: leaguePosition ?? Math.ceil(totalTeams / 2),
    totalTeams,
    wonLeague, wonCup, wasRelegated, wasPromoted,
    budgetBalance,
    squadAverageOverall: 70,
    staffAverageAbility: 10,
  });

  // 2. Persist reputation history + update club.
  await insertReputationHistory(db, saveId, { clubId, season: endedSeason, reputation: repResult.newReputation, delta: repResult.delta }).catch(() => {});
  await db.prepare('UPDATE clubs SET reputation = ? WHERE save_id = ? AND id = ?').run(repResult.newReputation, saveId, clubId);

  // 3. Trust delta.
  const currentTrust = await getSaveBoardTrust(db, saveId);
  const prevObjective = await getBoardObjective(db, saveId, clubId, endedSeason);
  const trustResult = computeTrustDelta({
    currentTrust,
    objectiveType: prevObjective?.type ?? 'no_relegation',
    objectiveTarget: prevObjective?.target ?? null,
    leaguePosition,
    totalTeams,
    wonCup, wasRelegated, wasPromoted,
    reputationDelta: repResult.delta,
    budgetBalance,
  });

  // 4. Persist trust history + update save.
  await insertTrustHistory(db, saveId, { clubId, season: endedSeason, trust: trustResult.newTrust, outcome: trustResult.outcome }).catch(() => {});
  await updateSaveBoardTrust(db, saveId, trustResult.newTrust);

  // 5. Budget consequence.
  if (trustResult.consequence === 'budget_cut') {
    await db.prepare('UPDATE clubs SET budget = CAST(budget * 0.8 AS INTEGER) WHERE save_id = ? AND id = ?').run(saveId, clubId);
  } else if (trustResult.consequence === 'budget_bonus') {
    await db.prepare('UPDATE clubs SET budget = CAST(budget * 1.1 AS INTEGER) WHERE save_id = ? AND id = ?').run(saveId, clubId);
  }

  // 6. Objective for the NEW season.
  const objective = generateObjective({
    clubReputation: repResult.newReputation,
    currentLeaguePosition: leaguePosition,
    totalTeams,
    divisionLevel: 1,
    wasRelegated, wasPromoted,
    rng: new SeededRng(newSeason * 31337 + clubId),
  });
  await upsertBoardObjective(db, saveId, { clubId, season: newSeason, type: objective.type, target: objective.target, description: objective.description });

  // 7. Read back for the caller.
  const newObjective = await getBoardObjective(db, saveId, clubId, newSeason);
  const reputationHistory = await getReputationHistory(db, saveId, clubId);

  return {
    oldReputation: currentReputation,
    newReputation: repResult.newReputation,
    reputationDelta: repResult.delta,
    newTrust: trustResult.newTrust,
    outcome: trustResult.outcome,
    consequence: trustResult.consequence,
    newObjective,
    objectiveDescription: objective.description,
    reputationHistory,
  };
}
