import { buildOpponentReport, OpponentPlayer } from '@/engine/reports/opponent-report';
import { Fixture, MatchEvent } from '@/types';
import { PlayerAttributes } from '@/types/player';

const ME = 10;
const OPP = 20;

function mkAttrs(o: Partial<PlayerAttributes> = {}): PlayerAttributes {
  const base = 60;
  return {
    finishing: base, passing: base, crossing: base, dribbling: base, heading: base,
    longShots: base, freeKicks: base, vision: base, composure: base, decisions: base,
    positioning: base, aggression: base, leadership: base, pace: base, stamina: base,
    strength: base, agility: base, jumping: base, ...o,
  };
}
function mkFixture(id: number, o: Partial<Fixture> = {}): Fixture {
  return {
    id, competitionId: 1, season: 1, week: o.week ?? 5, round: null,
    homeClubId: o.homeClubId ?? OPP, awayClubId: o.awayClubId ?? 99,
    homeGoals: o.homeGoals ?? 2, awayGoals: o.awayGoals ?? 0,
    played: true, attendance: 10000,
  };
}
function mkOpp(id: number, position: OpponentPlayer['position'], attrs: PlayerAttributes): OpponentPlayer & { attributes: PlayerAttributes } {
  return { id, name: `O${id}`, position, overall: 0, attributes: attrs };
}

describe('buildOpponentReport', () => {
  it('rotula reputação: Favorito (>+15), Equilíbrio, Zebra (<-15) e detecta mando', () => {
    const next = mkFixture(1, { homeClubId: ME, awayClubId: OPP });
    const base = {
      nextFixture: next, playerClubId: ME, playerClubReputation: 50,
      opponentClubId: OPP, opponentName: 'Rival',
      opponentRecentFixtures: [], opponentSquad: [], eventsByFixture: new Map<number, MatchEvent[]>(),
    };
    expect(buildOpponentReport({ ...base, opponentReputation: 80 }).reputationLabel).toBe('Favorito');
    expect(buildOpponentReport({ ...base, opponentReputation: 50 }).reputationLabel).toBe('Equilíbrio');
    expect(buildOpponentReport({ ...base, opponentReputation: 20 }).reputationLabel).toBe('Zebra');
    expect(buildOpponentReport({ ...base, opponentReputation: 50 }).isHome).toBe(true);
  });

  it('calcula recentForm (W/D/L do ponto de vista do adversário) e médias de gols', () => {
    const recent = [
      mkFixture(101, { homeClubId: OPP, homeGoals: 3, awayGoals: 0 }), // W, gf3 ga0
      mkFixture(102, { homeClubId: 99, awayClubId: OPP, homeGoals: 1, awayGoals: 1 }), // D, gf1 ga1
    ];
    const r = buildOpponentReport({
      nextFixture: mkFixture(1, { homeClubId: ME, awayClubId: OPP }),
      playerClubId: ME, playerClubReputation: 50, opponentClubId: OPP, opponentName: 'Rival',
      opponentReputation: 50, opponentRecentFixtures: recent, opponentSquad: [],
      eventsByFixture: new Map(),
    });
    expect(r.recentForm.map((f) => f.result)).toEqual(['W', 'D']);
    expect(r.goalsPerGame).toBe(2);     // (3+1)/2
    expect(r.concededPerGame).toBe(0.5); // (0+1)/2
  });

  it('top 3 por overall calculado dos atributos + média do elenco', () => {
    const squad = [
      mkOpp(1, 'ST', mkAttrs({ finishing: 95, pace: 95 })),
      mkOpp(2, 'CB', mkAttrs({ heading: 40 })),
      mkOpp(3, 'GK', mkAttrs({ positioning: 50 })),
      mkOpp(4, 'CM', mkAttrs({ passing: 70 })),
    ];
    const r = buildOpponentReport({
      nextFixture: mkFixture(1, { homeClubId: ME, awayClubId: OPP }),
      playerClubId: ME, playerClubReputation: 50, opponentClubId: OPP, opponentName: 'Rival',
      opponentReputation: 50, opponentRecentFixtures: [], opponentSquad: squad,
      eventsByFixture: new Map(),
    });
    expect(r.topPlayers).toHaveLength(3);
    expect(r.topPlayers[0].id).toBe(1); // melhor overall
    expect(r.squadAvgOverall).toBeGreaterThan(0);
  });

  it('alerta de sequência de 3 vitórias seguidas', () => {
    const recent = [
      mkFixture(101, { homeClubId: OPP, homeGoals: 1, awayGoals: 0 }),
      mkFixture(102, { homeClubId: OPP, homeGoals: 2, awayGoals: 1 }),
      mkFixture(103, { homeClubId: OPP, homeGoals: 3, awayGoals: 0 }),
    ];
    const r = buildOpponentReport({
      nextFixture: mkFixture(1, { homeClubId: ME, awayClubId: OPP }),
      playerClubId: ME, playerClubReputation: 50, opponentClubId: OPP, opponentName: 'Rival',
      opponentReputation: 50, opponentRecentFixtures: recent, opponentSquad: [],
      eventsByFixture: new Map(),
    });
    expect(r.alertMessage).toContain('Rival');
  });

  it('sem fixtures/sem elenco -> médias 0, top vazio, alerta null', () => {
    const r = buildOpponentReport({
      nextFixture: mkFixture(1, { homeClubId: OPP, awayClubId: ME }),
      playerClubId: ME, playerClubReputation: 50, opponentClubId: OPP, opponentName: 'Rival',
      opponentReputation: 50, opponentRecentFixtures: [], opponentSquad: [],
      eventsByFixture: new Map(),
    });
    expect(r.goalsPerGame).toBe(0);
    expect(r.topPlayers).toEqual([]);
    expect(r.squadAvgOverall).toBe(0);
    expect(r.alertMessage).toBeNull();
    expect(r.isHome).toBe(false); // ME é visitante
  });
});
