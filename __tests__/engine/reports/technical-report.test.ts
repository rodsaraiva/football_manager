import {
  buildTechnicalReport,
  buildSquadSummary,
  computeForm,
  ratePlayerFromEvents,
  SquadPlayer,
} from '@/engine/reports/technical-report';
import { Fixture, MatchEvent, Position } from '@/types';
import { PlayerAttributes } from '@/types/player';

function mkAttributes(overrides: Partial<PlayerAttributes> = {}): PlayerAttributes {
  const defaults: PlayerAttributes = {
    finishing: 60, passing: 60, crossing: 60, dribbling: 60, heading: 60,
    longShots: 60, freeKicks: 60, vision: 60, composure: 60, decisions: 60,
    positioning: 60, aggression: 60, leadership: 60, pace: 60, stamina: 60,
    strength: 60, agility: 60, jumping: 60,
  };
  return { ...defaults, ...overrides };
}

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
    attributes: overrides.attributes,
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

  it('inclui squadSummary no relatório', () => {
    const squad: SquadPlayer[] = [
      mkPlayer({ id: 1, attributes: mkAttributes({ pace: 85 }) }),
    ];
    const report = buildTechnicalReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
      currentWeek: 1,
    });
    expect(report.squadSummary).toBeDefined();
    expect(report.squadSummary.collectiveStrengths.length).toBeGreaterThan(0);
  });
});

describe('buildTechnicalReport — matchdaySquadIds', () => {
  it('squadSummary usa apenas os relacionados quando matchdaySquadIds é fornecido', () => {
    const attrs90 = mkAttributes({ pace: 90, finishing: 90 });
    const attrs50 = mkAttributes({ pace: 50, finishing: 50 });
    const squad: SquadPlayer[] = [
      mkPlayer({ id: 1, attributes: attrs90, position: 'ST' }), // relacionado
      mkPlayer({ id: 2, attributes: attrs50, position: 'CM' }), // NÃO relacionado (fraco)
    ];

    const matchdaySquadIds = new Set([1]);

    const report = buildTechnicalReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
      currentWeek: 1,
      matchdaySquadIds,
    });

    // Com apenas o jogador 1 (attrs altas), a média de pace deve ser 90
    const paceStrength = report.squadSummary.collectiveStrengths.find((s) => s.attribute === 'pace');
    expect(paceStrength?.avg).toBe(90);
  });

  it('squadSummary usa elenco completo quando matchdaySquadIds é undefined', () => {
    const squad: SquadPlayer[] = [
      mkPlayer({ id: 1, attributes: mkAttributes({ pace: 90 }), position: 'ST' }),
      mkPlayer({ id: 2, attributes: mkAttributes({ pace: 50 }), position: 'CM' }),
    ];

    const report = buildTechnicalReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
      currentWeek: 1,
      // matchdaySquadIds não fornecido
    });

    // Média de pace deve ser (90+50)/2 = 70
    const paceAttr = report.squadSummary.collectiveStrengths
      .concat(report.squadSummary.collectiveWeaknesses)
      .find((a) => a.attribute === 'pace');
    // pace 70 estará no meio — confirmar que a média considera os dois jogadores
    const allAttrs = [...report.squadSummary.collectiveStrengths, ...report.squadSummary.collectiveWeaknesses];
    const foundPace = allAttrs.find((a) => a.attribute === 'pace');
    // Se pace=70 não aparece entre top/bottom, verifique que o relatório foi calculado com 2 jogadores
    // O importante é que não seja 90 (que seria apenas 1 jogador)
    if (foundPace) {
      expect(foundPace.avg).not.toBe(90);
    }
  });

  it('squadSummary usa elenco completo quando matchdaySquadIds está vazio', () => {
    const squad: SquadPlayer[] = [
      mkPlayer({ id: 1, attributes: mkAttributes({ pace: 90 }), position: 'ST' }),
    ];

    const report = buildTechnicalReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
      currentWeek: 1,
      matchdaySquadIds: new Set(), // vazio — deve usar elenco completo (edge case)
    });

    expect(report.squadSummary.collectiveStrengths.length).toBeGreaterThan(0);
  });

  it('outras seções do relatório NÃO são afetadas por matchdaySquadIds', () => {
    const squad: SquadPlayer[] = [
      mkPlayer({ id: 1, overall: 68, age: 19, effectivePotential: 85, position: 'LW' }), // jovem em evolução
      mkPlayer({ id: 2, overall: 72, position: 'CB' }), // fora dos relacionados
    ];

    // apenas jogador 1 no matchday squad
    const matchdaySquadIds = new Set([1]);

    const report = buildTechnicalReport({
      squad,
      recentFixtures: [],
      eventsByFixture: new Map(),
      playerClubId: 10,
      currentWeek: 1,
      matchdaySquadIds,
    });

    // rising deve considerar o elenco completo — jogador 1 deve aparecer
    expect(report.rising.map((p) => p.id)).toContain(1);
  });
});

describe('buildSquadSummary', () => {
  it('retorna vazio se nenhum jogador tem atributos', () => {
    const squad = [mkPlayer({ id: 1 })];
    const summary = buildSquadSummary(squad);
    expect(summary.collectiveStrengths).toHaveLength(0);
    expect(summary.collectiveWeaknesses).toHaveLength(0);
    expect(summary.individualHighlights).toHaveLength(0);
  });

  it('identifica pontos fortes e fracos coletivos corretamente', () => {
    const squad: SquadPlayer[] = [
      mkPlayer({ id: 1, attributes: mkAttributes({ pace: 90, finishing: 40 }) }),
      mkPlayer({ id: 2, attributes: mkAttributes({ pace: 88, finishing: 42 }) }),
    ];
    const summary = buildSquadSummary(squad);
    const strengthAttrs = summary.collectiveStrengths.map((s) => s.attribute);
    const weaknessAttrs = summary.collectiveWeaknesses.map((w) => w.attribute);
    expect(strengthAttrs).toContain('pace');
    expect(weaknessAttrs).toContain('finishing');
  });

  it('destaca jogador individual com atributo >= 80', () => {
    const squad: SquadPlayer[] = [
      mkPlayer({ id: 1, name: 'Rapido', attributes: mkAttributes({ pace: 92 }) }),
      mkPlayer({ id: 2, attributes: mkAttributes({ pace: 55 }) }),
    ];
    const summary = buildSquadSummary(squad);
    const paceHighlight = summary.individualHighlights.find((h) => h.attribute === 'pace');
    expect(paceHighlight).toBeDefined();
    expect(paceHighlight!.playerId).toBe(1);
    expect(paceHighlight!.value).toBe(92);
  });

  it('não destaca atributo individual se nenhum jogador atinge 80', () => {
    const squad: SquadPlayer[] = [
      mkPlayer({ id: 1, attributes: mkAttributes({ pace: 79 }) }),
    ];
    const summary = buildSquadSummary(squad);
    const paceHighlight = summary.individualHighlights.find((h) => h.attribute === 'pace');
    expect(paceHighlight).toBeUndefined();
  });

  it('limita destaques individuais a 8', () => {
    // All attributes at 90 — should still cap at 8 highlights
    const attrs = mkAttributes({
      crossing: 90, pace: 90, passing: 90, finishing: 90,
      dribbling: 90, vision: 90, heading: 90, freeKicks: 90,
      longShots: 90, leadership: 90,
    });
    const squad: SquadPlayer[] = [mkPlayer({ id: 1, attributes: attrs })];
    const summary = buildSquadSummary(squad);
    expect(summary.individualHighlights.length).toBeLessThanOrEqual(8);
  });
});
