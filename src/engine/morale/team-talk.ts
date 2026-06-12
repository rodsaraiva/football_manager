export type TeamTalkTone = 'praise' | 'criticize' | 'motivate';

export interface TeamTalkInput {
  tone: TeamTalkTone;
  recentAvgRating: number; // 0 if no recent games
}

/**
 * Pure: morale delta from a one-off manager interaction.
 * Praise rewards more when form is poor (recognition matters less when already flying).
 * Criticism backfires on in-form players but can sting an out-of-form one without hurting.
 * Motivate is a flat small lift.
 */
export function computeTeamTalkDelta(input: TeamTalkInput): number {
  const r = input.recentAvgRating;
  switch (input.tone) {
    case 'praise':
      return r >= 7.0 ? 1 : 3;
    case 'criticize':
      // in great form → resentment; poor form → neutral wake-up
      return r >= 7.0 ? -3 : 0;
    case 'motivate':
      return 2;
  }
}
