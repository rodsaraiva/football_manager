import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { Fixture } from '@/types';
import { getFixturesByClub } from '@/database/queries/fixtures';
import { getFinancesBySeason } from '@/database/queries/finances';
import { getAllLeagues } from '@/database/queries/leagues';
import { getClubsByLeague, getAllClubs } from '@/database/queries/clubs';
import { calculateStandings } from '@/engine/competition/standings';
import { getPromotedForClub } from '@/database/queries/season-promoted';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { processSeasonEndBoard, SeasonEndBoardResult } from '@/engine/board/season-end-board';
import { isManagerDismissed } from '@/engine/board/season-outcome';
import { computeManagerReputationDelta } from '@/engine/board/manager-reputation-engine';
import { generateJobOffers, JobOfferCandidateClub } from '@/engine/board/job-offers-engine';
import { getManagerReputation, setManagerReputation, setJobOffersPending } from '@/database/queries/save';
import { insertJobOffer } from '@/database/queries/job-offers';

export interface SeasonEndEval {
  stats: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    leaguePosition: number | null;
    totalTeams: number;
    income: number;
    expenses: number;
  };
  board: SeasonEndBoardResult;
  managerRep: { before: number; after: number; delta: number };
  wonCup: boolean;
  wasPromoted: boolean;
  wasRelegated: boolean;
  generatedOfferClubIds: number[]; // [] se demitido ou sem ofertas
}

export interface EvaluateSeasonEndBoardParams {
  saveId: number;
  playerClubId: number;
  clubReputation: number;
  endedSeason: number;
  newSeason: number;
  competitions: { id: number; type: string }[];
  offerRng: SeededRng;
}

/**
 * Headless season-end board evaluation, extracted from EndOfSeasonScreen's load-effect.
 * Re-computes final stats + promotion/relegation/cup/squad strength internally, then runs
 * processSeasonEndBoard, accrues the career manager reputation (persisted), and generates
 * job offers (unless the manager was dismissed). Does NOT touch stores or achievements —
 * the UI wires those from the returned SeasonEndEval. Pure of React — takes a DbHandle.
 */
