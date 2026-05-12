import {
  computeQualityStars,
  generateAssistant,
  processAssistantSeasonEnd,
  generateCandidates,
  candidateWillAccept,
  ARCHETYPE_POOL_BY_ROLE,
  ALL_ARCHETYPES,
} from '@/engine/assistant/assistant-engine';
import { SeededRng } from '@/engine/rng';
import { ASSISTANT_CANDIDATE_POOL_SIZE, ASSISTANT_QUALITY_THRESHOLDS } from '@/engine/balance';
import { Assistant } from '@/types/assistant';

// ── computeQualityStars ────────────────────────────────────────────────────

describe('computeQualityStars', () => {
  it('returns 1 star for 0 seasons', () => {
    expect(computeQualityStars(0)).toBe(1);
  });

  it('returns 1 star for 1 season (below threshold for 2★)', () => {
    expect(computeQualityStars(1)).toBe(1);
  });

  it('returns 2 stars at threshold[1]', () => {
    expect(computeQualityStars(ASSISTANT_QUALITY_THRESHOLDS[1])).toBe(2);
  });

  it('returns 3 stars at threshold[2]', () => {
    expect(computeQualityStars(ASSISTANT_QUALITY_THRESHOLDS[2])).toBe(3);
  });

  it('returns 4 stars at threshold[3]', () => {
    expect(computeQualityStars(ASSISTANT_QUALITY_THRESHOLDS[3])).toBe(4);
  });

  it('returns 5 stars at threshold[4]', () => {
    expect(computeQualityStars(ASSISTANT_QUALITY_THRESHOLDS[4])).toBe(5);
  });

  it('returns 5 stars beyond threshold[4]', () => {
    expect(computeQualityStars(20)).toBe(5);
  });
});

// ── generateAssistant ─────────────────────────────────────────────────────

describe('generateAssistant', () => {
  const rng = new SeededRng(42);

  it('always starts with 0 seasonsAtClub', () => {
    const a = generateAssistant({ role: 'squad', clubId: 1, saveId: 1, rng: new SeededRng(1) });
    expect(a.seasonsAtClub).toBe(0);
  });

  it('always starts with willRetireNextSeason false', () => {
    const a = generateAssistant({ role: 'financial', clubId: 1, saveId: 1, rng: new SeededRng(2) });
    expect(a.willRetireNextSeason).toBe(false);
  });

  it('retirementAge is between 60 and 70', () => {
    for (let seed = 0; seed < 20; seed++) {
      const a = generateAssistant({ role: 'youth', clubId: 1, saveId: 1, rng: new SeededRng(seed) });
      expect(a.retirementAge).toBeGreaterThanOrEqual(60);
      expect(a.retirementAge).toBeLessThanOrEqual(70);
    }
  });

  it('age is between 35 and 55', () => {
    for (let seed = 0; seed < 20; seed++) {
      const a = generateAssistant({ role: 'squad', clubId: 1, saveId: 1, rng: new SeededRng(seed) });
      expect(a.age).toBeGreaterThanOrEqual(35);
      expect(a.age).toBeLessThanOrEqual(55);
    }
  });

  it('name is non-empty', () => {
    const a = generateAssistant({ role: 'squad', clubId: 1, saveId: 1, rng });
    expect(a.name.length).toBeGreaterThan(0);
  });

  it('archetype is valid', () => {
    const a = generateAssistant({ role: 'squad', clubId: 1, saveId: 1, rng: new SeededRng(7) });
    expect(ALL_ARCHETYPES).toContain(a.archetype);
  });

  it('is deterministic with the same seed', () => {
    const a = generateAssistant({ role: 'squad', clubId: 5, saveId: 2, rng: new SeededRng(99) });
    const b = generateAssistant({ role: 'squad', clubId: 5, saveId: 2, rng: new SeededRng(99) });
    expect(a.name).toBe(b.name);
    expect(a.archetype).toBe(b.archetype);
    expect(a.age).toBe(b.age);
  });

  it('sets correct role, clubId, saveId', () => {
    const a = generateAssistant({ role: 'financial', clubId: 7, saveId: 3, rng: new SeededRng(0) });
    expect(a.role).toBe('financial');
    expect(a.clubId).toBe(7);
    expect(a.saveId).toBe(3);
  });

  it('archetype pool by role contains valid archetypes', () => {
    for (const role of ['squad', 'financial', 'youth'] as const) {
      for (const archetype of ARCHETYPE_POOL_BY_ROLE[role]) {
        expect(ALL_ARCHETYPES).toContain(archetype);
      }
    }
  });
});

