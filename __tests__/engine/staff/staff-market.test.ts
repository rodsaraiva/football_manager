import { generateStaffCandidates, canHireStaff } from '@/engine/staff/staff-market';
import { SeededRng } from '@/engine/rng';
import { STAFF_CANDIDATE_POOL_SIZE, STAFF_WAGE_PER_ABILITY } from '@/engine/balance';

describe('generateStaffCandidates', () => {
  it('gera N candidatos da função com ability/wage plausíveis e determinístico', () => {
    const a = generateStaffCandidates('scout', 80, new SeededRng(5));
    const b = generateStaffCandidates('scout', 80, new SeededRng(5));
    expect(a).toEqual(b);
    expect(a).toHaveLength(STAFF_CANDIDATE_POOL_SIZE);
    for (const c of a) {
      expect(c.role).toBe('scout');
      expect(c.ability).toBeGreaterThanOrEqual(1);
      expect(c.ability).toBeLessThanOrEqual(20);
      expect(c.wage).toBeGreaterThan(0);
      expect(c.wage).toBe(c.ability * STAFF_WAGE_PER_ABILITY);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it('reputação maior tende a melhor ability média', () => {
    const highRep = generateStaffCandidates('scout', 90, new SeededRng(5));
    const lowRep = generateStaffCandidates('scout', 20, new SeededRng(5));
    const avg = (xs: { ability: number }[]) => xs.reduce((s, c) => s + c.ability, 0) / xs.length;
    expect(avg(highRep)).toBeGreaterThan(avg(lowRep));
  });

  it('respeita o role passado', () => {
    const physios = generateStaffCandidates('physio', 50, new SeededRng(7));
    for (const c of physios) expect(c.role).toBe('physio');
  });

  it('não gera nomes duplicados no pool (amostragem sem reposição)', () => {
    for (const seed of [1, 5, 42, 100, 777]) {
      const names = generateStaffCandidates('scout', 60, new SeededRng(seed)).map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('canHireStaff', () => {
  it('permite quando há slot, wage budget e budget', () => {
    expect(
      canHireStaff({ budget: 100000, wageBudget: 100000, candidateWage: 2000, currentCountForRole: 0, maxSlots: 2 }).ok,
    ).toBe(true);
  });

  it('barra por slots primeiro', () => {
    expect(
      canHireStaff({ budget: 100, wageBudget: 100000, candidateWage: 2000, currentCountForRole: 2, maxSlots: 2 }),
    ).toMatchObject({ ok: false, reason: 'slots' });
  });

  it('barra por wage_budget', () => {
    expect(
      canHireStaff({ budget: 100, wageBudget: 100, candidateWage: 2000, currentCountForRole: 0, maxSlots: 2 }),
    ).toMatchObject({ ok: false, reason: 'wage_budget' });
  });

  it('barra por budget', () => {
    expect(
      canHireStaff({ budget: 100, wageBudget: 100000, candidateWage: 200, currentCountForRole: 0, maxSlots: 2 }),
    ).toMatchObject({ ok: false, reason: 'budget' });
  });
});
