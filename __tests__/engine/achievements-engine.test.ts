import { evaluateAchievements, AchievementSnapshot } from '@/engine/achievements/achievements-engine';
import { ACHIEVEMENTS } from '@/engine/achievements/achievements-catalog';

describe('achievements catalog', () => {
  it('has 10-12 entries with unique ids and i18n keys', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(12);
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.icon.length).toBeGreaterThan(0);
      expect(a.titleKey).toContain('achievements.');
      expect(a.descKey).toContain('achievements.');
    }
  });

  it('every evaluator-emittable id exists in the catalog', () => {
    const catalogIds = new Set(ACHIEVEMENTS.map((a) => a.id));
    // Snapshot that triggers everything at once.
    const all = evaluateAchievements({
      justWon: true,
      goalMargin: 5,
      totalWins: 50,
      wonLeague: true,
      wonCup: true,
      promoted: true,
      managerReputation: 100,
      seasonsCompleted: 10,
      changedClubs: true,
    });
    for (const id of all) expect(catalogIds.has(id)).toBe(true);
  });
});

describe('evaluateAchievements', () => {
  const empty: AchievementSnapshot = {};

  it('an empty snapshot unlocks nothing', () => {
    expect(evaluateAchievements(empty)).toEqual([]);
  });

  describe('first_win / wins_10 (from totalWins)', () => {
    it('first_win unlocks at totalWins >= 1', () => {
      expect(evaluateAchievements({ totalWins: 1 })).toContain('first_win');
      expect(evaluateAchievements({ totalWins: 0 })).not.toContain('first_win');
    });
    it('wins_10 unlocks at 10, not at 9', () => {
      expect(evaluateAchievements({ totalWins: 9 })).not.toContain('wins_10');
      expect(evaluateAchievements({ totalWins: 10 })).toContain('wins_10');
    });
    it('totalWins absent unlocks neither', () => {
      const ids = evaluateAchievements(empty);
      expect(ids).not.toContain('first_win');
      expect(ids).not.toContain('wins_10');
    });
  });

  describe('big_win (goalMargin >= 4 && justWon)', () => {
    it('unlocks at margin 4 with a win', () => {
      expect(evaluateAchievements({ justWon: true, goalMargin: 4 })).toContain('big_win');
    });
    it('does not unlock at margin 3', () => {
      expect(evaluateAchievements({ justWon: true, goalMargin: 3 })).not.toContain('big_win');
    });
    it('does not unlock on a big margin that was not a win', () => {
      expect(evaluateAchievements({ justWon: false, goalMargin: 5 })).not.toContain('big_win');
    });
    it('does not unlock when justWon is absent', () => {
      expect(evaluateAchievements({ goalMargin: 5 })).not.toContain('big_win');
    });
  });

  describe('season-end achievements', () => {
    it('league_title from wonLeague', () => {
      expect(evaluateAchievements({ wonLeague: true })).toContain('league_title');
      expect(evaluateAchievements({ wonLeague: false })).not.toContain('league_title');
      expect(evaluateAchievements(empty)).not.toContain('league_title');
    });
    it('cup_title from wonCup', () => {
      expect(evaluateAchievements({ wonCup: true })).toContain('cup_title');
      expect(evaluateAchievements({ wonCup: false })).not.toContain('cup_title');
    });
    it('promotion from promoted', () => {
      expect(evaluateAchievements({ promoted: true })).toContain('promotion');
      expect(evaluateAchievements({ promoted: false })).not.toContain('promotion');
    });
    it('season_complete at >= 1 season', () => {
      expect(evaluateAchievements({ seasonsCompleted: 1 })).toContain('season_complete');
      expect(evaluateAchievements({ seasonsCompleted: 0 })).not.toContain('season_complete');
    });
    it('survivor at >= 3 seasons, not at 2', () => {
      expect(evaluateAchievements({ seasonsCompleted: 2 })).not.toContain('survivor');
      expect(evaluateAchievements({ seasonsCompleted: 3 })).toContain('survivor');
    });
  });

  describe('reputation achievements (thresholds)', () => {
    it('rep_respected at 60, not 59', () => {
      expect(evaluateAchievements({ managerReputation: 59 })).not.toContain('rep_respected');
      expect(evaluateAchievements({ managerReputation: 60 })).toContain('rep_respected');
    });
    it('rep_elite at 85, not 84', () => {
      expect(evaluateAchievements({ managerReputation: 84 })).not.toContain('rep_elite');
      expect(evaluateAchievements({ managerReputation: 85 })).toContain('rep_elite');
    });
  });

  describe('poached (changedClubs)', () => {
    it('unlocks when changedClubs is true', () => {
      expect(evaluateAchievements({ changedClubs: true })).toEqual(['poached']);
    });
    it('does not unlock when false or absent', () => {
      expect(evaluateAchievements({ changedClubs: false })).not.toContain('poached');
      expect(evaluateAchievements(empty)).not.toContain('poached');
    });
  });

  describe('partial snapshots only unlock relevant achievements', () => {
    it('a post-match snapshot never unlocks season-end ones', () => {
      const ids = evaluateAchievements({ justWon: true, goalMargin: 4, totalWins: 10 });
      expect(ids).toEqual(expect.arrayContaining(['first_win', 'wins_10', 'big_win']));
      expect(ids).not.toContain('league_title');
      expect(ids).not.toContain('cup_title');
      expect(ids).not.toContain('rep_respected');
      expect(ids).not.toContain('poached');
    });
    it('a season-end snapshot never unlocks post-match ones', () => {
      const ids = evaluateAchievements({
        wonLeague: true,
        wonCup: false,
        promoted: false,
        managerReputation: 60,
        seasonsCompleted: 1,
      });
      expect(ids).toEqual(expect.arrayContaining(['league_title', 'rep_respected', 'season_complete']));
      expect(ids).not.toContain('first_win');
      expect(ids).not.toContain('big_win');
      expect(ids).not.toContain('poached');
    });
  });
});
