import { buildContractAlerts } from '@/engine/reports/contract-alerts';
import { SquadPlayer } from '@/engine/reports/technical-report';

function mkPlayer(id: number, o: Partial<SquadPlayer> = {}): SquadPlayer {
  return {
    id,
    name: o.name ?? `P${id}`,
    age: o.age ?? 25,
    position: o.position ?? 'ST',
    overall: o.overall ?? 75,
    basePotential: o.basePotential ?? 80,
    effectivePotential: o.effectivePotential ?? 80,
    injuryWeeksLeft: 0,
    contractEnd: o.contractEnd,
  };
}

describe('buildContractAlerts', () => {
  it('classifica urgência: 0 = critical, +1 = warning, +2 = watch', () => {
    const squad = [
      mkPlayer(1, { contractEnd: 3 }), // diff 0 -> critical
      mkPlayer(2, { contractEnd: 4 }), // diff 1 -> warning
      mkPlayer(3, { contractEnd: 5 }), // diff 2 -> watch
    ];
    const r = buildContractAlerts(squad, 3);
    const byId = new Map(r.map((a) => [a.player.id, a.urgency]));
    expect(byId.get(1)).toBe('critical');
    expect(byId.get(2)).toBe('warning');
    expect(byId.get(3)).toBe('watch');
  });

  it('exclui contratos > 2 temporadas à frente e overall <= 70', () => {
    const squad = [
      mkPlayer(1, { contractEnd: 10, overall: 90 }), // diff 7 -> fora
      mkPlayer(2, { contractEnd: 3, overall: 70 }),  // overall <= 70 -> fora
      mkPlayer(3, { contractEnd: 3, overall: 71 }),  // dentro
    ];
    const r = buildContractAlerts(squad, 3);
    const ids = r.map((a) => a.player.id);
    expect(ids).toEqual([3]);
  });

  it('ignora jogadores sem contractEnd', () => {
    const squad = [mkPlayer(1, { contractEnd: undefined, overall: 90 })];
    expect(buildContractAlerts(squad, 3)).toHaveLength(0);
  });

  it('ordena por urgência asc e depois overall desc', () => {
    const squad = [
      mkPlayer(1, { contractEnd: 4, overall: 80 }), // warning
      mkPlayer(2, { contractEnd: 3, overall: 75 }), // critical
      mkPlayer(3, { contractEnd: 3, overall: 85 }), // critical, maior overall
    ];
    const r = buildContractAlerts(squad, 3);
    expect(r.map((a) => a.player.id)).toEqual([3, 2, 1]);
  });

  it('squad vazio -> sem alertas', () => {
    expect(buildContractAlerts([], 1)).toEqual([]);
  });
});
