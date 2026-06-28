import { computeClubAmbition } from '@/engine/board/club-ambition';

describe('computeClubAmbition', () => {
  it('retorna sempre 0..1 (clamp)', () => {
    for (const rep of [1, 50, 100]) {
      for (const div of [1, 2, 5]) {
        const a = computeClubAmbition({ reputation: rep, divisionLevel: div });
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it('clube de reputação alta em divisão baixa é mais faminto que clube equilibrado', () => {
    const faminto = computeClubAmbition({ reputation: 80, divisionLevel: 4 });
    const equilibrado = computeClubAmbition({ reputation: 50, divisionLevel: 2 });
    expect(faminto).toBeGreaterThan(equilibrado);
  });

  it('é monotônico: descer de divisão (mesma reputação) aumenta a fome', () => {
    const div1 = computeClubAmbition({ reputation: 70, divisionLevel: 1 });
    const div3 = computeClubAmbition({ reputation: 70, divisionLevel: 3 });
    expect(div3).toBeGreaterThan(div1);
  });
});
