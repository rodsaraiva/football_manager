import { projectClassification } from '@/engine/reports/classification-projection';
import { StandingsEntry } from '@/engine/competition/standings';

function entry(clubId: number, points: number): StandingsEntry {
  return {
    clubId, played: 10, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points,
  };
}

const standings: StandingsEntry[] = [
  entry(1, 30), entry(2, 27), entry(3, 24), entry(4, 21),
  entry(5, 18), entry(6, 15), entry(7, 12), entry(8, 9),
];

describe('projectClassification divisionLevel', () => {
  it('top division marks top-N as continental, not promotion', () => {
    const proj = projectClassification({
      currentStandings: standings, remainingFixtures: [],
      overallByClub: new Map(), leagueSize: 8, divisionLevel: 1,
    });
    expect(proj[0].status).toBe('title'); // pos 1
    expect(proj[1].status).toBe('continental'); // pos 2 (top 25%)
    expect(proj.some((p) => p.status === 'promotion')).toBe(false);
  });

  it('lower division keeps top-N as promotion', () => {
    const proj = projectClassification({
      currentStandings: standings, remainingFixtures: [],
      overallByClub: new Map(), leagueSize: 8, divisionLevel: 2,
    });
    expect(proj[1].status).toBe('promotion'); // pos 2
    expect(proj.some((p) => p.status === 'continental')).toBe(false);
  });

  it('defaults to division 1 (continental) when divisionLevel is omitted', () => {
    const proj = projectClassification({
      currentStandings: standings, remainingFixtures: [],
      overallByClub: new Map(), leagueSize: 8,
    });
    expect(proj[1].status).toBe('continental');
  });
});
