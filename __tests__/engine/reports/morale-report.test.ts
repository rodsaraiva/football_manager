import { buildMoraleReport } from '@/engine/reports/morale-report';
import { SquadPlayer } from '@/engine/reports/technical-report';

function mkPlayer(id: number, morale: number | undefined, position: SquadPlayer['position'] = 'ST'): SquadPlayer {
  return {
    id, name: `P${id}`, age: 25, position,
    overall: 75, basePotential: 80, effectivePotential: 80,
    injuryWeeksLeft: 0, morale,
  };
}

describe('buildMoraleReport', () => {
  it('calcula média arredondada e classifica alertLevel', () => {
    const ok = buildMoraleReport([mkPlayer(1, 80), mkPlayer(2, 70)]);
    expect(ok.avgMorale).toBe(75);
    expect(ok.alertLevel).toBe('ok');

    const warning = buildMoraleReport([mkPlayer(1, 60), mkPlayer(2, 60)]);
    expect(warning.alertLevel).toBe('warning');

    const critical = buildMoraleReport([mkPlayer(1, 40), mkPlayer(2, 40)]);
    expect(critical.alertLevel).toBe('critical');
  });

  it('top/bottom têm no máx 3, ordenados por moral desc/asc', () => {
    const squad = [
      mkPlayer(1, 90), mkPlayer(2, 80), mkPlayer(3, 70), mkPlayer(4, 60), mkPlayer(5, 50),
    ];
    const r = buildMoraleReport(squad);
    expect(r.topMorale.map((e) => e.playerId)).toEqual([1, 2, 3]);
    expect(r.bottomMorale.map((e) => e.playerId)).toEqual([5, 4, 3]);
    expect(r.topMorale).toHaveLength(3);
  });

  it('desempata por posição (localeCompare) com morais iguais', () => {
    const squad = [mkPlayer(1, 70, 'ST'), mkPlayer(2, 70, 'CB')];
    const r = buildMoraleReport(squad);
    // CB < ST -> player 2 vem antes no sorted desc (empate cai no localeCompare asc)
    expect(r.topMorale[0].playerId).toBe(2);
  });

  it('squad vazio -> relatório zerado, alertLevel ok', () => {
    const r = buildMoraleReport([]);
    expect(r).toEqual({ avgMorale: 0, topMorale: [], bottomMorale: [], alertLevel: 'ok' });
  });

  it('squad sem nenhum morale definido -> relatório zerado', () => {
    const r = buildMoraleReport([mkPlayer(1, undefined), mkPlayer(2, undefined)]);
    expect(r.avgMorale).toBe(0);
    expect(r.topMorale).toEqual([]);
  });
});
