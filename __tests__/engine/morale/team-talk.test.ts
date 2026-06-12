import { computeTeamTalkDelta, TeamTalkInput } from '@/engine/morale/team-talk';

describe('computeTeamTalkDelta', () => {
  it('praising a player in poor form helps', () => {
    const d = computeTeamTalkDelta({ tone: 'praise', recentAvgRating: 5.5 });
    expect(d).toBeGreaterThan(0);
  });

  it('praising a player already in great form helps little or nothing', () => {
    const poor = computeTeamTalkDelta({ tone: 'praise', recentAvgRating: 5.5 });
    const great = computeTeamTalkDelta({ tone: 'praise', recentAvgRating: 8.0 });
    expect(great).toBeLessThan(poor);
  });

  it('criticizing a player in great form can backfire (negative)', () => {
    const d = computeTeamTalkDelta({ tone: 'criticize', recentAvgRating: 8.0 });
    expect(d).toBeLessThan(0);
  });

  it('criticizing a player in poor form can sting them into a small lift or neutral', () => {
    const d = computeTeamTalkDelta({ tone: 'criticize', recentAvgRating: 4.5 });
    expect(d).toBeGreaterThanOrEqual(0);
  });

  it('motivate is a small positive regardless of form', () => {
    expect(computeTeamTalkDelta({ tone: 'motivate', recentAvgRating: 6.0 })).toBeGreaterThan(0);
    expect(computeTeamTalkDelta({ tone: 'motivate', recentAvgRating: 8.0 })).toBeGreaterThan(0);
  });
});

// Keep TeamTalkInput referenced for the type import.
const _typecheck: TeamTalkInput = { tone: 'praise', recentAvgRating: 6 };
void _typecheck;
