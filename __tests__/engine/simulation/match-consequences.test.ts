import { resolveMatchSuspensions } from '@/engine/simulation/match-consequences';
import { MatchEvent } from '@/types';
import { SeededRng } from '@/engine/rng';

const ev = (type: MatchEvent['type'], playerId: number, minute = 30): MatchEvent => ({
  fixtureId: 1, minute, type, playerId, secondaryPlayerId: null,
});

describe('resolveMatchSuspensions', () => {
  it('returns no outcomes when there are no cards', () => {
    expect(resolveMatchSuspensions([ev('goal', 7)], new Map(), new SeededRng(1))).toEqual([]);
  });

  it('a red card bans the player for 1 week', () => {
    const out = resolveMatchSuspensions([ev('red', 7)], new Map(), new SeededRng(1));
    expect(out).toEqual([{ playerId: 7, weeks: 1, reason: 'red' }]);
  });

  it('crossing the 5-yellow threshold bans for 1 week (prior 4, +1 = 5)', () => {
    const out = resolveMatchSuspensions([ev('yellow', 7)], new Map([[7, 4]]), new SeededRng(1));
    expect(out).toEqual([{ playerId: 7, weeks: 1, reason: 'yellow_accumulation' }]);
  });

  it('does not re-ban inside the same multiple (prior 5, +1 = 6 ⇒ no ban)', () => {
    const out = resolveMatchSuspensions([ev('yellow', 7)], new Map([[7, 5]]), new SeededRng(1));
    expect(out).toEqual([]);
  });

  it('crosses exactly one multiple even with two yellows in one match (prior 4, +2 = 6 ⇒ 1 ban)', () => {
    const out = resolveMatchSuspensions(
      [ev('yellow', 7), ev('yellow', 7)], new Map([[7, 4]]), new SeededRng(1),
    );
    expect(out.filter(o => o.reason === 'yellow_accumulation')).toHaveLength(1);
  });

  it('second-yellow pair: counts the yellow toward accumulation AND the red as a ban', () => {
    const events = [ev('yellow', 7, 50), ev('red', 7, 50)];
    const out = resolveMatchSuspensions(events, new Map([[7, 4]]), new SeededRng(1));
    expect(out.some(o => o.reason === 'red' && o.weeks === 1)).toBe(true);
    expect(out.some(o => o.reason === 'yellow_accumulation')).toBe(true);
  });
});
