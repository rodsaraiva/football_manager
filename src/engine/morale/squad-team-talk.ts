import { computeTeamTalkDelta, TeamTalkTone } from './team-talk';
import { applyMoraleDelta } from './morale-engine';

export interface SquadTalkMember {
  id: number;
  morale: number;
  recentAvgRating: number; // 0 if no recent games
}

export interface SquadTalkMemberResult {
  id: number;
  delta: number;
  nextMorale: number;
}

export interface SquadTalkSummary {
  improved: number;
  worsened: number;
  unchanged: number;
}

export interface SquadTalkResult {
  results: SquadTalkMemberResult[];
  summary: SquadTalkSummary;
}

/**
 * Pure: applies a collective team talk to a whole roster. Each player's delta is
 * driven by their own recent form via computeTeamTalkDelta, so the same tone helps
 * some and stings others. Returns per-player results plus a reaction summary.
 */
export function computeSquadTeamTalk(roster: SquadTalkMember[], tone: TeamTalkTone): SquadTalkResult {
  const summary: SquadTalkSummary = { improved: 0, worsened: 0, unchanged: 0 };
  const results = roster.map((m) => {
    const delta = computeTeamTalkDelta({ tone, recentAvgRating: m.recentAvgRating });
    const nextMorale = applyMoraleDelta(m.morale, delta);
    const effective = nextMorale - m.morale; // post-clamp change
    if (effective > 0) summary.improved += 1;
    else if (effective < 0) summary.worsened += 1;
    else summary.unchanged += 1;
    return { id: m.id, delta, nextMorale };
  });
  return { results, summary };
}
