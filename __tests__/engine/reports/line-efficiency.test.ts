import { buildLineEfficiency } from '@/engine/reports/line-efficiency';
import { PlayerForm, SquadPlayer } from '@/engine/reports/technical-report';
import { Position } from '@/types';

function mkPlayer(id: number, position: Position): SquadPlayer {
  return { id, name: `P${id}`, age: 25, position, overall: 75, basePotential: 80, effectivePotential: 80, injuryWeeksLeft: 0 };
}
function mkForm(playerId: number, avgRating: number, appearances: number): PlayerForm {
  return { playerId, avgRating, appearances, goals: 0, assists: 0 };
}

describe('buildLineEfficiency', () => {
  it('agrega por linha com média ponderada por aparições e marca weakest/strongest', () => {
    const squad = [mkPlayer(1, 'GK'), mkPlayer(2, 'CB'), mkPlayer(3, 'ST')];
    const forms = [
      mkForm(1, 6.0, 2), // GK
      mkForm(2, 8.0, 2), // DEF
      mkForm(3, 7.0, 2), // ATK
    ];
    const r = buildLineEfficiency(forms, squad);
    const byGroup = new Map(r.map((l) => [l.group, l]));
    expect(byGroup.get('GK')!.avgRating).toBe(6.0);
    expect(byGroup.get('DEF')!.avgRating).toBe(8.0);
    expect(byGroup.get('MID')!.appearances).toBe(0); // sem dados
    expect(byGroup.get('GK')!.isWeakest).toBe(true);
    expect(byGroup.get('DEF')!.isStrongest).toBe(true);
    // MID sem aparições nunca é weakest/strongest
    expect(byGroup.get('MID')!.isWeakest).toBe(false);
    expect(byGroup.get('MID')!.isStrongest).toBe(false);
  });

  it('média ponderada: dois jogadores na mesma linha', () => {
    const squad = [mkPlayer(1, 'CB'), mkPlayer(2, 'LB')];
    const forms = [mkForm(1, 6.0, 1), mkForm(2, 8.0, 3)]; // (6*1 + 8*3)/4 = 7.5
    const r = buildLineEfficiency(forms, squad);
    expect(r.find((l) => l.group === 'DEF')!.avgRating).toBe(7.5);
  });

  it('ignora forms com 0 aparições e forms de jogador fora do squad', () => {
    const squad = [mkPlayer(1, 'ST')];
    const forms = [mkForm(1, 0, 0), mkForm(99, 9, 5)];
    const r = buildLineEfficiency(forms, squad);
    for (const l of r) expect(l.appearances).toBe(0);
  });

  it('sempre retorna as 4 linhas com label', () => {
    const r = buildLineEfficiency([], []);
    expect(r.map((l) => l.group)).toEqual(['GK', 'DEF', 'MID', 'ATK']);
    expect(r.every((l) => typeof l.label === 'string' && l.label.length > 0)).toBe(true);
  });
});
