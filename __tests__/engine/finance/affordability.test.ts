import { canAffordTransfer, canAffordWage } from '@/engine/finance/affordability';

describe('canAffordTransfer', () => {
  it('rejects when the fee exceeds the budget', () => {
    expect(canAffordTransfer(100, 150)).toBe(false);
  });
  it('accepts when the budget covers the fee', () => {
    expect(canAffordTransfer(150, 100)).toBe(true);
  });
  it('accepts an exact-match fee', () => {
    expect(canAffordTransfer(100, 100)).toBe(true);
  });
  it('honours an optional floor that must remain after the fee', () => {
    expect(canAffordTransfer(100, 80, 50)).toBe(false);
    expect(canAffordTransfer(100, 40, 50)).toBe(true);
  });
  it('treats a zero fee as always affordable', () => {
    expect(canAffordTransfer(-1000, 0)).toBe(true);
  });
});

describe('canAffordWage', () => {
  it('accepts when current bill + added wage stays within the budget', () => {
    expect(canAffordWage(800, 1000, 100)).toBe(true);
  });
  it('accepts at the exact cap', () => {
    expect(canAffordWage(900, 1000, 100)).toBe(true);
  });
  it('rejects when current bill + added wage exceeds the budget', () => {
    expect(canAffordWage(950, 1000, 100)).toBe(false);
  });
  it('treats wageBudget <= 0 as "no cap" (legacy saves)', () => {
    expect(canAffordWage(999999, 0, 100)).toBe(true);
    expect(canAffordWage(999999, -5, 100)).toBe(true);
  });
});
