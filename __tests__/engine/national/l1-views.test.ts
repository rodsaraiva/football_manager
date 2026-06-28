import { Fixture } from '@/types';
import {
  activeNationalWindow,
  buildNationalSquadView,
  buildNationalCalendarView,
  NationalPoolPlayer,
  NationalCallUpLite,
} from '@/engine/national/national-views';
import { INTERNATIONAL_BREAK_WEEKS } from '@/engine/national/international-duty';

describe('activeNationalWindow', () => {
  it('retorna a próxima janela FIFA ≥ week', () => {
    expect(activeNationalWindow(1)).toBe(INTERNATIONAL_BREAK_WEEKS[0]);
    expect(activeNationalWindow(INTERNATIONAL_BREAK_WEEKS[1])).toBe(INTERNATIONAL_BREAK_WEEKS[1]);
    expect(activeNationalWindow(INTERNATIONAL_BREAK_WEEKS[1] + 1)).toBe(INTERNATIONAL_BREAK_WEEKS[2]);
  });

  it('passada a última janela, volta para a primeira', () => {
    const last = INTERNATIONAL_BREAK_WEEKS[INTERNATIONAL_BREAK_WEEKS.length - 1];
    expect(activeNationalWindow(last + 1)).toBe(INTERNATIONAL_BREAK_WEEKS[0]);
  });
});

describe('buildNationalSquadView', () => {
  const pool: NationalPoolPlayer[] = [
    { id: 1, name: 'GK', position: 'GK', overall: 80 },
    { id: 2, name: 'Star', position: 'ST', overall: 90 },
    { id: 3, name: 'Mid', position: 'CM', overall: 85 },
    { id: 4, name: 'Bench', position: 'CB', overall: 76 },
  ];

  it('ordena por overall desc e marca convocados/titulares/manual', () => {
    const callUps: NationalCallUpLite[] = [
      { playerId: 2, isStarter: true, source: 'auto' },
      { playerId: 3, isStarter: true, source: 'manual' },
      { playerId: 1, isStarter: false, source: 'auto' },
    ];
    const v = buildNationalSquadView(pool, callUps);
    expect(v.rows.map((r) => r.id)).toEqual([2, 3, 1, 4]);
    expect(v.calledCount).toBe(3);
    const star = v.rows.find((r) => r.id === 2)!;
    expect(star.calledUp && star.isStarter && !star.isManual).toBe(true);
    const mid = v.rows.find((r) => r.id === 3)!;
    expect(mid.isManual).toBe(true);
    expect(v.rows.find((r) => r.id === 4)!.calledUp).toBe(false);
  });

  it('XI prioriza titular manual sobre auto de maior overall', () => {
    const callUps: NationalCallUpLite[] = [
      { playerId: 2, isStarter: true, source: 'auto' },
      { playerId: 4, isStarter: true, source: 'manual' },
    ];
    const v = buildNationalSquadView(pool, callUps);
    expect(v.xi[0].id).toBe(4); // manual primeiro
    expect(v.xi.map((r) => r.id)).toEqual([4, 2]);
  });

  it('sem convocação cai para top-11 do pool', () => {
    const v = buildNationalSquadView(pool, []);
    expect(v.calledCount).toBe(0);
    expect(v.xi.map((r) => r.id)).toEqual([2, 3, 1, 4]);
  });
});

describe('buildNationalCalendarView', () => {
  const teams = [
    { id: 100, name: 'Brazil' },
    { id: 200, name: 'France' },
    { id: 300, name: 'Spain' },
  ];
  const fx = (over: Partial<Fixture>): Fixture => ({
    id: 0, competitionId: 10, season: 1, week: 7, round: 0,
    homeClubId: 100, awayClubId: 200, homeGoals: null, awayGoals: null,
    played: false, attendance: null, ...over,
  });

  it('particiona eliminatória x mata-mata e calcula a tabela', () => {
    const fixtures: Fixture[] = [
      fx({ id: 1, competitionId: 10, week: 7, round: 0, homeClubId: 100, awayClubId: 200, homeGoals: 2, awayGoals: 0, played: true }),
      fx({ id: 2, competitionId: 10, week: 15, round: 1, homeClubId: 300, awayClubId: 100, homeGoals: 1, awayGoals: 1, played: true }),
      fx({ id: 3, competitionId: 99, week: 31, round: 1, homeClubId: 100, awayClubId: 300 }),
    ];
    const v = buildNationalCalendarView({ fixtures, teams, qualifierCompetitionId: 10, userNationId: 100 });
    expect(v.qualifiers.map((f) => f.id)).toEqual([1, 2]);
    expect(v.knockout).toHaveLength(1);
    expect(v.knockout[0].fixtures[0].id).toBe(3);
    // Brazil: V + E = 4 pts no topo, com nome resolvido e flag de usuário.
    expect(v.standings[0].name).toBe('Brazil');
    expect(v.standings[0].points).toBe(4);
    expect(v.standings[0].isUser).toBe(true);
    expect(v.standings[0].rank).toBe(1);
    expect(v.qualifiers[0].involvesUser).toBe(true);
  });

  it('só fixtures da eliminatória entram na tabela (mata-mata não polui)', () => {
    const fixtures: Fixture[] = [
      fx({ id: 1, competitionId: 99, homeClubId: 100, awayClubId: 200, homeGoals: 5, awayGoals: 0, played: true }),
    ];
    const v = buildNationalCalendarView({ fixtures, teams, qualifierCompetitionId: 10, userNationId: null });
    expect(v.qualifiers).toHaveLength(0);
    expect(v.standings).toHaveLength(0);
  });
});
