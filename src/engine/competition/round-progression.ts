import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { createFixture, addMatchEvent } from '@/database/queries/fixtures';
import {
  resolveKnockoutTie,
  buildNextKnockoutRound,
  isKnockoutComplete,
  seedClChampionsKnockout,
  PlayedKnockoutFixture,
} from './knockout';

interface CompRow { id: number; type: string; format: string; }
interface FxRow {
  id: number; round: string | null; played: number;
  home_club_id: number; away_club_id: number;
  home_goals: number | null; away_goals: number | null;
}

// Fixture ids are offset per save (saveOffset); the next id stays inside this
// save's id band, so scope the MAX by save_id.
async function nextFixtureId(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db.prepare('SELECT MAX(id) AS m FROM fixtures WHERE save_id = ?').get(saveId)) as { m: number | null };
  return (row.m ?? 0) + 1;
}

async function reputationMap(db: DbHandle, saveId: number, clubIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  for (const id of clubIds) {
    const row = (await db.prepare('SELECT reputation FROM clubs WHERE save_id = ? AND id = ?').get(saveId, id)) as { reputation: number } | undefined;
    map.set(id, row?.reputation ?? 0);
  }
  return map;
}

/**
 * After a week is simulated, advance any knockout competition whose current max
 * round is fully played and which still has >1 club alive. Idempotent: only
 * generates a round number that does not yet exist.
 */
export async function maybeGenerateNextKnockoutRound(
  db: DbHandle,
  saveId: number,
  season: number,
  week: number,
  rng: SeededRng,
): Promise<void> {
  const comps = (await db
    .prepare(
      `SELECT id, type, format FROM competitions
       WHERE save_id = ? AND season = ? AND (type = 'cup' OR type = 'continental')`,
    )
    .all(saveId, season)) as CompRow[];

  for (const comp of comps) {
    const fixtures = (await db
      .prepare(
        `SELECT id, round, played, home_club_id, away_club_id, home_goals, away_goals
         FROM fixtures WHERE save_id = ? AND competition_id = ? AND season = ?`,
      )
      .all(saveId, comp.id, season)) as FxRow[];

    // Knockout rounds only: numeric round. CL group fixtures have round IS NULL.
    const ko = fixtures.filter((f) => f.round != null && !Number.isNaN(Number(f.round)));

    if (ko.length === 0) {
      // No knockout round yet. For a CL group_knockout, once the group stage is
      // fully played, seed round 1 of the knockout from the group standings.
      if (comp.format === 'group_knockout') {
        await maybeSeedClKnockout(db, saveId, comp.id, season, week, fixtures);
      }
      continue;
    }

    const maxRound = Math.max(...ko.map((f) => Number(f.round)));
    const currentRoundFixtures = ko.filter((f) => Number(f.round) === maxRound);
    if (currentRoundFixtures.some((f) => f.played !== 1)) continue; // round not finished

    // Resolve every tie in the current round (shootout on draws → persist event).
    const winners: number[] = [];
    for (const f of currentRoundFixtures) {
      const played: PlayedKnockoutFixture = {
        homeClubId: f.home_club_id, awayClubId: f.away_club_id,
        homeGoals: f.home_goals ?? 0, awayGoals: f.away_goals ?? 0, round: maxRound,
      };
      const result = resolveKnockoutTie(played, rng);
      winners.push(result.winnerClubId);
      if (result.viaShootout) {
        // Sentinel encoding (see spec §6): minute 120, player_id=winner clubId,
        // secondary_player_id=loser clubId. Club ids ⊆ player ids (seed structure),
        // so the players(id) FK is satisfied; the archiver reads them as club ids.
        await addMatchEvent(db, {
          fixtureId: f.id, minute: 120, type: 'penalty_shootout',
          playerId: result.winnerClubId, secondaryPlayerId: result.loserClubId,
        });
      }
    }

    // Pending byes: entries not present in any knockout fixture so far.
    const entries = (await db
      .prepare('SELECT club_id FROM competition_entries WHERE save_id = ? AND competition_id = ?')
      .all(saveId, comp.id)) as Array<{ club_id: number }>;
    const seenInKo = new Set(ko.flatMap((f) => [f.home_club_id, f.away_club_id]));
    const pendingByeClubIds = entries
      .map((e) => e.club_id)
      .filter((c) => !seenInKo.has(c));

    if (isKnockoutComplete(winners, pendingByeClubIds)) continue;

    const repMap = await reputationMap(db, saveId, [...winners, ...pendingByeClubIds]);
    const { fixtures: nextFixtures } = buildNextKnockoutRound({
      competitionId: comp.id, season, completedRound: maxRound,
      winners, pendingByeClubIds, week: week + 2, reputationByClubId: repMap,
    });

    let fid = await nextFixtureId(db, saveId);
    for (const nf of nextFixtures) {
      await createFixture(db, saveId, {
        id: fid++, competitionId: nf.competitionId, season,
        week: nf.week, round: String(nf.round),
        homeClubId: nf.homeClubId, awayClubId: nf.awayClubId,
      });
    }
  }
}

async function maybeSeedClKnockout(
  db: DbHandle,
  saveId: number,
  competitionId: number,
  season: number,
  week: number,
  fixtures: FxRow[],
): Promise<void> {
  const groupFixtures = fixtures.filter((f) => f.round == null);
  if (groupFixtures.length === 0 || groupFixtures.some((f) => f.played !== 1)) return;

  // Build per-group standings from group fixtures + entries.
  const entries = (await db
    .prepare('SELECT club_id, group_name FROM competition_entries WHERE save_id = ? AND competition_id = ? AND group_name IS NOT NULL ORDER BY group_name, club_id')
    .all(saveId, competitionId)) as Array<{ club_id: number; group_name: string }>;
  if (entries.length === 0) return;

  const groups: Record<string, number[]> = {};
  const points = new Map<number, number>();
  const gd = new Map<number, number>();
  for (const e of entries) { points.set(e.club_id, 0); gd.set(e.club_id, 0); (groups[e.group_name] ??= []).push(e.club_id); }
  for (const f of groupFixtures) {
    if (f.home_goals == null || f.away_goals == null) continue;
    gd.set(f.home_club_id, (gd.get(f.home_club_id) ?? 0) + f.home_goals - f.away_goals);
    gd.set(f.away_club_id, (gd.get(f.away_club_id) ?? 0) + f.away_goals - f.home_goals);
    if (f.home_goals > f.away_goals) points.set(f.home_club_id, (points.get(f.home_club_id) ?? 0) + 3);
    else if (f.away_goals > f.home_goals) points.set(f.away_club_id, (points.get(f.away_club_id) ?? 0) + 3);
    else { points.set(f.home_club_id, (points.get(f.home_club_id) ?? 0) + 1); points.set(f.away_club_id, (points.get(f.away_club_id) ?? 0) + 1); }
  }
  for (const name of Object.keys(groups)) {
    groups[name].sort((a, b) => (points.get(b)! - points.get(a)!) || (gd.get(b)! - gd.get(a)!) || (a - b));
  }

  const koFixtures = seedClChampionsKnockout({ competitionId, season, week: week + 2, groups });
  let fid = await nextFixtureId(db, saveId);
  for (const nf of koFixtures) {
    await createFixture(db, saveId, {
      id: fid++, competitionId: nf.competitionId, season,
      week: nf.week, round: String(nf.round),
      homeClubId: nf.homeClubId, awayClubId: nf.awayClubId,
    });
  }
}
