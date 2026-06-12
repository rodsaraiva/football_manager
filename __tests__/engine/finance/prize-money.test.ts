import {
  calculateLeaguePrize,
  calculateCupPrize,
  gateReceiptMultiplier,
} from '@/engine/finance/prize-money';

describe('calculateLeaguePrize', () => {
  const base = { divisionLevel: 1, finalPosition: 1, numTeams: 20 };
  it('champion earns more than mid-table', () => {
    expect(calculateLeaguePrize(base)).toBeGreaterThan(
      calculateLeaguePrize({ ...base, finalPosition: 10 }),
    );
  });
  it('mid-table earns more than last place', () => {
    expect(calculateLeaguePrize({ ...base, finalPosition: 10 })).toBeGreaterThan(
      calculateLeaguePrize({ ...base, finalPosition: 20 }),
    );
  });
  it('a higher division pays more for the same position', () => {
    expect(calculateLeaguePrize({ ...base, divisionLevel: 1 })).toBeGreaterThan(
      calculateLeaguePrize({ ...base, divisionLevel: 3 }),
    );
  });
  it('never returns a negative prize', () => {
    expect(calculateLeaguePrize({ ...base, finalPosition: 20 })).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateCupPrize', () => {
  it('champion earns more than runner-up', () => {
    expect(calculateCupPrize({ competitionType: 'cup', result: 'champion' })).toBeGreaterThan(
      calculateCupPrize({ competitionType: 'cup', result: 'runner_up' }),
    );
  });
  it('runner-up earns more than a plain participant', () => {
    expect(calculateCupPrize({ competitionType: 'cup', result: 'runner_up' })).toBeGreaterThan(
      calculateCupPrize({ competitionType: 'cup', result: 'participant' }),
    );
  });
  it('a continental (CL) title pays more than a domestic cup title', () => {
    expect(calculateCupPrize({ competitionType: 'continental', result: 'champion' })).toBeGreaterThan(
      calculateCupPrize({ competitionType: 'cup', result: 'champion' }),
    );
  });
});

describe('gateReceiptMultiplier', () => {
  it('continental matches draw bigger crowds than league matches', () => {
    expect(gateReceiptMultiplier('continental')).toBeGreaterThan(gateReceiptMultiplier('league'));
  });
  it('cup matches draw at least as much as league matches', () => {
    expect(gateReceiptMultiplier('cup')).toBeGreaterThanOrEqual(gateReceiptMultiplier('league'));
  });
  it('league is the 1.0 baseline', () => {
    expect(gateReceiptMultiplier('league')).toBe(1.0);
  });
});
