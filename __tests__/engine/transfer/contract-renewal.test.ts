import { evaluateRenewal, RenewalInput } from '@/engine/transfer/contract-renewal';

describe('evaluateRenewal', () => {
  const base: RenewalInput = {
    playerAge: 26,
    playerOverall: 78,
    effectivePotential: 82,
    currentWage: 50_000,
    offeredWage: 55_000,
    offeredYears: 3,
    contractYearsLeft: 1,
    clubReputation: 70,
  };

  it('accepts a fair raise', () => {
    expect(evaluateRenewal(base).decision).toBe('accept');
  });

  it('rejects a wage well below expectation', () => {
    const res = evaluateRenewal({ ...base, offeredWage: 20_000 });
    expect(res.decision).toBe('reject');
  });

  it('counters with a higher wage when the offer is close but light', () => {
    const res = evaluateRenewal({ ...base, offeredWage: 45_000 });
    expect(res.decision).toBe('counter');
    expect(res.counterWage).toBeGreaterThan(45_000);
    expect(res.counterYears).toBeGreaterThanOrEqual(1);
  });

  it('a young high-potential player demands more than a journeyman', () => {
    const youngCounter = evaluateRenewal({
      ...base, playerAge: 19, playerOverall: 70, effectivePotential: 90, offeredWage: 40_000,
    });
    const oldAccept = evaluateRenewal({
      ...base, playerAge: 33, playerOverall: 70, effectivePotential: 70, offeredWage: 40_000,
    });
    expect(youngCounter.decision).not.toBe('accept');
    expect(oldAccept.decision).toBe('accept');
  });

  it('is deterministic (pure)', () => {
    expect(evaluateRenewal(base)).toEqual(evaluateRenewal(base));
  });
});
