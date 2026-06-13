import type { TKey } from '@/i18n/translate';

/**
 * Static definition of an achievement. The unlock *condition* lives in the evaluator
 * (achievements-engine); this is only the display metadata + i18n keys.
 */
export interface AchievementDef {
  id: string;
  icon: string;
  titleKey: TKey;
  descKey: TKey;
}

/**
 * The shipped catalog (MVP). Order here is the display order on the achievements screen.
 * Each id matches a branch in evaluateAchievements.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', icon: '🎉', titleKey: 'achievements.first_win_title', descKey: 'achievements.first_win_desc' },
  { id: 'wins_10', icon: '🔟', titleKey: 'achievements.wins_10_title', descKey: 'achievements.wins_10_desc' },
  { id: 'big_win', icon: '💥', titleKey: 'achievements.big_win_title', descKey: 'achievements.big_win_desc' },
  { id: 'season_complete', icon: '📅', titleKey: 'achievements.season_complete_title', descKey: 'achievements.season_complete_desc' },
  { id: 'survivor', icon: '🛡️', titleKey: 'achievements.survivor_title', descKey: 'achievements.survivor_desc' },
  { id: 'promotion', icon: '⬆️', titleKey: 'achievements.promotion_title', descKey: 'achievements.promotion_desc' },
  { id: 'league_title', icon: '🏆', titleKey: 'achievements.league_title_title', descKey: 'achievements.league_title_desc' },
  { id: 'cup_title', icon: '🏅', titleKey: 'achievements.cup_title_title', descKey: 'achievements.cup_title_desc' },
  { id: 'rep_respected', icon: '⭐', titleKey: 'achievements.rep_respected_title', descKey: 'achievements.rep_respected_desc' },
  { id: 'rep_elite', icon: '🌟', titleKey: 'achievements.rep_elite_title', descKey: 'achievements.rep_elite_desc' },
  { id: 'poached', icon: '🤝', titleKey: 'achievements.poached_title', descKey: 'achievements.poached_desc' },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievementDef(id: string): AchievementDef | undefined {
  return BY_ID.get(id);
}
