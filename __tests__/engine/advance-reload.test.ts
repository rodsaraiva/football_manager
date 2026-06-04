import { resolveAdvanceReload } from '@/engine/advance-reload';

describe('resolveAdvanceReload', () => {
  it('on season end: fetch recents for the season that just ended, start new season', () => {
    const r = resolveAdvanceReload({
      result: { isSeasonEnd: true, newSeason: 3 },
      season: 2,
    });
    expect(r.fetchSeasonForRecents).toBe(2);
    expect(r.shouldStartNewSeason).toBe(true);
  });

  it('on a normal week: fetch recents for the (unchanged) new season, no new season', () => {
    const r = resolveAdvanceReload({
      result: { isSeasonEnd: false, newSeason: 2 },
      season: 2,
    });
    expect(r.fetchSeasonForRecents).toBe(2);
    expect(r.shouldStartNewSeason).toBe(false);
  });
});
