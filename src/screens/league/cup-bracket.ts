import { DbHandle } from '@/database/queries/players';
import { getFixturesByWeek } from '@/database/queries/fixtures';
import { getClubById } from '@/database/queries/clubs';

export interface CupTie {
  homeClubId: number;
  awayClubId: number;
  homeName: string;
  awayName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface CupRound {
  round: number;
  ties: CupTie[];
}

/** Cup fixtures up to `maxWeek`, grouped by round (asc). Renders whatever exists. */
export async function buildCupBracket(
  db: DbHandle,
  saveId: number,
  season: number,
  maxWeek: number,
  competitionId: number,
): Promise<CupRound[]> {
  const byRound = new Map<number, CupTie[]>();
  const nameCache = new Map<number, string>();

  async function nameOf(clubId: number): Promise<string> {
    const cached = nameCache.get(clubId);
    if (cached) return cached;
    const club = await getClubById(db, saveId, clubId);
    const name = club?.name ?? `#${clubId}`;
    nameCache.set(clubId, name);
    return name;
  }

  for (let w = 1; w <= maxWeek; w++) {
    const weekFixtures = await getFixturesByWeek(db, saveId, season, w);
    for (const f of weekFixtures) {
      if (f.competitionId !== competitionId) continue;
      // fixtures.round is a TEXT column typed as `number | null` by rowToFixture;
      // coerce to a real number so Map keys / sort / output are numeric.
      const round = Number(f.round ?? 1);
      const tie: CupTie = {
        homeClubId: f.homeClubId,
        awayClubId: f.awayClubId,
        homeName: await nameOf(f.homeClubId),
        awayName: await nameOf(f.awayClubId),
        homeGoals: f.homeGoals,
        awayGoals: f.awayGoals,
      };
      const list = byRound.get(round) ?? [];
      list.push(tie);
      byRound.set(round, list);
    }
  }

  return [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((round) => ({ round, ties: byRound.get(round)! }));
}
