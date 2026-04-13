import { calculateMarketValue, MarketValueInput } from '@/engine/transfer/market-value';

describe('calculateMarketValue', () => {
  const base: MarketValueInput = { overall: 75, effectivePotential: 82, age: 25, contractYearsLeft: 3 };

  it('returns a positive value', () => { expect(calculateMarketValue(base)).toBeGreaterThan(0); });
  it('higher overall = higher value', () => {
    expect(calculateMarketValue({ ...base, overall: 85 })).toBeGreaterThan(calculateMarketValue({ ...base, overall: 60 }));
  });
  it('younger players are worth more', () => {
    expect(calculateMarketValue({ ...base, age: 21 })).toBeGreaterThan(calculateMarketValue({ ...base, age: 33 }));
  });
  it('higher potential gap increases value', () => {
    expect(calculateMarketValue({ ...base, effectivePotential: 90 })).toBeGreaterThan(calculateMarketValue({ ...base, effectivePotential: 76 }));
  });
  it('last year of contract reduces value', () => {
    expect(calculateMarketValue({ ...base, contractYearsLeft: 4 })).toBeGreaterThan(calculateMarketValue({ ...base, contractYearsLeft: 1 }));
  });
  it('returns values rounded to 10k', () => { expect(calculateMarketValue(base) % 10000).toBe(0); });
});
