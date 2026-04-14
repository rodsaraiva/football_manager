import {
  FORMATION_ROWS,
  FORMATION_SLOTS,
  formationToSlots,
  formationModifiers,
} from '@/engine/formations';
import { Formation } from '@/types';

const ALL_FORMATIONS: Formation[] = [
  '4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3',
  '4-5-1', '4-1-4-1', '5-3-2', '5-4-1',
  '4-4-1-1', '4-1-2-1-2', '4-2-2-2', '3-4-2-1',
  '4-3-1-2', '3-4-1-2', '4-2-4',
];

describe('FORMATION_SLOTS', () => {
  it('defines exactly 11 slots for every formation', () => {
    for (const f of ALL_FORMATIONS) {
      const slots = FORMATION_SLOTS[f];
      expect(slots).toBeDefined();
      expect(slots).toHaveLength(11);
    }
  });

  it('always starts with a GK', () => {
    for (const f of ALL_FORMATIONS) {
      expect(FORMATION_SLOTS[f][0]).toBe('GK');
    }
  });

  it('slot totals match the name for three-part formations', () => {
    // For X-Y-Z formations, DEF count = X, FWD count = Z.
    // (Middle tokens are ambiguous when there's a 10/CDM split.)
    const defTokens = new Set(['CB', 'LB', 'RB']);
    const fwdTokens = new Set(['ST', 'LW', 'RW']);
    const simple: Formation[] = ['4-4-2', '4-3-3', '3-5-2', '3-4-3', '4-5-1', '5-3-2', '5-4-1'];
    for (const f of simple) {
      const [d, , w] = f.split('-').map(Number);
      const slots = FORMATION_SLOTS[f];
      const defs = slots.filter((s) => defTokens.has(s)).length;
      const fwds = slots.filter((s) => fwdTokens.has(s)).length;
      expect(defs).toBe(d);
      expect(fwds).toBe(w);
    }
  });
});

describe('FORMATION_ROWS', () => {
  it('has a row layout for every formation', () => {
    for (const f of ALL_FORMATIONS) {
      expect(FORMATION_ROWS[f]).toBeDefined();
    }
  });

  it('sums to 11 per formation', () => {
    for (const f of ALL_FORMATIONS) {
      const total = FORMATION_ROWS[f].reduce((s, row) => s + row.length, 0);
      expect(total).toBe(11);
    }
  });

  it('ends with the GK row', () => {
    for (const f of ALL_FORMATIONS) {
      const rows = FORMATION_ROWS[f];
      const lastRow = rows[rows.length - 1];
      expect(lastRow).toEqual(['GK']);
    }
  });
});

describe('formationToSlots', () => {
  it('returns a copy (not a shared reference)', () => {
    const a = formationToSlots('4-4-2');
    const b = formationToSlots('4-4-2');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('falls back to 4-4-2 for unknown formation strings', () => {
    const slots = formationToSlots('9-9-9' as Formation);
    expect(slots).toEqual(FORMATION_SLOTS['4-4-2']);
  });
});

describe('formationModifiers', () => {
  it('4-4-2 is the neutral baseline', () => {
    const m = formationModifiers('4-4-2');
    expect(m.attackMult).toBeCloseTo(1.0);
    expect(m.defenseMult).toBeCloseTo(1.0);
    expect(m.wingPlayMult).toBeCloseTo(1.0);
    expect(m.possessionDelta).toBe(0);
  });

  it('attacking formations boost attackMult', () => {
    const attacking: Formation[] = ['4-3-3', '3-4-3', '4-2-2-2', '4-2-4', '3-4-1-2'];
    for (const f of attacking) {
      const m = formationModifiers(f);
      expect(m.attackMult).toBeGreaterThan(1.0);
    }
  });

  it('defensive formations reduce attackMult and boost defenseMult', () => {
    const defensive: Formation[] = ['4-5-1', '5-3-2', '5-4-1', '4-1-4-1'];
    for (const f of defensive) {
      const m = formationModifiers(f);
      expect(m.attackMult).toBeLessThanOrEqual(1.0);
      expect(m.defenseMult).toBeGreaterThan(1.0);
    }
  });

  it('4-2-4 is the most aggressive trade-off', () => {
    const m = formationModifiers('4-2-4');
    expect(m.attackMult).toBeGreaterThanOrEqual(1.1);
    expect(m.defenseMult).toBeLessThan(1.0);
  });

  it('diamond formation raises possession at the cost of wing play', () => {
    const m = formationModifiers('4-1-2-1-2');
    expect(m.possessionDelta).toBeGreaterThan(0);
    expect(m.wingPlayMult).toBeLessThan(1.0);
  });
});
