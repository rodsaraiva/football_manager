/**
 * Facts known at a checkpoint. Each field is OPTIONAL: a checkpoint passes only the facts
 * it actually has (post-match knows wins/margin; season-end knows titles/rep; club-change
 * knows changedClubs). A missing field never unlocks its achievement — so a partial snapshot
 * only unlocks the achievements relevant to that checkpoint.
 */
export interface AchievementSnapshot {
  justWon?: boolean;
  goalMargin?: number;
  totalWins?: number;
  wonLeague?: boolean;
  wonCup?: boolean;
  promoted?: boolean;
  managerReputation?: number;
  seasonsCompleted?: number;
  changedClubs?: boolean;
}

const WINS_10_THRESHOLD = 10;
const BIG_WIN_MARGIN = 4;
const SURVIVOR_SEASONS = 3;
const REP_RESPECTED = 60;
const REP_ELITE = 85;

/**
 * Pure: returns the ids of every achievement whose condition is met by the snapshot.
 * Reads only the fields each condition needs; undefined fields are treated as "not met".
 */
export function evaluateAchievements(s: AchievementSnapshot): string[] {
  const unlocked: string[] = [];

  if ((s.totalWins ?? 0) >= 1) unlocked.push('first_win');
  if ((s.totalWins ?? 0) >= WINS_10_THRESHOLD) unlocked.push('wins_10');
  if (s.justWon === true && (s.goalMargin ?? 0) >= BIG_WIN_MARGIN) unlocked.push('big_win');

  if ((s.seasonsCompleted ?? 0) >= 1) unlocked.push('season_complete');
  if ((s.seasonsCompleted ?? 0) >= SURVIVOR_SEASONS) unlocked.push('survivor');
  if (s.promoted === true) unlocked.push('promotion');
  if (s.wonLeague === true) unlocked.push('league_title');
  if (s.wonCup === true) unlocked.push('cup_title');

  if ((s.managerReputation ?? 0) >= REP_RESPECTED) unlocked.push('rep_respected');
  if ((s.managerReputation ?? 0) >= REP_ELITE) unlocked.push('rep_elite');

  if (s.changedClubs === true) unlocked.push('poached');

  return unlocked;
}
