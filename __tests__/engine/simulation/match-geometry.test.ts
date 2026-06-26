import { simulateMatch, MatchInput, MatchResult } from '@/engine/simulation/match-engine';
import { deriveMatchGeometry } from '@/engine/simulation/match-geometry';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';

const makeAttrs = (base: number): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base,
  vision: base, composure: base, decisions: base,
  positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
});

const POSITIONS: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'];

const makeSquad = (overall: number, idBase: number) =>
  Array.from({ length: 11 }, (_, i) => ({
    id: idBase + i,
    position: POSITIONS[i],
    secondaryPosition: null as Position | null,
    attributes: makeAttrs(overall),
    morale: 70,
    fitness: 90,
  }));

const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
  attackFocus: 'balanced', subStrategy: 'balanced',
};

function makeInput(seed: number): MatchInput {
  return {
    fixtureId: 1,
    homeSquad: makeSquad(80, 1),
    awaySquad: makeSquad(78, 100),
    homeTactic: defaultTactic,
    awayTactic: { ...defaultTactic, id: 2, clubId: 2 },
    homeClubReputation: 80,
    awayClubReputation: 80,
    rng: new SeededRng(seed),
  };
}

const HOME_IDS = new Set(makeSquad(80, 1).map(p => p.id));
const AWAY_IDS = new Set(makeSquad(78, 100).map(p => p.id));

describe('L2 Fase 1 · xG por chance', () => {
  it('soma do xg dos eventos de chance bate com stats.homeXG/awayXG por lado', () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      const result = simulateMatch(makeInput(seed));
      let homeXg = 0;
      let awayXg = 0;
      for (const e of result.events) {
        if (e.xg == null) continue;
        if (HOME_IDS.has(e.playerId)) homeXg += e.xg;
        else if (AWAY_IDS.has(e.playerId)) awayXg += e.xg;
      }
      expect(Math.abs(homeXg - result.stats.homeXG)).toBeLessThan(0.02);
      expect(Math.abs(awayXg - result.stats.awayXG)).toBeLessThan(0.02);
    }
  });

  it('eventos de gol/chute carregam xg em [0, 0.9]', () => {
    const result = simulateMatch(makeInput(42));
    const shots = result.events.filter(e =>
      ['goal', 'shot_on_target', 'shot_off_target'].includes(e.type) && e.xg != null,
    );
    expect(shots.length).toBeGreaterThan(0);
    for (const e of shots) {
      expect(e.xg!).toBeGreaterThanOrEqual(0);
      expect(e.xg!).toBeLessThanOrEqual(0.9);
    }
  });
});

describe('L2 · determinismo (Opção B): expor xg não reordena a stream', () => {
  it('mesma seed → MESMO MatchResult (placar, eventos e xg idênticos)', () => {
    const a = simulateMatch(makeInput(42));
    const b = simulateMatch(makeInput(42));
    expect(a.homeGoals).toBe(b.homeGoals);
    expect(a.awayGoals).toBe(b.awayGoals);
    expect(a.events).toEqual(b.events);
    expect(a.stats).toEqual(b.stats);
  });
});

describe('L2 Fase 2 · deriveMatchGeometry', () => {
  it('rodar 2× com a mesma seed produz output idêntico', () => {
    const input = makeInput(42);
    const result = simulateMatch(input);
    const g1 = deriveMatchGeometry(result, input);
    const g2 = deriveMatchGeometry(result, input);
    expect(g1).toEqual(g2);
    expect(g1.length).toBe(result.events.length);
  });

  it('todas as coordenadas ficam em [0,1] e há um GeometricEvent por evento', () => {
    for (const seed of [1, 7, 42, 99]) {
      const input = makeInput(seed);
      const result = simulateMatch(input);
      const geo = deriveMatchGeometry(result, input);
      expect(geo.length).toBe(result.events.length);
      geo.forEach((g, i) => {
        expect(g.eventIndex).toBe(i);
        expect(g.x).toBeGreaterThanOrEqual(0);
        expect(g.x).toBeLessThanOrEqual(1);
        expect(g.y).toBeGreaterThanOrEqual(0);
        expect(g.y).toBeLessThanOrEqual(1);
      });
    }
  });

  it('gols caem no terço ofensivo correto por lado', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const input = makeInput(seed);
      const result = simulateMatch(input);
      const geo = deriveMatchGeometry(result, input);
      result.events.forEach((e, i) => {
        if (e.type !== 'goal' && e.type !== 'shot_on_target' && e.type !== 'shot_off_target') return;
        if (HOME_IDS.has(e.playerId)) {
          expect(geo[i].x).toBeGreaterThanOrEqual(2 / 3); // mandante ataca x→1
          checked++;
        } else if (AWAY_IDS.has(e.playerId)) {
          expect(geo[i].x).toBeLessThanOrEqual(1 / 3); // visitante ataca x→0
          checked++;
        }
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('é pura: não muta result nem input', () => {
    const input = makeInput(42);
    const result = simulateMatch(input);
    const eventsSnapshot = JSON.stringify(result.events);
    const inputSnapshot = JSON.stringify({
      fixtureId: input.fixtureId,
      homeSquad: input.homeSquad,
      awaySquad: input.awaySquad,
    });
    deriveMatchGeometry(result, input);
    expect(JSON.stringify(result.events)).toBe(eventsSnapshot);
    expect(JSON.stringify({
      fixtureId: input.fixtureId,
      homeSquad: input.homeSquad,
      awaySquad: input.awaySquad,
    })).toBe(inputSnapshot);
  });

  it('phase mapeia penalty e set_piece corretamente', () => {
    // Constrói um MatchResult sintético com tipos variados para travar o mapa de fase.
    const result = {
      homeGoals: 1, awayGoals: 0,
      events: [
        { fixtureId: 5, minute: 10, type: 'penalty_scored', playerId: 10, secondaryPlayerId: null },
        { fixtureId: 5, minute: 20, type: 'free_kick_scored', playerId: 6, secondaryPlayerId: null },
        { fixtureId: 5, minute: 30, type: 'goal', playerId: 11, secondaryPlayerId: null },
        { fixtureId: 5, minute: 40, type: 'yellow', playerId: 2, secondaryPlayerId: null },
      ],
      homeRatings: [], awayRatings: [],
      stats: {} as MatchResult['stats'], attendance: 0,
    } as unknown as MatchResult;
    const input = { ...makeInput(1), fixtureId: 5 };
    const geo = deriveMatchGeometry(result, input);
    expect(geo[0].phase).toBe('penalty');
    expect(geo[1].phase).toBe('set_piece');
    expect(geo[2].phase).toBe('open_play');
    expect(geo[3].phase).toBe('open_play');
  });
});
