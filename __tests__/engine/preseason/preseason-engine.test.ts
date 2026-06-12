import { SeededRng } from '@/engine/rng';
import {
  suggestFriendlyOpponents,
  applyFriendlyFitnessGain,
  FriendlyOpponentCandidate,
  PRESEASON_MAX_FRIENDLIES,
  FRIENDLY_FITNESS_MIN_GAIN,
  FRIENDLY_FITNESS_MAX_GAIN,
} from '@/engine/preseason/preseason-engine';

function candidates(...reps: number[]): FriendlyOpponentCandidate[] {
  return reps.map((reputation, i) => ({ id: 100 + i, name: `Club ${i}`, reputation }));
}

describe('suggestFriendlyOpponents', () => {
  it('excludes the player club itself', () => {
    const cands: FriendlyOpponentCandidate[] = [
      { id: 1, name: 'Mine', reputation: 70 },
      { id: 2, name: 'Other', reputation: 70 },
    ];
    const out = suggestFriendlyOpponents({ playerClubId: 1, playerReputation: 70, candidates: cands, rng: new SeededRng(1) });
    expect(out.every((c) => c.id !== 1)).toBe(true);
  });

  it('prefers clubs within a close reputation band over distant ones', () => {
    // player rep 70; near = 68,72,74; far = 20,99
    const cands = candidates(68, 72, 74, 20, 99).map((c, i) => ({ ...c, id: i + 1 }));
    const out = suggestFriendlyOpponents({ playerClubId: 999, playerReputation: 70, candidates: cands, rng: new SeededRng(7) });
    const reps = out.map((c) => c.reputation);
    // the two extreme reps must not be picked while close ones are available
    expect(reps).not.toContain(20);
    expect(reps).not.toContain(99);
  });

  it('returns at most PRESEASON_MAX_FRIENDLIES opponents', () => {
    const cands = candidates(70, 71, 72, 73, 69, 68, 74).map((c, i) => ({ ...c, id: i + 1 }));
    const out = suggestFriendlyOpponents({ playerClubId: 999, playerReputation: 70, candidates: cands, rng: new SeededRng(3) });
    expect(out.length).toBeLessThanOrEqual(PRESEASON_MAX_FRIENDLIES);
  });

  it('is deterministic for the same seed', () => {
    const cands = candidates(70, 71, 72, 73, 69, 68, 74).map((c, i) => ({ ...c, id: i + 1 }));
    const a = suggestFriendlyOpponents({ playerClubId: 999, playerReputation: 70, candidates: cands, rng: new SeededRng(42) });
    const b = suggestFriendlyOpponents({ playerClubId: 999, playerReputation: 70, candidates: cands, rng: new SeededRng(42) });
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it('falls back to nearest available when no club is inside the band', () => {
    const cands = candidates(10, 12, 95).map((c, i) => ({ ...c, id: i + 1 }));
    const out = suggestFriendlyOpponents({ playerClubId: 999, playerReputation: 70, candidates: cands, rng: new SeededRng(1) });
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('applyFriendlyFitnessGain', () => {
  it('grants a small gain within bounds to participants', () => {
    const rng = new SeededRng(5);
    const next = applyFriendlyFitnessGain(80, true, rng);
    expect(next).toBeGreaterThanOrEqual(80 + FRIENDLY_FITNESS_MIN_GAIN);
    expect(next).toBeLessThanOrEqual(80 + FRIENDLY_FITNESS_MAX_GAIN);
  });

  it('caps fitness at 100', () => {
    const rng = new SeededRng(5);
    expect(applyFriendlyFitnessGain(98, true, rng)).toBe(100);
    expect(applyFriendlyFitnessGain(100, true, rng)).toBe(100);
  });

  it('leaves non-participants unchanged', () => {
    const rng = new SeededRng(5);
    expect(applyFriendlyFitnessGain(60, false, rng)).toBe(60);
  });
});
