import { buildFreeAgentScout } from '@/engine/reports/free-agent-scout';
import { Player } from '@/types';
import { PlayerAttributes } from '@/types/player';

function mkAttrs(o: Partial<PlayerAttributes> = {}): PlayerAttributes {
  const base = 60;
  return {
    finishing: base, passing: base, crossing: base, dribbling: base, heading: base,
    longShots: base, freeKicks: base, vision: base, composure: base, decisions: base,
    positioning: base, aggression: base, leadership: base, pace: base, stamina: base,
    strength: base, agility: base, jumping: base, ...o,
  };
}
function mkPlayer(id: number, o: Partial<Player> = {}): Player {
  return {
    id, name: o.name ?? `P${id}`, nationality: o.nationality ?? 'BR',
    age: o.age ?? 25, position: o.position ?? 'ST',
    secondaryPosition: o.secondaryPosition ?? null,
    clubId: o.clubId ?? null, wage: o.wage ?? 1000,
    contractEnd: o.contractEnd ?? 5, marketValue: o.marketValue ?? 1_000_000,
    basePotential: o.basePotential ?? 80, effectivePotential: o.effectivePotential ?? 80,
    morale: o.morale ?? 70, fitness: o.fitness ?? 100,
    injuryWeeksLeft: o.injuryWeeksLeft ?? 0, suspensionWeeksLeft: o.suspensionWeeksLeft ?? 0,
    isFreeAgent: o.isFreeAgent ?? true, preferredFoot: o.preferredFoot ?? 'right',
    weakFootAbility: o.weakFootAbility ?? 3, isTransferListed: o.isTransferListed ?? false,
    isLoanListed: o.isLoanListed ?? false, askingPrice: o.askingPrice ?? null,
    loanWageShare: o.loanWageShare ?? null, loanWage: o.loanWage ?? null,
    consecutiveLowMoraleWeeks: o.consecutiveLowMoraleWeeks ?? 0,
    willRetireAtSeasonEnd: o.willRetireAtSeasonEnd ?? false,
    squadTier: o.squadTier ?? 'first',
    personality: o.personality ?? 'balanced',
    falloutState: o.falloutState ?? 'none',
  };
}

describe('buildFreeAgentScout', () => {
  it('calcula squadGaps por posição ordenados por avgOverall asc', () => {
    const squad = [
      { player: mkPlayer(1, { position: 'ST' }), attributes: mkAttrs({ finishing: 90 }) },
      { player: mkPlayer(2, { position: 'CB' }), attributes: mkAttrs({ heading: 40 }) },
    ];
    const r = buildFreeAgentScout({ freeAgentsWithAttrs: [], squadWithAttrs: squad, wageBudgetRemaining: 1_000_000 });
    expect(r.squadGaps.length).toBe(2);
    // ordenado asc por avgOverall
    expect(r.squadGaps[0].avgOverall).toBeLessThanOrEqual(r.squadGaps[1].avgOverall);
    expect(r.squadGaps.map((g) => g.position).sort()).toEqual(['CB', 'ST']);
  });

  it('filtra agentes cujo wage > 30% do budget restante', () => {
    const squad = [{ player: mkPlayer(1, { position: 'ST' }), attributes: mkAttrs() }];
    const cheap = { player: mkPlayer(10, { position: 'ST', wage: 100 }), attributes: mkAttrs({ finishing: 99 }) };
    const pricey = { player: mkPlayer(11, { position: 'ST', wage: 5000 }), attributes: mkAttrs({ finishing: 99 }) };
    const r = buildFreeAgentScout({ freeAgentsWithAttrs: [cheap, pricey], squadWithAttrs: squad, wageBudgetRemaining: 10_000 });
    // budget*0.3 = 3000 -> cheap passa, pricey é filtrado
    expect(r.fits.map((f) => f.player.id)).toEqual([10]);
  });

  it('ordena fits por fitScore desc e é determinístico (mesma entrada = mesma saída)', () => {
    const squad = [{ player: mkPlayer(1, { position: 'ST' }), attributes: mkAttrs({ finishing: 50 }) }];
    const agents = [
      { player: mkPlayer(10, { position: 'ST', wage: 100 }), attributes: mkAttrs({ finishing: 70 }) },
      { player: mkPlayer(11, { position: 'ST', wage: 100 }), attributes: mkAttrs({ finishing: 95 }) },
    ];
    const params = { freeAgentsWithAttrs: agents, squadWithAttrs: squad, wageBudgetRemaining: 1_000_000 };
    const a = buildFreeAgentScout(params);
    const b = buildFreeAgentScout(params);
    expect(a).toEqual(b);
    expect(a.fits[0].fitScore).toBeGreaterThanOrEqual(a.fits[1].fitScore);
  });

  it('budget negativo é tratado como 0 (nenhum agente passa o filtro de wage)', () => {
    const squad = [{ player: mkPlayer(1, { position: 'ST' }), attributes: mkAttrs() }];
    const agent = { player: mkPlayer(10, { position: 'ST', wage: 1 }), attributes: mkAttrs() };
    const r = buildFreeAgentScout({ freeAgentsWithAttrs: [agent], squadWithAttrs: squad, wageBudgetRemaining: -500 });
    expect(r.fits).toHaveLength(0);
  });

  it('squad vazio -> squadGaps vazio mas ainda pontua agentes vs baseline 50', () => {
    const agent = { player: mkPlayer(10, { position: 'ST', wage: 100 }), attributes: mkAttrs({ finishing: 90 }) };
    const r = buildFreeAgentScout({ freeAgentsWithAttrs: [agent], squadWithAttrs: [], wageBudgetRemaining: 1_000_000 });
    expect(r.squadGaps).toHaveLength(0);
    expect(r.fits).toHaveLength(1);
    expect(r.fits[0].gapCovered).toBeGreaterThan(0); // overall do agente - baseline 50 > 0
  });
});
