import { classifySeasonSaga, SagaInput } from '@/engine/legacy/saga-engine';

const inp = (over: Partial<SagaInput>): SagaInput => ({
  season: 3, leaguePosition: 8, totalTeams: 20, expectedPosition: 8,
  wonLeague: false, wonCup: false, wasPromoted: false, wasRelegated: false, trophies: 0, ...over,
});

describe('classifySeasonSaga', () => {
  it('campeão com 2+ troféus → historic_title e chaves i18n', () => {
    const s = classifySeasonSaga(inp({ leaguePosition: 1, wonLeague: true, trophies: 2 }));
    expect(s.archetype).toBe('historic_title');
    expect(s.titleKey).toBe('saga.historic_title.title');
    expect(s.bodyKey).toBe('saga.historic_title.body');
    expect(s.vars.season).toBe(3);
  });
  it('rebaixado → relegated', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 19, wasRelegated: true })).archetype).toBe('relegated');
  });
  it('alvo do board superado por folga → overachieved', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 3, expectedPosition: 10 })).archetype).toBe('overachieved');
  });
  it('muito abaixo do alvo → underachieved', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 15, expectedPosition: 6 })).archetype).toBe('underachieved');
  });
  it('promovido → promotion', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 2, wasPromoted: true, expectedPosition: null })).archetype).toBe('promotion');
  });
  it('briga contra rebaixamento (parte de baixo da tabela)', () => {
    expect(classifySeasonSaga(inp({ leaguePosition: 17, totalTeams: 20, expectedPosition: null })).archetype).toBe('relegation_fight');
  });
});
