import {
  MISSION_DEFS,
  advanceMission,
  missionVerdict,
  MissionProgressRow,
} from '@/engine/scouting/scout-missions';

const row = (over: Partial<MissionProgressRow> = {}): MissionProgressRow => ({
  missionId: 1, type: 'short_eval', knowledge: 0, weeksElapsed: 0,
  scoutAbility: 10, archetypeMult: 1.0, ...over,
});

describe('MISSION_DEFS', () => {
  it('define os 4 tipos com prazos esperados', () => {
    expect(MISSION_DEFS.short_eval.durationWeeks).toBe(3);
    expect(MISSION_DEFS.long_project.durationWeeks).toBe(10);
    expect(MISSION_DEFS.opponent_intel.durationWeeks).toBe(1);
    expect(MISSION_DEFS.youth_prospect.durationWeeks).toBe(4);
    expect(MISSION_DEFS.long_project.revealsPotential).toBe(true);
    expect(MISSION_DEFS.short_eval.revealsPotential).toBe(false);
    expect(MISSION_DEFS.short_eval.weeklyPaceMult).toBeGreaterThan(MISSION_DEFS.long_project.weeklyPaceMult);
  });
});

describe('advanceMission', () => {
  it('soma conhecimento por ritmo*arquétipo e incrementa semana', () => {
    const r = advanceMission(row({ knowledge: 0 }));
    expect(r.weeksElapsed).toBe(1);
    expect(r.knowledge).toBeGreaterThan(0);
    expect(r.completed).toBe(false);
  });

  it('short_eval acumula mais rápido que long_project', () => {
    const s = advanceMission(row({ type: 'short_eval' }));
    const l = advanceMission(row({ type: 'long_project' }));
    expect(s.knowledge).toBeGreaterThan(l.knowledge);
  });

  it('arquétipo favorável acelera', () => {
    const base = advanceMission(row({ archetypeMult: 1.0 }));
    const boosted = advanceMission(row({ archetypeMult: 1.4 }));
    expect(boosted.knowledge).toBeGreaterThan(base.knowledge);
  });

  it('completa ao atingir 100', () => {
    const r = advanceMission(row({ knowledge: 99, scoutAbility: 20 }));
    expect(r.knowledge).toBe(100);
    expect(r.completed).toBe(true);
    expect(r.expiredEarly).toBe(false);
  });

  it('expira parcial quando vence o prazo sem 100 (knowledge mantido)', () => {
    const r = advanceMission(row({ type: 'short_eval', knowledge: 5, weeksElapsed: 2, scoutAbility: 1, archetypeMult: 0.7 }));
    expect(r.weeksElapsed).toBe(3);
    expect(r.completed).toBe(true);
    expect(r.expiredEarly).toBe(true);
    expect(r.knowledge).toBeGreaterThan(5);
  });

  it('opponent_intel completa em 1 semana (duração 1)', () => {
    const r = advanceMission(row({ type: 'opponent_intel', knowledge: 0, weeksElapsed: 0, scoutAbility: 1 }));
    expect(r.weeksElapsed).toBe(1);
    expect(r.completed).toBe(true);
  });
});

describe('missionVerdict', () => {
  it('mapeia faixas de conhecimento + overall', () => {
    expect(missionVerdict(100, 82).verdictKey).toBe('verdict.bargain');
    expect(missionVerdict(100, 70).verdictKey).toBe('verdict.solid');
    expect(missionVerdict(100, 55).verdictKey).toBe('verdict.risky');
    expect(missionVerdict(40, 70).verdictKey).toBe('verdict.inconclusive');
  });
});
