import { generateRescueOffers } from '@/engine/board/job-offers-engine';

const cands = [
  { id: 1, reputation: 80, divisionLevel: 1 }, // current club
  { id: 2, reputation: 70, divisionLevel: 1 }, // step down — qualifica
  { id: 3, reputation: 60, divisionLevel: 2 }, // step down — qualifica
  { id: 4, reputation: 90, divisionLevel: 1 }, // acima — NÃO (resgate é p/ baixo)
];

describe('generateRescueOffers', () => {
  it('gera ofertas de clubes de MENOR reputação que o atual', () => {
    const offers = generateRescueOffers({
      managerReputation: 75,
      currentClubId: 1,
      currentClubReputation: 80,
      candidates: cands,
    });
    const ids = offers.map((o) => o.offeringClubId);
    expect(ids).not.toContain(1); // não o atual
    expect(ids).not.toContain(4); // não clube acima
    expect(ids).toContain(2); // step down
    expect(offers.length).toBeGreaterThan(0);
  });

  it('vazio se nenhum clube de menor reputação ao alcance', () => {
    const offers = generateRescueOffers({
      managerReputation: 75,
      currentClubId: 1,
      currentClubReputation: 1,
      candidates: cands,
    });
    expect(offers).toEqual([]); // currentClubReputation 1 → nada abaixo
  });

  it('respeita o teto managerReputation + STEP', () => {
    const offers = generateRescueOffers({
      managerReputation: 55, // ceiling 67 → exclui clube 70
      currentClubId: 1,
      currentClubReputation: 80,
      candidates: cands,
    });
    const ids = offers.map((o) => o.offeringClubId);
    expect(ids).not.toContain(2); // 70 > 67
    expect(ids).toContain(3); // 60 <= 67
  });

  it('ordena reputação desc, id asc e limita ao top MAX', () => {
    const many = [
      { id: 1, reputation: 80, divisionLevel: 1 }, // current
      { id: 2, reputation: 70, divisionLevel: 1 },
      { id: 3, reputation: 65, divisionLevel: 1 },
      { id: 4, reputation: 60, divisionLevel: 1 },
      { id: 5, reputation: 60, divisionLevel: 1 }, // tie com 4 → id asc
    ];
    const offers = generateRescueOffers({
      managerReputation: 80,
      currentClubId: 1,
      currentClubReputation: 80,
      candidates: many,
    });
    expect(offers.map((o) => o.offeringClubId)).toEqual([2, 3, 4]); // top 3, rep desc, id asc
  });
});
