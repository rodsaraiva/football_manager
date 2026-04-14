import {
  buildTechnicalReport,
  computeForm,
  ratePlayerFromEvents,
  SquadPlayer,
} from '@/engine/reports/technical-report';
import { Fixture, MatchEvent, Position } from '@/types';

function mkPlayer(overrides: Partial<SquadPlayer> & { id: number }): SquadPlayer {
  return {
    id: overrides.id,
    name: overrides.name ?? `Player ${overrides.id}`,
    age: overrides.age ?? 25,
    position: overrides.position ?? 'ST',
    overall: overrides.overall ?? 70,
    basePotential: overrides.basePotential ?? 80,
    effectivePotential: overrides.effectivePotential ?? 80,
    injuryWeeksLeft: overrides.injuryWeeksLeft ?? 0,
  };
}

function mkFixture(id: number, week: number, homeId: number, awayId: number, hg: number, ag: number): Fixture {
  return {
    id,
    competitionId: 1,
    season: 1,
    week,
    round: null,
    homeClubId: homeId,
    awayClubId: awayId,
    homeGoals: hg,
    awayGoals: ag,
    played: true,
    attendance: 20000,
  };
}

describe('ratePlayerFromEvents', () => {
  it('returns rating 0 and played=false if the player has no events', () => {
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 20, type: 'goal', playerId: 99, secondaryPlayerId: null },
    ];
    const r = ratePlayerFromEvents(1, 70, events, false, 1, false);
    expect(r.played).toBe(false);
    expect(r.rating).toBe(0);
  });

  it('rewards goals and assists', () => {
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 10, type: 'goal', playerId: 1, secondaryPlayerId: null },
      { fixtureId: 1, minute: 55, type: 'assist', playerId: 1, secondaryPlayerId: 2 },
    ];
    const r = ratePlayerFromEvents(1, 70, events, true, 0, false);
    expect(r.played).toBe(true);
    expect(r.goals).toBe(1);
    expect(r.assists).toBe(1);
    expect(r.rating).toBeGreaterThan(7);
  });

  it('penalises red cards heavily', () => {
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 30, type: 'red', playerId: 1, secondaryPlayerId: null },
    ];
    const r = ratePlayerFromEvents(1, 75, events, false, 2, false);
    expect(r.reds).toBe(1);
    expect(r.rating).toBeLessThan(6);
  });

  it('gives a clean-sheet bonus to defenders', () => {
    const events: MatchEvent[] = [
      { fixtureId: 1, minute: 70, type: 'yellow', playerId: 1, secondaryPlayerId: null },
    ];
    const nonDefender = ratePlayerFromEvents(1, 70, events, true, 0, false);
    const defender = ratePlayerFromEvents(1, 70, events, true, 0, true);
    expect(defender.rating).toBeGreaterThan(nonDefender.rating);
  });
});

describe('computeForm', () => {
  it('aggregates appearances, goals, assists, and avg rating over the window', () => {
    const squad = [mkPlayer({ id: 1, overall: 75 })];
    const events: Map<number, MatchEvent[]> = new Map([
      [
        100,
        [
          { fixtureId: 100, minute: 20, type: 'goal', playerId: 1, secondaryPlayerId: null },
        ],
      ],
      [
        101,
        [
          { fixtureId: 101, minute: 40, type: 'assist', playerId: 1, secondaryPlayerId: 99 },
        ],
      ],
    ]);
    const fixtures = [
      mkFixture(100, 2, 10, 20, 1, 0),
      mkFixture(101, 3, 10, 30, 2, 1),
    ];

    const forms = computeForm({
      squad,
      recentFixtures: fixtures,
      eventsByFixture: events,
      playerClubId: 10,
    });
    const f = forms.find((x) => x.playerId === 1)!;
    expect(f.appearances).toBe(2);
    expect(f.goals).toBe(1);
    expect(f.assists).toBe(1);
    expect(f.avgRating).toBeGreaterThan(6);
  });
});

describe('buildTechnicalReport', () => {
  it('highlights in-form, out-of-form, rising and benched players', () => {
    const squad: SquadPlayer[] = [
      // Starter in great form
      mkPlayer({ id: 1, overall: 82, position: 'ST' }),
      // Starter in poor form
      mkPlayer({ id: 2, overall: 78, position: 'CM' }),
      // Rising youngster
      mkPlayer({ id: 3, overall: 68, age: 19, effectivePotential: 85, position: 'LW' }),
      // Bench warmer deserving minutes
      mkPlayer({ id: 4, overall: 74, position: 'CB' }),
      // Default starter in CB
      mkPlayer({ id: 5, overall: 75, position: 'CB' }),
    ];

    const events = new Map<number, MatchEvent[]>();
    for (let i = 0; i < 5; i++) {
      events.set(1000 + i, [
        // Player 1 scores every week
        { fixtureId: 1000 + i, minute: 20, type: 'goal', playerId: 1, secondaryPlayerId: null },
        // Player 2 earns only a card
        { fixtureId: 1000 + i, minute: 60, type: 'yellow', playerId: 2, secondaryPlayerId: null },
        // Player 5 (CB) plays
        { fixtureId: 1000 + i, minute: 5, type: 'injury', playerId: 5, secondaryPlayerId: null },
      ]);
    }

    const fixtures = [0, 1, 2, 3, 4].map((w) =>
      mkFixture(1000 + w, w + 1, 10, 99, 2, 1),
    );

    const report = buildTechnicalReport({
      squad,
      recentFixtures: fixtures,
      eventsByFixture: events,
      playerClubId: 10,
      currentWeek: 6,
    });

    // Player 1 tops the in-form list
    expect(report.inForm[0].player.id).toBe(1);
    // Rising includes the youngster with potential gap
    expect(report.rising.map((p) => p.id)).toContain(3);
    // Player 4 (CB with high overall, no events) flagged as benched-deserves
    expect(report.benchedButDeservesMinutes.map((p) => p.id)).toContain(4);
  });

  it('handles an empty form window gracefully', () => {
    const squad: SquadPlayer[] = [mkPlayer({ id: 1 })];
    const report = buildTechnicalReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
      currentWeek: 1,
    });
    expect(report.inForm).toHaveLength(0);
    expect(report.outOfForm).toHaveLength(0);
  });
});
