import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { Fixture } from '@/types';
import { getAllLeagues, getCompetitionsBySeason } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { getFixturesByClub } from '@/database/queries/fixtures';
import { calculateStandings } from '@/engine/competition/standings';
import { buildDivisionPairs, computeDivisionSwaps } from '@/engine/competition/promotion';
import { rolloverSeason, RolloverSeasonResult } from '@/engine/season-rollover';
import { processAssistantsSeasonEnd } from '@/engine/assistant/season-end-assistants';

export interface SeasonTransitionParams {
  saveId: number;
  playerClubId: number;
  endedSeason: number;
  newSeason: number;
  youthAcademyLevel: number;
  rng: SeededRng;
}

/**
 * Headless season-end mutation: assistants aging + promotion/relegation + rolloverSeason.
 * Extracted 1:1 from EndOfSeasonScreen.handleContinue. Pure of React — takes a DbHandle.
 */
export async function runSeasonTransition(
  db: DbHandle,
  p: SeasonTransitionParams,
): Promise<RolloverSeasonResult> {
  // Assistants: age/retire loop persisted in the DB.
  await processAssistantsSeasonEnd(db, p.saveId);

  // Promotion/relegation: physically move clubs between linked divisions using
  // each league's FINAL standings, BEFORE rolloverSeason regenerates the calendar
  // (so the new season's fixtures reflect the post-swap divisions).
  const swapLeagues = await getAllLeagues(db);
  const standingsByLeague = new Map<number, number[]>();
  const competitionsEnded = await getCompetitionsBySeason(db, p.saveId, p.endedSeason);
  for (const lg of swapLeagues) {
    const leagueComp = competitionsEnded.find((c) => c.leagueId === lg.id && c.type === 'league');
    if (!leagueComp) continue;
    const lgClubs = await getClubsByLeague(db, p.saveId, lg.id);
    const lgClubIds = lgClubs.map((c) => c.id);
    const fxSet = new Map<number, Fixture>();
    for (const cid of lgClubIds) {
      const cf = await getFixturesByClub(db, p.saveId, cid, p.endedSeason);
      for (const f of cf) {
        if (f.competitionId === leagueComp.id && f.played && !fxSet.has(f.id)) fxSet.set(f.id, f);
      }
    }
    const ordered = calculateStandings(Array.from(fxSet.values()), lgClubIds);
    standingsByLeague.set(lg.id, ordered.map((e) => e.clubId));
  }
  const divisionSwaps = computeDivisionSwaps(buildDivisionPairs(swapLeagues), standingsByLeague);
  for (const s of divisionSwaps) {
    await db.prepare('UPDATE clubs SET league_id = ? WHERE save_id = ? AND id = ?').run(s.toLeagueId, p.saveId, s.clubId);
  }

  // Transactional rollover: age players, expire contracts, return loans,
  // recalc potential, generate youth, regenerate the new-season calendar.
  return rolloverSeason({
    dbHandle: db,
    playerClubId: p.playerClubId,
    saveId: p.saveId,
    endedSeason: p.endedSeason,
    newSeason: p.newSeason,
    youthAcademyLevel: p.youthAcademyLevel,
    rng: p.rng,
  });
}
