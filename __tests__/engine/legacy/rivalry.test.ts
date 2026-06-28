import { generateRivalries, reinforceIntensity, RivalryClub } from '@/engine/legacy/rivalry-engine';
import { SeededRng } from '@/engine/rng';

const clubs: RivalryClub[] = [
  { id: 1, leagueId: 100, countryId: 1, divisionLevel: 1, reputation: 80 },
  { id: 2, leagueId: 100, countryId: 1, divisionLevel: 1, reputation: 78 },
  { id: 3, leagueId: 200, countryId: 1, divisionLevel: 2, reputation: 60 },
  { id: 4, leagueId: 300, countryId: 2, divisionLevel: 5, reputation: 50 },
];

describe('rivalry-engine', () => {
  it('é determinístico: mesma seed + mesmos clubes → array idêntico', () => {
    const a = generateRivalries(clubs, new SeededRng(42));
    const b = generateRivalries(clubs, new SeededRng(42));
    expect(a).toEqual(b);
  });

  it('mesma liga → division; mesmo país + div adjacente → regional', () => {
    const out = generateRivalries(clubs, new SeededRng(42));
    const div = out.find((r) => r.clubAId === 1 && r.clubBId === 2);
    expect(div?.origin).toBe('division');
    expect(out.some((r) => r.origin === 'regional')).toBe(true);
    for (const r of out) expect(r.clubAId).toBeLessThan(r.clubBId);
  });

  it('clube isolado (país/divisão distantes) não vira rival', () => {
    const out = generateRivalries(clubs, new SeededRng(42));
    expect(out.some((r) => r.clubAId === 4 || r.clubBId === 4)).toBe(false);
  });

  it('intensity em [1,100]', () => {
    for (const r of generateRivalries(clubs, new SeededRng(7))) {
      expect(r.intensity).toBeGreaterThanOrEqual(1);
      expect(r.intensity).toBeLessThanOrEqual(100);
    }
  });

  it('reinforceIntensity cresce com finais/title-deciders e satura em 100', () => {
    const base = { clubAId: 1, clubBId: 2, intensity: 50, origin: 'division' as const };
    expect(reinforceIntensity(base, { clubAId: 1, clubBId: 2, meetings: 4, finals: 2, titleDeciders: 1 }))
      .toBe(50 + 2 * 4 + 1 * 8);
    expect(reinforceIntensity({ ...base, intensity: 98 },
      { clubAId: 1, clubBId: 2, meetings: 10, finals: 5, titleDeciders: 5 })).toBe(100);
  });
});
