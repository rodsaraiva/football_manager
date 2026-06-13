import { resolveTaker } from '@/engine/simulation/set-piece-takers';
import {
  simulateMatch,
  MatchInput,
} from '@/engine/simulation/match-engine';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';

const makeAttrs = (base: number, over: Partial<PlayerAttributes> = {}): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base,
  vision: base, composure: base, decisions: base,
  positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
  ...over,
});

function player(id: number, position: Position, attrs: PlayerAttributes): PlayerForStrength {
  return { id, position, secondaryPosition: null, attributes: attrs, morale: 70, fitness: 90 };
}

// ─── resolveTaker (pure unit) ────────────────────────────────────────────────

describe('resolveTaker', () => {
  const squad = [
    player(1, 'ST', makeAttrs(50)),
    player(2, 'CM', makeAttrs(50)),
    player(3, 'CB', makeAttrs(50)),
  ];

  it('returns the designated player when on the pitch (fallback NOT called)', () => {
    let fallbackCalled = false;
    const result = resolveTaker(squad, 2, () => { fallbackCalled = true; return squad[0]; });
    expect(result.id).toBe(2);
    expect(fallbackCalled).toBe(false);
  });

  it('calls fallback when the designated player is not in the squad (subbed off)', () => {
    let fallbackCalled = false;
    const result = resolveTaker(squad, 99, () => { fallbackCalled = true; return squad[0]; });
    expect(fallbackCalled).toBe(true);
    expect(result.id).toBe(1);
  });

  it('calls fallback when designatedId is null', () => {
    let fallbackCalled = false;
    const result = resolveTaker(squad, null, () => { fallbackCalled = true; return squad[2]; });
    expect(fallbackCalled).toBe(true);
    expect(result.id).toBe(3);
  });

  it('calls fallback when designatedId is undefined', () => {
    let fallbackCalled = false;
    const result = resolveTaker(squad, undefined, () => { fallbackCalled = true; return squad[1]; });
    expect(fallbackCalled).toBe(true);
    expect(result.id).toBe(2);
  });
});

// ─── Full-match threading ────────────────────────────────────────────────────

const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
  attackFocus: 'balanced', subStrategy: 'balanced',
};

// Home squad where the natural penalty pick (best finishing+composure) is the
// STRONG striker id=10, but we designate the WEAK id=2 so we can prove threading.
function makeHomeSquad(): PlayerForStrength[] {
  const positions: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'];
  return positions.map((pos, i) => {
    const id = i + 1;
    // id 10 is the strong taker, id 2 the deliberately weak designated one.
    if (id === 10) return player(10, pos, makeAttrs(60, { finishing: 99, composure: 99, freeKicks: 99 }));
    if (id === 2) return player(2, pos, makeAttrs(60, { finishing: 1, composure: 1, freeKicks: 1 }));
    return player(id, pos, makeAttrs(60));
  });
}

function makeAwaySquad(): PlayerForStrength[] {
  const positions: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'];
  return positions.map((pos, i) => player(i + 100, pos, makeAttrs(60)));
}

function makeInput(seed: number, homeTakers?: MatchInput['homeSetPieceTakers']): MatchInput {
  return {
    fixtureId: 1,
    homeSquad: makeHomeSquad(),
    awaySquad: makeAwaySquad(),
    homeTactic: defaultTactic,
    awayTactic: { ...defaultTactic, id: 2, clubId: 2 },
    homeClubReputation: 80,
    awayClubReputation: 80,
    homeSetPieceTakers: homeTakers,
    rng: new SeededRng(seed),
  };
}

describe('designated taker threads through the match engine', () => {
  it('credits the designated WEAK penalty taker (id=2) on home penalty events', () => {
    let sawPenalty = false;
    for (let seed = 0; seed < 400 && !sawPenalty; seed++) {
      const result = simulateMatch(makeInput(seed, { penaltyTakerId: 2 }));
      const homeIds = new Set(makeHomeSquad().map(p => p.id));
      const pens = result.events.filter(
        e => (e.type === 'penalty_scored' || e.type === 'penalty_missed') && homeIds.has(e.playerId),
      );
      if (pens.length > 0) {
        sawPenalty = true;
        for (const p of pens) expect(p.playerId).toBe(2);
      }
    }
    expect(sawPenalty).toBe(true);
  });

  it('without designation, the natural strong taker (id=10) takes home penalties', () => {
    let sawPenalty = false;
    for (let seed = 0; seed < 400 && !sawPenalty; seed++) {
      const result = simulateMatch(makeInput(seed));
      const homeIds = new Set(makeHomeSquad().map(p => p.id));
      const pens = result.events.filter(
        e => (e.type === 'penalty_scored' || e.type === 'penalty_missed') && homeIds.has(e.playerId),
      );
      if (pens.length > 0) {
        sawPenalty = true;
        for (const p of pens) expect(p.playerId).toBe(10);
      }
    }
    expect(sawPenalty).toBe(true);
  });
});

// ─── Determinism guard ───────────────────────────────────────────────────────

describe('no-takers path is deterministic and unchanged', () => {
  it('simulateMatch with no takers equals itself (same seed)', () => {
    for (const seed of [1, 7, 42, 99, 123]) {
      const a = simulateMatch(makeInput(seed));
      const b = simulateMatch(makeInput(seed));
      expect(a.events).toEqual(b.events);
      expect(a.homeGoals).toBe(b.homeGoals);
      expect(a.awayGoals).toBe(b.awayGoals);
    }
  });

  it('undefined takers === explicit empty/null takers (no RNG divergence on fallback)', () => {
    for (const seed of [1, 7, 42, 99, 123]) {
      const noField = simulateMatch(makeInput(seed));
      const allNull = simulateMatch(makeInput(seed, {
        penaltyTakerId: null, freeKickTakerId: null, cornerTakerId: null,
      }));
      expect(allNull.events).toEqual(noField.events);
    }
  });
});
