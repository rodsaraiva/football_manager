import {
  generateManagerOffers,
  ManagerOfferCandidate,
} from '@/engine/board/job-offers-engine';
import { SeededRng } from '@/engine/rng';
import { MANAGER_JOB_OFFER_MAX } from '@/engine/balance';

const cand = (id: number, reputation: number, ambition: number): ManagerOfferCandidate => ({
  id, reputation, divisionLevel: 1, ambition,
});

describe('generateManagerOffers', () => {
  const pool: ManagerOfferCandidate[] = [
    cand(1, 80, 0.5),  // clube atual
    cand(2, 88, 0.5),  // step_up
    cand(3, 84, 0.9),  // step_up faminto
    cand(4, 70, 0.5),  // rescue (abaixo)
    cand(5, 80, 0.5),  // lateral (igual ao atual)
  ];

  it('banda step_up só clubes ACIMA do atual e dentro do ceiling', () => {
    const offers = generateManagerOffers({
      managerReputation: 90, currentClubId: 1, currentClubReputation: 80,
      candidates: pool, bands: ['step_up'], rng: new SeededRng(1),
    });
    const ids = offers.map((o) => o.offeringClubId);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(4); // abaixo → não step_up
    expect(offers.every((o) => o.band === 'step_up')).toBe(true);
    expect(ids).toContain(2);
  });

  it('banda rescue só clubes ABAIXO do atual', () => {
    const offers = generateManagerOffers({
      managerReputation: 90, currentClubId: 1, currentClubReputation: 80,
      candidates: pool, bands: ['rescue'], rng: new SeededRng(1),
    });
    const ids = offers.map((o) => o.offeringClubId);
    expect(ids).toContain(4);
    expect(ids).not.toContain(2);
    expect(offers.every((o) => o.band === 'rescue')).toBe(true);
  });

  it('respeita o ceiling managerReputation + STEP', () => {
    const offers = generateManagerOffers({
      managerReputation: 75, currentClubId: 1, currentClubReputation: 80, // ceiling 87
      candidates: pool, bands: ['step_up'], rng: new SeededRng(1),
    });
    expect(offers.map((o) => o.offeringClubId)).not.toContain(2); // rep 88 > 87
  });

  it('mesmo seed → mesmo lote (determinístico)', () => {
    const args = {
      managerReputation: 90, currentClubId: 1, currentClubReputation: 80,
      candidates: pool, bands: ['step_up', 'rescue'] as const,
    };
    const a = generateManagerOffers({ ...args, bands: [...args.bands], rng: new SeededRng(42) });
    const b = generateManagerOffers({ ...args, bands: [...args.bands], rng: new SeededRng(42) });
    expect(a).toEqual(b);
  });

  it('limita ao top MANAGER_JOB_OFFER_MAX', () => {
    const many: ManagerOfferCandidate[] = Array.from({ length: 10 }, (_, i) =>
      cand(i + 2, 70 + i, 0.5),
    );
    const offers = generateManagerOffers({
      managerReputation: 100, currentClubId: 1, currentClubReputation: 50,
      candidates: many, bands: ['step_up'], rng: new SeededRng(7),
    });
    expect(offers.length).toBeLessThanOrEqual(MANAGER_JOB_OFFER_MAX);
  });

  it('currentClubId null (desempregado) qualifica todos ≤ ceiling para rescue', () => {
    const offers = generateManagerOffers({
      managerReputation: 90, currentClubId: null, currentClubReputation: 90,
      candidates: pool, bands: ['rescue'], rng: new SeededRng(3),
    });
    expect(offers.length).toBeGreaterThan(0);
  });

  it('ambição alta aumenta a frequência de seleção ao longo de N seeds', () => {
    // Mais qualificadores que MANAGER_JOB_OFFER_MAX → o sorteio ponderado decide
    // quem entra; o faminto (id 2) deve ser escolhido mais que o apático (id 3),
    // todos com a MESMA reputação para isolar o efeito da ambição.
    const many: ManagerOfferCandidate[] = [
      cand(1, 80, 0.5),         // atual (excluído)
      cand(2, 82, 0.95),        // faminto
      cand(3, 82, 0.05),        // apático
      cand(4, 82, 0.5),
      cand(5, 82, 0.5),
      cand(6, 82, 0.5),
    ];
    let famintoHits = 0, apaticoHits = 0;
    for (let s = 0; s < 80; s++) {
      const offers = generateManagerOffers({
        managerReputation: 85, currentClubId: 1, currentClubReputation: 80,
        candidates: many, bands: ['step_up'], rng: new SeededRng(s),
      });
      const ids = offers.map((o) => o.offeringClubId);
      if (ids.includes(2)) famintoHits++;
      if (ids.includes(3)) apaticoHits++;
    }
    expect(famintoHits).toBeGreaterThan(apaticoHits);
  });
});
