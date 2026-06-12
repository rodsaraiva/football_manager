import { detectOrdinaryRetirements, OrdinaryInput } from '@/engine/retirement/retirement-engine';
import { SeededRng } from '@/engine/rng';
import { RETIREMENT_MIN_AGE, MAX_PLAYER_AGE } from '@/engine/balance';

const mk = (over: Partial<OrdinaryInput>): OrdinaryInput => ({
  id: 1, name: 'P', age: 35, isFreeAgent: false, willRetireAtSeasonEnd: false, ...over,
});

describe('detectOrdinaryRetirements', () => {
  it('never retires a player below RETIREMENT_MIN_AGE', () => {
    const players = Array.from({ length: 50 }, (_, i) => mk({ id: i, age: RETIREMENT_MIN_AGE - 1 }));
    const out = detectOrdinaryRetirements(players, new SeededRng(1));
    expect(out).toHaveLength(0);
  });

  it('never re-picks a player at/above MAX_PLAYER_AGE (compulsory owns those)', () => {
    const players = [mk({ id: 1, age: MAX_PLAYER_AGE })];
    const out = detectOrdinaryRetirements(players, new SeededRng(1));
    expect(out).toHaveLength(0);
  });

  it('skips players already announced (will_retire_at_season_end)', () => {
    const players = [mk({ id: 1, age: 40, willRetireAtSeasonEnd: true })];
    const out = detectOrdinaryRetirements(players, new SeededRng(1));
    expect(out).toHaveLength(0);
  });

  it('skips free agents', () => {
    const players = [mk({ id: 1, age: 40, isFreeAgent: true })];
    const out = detectOrdinaryRetirements(players, new SeededRng(1));
    expect(out).toHaveLength(0);
  });

  it('retirement probability increases with age (more 40yos retire than 33yos)', () => {
    const young = Array.from({ length: 200 }, (_, i) => mk({ id: i, age: 33 }));
    const old = Array.from({ length: 200 }, (_, i) => mk({ id: 1000 + i, age: 40 }));
    const youngOut = detectOrdinaryRetirements(young, new SeededRng(7)).length;
    const oldOut = detectOrdinaryRetirements(old, new SeededRng(7)).length;
    expect(oldOut).toBeGreaterThan(youngOut);
  });

  it('is deterministic for the same seed', () => {
    const players = Array.from({ length: 100 }, (_, i) => mk({ id: i, age: 37 }));
    const a = detectOrdinaryRetirements(players, new SeededRng(42)).map((d) => d.playerId);
    const b = detectOrdinaryRetirements(players, new SeededRng(42)).map((d) => d.playerId);
    expect(a).toEqual(b);
  });

  it('tags the reason as max_age (effective retirement, same handling)', () => {
    const players = Array.from({ length: 200 }, (_, i) => mk({ id: i, age: 40 }));
    const out = detectOrdinaryRetirements(players, new SeededRng(3));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((d) => d.reason === 'max_age')).toBe(true);
  });
});
