import { buildAnalyticsReport, ClubSample } from '@/engine/reports/analytics-report';

function sample(
  clubId: number,
  name: string,
  squadOverall: number,
  bestOverall: number,
  points: number,
  matchesPlayed: number,
  goalsFor: number,
  goalsAgainst: number,
): ClubSample {
  return { clubId, name, squadOverall, bestOverall, points, matchesPlayed, goalsFor, goalsAgainst };
}

describe('buildAnalyticsReport', () => {
  it('returns 5 ranking lines', () => {
    const samples = [
      sample(1, 'Aa', 75, 85, 15, 5, 10, 5),
      sample(2, 'Bb', 78, 88, 12, 5, 11, 6),
      sample(3, 'Cc', 72, 80, 18, 5, 14, 4),
    ];
    const r = buildAnalyticsReport({ playerClubId: 1, samples });
    expect(r.lines).toHaveLength(5);
    const metrics = r.lines.map((l) => l.metric);
    expect(metrics).toContain('Overall do elenco');
    expect(metrics).toContain('Ataque');
    expect(metrics).toContain('Defesa');
  });

  it('ranks the player club correctly in each metric', () => {
    const samples = [
      sample(1, 'Mine', 80, 90, 20, 5, 15, 3), // best in almost everything
      sample(2, 'Rival', 75, 85, 12, 5, 10, 6),
      sample(3, 'Weak', 65, 75, 3, 5, 4, 15),
    ];
    const r = buildAnalyticsReport({ playerClubId: 1, samples });
    const overallLine = r.lines.find((l) => l.metric === 'Overall do elenco')!;
    expect(overallLine.rank).toBe(1);
    expect(overallLine.total).toBe(3);

    const attack = r.lines.find((l) => l.metric === 'Ataque')!;
    expect(attack.rank).toBe(1);

    const defense = r.lines.find((l) => l.metric === 'Defesa')!;
    expect(defense.rank).toBe(1);
  });

  it('returns an empty report when the player club is missing', () => {
    const samples = [sample(2, 'X', 70, 80, 5, 2, 3, 2)];
    const r = buildAnalyticsReport({ playerClubId: 1, samples });
    expect(r.lines).toHaveLength(0);
  });

  it('returns a point-percentage-based aproveitamento metric', () => {
    const samples = [
      sample(1, 'A', 75, 80, 9, 5, 5, 5), // 60% (9/15)
      sample(2, 'B', 75, 80, 15, 5, 5, 5), // 100%
    ];
    const r = buildAnalyticsReport({ playerClubId: 1, samples });
    const apro = r.lines.find((l) => l.metric === 'Aproveitamento')!;
    expect(apro.rank).toBe(2); // Player club behind B
    expect(apro.value).toBeCloseTo(60);
  });
});
