import {
  INTERNATIONAL_BREAK_WEEKS,
  INTERNATIONAL_CALLUP_MIN_OVERALL,
  TRAVEL_FATIGUE_PENALTY,
  isInternationalBreak,
  selectCallUps,
  applyTravelFatigue,
  CallUpCandidate,
} from '@/engine/national/international-duty';
import { SEASON_END_WEEK } from '@/engine/balance';

describe('international-duty (pure engine)', () => {
  describe('isInternationalBreak', () => {
    it('returns true for the configured break weeks', () => {
      for (const w of INTERNATIONAL_BREAK_WEEKS) {
        expect(isInternationalBreak(w)).toBe(true);
      }
    });

    it('returns false for non-break weeks', () => {
      expect(isInternationalBreak(1)).toBe(false);
      expect(isInternationalBreak(8)).toBe(false);
      expect(isInternationalBreak(58)).toBe(false);
    });

    it('keeps every break week inside the playable season range', () => {
      for (const w of INTERNATIONAL_BREAK_WEEKS) {
        expect(w).toBeGreaterThanOrEqual(1);
        expect(w).toBeLessThanOrEqual(SEASON_END_WEEK);
      }
    });
  });

  describe('selectCallUps', () => {
    it('calls up only players at or above the threshold', () => {
      const squad: CallUpCandidate[] = [
        { id: 1, nationality: 'Brazil', overall: INTERNATIONAL_CALLUP_MIN_OVERALL },
        { id: 2, nationality: 'Argentina', overall: INTERNATIONAL_CALLUP_MIN_OVERALL - 1 },
        { id: 3, nationality: 'France', overall: 90 },
      ];
      expect(selectCallUps(squad).sort((a, b) => a - b)).toEqual([1, 3]);
    });

    it('calls up at most the best player per nationality', () => {
      const squad: CallUpCandidate[] = [
        { id: 1, nationality: 'Brazil', overall: 80 },
        { id: 2, nationality: 'Brazil', overall: 88 },
        { id: 3, nationality: 'Brazil', overall: 76 },
        { id: 4, nationality: 'Spain', overall: 82 },
      ];
      // Only the best Brazilian (id 2) and the lone Spaniard (id 4).
      expect(selectCallUps(squad).sort((a, b) => a - b)).toEqual([2, 4]);
    });

    it('is deterministic regardless of input order', () => {
      const a: CallUpCandidate[] = [
        { id: 1, nationality: 'Brazil', overall: 80 },
        { id: 2, nationality: 'Brazil', overall: 88 },
      ];
      const b: CallUpCandidate[] = [
        { id: 2, nationality: 'Brazil', overall: 88 },
        { id: 1, nationality: 'Brazil', overall: 80 },
      ];
      expect(selectCallUps(a)).toEqual(selectCallUps(b));
    });

    it('returns an empty array when nobody clears the threshold', () => {
      const squad: CallUpCandidate[] = [
        { id: 1, nationality: 'Brazil', overall: 60 },
        { id: 2, nationality: 'Spain', overall: 74 },
      ];
      expect(selectCallUps(squad)).toEqual([]);
    });
  });

  describe('applyTravelFatigue', () => {
    it('subtracts the penalty from fitness', () => {
      expect(applyTravelFatigue(100)).toBe(100 - TRAVEL_FATIGUE_PENALTY);
    });

    it('clamps to the schema fitness floor of 1', () => {
      expect(applyTravelFatigue(1)).toBe(1);
      expect(applyTravelFatigue(TRAVEL_FATIGUE_PENALTY)).toBe(1);
      expect(applyTravelFatigue(TRAVEL_FATIGUE_PENALTY - 3)).toBe(1);
    });
  });
});
