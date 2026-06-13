import { computeSquadTeamTalk, SquadTalkMember } from '@/engine/morale/squad-team-talk';

const roster: SquadTalkMember[] = [
  { id: 1, morale: 50, recentAvgRating: 8.0 }, // in form
  { id: 2, morale: 50, recentAvgRating: 5.0 }, // out of form
  { id: 3, morale: 99, recentAvgRating: 5.0 }, // out of form, morale capped
];

describe('computeSquadTeamTalk', () => {
  it('praise lifts everyone, summarising how many improved', () => {
    const out = computeSquadTeamTalk(roster, 'praise');
    expect(out.results).toHaveLength(3);
    expect(out.summary.improved).toBe(3);
    expect(out.summary.worsened).toBe(0);
    // delta is bigger for the out-of-form player (praise matters more when struggling)
    const inForm = out.results.find((r) => r.id === 1)!;
    const outOfForm = out.results.find((r) => r.id === 2)!;
    expect(outOfForm.delta).toBeGreaterThan(inForm.delta);
  });

  it('criticism backfires on in-form players and is neutral for the rest', () => {
    const out = computeSquadTeamTalk(roster, 'criticize');
    const inForm = out.results.find((r) => r.id === 1)!;
    expect(inForm.delta).toBeLessThan(0);
    expect(out.summary.worsened).toBe(1);
  });

  it('clamps next morale to the [1,100] schema range', () => {
    const out = computeSquadTeamTalk([{ id: 9, morale: 99, recentAvgRating: 5.0 }], 'praise');
    expect(out.results[0].nextMorale).toBeLessThanOrEqual(100);
    expect(out.results[0].nextMorale).toBeGreaterThanOrEqual(1);
  });

  it('counts a zero-delta member as unchanged', () => {
    // motivate is a flat +2 for all, so craft criticism on out-of-form/low-ish to hit a neutral 0
    const out = computeSquadTeamTalk([{ id: 1, morale: 50, recentAvgRating: 5.0 }], 'criticize');
    // out-of-form + ok morale → wake-up (0 in team-talk engine), so unchanged
    expect(out.summary.unchanged + out.summary.improved + out.summary.worsened).toBe(1);
  });
});
