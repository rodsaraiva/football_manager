import { isManagerDismissed } from '@/engine/board/season-outcome';
import { TrustConsequence } from '@/types/board';

describe('isManagerDismissed', () => {
  it('is true only when fired', () => {
    expect(isManagerDismissed('fired')).toBe(true);
  });

  it('is false for every non-fired consequence', () => {
    const others: TrustConsequence[] = ['none', 'budget_cut', 'budget_bonus'];
    for (const c of others) {
      expect(isManagerDismissed(c)).toBe(false);
    }
  });
});
