import {
  suggestClubsForProfile,
  AMBITION_PROFILES,
  MAX_SUGGESTIONS,
  ClubForAmbition,
} from '@/engine/newgame/ambition';

const mk = (id: number, reputation: number, divisionLevel: number): ClubForAmbition => ({
  id,
  reputation,
  divisionLevel,
});

const SAMPLE: ClubForAmbition[] = [
  mk(1, 95, 1), // continental
  mk(2, 80, 1), // continental
  mk(3, 78, 1), // continental (boundary)
  mk(4, 77, 1), // nacional (boundary)
  mk(5, 50, 1), // nacional
  mk(6, 45, 2), // acesso
  mk(7, 30, 3), // acesso
];

describe('AMBITION_PROFILES', () => {
  it('has the three profiles in order continental, nacional, acesso', () => {
    expect(AMBITION_PROFILES.map((p) => p.id)).toEqual(['continental', 'nacional', 'acesso']);
  });
});

describe('suggestClubsForProfile', () => {
  it('continental: only div1 with rep >= 78', () => {
    const ids = suggestClubsForProfile('continental', SAMPLE).map((c) => c.id);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('nacional: div1 with rep < 78, excludes the continental elite', () => {
    const ids = suggestClubsForProfile('nacional', SAMPLE).map((c) => c.id);
    expect(ids).toEqual([4, 5]);
  });

  it('acesso: only division >= 2', () => {
    const ids = suggestClubsForProfile('acesso', SAMPLE).map((c) => c.id);
    expect(ids).toEqual([6, 7]);
  });

  it('returns empty array when no club matches the profile', () => {
    const onlyLower = [mk(10, 20, 2), mk(11, 15, 3)];
    expect(suggestClubsForProfile('continental', onlyLower)).toEqual([]);
  });

  it('sorts by reputation desc and caps at MAX_SUGGESTIONS', () => {
    const many = [
      mk(1, 90, 1), mk(2, 88, 1), mk(3, 86, 1),
      mk(4, 84, 1), mk(5, 82, 1), mk(6, 80, 1), mk(7, 79, 1),
    ];
    const result = suggestClubsForProfile('continental', many);
    expect(result).toHaveLength(MAX_SUGGESTIONS);
    expect(result.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('preserves the original club object (extra fields kept)', () => {
    const enriched = [{ id: 1, reputation: 90, divisionLevel: 1, name: 'Foo FC' }];
    const result = suggestClubsForProfile('continental', enriched);
    expect(result[0]).toBe(enriched[0]);
    expect((result[0] as typeof enriched[number]).name).toBe('Foo FC');
  });
});
