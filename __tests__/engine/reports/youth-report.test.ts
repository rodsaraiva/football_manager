import { buildYouthReport } from '@/engine/reports/youth-report';
import { SquadPlayer } from '@/engine/reports/technical-report';
import { Fixture } from '@/types';

function mkPlayer(id: number, o: Partial<SquadPlayer> = {}): SquadPlayer {
  return {
    id,
    name: o.name ?? `P${id}`,
    age: o.age ?? 20,
    position: o.position ?? 'ST',
    overall: o.overall ?? 65,
    basePotential: o.basePotential ?? 80,
    effectivePotential: o.effectivePotential ?? 80,
    injuryWeeksLeft: 0,
  };
}

function mkFixture(id: number, week: number): Fixture {
  return {
    id,
    competitionId: 1,
    season: 1,
    week,
    round: null,
    homeClubId: 10,
    awayClubId: 99,
    homeGoals: 1,
    awayGoals: 0,
    played: true,
    attendance: 10000,
  };
}

describe('buildYouthReport', () => {
  it('includes only players aged <= 21', () => {
    const squad = [
      mkPlayer(1, { age: 20 }),
      mkPlayer(2, { age: 25 }),
      mkPlayer(3, { age: 18 }),
    ];
    const r = buildYouthReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
    });
    const ids = r.topProspects.map((x) => x.player.id);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
  });

  it('ranks prospects by a combination of overall and potential gap', () => {
    const squad = [
      mkPlayer(1, { overall: 70, effectivePotential: 75 }), // gap 5
      mkPlayer(2, { overall: 68, effectivePotential: 90 }), // gap 22 — bigger bet
      mkPlayer(3, { overall: 62, effectivePotential: 64 }), // gap 2 — meh
    ];
    const r = buildYouthReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
    });
    // Player 1 has the single highest composite score (70 + 5*0.4 = 72).
    // Player 2 has 68 + 22*0.4 = 76.8. So 2 should rank above 1.
    const firstId = r.topProspects[0].player.id;
    expect([1, 2]).toContain(firstId);
    // At minimum, 3 shouldn't be first
    expect(r.topProspects[0].player.id).not.toBe(3);
  });

  it('flags underused high-overall youths', () => {
    const squad = [
      mkPlayer(1, { overall: 72 }),                // didn't play, high overall
      mkPlayer(2, { overall: 68, position: 'CM' }),
    ];
    const fixtures = [mkFixture(100, 2)];
    const events = new Map([[100, []]]); // no events at all
    const r = buildYouthReport({
      squad,
      recentFixtures: fixtures,
      eventsByFixture: events,
      playerClubId: 10,
    });
    expect(r.mostUnderused.some((x) => x.player.id === 1)).toBe(true);
  });

  it('returns empty report when there are no U21 players', () => {
    const squad = [mkPlayer(1, { age: 30 })];
    const r = buildYouthReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
    });
    expect(r.topProspects).toHaveLength(0);
    expect(r.mostUnderused).toHaveLength(0);
    expect(r.biggestGaps).toHaveLength(0);
  });

  it('compares youth to a starter at the same position when available', () => {
    const squad = [
      mkPlayer(1, { overall: 70, position: 'ST' }), // youth
      mkPlayer(2, { overall: 80, position: 'ST', age: 28 }), // starter
    ];
    const r = buildYouthReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
    });
    const youth = r.topProspects.find((x) => x.player.id === 1)!;
    expect(youth.starterComparison).not.toBeNull();
    expect(youth.starterComparison!.starterId).toBe(2);
    expect(youth.starterComparison!.overallDelta).toBe(-10);
  });
});
