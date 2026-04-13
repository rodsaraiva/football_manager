import { generateRoundRobin, generateKnockoutRound, FixtureInput } from '@/engine/competition/fixture-generator';

describe('generateRoundRobin', () => {
  it('generates correct number of fixtures for 20 teams', () => {
    const teamIds = Array.from({ length: 20 }, (_, i) => i + 1);
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 7 });
    expect(fixtures).toHaveLength(380);
  });

  it('generates correct number of fixtures for 18 teams', () => {
    const teamIds = Array.from({ length: 18 }, (_, i) => i + 1);
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 7 });
    expect(fixtures).toHaveLength(306);
  });

  it('every team plays every other team twice (home and away)', () => {
    const teamIds = [1, 2, 3, 4];
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 1 });
    expect(fixtures).toHaveLength(12);
    for (const a of teamIds) {
      for (const b of teamIds) {
        if (a === b) continue;
        const match = fixtures.find(f => f.homeClubId === a && f.awayClubId === b);
        expect(match).toBeDefined();
      }
    }
  });

  it('no team plays itself', () => {
    const teamIds = Array.from({ length: 20 }, (_, i) => i + 1);
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 7 });
    for (const f of fixtures) {
      expect(f.homeClubId).not.toBe(f.awayClubId);
    }
  });

  it('no team plays more than one match per week', () => {
    const teamIds = Array.from({ length: 20 }, (_, i) => i + 1);
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 7 });
    const weekMap = new Map<number, Set<number>>();
    for (const f of fixtures) {
      if (!weekMap.has(f.week)) weekMap.set(f.week, new Set());
      const teams = weekMap.get(f.week)!;
      expect(teams.has(f.homeClubId)).toBe(false);
      expect(teams.has(f.awayClubId)).toBe(false);
      teams.add(f.homeClubId);
      teams.add(f.awayClubId);
    }
  });

  it('assigns sequential weeks starting from startWeek', () => {
    const teamIds = [1, 2, 3, 4];
    const fixtures = generateRoundRobin(teamIds, { competitionId: 1, season: 1, startWeek: 10 });
    const weeks = [...new Set(fixtures.map(f => f.week))].sort((a, b) => a - b);
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toBe(10);
  });

  it('returns FixtureInput objects with correct fields', () => {
    const fixtures = generateRoundRobin([1, 2, 3, 4], { competitionId: 5, season: 2, startWeek: 1 });
    for (const f of fixtures) {
      expect(f.competitionId).toBe(5);
      expect(f.season).toBe(2);
      expect(typeof f.homeClubId).toBe('number');
      expect(typeof f.awayClubId).toBe('number');
      expect(typeof f.week).toBe('number');
    }
  });
});

describe('generateKnockoutRound', () => {
  it('generates correct number of fixtures for 16 teams', () => {
    const teamIds = Array.from({ length: 16 }, (_, i) => i + 1);
    const fixtures = generateKnockoutRound(teamIds, { competitionId: 1, season: 1, week: 20, round: 1 });
    expect(fixtures).toHaveLength(8);
  });

  it('pairs teams sequentially (1v2, 3v4, ...)', () => {
    const teamIds = [10, 20, 30, 40];
    const fixtures = generateKnockoutRound(teamIds, { competitionId: 1, season: 1, week: 20, round: 1 });
    expect(fixtures[0].homeClubId).toBe(10);
    expect(fixtures[0].awayClubId).toBe(20);
    expect(fixtures[1].homeClubId).toBe(30);
    expect(fixtures[1].awayClubId).toBe(40);
  });

  it('assigns the specified round number', () => {
    const fixtures = generateKnockoutRound([1, 2], { competitionId: 1, season: 1, week: 30, round: 3 });
    expect(fixtures[0].round).toBe(3);
  });
});
