import { generateJobOffers, JobOfferCandidateClub } from '@/engine/board/job-offers-engine';
import { SeededRng } from '@/engine/rng';

function rng() {
  return new SeededRng(12345);
}

// Current club: id 1, reputation 50.
const CURRENT = { currentClubId: 1, currentClubReputation: 50 };

const candidates: JobOfferCandidateClub[] = [
  { id: 1, reputation: 50, divisionLevel: 1 }, // current club
  { id: 2, reputation: 55, divisionLevel: 1 }, // small step up
  { id: 3, reputation: 60, divisionLevel: 1 }, // step up
  { id: 4, reputation: 70, divisionLevel: 1 }, // bigger step up
  { id: 5, reputation: 90, divisionLevel: 1 }, // elite, far above
  { id: 6, reputation: 45, divisionLevel: 2 }, // lower rep, not a step up
];

describe('generateJobOffers', () => {
  it('returns no offers when manager reputation is low (early game)', () => {
    const offers = generateJobOffers({
      managerReputation: 40,
      ...CURRENT,
      candidates,
      rng: rng(),
    });
    // Step-up clubs (55,60,70,90) all require rep <= 40+12=52 → only 55 fails too. None qualify.
    expect(offers).toEqual([]);
  });

  it('higher manager reputation unlocks up to 3 step-up offers, capped at 3', () => {
    const offers = generateJobOffers({
      managerReputation: 95,
      ...CURRENT,
      candidates,
      rng: rng(),
    });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.length).toBeLessThanOrEqual(3);
  });

  it('never offers the current club', () => {
    const offers = generateJobOffers({
      managerReputation: 100,
      ...CURRENT,
      candidates,
      rng: rng(),
    });
    expect(offers.find((o) => o.offeringClubId === 1)).toBeUndefined();
  });

  it('only step-up clubs (reputation strictly greater than current) qualify', () => {
    const offers = generateJobOffers({
      managerReputation: 100,
      ...CURRENT,
      candidates,
      rng: rng(),
    });
    // Club 6 (rep 45 < 50) must never appear.
    expect(offers.find((o) => o.offeringClubId === 6)).toBeUndefined();
  });

  it('excludes clubs too far above the manager (rep > managerRep + STEP)', () => {
    // managerRep 58 → ceiling 58+12=70. Club 5 (rep 90) and... club 4 (70) is exactly at ceiling.
    const offers = generateJobOffers({
      managerReputation: 58,
      ...CURRENT,
      candidates,
      rng: rng(),
    });
    expect(offers.find((o) => o.offeringClubId === 5)).toBeUndefined();
    // 55, 60, 70 are within [>50, <=70] → qualify.
    const ids = offers.map((o) => o.offeringClubId).sort();
    expect(ids).toEqual([2, 3, 4]);
  });

  it('orders offers by club reputation descending (top clubs first)', () => {
    const offers = generateJobOffers({
      managerReputation: 100,
      ...CURRENT,
      candidates,
      rng: rng(),
    });
    // Highest-rep step-up clubs first: 90, 70, 60 (cap 3).
    expect(offers.map((o) => o.offeringClubId)).toEqual([5, 4, 3]);
  });

  it('returns [] when there are no candidates beyond the current club', () => {
    const offers = generateJobOffers({
      managerReputation: 100,
      ...CURRENT,
      candidates: [{ id: 1, reputation: 50, divisionLevel: 1 }],
      rng: rng(),
    });
    expect(offers).toEqual([]);
  });
});
