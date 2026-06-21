import {
  previewIntake, resolveIntakeCount, potentialCeiling, GEM_THRESHOLD, IntakeLevers,
} from '@/engine/youth/youth-levers';
import { SeededRng } from '@/engine/rng';

const L = (over: Partial<IntakeLevers> = {}): IntakeLevers => ({
  academyLevel: 3, youthCoachBonus: 5, academyReputation: 50, specialization: 'balanced', ...over,
});

describe('youth-levers', () => {
  it('preview de academia top é melhor que base em count, potencial e joias', () => {
    const top = previewIntake(L({ academyLevel: 5, youthCoachBonus: 10, academyReputation: 90 }));
    const low = previewIntake(L({ academyLevel: 1, youthCoachBonus: 0, academyReputation: 1 }));
    expect(top.countMax).toBeGreaterThanOrEqual(low.countMax);
    expect(top.potentialMax).toBeGreaterThan(low.potentialMax);
    expect(top.expectedGems).toBeGreaterThanOrEqual(low.expectedGems);
  });

  it('respeita o piso histórico de count [2,5] e teto de potencial 95', () => {
    const low = previewIntake(L({ academyLevel: 1, youthCoachBonus: 0, academyReputation: 1 }));
    expect(low.countMin).toBeGreaterThanOrEqual(2);
    const top = previewIntake(L({ academyLevel: 5, youthCoachBonus: 10, academyReputation: 100 }));
    expect(top.countMax).toBeLessThanOrEqual(5);
    expect(potentialCeiling(L({ academyLevel: 5, youthCoachBonus: 10, academyReputation: 100 }))).toBeLessThanOrEqual(95);
    expect(potentialCeiling(L({ academyLevel: 1, youthCoachBonus: 0, academyReputation: 1 }))).toBeGreaterThanOrEqual(45);
  });

  it('reputationTier classifica por faixa', () => {
    expect(previewIntake(L({ academyReputation: 90 })).reputationTier).toBe('elite');
    expect(previewIntake(L({ academyReputation: 70 })).reputationTier).toBe('forte');
    expect(previewIntake(L({ academyReputation: 45 })).reputationTier).toBe('mediana');
    expect(previewIntake(L({ academyReputation: 20 })).reputationTier).toBe('fraca');
  });

  it('preview é puro (sem rng) — mesma entrada, mesma saída', () => {
    expect(previewIntake(L())).toEqual(previewIntake(L()));
  });

  it('resolveIntakeCount é determinístico por seed e fica em [2,5]', () => {
    const a = resolveIntakeCount(L({ academyLevel: 4 }), new SeededRng(7));
    const b = resolveIntakeCount(L({ academyLevel: 4 }), new SeededRng(7));
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(2);
    expect(a).toBeLessThanOrEqual(5);
  });

  it('GEM_THRESHOLD é 80', () => { expect(GEM_THRESHOLD).toBe(80); });
});
