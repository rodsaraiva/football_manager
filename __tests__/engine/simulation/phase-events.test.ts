/**
 * L2 Fase 6 — eventos de fase granulares atrás de flag default-OFF.
 *
 * Invariante-mãe: com emitPhaseEvents OFF (default), simulateMatch é byte-a-byte
 * idêntico ao legado (o golden master cobre os literais; aqui provamos OFF==OFF e
 * ausência de eventos de fase). Com a flag ON, os eventos de fase aparecem, são
 * determinísticos pela seed, e o PLACAR/eventos-marco/ratings ficam IDÊNTICOS ao
 * OFF — porque o phaseRng é uma stream SEPARADA que não toca o rng principal.
 *
 * Engine puro: zero DB, zero React.
 */
import { simulateMatch, MatchInput, MatchResult } from '@/engine/simulation/match-engine';
import { MatchEventType, PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';

const PHASE_TYPES = new Set<MatchEventType>(['tackle', 'key_pass', 'recovery', 'possession_change']);

const makeAttrs = (base: number): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base,
  vision: base, composure: base, decisions: base,
  positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
});

const makeSquad = (overall: number) => Array.from({ length: 11 }, (_, i) => ({
  id: i + 1,
  position: (['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall),
  morale: 70,
  fitness: 90,
}));

const makeBench = (overall: number, idOffset: number) => Array.from({ length: 5 }, (_, i) => ({
  id: idOffset + i,
  position: (['CM', 'ST', 'LW', 'CB', 'GK'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall),
  morale: 70,
  fitness: 95,
}));

const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
  attackFocus: 'balanced', subStrategy: 'balanced',
};

function makeInput(seed: number, emitPhaseEvents?: boolean): MatchInput {
  return {
    fixtureId: 1,
    homeSquad: makeSquad(72),
    awaySquad: makeSquad(68).map((p, i) => ({ ...p, id: i + 100 })),
    homeBench: makeBench(72, 200),
    awayBench: makeBench(68, 300),
    homeTactic: defaultTactic,
    awayTactic: { ...defaultTactic, id: 2, clubId: 2 },
    homeClubReputation: 80,
    awayClubReputation: 80,
    emitPhaseEvents,
    rng: new SeededRng(seed),
  };
}

/** Digest excluindo eventos de fase e os campos de stats novos — exatamente a
 *  superfície que deve ser idêntica entre OFF e ON na mesma seed. */
function coreDigest(result: MatchResult): string {
  const evs = result.events
    .filter(e => !PHASE_TYPES.has(e.type))
    .map(e => `${e.minute}|${e.type}|${e.playerId}|${e.secondaryPlayerId ?? 'x'}`)
    .join(',');
  const ratings = [...result.homeRatings, ...result.awayRatings]
    .map(x => `${x.playerId}:${x.rating}`)
    .join(',');
  const s = result.stats;
  const stats = [
    s.homePossession, s.awayPossession, s.homeShots, s.awayShots,
    s.homeShotsOnTarget, s.awayShotsOnTarget, s.homeFouls, s.awayFouls,
    s.homeCorners, s.awayCorners, s.homeXG, s.awayXG,
  ].join('/');
  return `SCORE=${result.homeGoals}-${result.awayGoals};ATT=${result.attendance};STATS=${stats};EVENTS=[${evs}];RATINGS=[${ratings}]`;
}

const SEEDS = [42, 99, 2024, 7, 1234];

describe('L2 Fase 6 — eventos de fase (flag default-OFF)', () => {
  it('OFF (default): nenhum evento de fase é emitido', () => {
    for (const seed of SEEDS) {
      const result = simulateMatch(makeInput(seed));
      expect(result.events.some(e => PHASE_TYPES.has(e.type))).toBe(false);
    }
  });

  it('OFF: omitir a flag == passá-la false (byte-idêntico)', () => {
    for (const seed of SEEDS) {
      expect(simulateMatch(makeInput(seed))).toEqual(simulateMatch(makeInput(seed, false)));
    }
  });

  it('ON: determinístico — mesma seed dá o mesmo MatchResult', () => {
    for (const seed of SEEDS) {
      expect(simulateMatch(makeInput(seed, true))).toEqual(simulateMatch(makeInput(seed, true)));
    }
  });

  it('ON: placar/eventos-marco/ratings IDÊNTICOS ao OFF (phaseRng não toca a stream principal)', () => {
    for (const seed of SEEDS) {
      const off = simulateMatch(makeInput(seed, false));
      const on = simulateMatch(makeInput(seed, true));
      expect(off.homeGoals).toBe(on.homeGoals);
      expect(off.awayGoals).toBe(on.awayGoals);
      expect(coreDigest(on)).toBe(coreDigest(off));
    }
  });

  it('ON: os 4 tipos de evento de fase realmente aparecem ao longo da partida', () => {
    const seen = new Set<MatchEventType>();
    for (const seed of SEEDS) {
      for (const e of simulateMatch(makeInput(seed, true)).events) {
        if (PHASE_TYPES.has(e.type)) seen.add(e.type);
      }
    }
    for (const t of PHASE_TYPES) expect(seen.has(t)).toBe(true);
  });

  it('ON: stats agregadas de fase (tackles/keyPasses) são preenchidas; OFF não as traz', () => {
    const on = simulateMatch(makeInput(42, true));
    expect(typeof on.stats.homeTackles).toBe('number');
    expect(typeof on.stats.awayTackles).toBe('number');
    expect(typeof on.stats.homeKeyPasses).toBe('number');
    expect(typeof on.stats.awayKeyPasses).toBe('number');

    const off = simulateMatch(makeInput(42, false));
    expect(off.stats.homeTackles).toBeUndefined();
    expect(off.stats.homeKeyPasses).toBeUndefined();
  });
});
