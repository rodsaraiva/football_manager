import { buildManagerContract, isContractExpiring } from '@/engine/board/manager-contract-engine';
import { MANAGER_CONTRACT_MIN_SEASONS, MANAGER_CONTRACT_MAX_SEASONS } from '@/engine/balance';
import { SeededRng } from '@/engine/rng';

describe('buildManagerContract', () => {
  const base = { managerReputation: 60, band: 'step_up' as const, startSeason: 3 };

  it('duração dentro de [MIN, MAX] e endSeason coerente', () => {
    const c = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(1) });
    const dur = c.endSeason - c.startSeason;
    expect(dur).toBeGreaterThanOrEqual(MANAGER_CONTRACT_MIN_SEASONS);
    expect(dur).toBeLessThanOrEqual(MANAGER_CONTRACT_MAX_SEASONS);
    expect(c.startSeason).toBe(3);
  });

  it('determinístico para o mesmo seed', () => {
    const a = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(9) });
    const b = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(9) });
    expect(a).toEqual(b);
  });

  it('wagePerSeason cresce com a reputação do clube', () => {
    const small = buildManagerContract({ ...base, clubReputation: 30, rng: new SeededRng(2) });
    const big = buildManagerContract({ ...base, clubReputation: 90, rng: new SeededRng(2) });
    expect(big.wagePerSeason).toBeGreaterThan(small.wagePerSeason);
  });

  it('releaseClause é proporcional ao wage (> 0)', () => {
    const c = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(4) });
    expect(c.releaseClause).toBeGreaterThan(0);
    expect(c.releaseClause).toBeLessThanOrEqual(c.wagePerSeason * (c.endSeason - c.startSeason));
  });

  it('expectation é um alvo plausível 1..100', () => {
    const c = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(4) });
    expect(c.expectation).toBeGreaterThanOrEqual(1);
    expect(c.expectation).toBeLessThanOrEqual(100);
  });
});

describe('isContractExpiring', () => {
  it('true só quando currentSeason >= endSeason', () => {
    expect(isContractExpiring(5, 4)).toBe(false);
    expect(isContractExpiring(5, 5)).toBe(true);
    expect(isContractExpiring(5, 6)).toBe(true);
  });
});
