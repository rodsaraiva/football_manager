import { rankLegends, LegendCandidate } from '@/engine/legacy/legends-engine';

const c = (over: Partial<LegendCandidate>): LegendCandidate => ({
  playerId: 1, clubId: 10, appearances: 0, goals: 0, assists: 0,
  trophies: 0, individualAwards: 0, firstSeason: 1, lastSeason: 1, ...over,
});

describe('rankLegends', () => {
  it('rankeia por score composto (títulos+gols+aparições+prêmios) e normaliza 0..100', () => {
    const top = c({ playerId: 1, appearances: 200, goals: 100, trophies: 5, individualAwards: 3 });
    const mid = c({ playerId: 2, appearances: 150, goals: 40, trophies: 1 });
    const out = rankLegends([mid, top], 10);
    expect(out[0].playerId).toBe(1);
    expect(out[0].legendScore).toBe(100);
    expect(out[1].playerId).toBe(2);
    expect(out[1].legendScore).toBeLessThan(100);
    expect(out[0].appearances).toBe(200);
  });

  it('exclui jogadores com 0 aparições', () => {
    const played = c({ playerId: 1, appearances: 10, goals: 1 });
    const ghost = c({ playerId: 2, appearances: 0, goals: 5, trophies: 9 });
    const out = rankLegends([played, ghost], 10);
    expect(out.map((l) => l.playerId)).toEqual([1]);
  });

  it('desempata por playerId ASC e respeita limit', () => {
    const a = c({ playerId: 9, appearances: 50, goals: 10 });
    const b = c({ playerId: 3, appearances: 50, goals: 10 });
    const out = rankLegends([a, b], 1);
    expect(out).toHaveLength(1);
    expect(out[0].playerId).toBe(3);
  });

  it('conjunto vazio → []', () => {
    expect(rankLegends([], 5)).toEqual([]);
  });
});