export async function evaluateSeasonEndBoard(
  db: DbHandle,
  p: EvaluateSeasonEndBoardParams,
): Promise<SeasonEndEval> {
  const { saveId, playerClubId, clubReputation, endedSeason, newSeason } = p;

  // ── Stats: results, league position, finances for the season that just ended ──
  const allFixtures = await getFixturesByClub(db, saveId, playerClubId, endedSeason);
  const played = allFixtures.filter((f) => f.played);

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const f of played) {
    const isHome = f.homeClubId === playerClubId;
    const myGoals = isHome ? (f.homeGoals ?? 0) : (f.awayGoals ?? 0);
    const oppGoals = isHome ? (f.awayGoals ?? 0) : (f.homeGoals ?? 0);
    goalsFor += myGoals;
    goalsAgainst += oppGoals;
    if (myGoals > oppGoals) wins++;
    else if (myGoals === oppGoals) draws++;
    else losses++;
  }

  // Resolve the player's league via the club row (clubReputation is passed; leagueId is not,
  // so fetch the club's league through getAllClubs to mirror the screen's playerClub.leagueId).
  const allClubs = await getAllClubs(db, saveId);
  const playerClub = allClubs.find((c) => c.id === playerClubId);
  const playerLeagueId = playerClub?.leagueId ?? -1;

  const leagueClubs = await getClubsByLeague(db, saveId, playerLeagueId);
  const clubIds = leagueClubs.map((c) => c.id);
  const totalTeams = leagueClubs.length;

  // The competitions param is shaped { id, type } only; to find the player's league competition
  // we need its leagueId — resolve it from the DB for the ended season.
  let leaguePosition: number | null = null;
  const leagueCompId = await resolvePlayerLeagueCompetitionId(db, saveId, endedSeason, playerLeagueId);
  if (leagueCompId != null) {
    const fixtureSet = new Map<number, Fixture>();
    for (const clubId of clubIds) {
      const clubFixtures = await getFixturesByClub(db, saveId, clubId, endedSeason);
      for (const f of clubFixtures) {
        if (f.competitionId === leagueCompId && f.played && !fixtureSet.has(f.id)) {
          fixtureSet.set(f.id, f);
        }
      }
    }
    const standings = calculateStandings(Array.from(fixtureSet.values()), clubIds);
    const idx = standings.findIndex((e) => e.clubId === playerClubId);
    leaguePosition = idx >= 0 ? idx + 1 : null;
  }

  const finances = await getFinancesBySeason(db, saveId, playerClubId, endedSeason);
  const income = finances.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const expenses = finances.filter((f) => f.amount < 0).reduce((s, f) => s + Math.abs(f.amount), 0);

  const stats = {
    played: played.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    leaguePosition,
    totalTeams,
    income,
    expenses,
  };

  // ── Promotion / relegation / cup detection ──
  const relegatedRow = (await db
    .prepare('SELECT id FROM season_relegated WHERE save_id = ? AND season = ? AND club_id = ? LIMIT 1')
    .get(saveId, endedSeason, playerClubId)) as { id: number } | undefined;
  const promotedRow = await getPromotedForClub(db, saveId, endedSeason, playerClubId);
  const wasRelegated = relegatedRow != null;
  const wasPromoted = promotedRow != null;

  // Real cup detection: any won domestic cup (exclude continental).
  let wonCup = false;
  for (const comp of p.competitions.filter((c) => c.type === 'cup')) {
    const champ = (await db
      .prepare('SELECT champion_club_id AS champ FROM season_competition_results WHERE save_id = ? AND season = ? AND competition_id = ?')
      .get(saveId, endedSeason, comp.id)) as { champ: number } | undefined;
    if (champ?.champ === playerClubId) {
      wonCup = true;
      break;
    }
  }

  // Real squad strength (drives the reputation squad bonus).
  const squadWithAttrs = await getPlayersWithAttributesByClub(db, saveId, playerClubId);
  const overalls = squadWithAttrs.map((pl) => calculateOverall(pl.attributes, pl.position));
  const squadAverageOverall = overalls.length
    ? overalls.reduce((s, v) => s + v, 0) / overalls.length
    : 70;

  // ── Board evaluation (persists trust/objective/reputation in the DB) ──
  const board = await processSeasonEndBoard({
    dbHandle: db,
    clubId: playerClubId,
    saveId,
    endedSeason,
    newSeason,
    leaguePosition,
    totalTeams,
    currentReputation: clubReputation,
    budgetBalance: income - expenses,
    wasRelegated,
    wasPromoted,
    wonLeague: leaguePosition === 1,
    wonCup,
    squadAverageOverall,
  });

  // ── Manager (career-wide) reputation accrual — persisted ──
  const objectiveMet = board.outcome !== 'objective_failed';
  const before = await getManagerReputation(db, saveId);
  const managerRepDelta = computeManagerReputationDelta({
    current: before,
    leaguePosition,
    totalTeams,
    wonLeague: leaguePosition === 1,
    wonCup,
    wasPromoted,
    wasRelegated,
    objectiveMet,
  });
  await setManagerReputation(db, saveId, managerRepDelta.next);
  const managerRep = { before, after: managerRepDelta.next, delta: managerRepDelta.delta };

  // ── Job offers — only when NOT fired (rescue offers are out of scope) ──
  const generatedOfferClubIds: number[] = [];
  if (!isManagerDismissed(board.consequence)) {
    const leaguesForDiv = await getAllLeagues(db);
    const divByLeague = new Map(leaguesForDiv.map((l) => [l.id, l.divisionLevel]));
    const candidates: JobOfferCandidateClub[] = allClubs.map((c) => ({
      id: c.id,
      reputation: c.reputation,
      divisionLevel: divByLeague.get(c.leagueId) ?? 1,
    }));
    const offers = generateJobOffers({
      managerReputation: managerRepDelta.next,
      currentClubId: playerClubId,
      currentClubReputation: clubReputation,
      candidates,
      rng: p.offerRng,
    });
    if (offers.length > 0) {
      for (const o of offers) {
        await insertJobOffer(db, saveId, endedSeason, o.offeringClubId);
        generatedOfferClubIds.push(o.offeringClubId);
      }
      await setJobOffersPending(db, saveId, true);
    }
  }

  return { stats, board, managerRep, wonCup, wasPromoted, wasRelegated, generatedOfferClubIds };
}

async function resolvePlayerLeagueCompetitionId(
  db: DbHandle,
  saveId: number,
  season: number,
  leagueId: number,
): Promise<number | null> {
  const row = (await db
    .prepare("SELECT id FROM competitions WHERE save_id = ? AND season = ? AND league_id = ? AND type = 'league' LIMIT 1")
    .get(saveId, season, leagueId)) as { id: number } | undefined;
  return row?.id ?? null;
}
