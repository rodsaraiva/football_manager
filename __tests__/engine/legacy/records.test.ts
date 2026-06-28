import { computeClubRecords, RecordInputs } from '@/engine/legacy/records-engine';

const base: RecordInputs = {
  clubId: 10,
  scorers: [{ playerId: 1, goals: 80 }, { playerId: 2, goals: 80 }, { playerId: 3, goals: 40 }],
  appearances: [{ playerId: 2, games: 300 }, { playerId: 1, games: 250 }],
  results: [
    { fixtureId: 1, season: 1, gf: 5, ga: 0, opponentId: 12 },
    { fixtureId: 2, season: 1, gf: 0, ga: 4, opponentId: 13 },
    { fixtureId: 3, season: 1, gf: 5, ga: 0, opponentId: 14 },
    { fixtureId: 4, season: 2, gf: 1, ga: 1, opponentId: 15 },
    { fixtureId: 5, season: 2, gf: 2, ga: 0, opponentId: 16 },
  ],
  trophiesBySeason: new Map([[1, 2], [2, 0]]),
};

const byType = (rs: ReturnType<typeof computeClubRecords>, t: string) => rs.find((r) => r.type === t)!;

describe('computeClubRecords', () => {
  it('artilheiro histórico = maior gols, desempate menor playerId', () => {
    const r = byType(computeClubRecords(base), 'all_time_top_scorer');
    expect(r.value).toBe(80); expect(r.holderId).toBe(1);
  });
  it('mais jogos', () => {
    const r = byType(computeClubRecords(base), 'most_appearances');
    expect(r.value).toBe(300); expect(r.holderId).toBe(2);
  });
  it('maior goleada = maior saldo positivo, desempate menor fixtureId', () => {
    const r = byType(computeClubRecords(base), 'biggest_win');
    expect(r.value).toBe(5); expect(r.fixtureRef).toBe(1);
    expect(r.detail).toBe('5-0 vs Club 12');
  });
  it('maior derrota', () => {
    const r = byType(computeClubRecords(base), 'biggest_defeat');
    expect(r.value).toBe(4); expect(r.fixtureRef).toBe(2);
  });
  it('mais troféus numa temporada', () => {
    const r = byType(computeClubRecords(base), 'most_trophies_in_season');
    expect(r.value).toBe(2); expect(r.season).toBe(1);
  });
  it('maior sequência invicta (não derrota) cruzando temporadas', () => {
    const r = byType(computeClubRecords(base), 'longest_unbeaten');
    expect(r.value).toBe(3);
  });
  it('clube sem jogos → sem records de placar/sequência', () => {
    const out = computeClubRecords({ ...base, results: [] });
    expect(out.find((r) => r.type === 'biggest_win')).toBeUndefined();
    expect(out.find((r) => r.type === 'longest_unbeaten')).toBeUndefined();
    expect(out.find((r) => r.type === 'all_time_top_scorer')).toBeDefined();
  });
});
