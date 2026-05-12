import { generateObjective, ObjectiveGeneratorInput } from '@/engine/board/objective-generator';
import { SeededRng } from '@/engine/rng';

const base: ObjectiveGeneratorInput = {
  clubReputation: 50,
  currentLeaguePosition: null,
  totalTeams: 20,
  divisionLevel: 1,
  wasRelegated: false,
  wasPromoted: false,
  rng: new SeededRng(42),
};

describe('generateObjective', () => {
  it('returns a valid objective type', () => {
    const result = generateObjective(base);
    const valid = ['league_position', 'cup_win', 'no_relegation', 'top_half', 'promotion', 'budget_balance'];
    expect(valid).toContain(result.type);
  });

  it('returns non-empty description', () => {
    const result = generateObjective(base);
    expect(result.description.length).toBeGreaterThan(0);
  });

  it('low reputation (1-30) generates survival objective', () => {
    const result = generateObjective({ ...base, clubReputation: 15, rng: new SeededRng(1) });
    expect(['no_relegation', 'top_half']).toContain(result.type);
  });

  it('mid reputation (31-55) generates mid-table objective', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      generateObjective({ ...base, clubReputation: 45, rng: new SeededRng(i) })
    );
    const types = new Set(results.map(r => r.type));
    expect([...types].every(t => ['top_half', 'league_position', 'cup_win', 'budget_balance'].includes(t))).toBe(true);
  });

  it('high reputation (71-85) targets top positions', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      generateObjective({ ...base, clubReputation: 78, rng: new SeededRng(i) })
    );
    const types = new Set(results.map(r => r.type));
    expect([...types].every(t => ['league_position', 'cup_win'].includes(t))).toBe(true);
  });

  it('elite reputation (86-100) targets title or cup', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      generateObjective({ ...base, clubReputation: 92, rng: new SeededRng(i) })
    );
    const types = new Set(results.map(r => r.type));
    expect([...types].every(t => ['league_position', 'cup_win'].includes(t))).toBe(true);
  });

  it('league_position objective has a numeric target', () => {
    let result = generateObjective({ ...base, clubReputation: 92, rng: new SeededRng(0) });
    for (let seed = 0; seed < 20; seed++) {
      result = generateObjective({ ...base, clubReputation: 92, rng: new SeededRng(seed) });
      if (result.type === 'league_position') break;
    }
    if (result.type === 'league_position') {
      expect(typeof result.target).toBe('number');
      expect(result.target).toBeGreaterThanOrEqual(1);
    }
  });

  it('is deterministic for same rng seed', () => {
    const a = generateObjective({ ...base, rng: new SeededRng(99) });
    const b = generateObjective({ ...base, rng: new SeededRng(99) });
    expect(a.type).toBe(b.type);
    expect(a.target).toBe(b.target);
    expect(a.description).toBe(b.description);
  });
});