// ── processAssistantSeasonEnd ──────────────────────────────────────────────

const baseAssistant: Assistant = {
  id: 1,
  clubId: 1,
  saveId: 1,
  role: 'squad',
  name: 'Test',
  age: 50,
  archetype: 'analytics',
  seasonsAtClub: 3,
  retirementAge: 65,
  wagePerMonth: 8000,
  willRetireNextSeason: false,
};

describe('processAssistantSeasonEnd', () => {
  it('increments age by 1', () => {
    const result = processAssistantSeasonEnd(baseAssistant);
    expect(result.newAge).toBe(51);
  });

  it('increments seasonsAtClub by 1', () => {
    const result = processAssistantSeasonEnd(baseAssistant);
    expect(result.newSeasonsAtClub).toBe(4);
  });

  it('not retired when age < retirementAge', () => {
    const result = processAssistantSeasonEnd(baseAssistant);
    expect(result.retired).toBe(false);
  });

  it('sets willRetireNextSeason when newAge === retirementAge - 1', () => {
    const result = processAssistantSeasonEnd({ ...baseAssistant, age: 64, retirementAge: 65 });
    expect(result.willRetireNextSeason).toBe(true);
    expect(result.retired).toBe(false);
  });

  it('retired when newAge >= retirementAge', () => {
    const result = processAssistantSeasonEnd({ ...baseAssistant, age: 65, retirementAge: 65 });
    expect(result.retired).toBe(true);
  });

  it('retired also when newAge > retirementAge', () => {
    const result = processAssistantSeasonEnd({ ...baseAssistant, age: 68, retirementAge: 65 });
    expect(result.retired).toBe(true);
  });

  it('computes qualityStars correctly from new seasonsAtClub', () => {
    const result = processAssistantSeasonEnd({ ...baseAssistant, seasonsAtClub: 1 });
    expect(result.newSeasonsAtClub).toBe(2);
    expect(result.newQualityStars).toBe(2);
  });
});

// ── generateCandidates ────────────────────────────────────────────────────

describe('generateCandidates', () => {
  it('returns exactly ASSISTANT_CANDIDATE_POOL_SIZE candidates', () => {
    const candidates = generateCandidates({ role: 'squad', saveId: 1, season: 1, rng: new SeededRng(1) });
    expect(candidates).toHaveLength(ASSISTANT_CANDIDATE_POOL_SIZE);
  });

  it('all candidates have qualityStars === 1 (new hires)', () => {
    const candidates = generateCandidates({ role: 'financial', saveId: 1, season: 2, rng: new SeededRng(2) });
    for (const c of candidates) {
      expect(c.qualityStars).toBe(1);
    }
  });

  it('all candidates have the requested role', () => {
    const candidates = generateCandidates({ role: 'youth', saveId: 1, season: 1, rng: new SeededRng(3) });
    for (const c of candidates) {
      expect(c.role).toBe('youth');
    }
  });

  it('candidates have valid archetypes', () => {
    const candidates = generateCandidates({ role: 'squad', saveId: 1, season: 1, rng: new SeededRng(4) });
    for (const c of candidates) {
      expect(ALL_ARCHETYPES).toContain(c.archetype);
    }
  });
});

// ── candidateWillAccept ───────────────────────────────────────────────────

describe('candidateWillAccept', () => {
  const baseCandidate = {
    name: 'Test',
    age: 40,
    archetype: 'analytics' as const,
    role: 'squad' as const,
    qualityStars: 1,
    wagePerMonth: 8000,
    reputationRequired: 50,
  };

  it('accepts when clubReputation >= reputationRequired', () => {
    expect(candidateWillAccept({ candidate: baseCandidate, clubReputation: 50, offeredWage: 8000 })).toBe(true);
  });

  it('accepts when clubReputation is much higher', () => {
    expect(candidateWillAccept({ candidate: baseCandidate, clubReputation: 90, offeredWage: 8000 })).toBe(true);
  });

  it('rejects when clubReputation < reputationRequired', () => {
    expect(candidateWillAccept({ candidate: baseCandidate, clubReputation: 30, offeredWage: 8000 })).toBe(false);
  });
});
