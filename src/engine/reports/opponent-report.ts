/**
 * Relatório Pré-Jogo do Adversário.
 *
 * Pure engine: builds a scouting summary of the next opponent based on
 * their recent form, squad strength, and goal stats.
 */
import { Fixture, MatchEvent, Position } from '@/types';
import { PlayerAttributes } from '@/types/player';
import { calculateOverall } from '@/utils/overall';
import { ratePlayerFromEvents } from './technical-report';

export interface OpponentPlayer {
  id: number;
  name: string;
  position: Position;
  overall: number;
}

export interface RecentResult {
  fixtureId: number;
  result: 'W' | 'D' | 'L';
  goalsFor: number;
  goalsAgainst: number;
  week: number;
}

export interface OpponentReport {
  opponentId: number;
  opponentName: string;
  opponentReputation: number;
  reputationLabel: 'Favorito' | 'Equilíbrio' | 'Zebra';
  /** Upcoming fixture week */
  fixtureWeek: number;
  isHome: boolean;
  recentForm: RecentResult[];
  goalsPerGame: number;
  concededPerGame: number;
  topPlayers: OpponentPlayer[];
  squadAvgOverall: number;
  alertMessage: string | null;
}

export interface BuildOpponentReportInput {
  nextFixture: Fixture;
  playerClubId: number;
  playerClubReputation: number;
  opponentClubId: number;
  opponentName: string;
  opponentReputation: number;
  /** Last N played fixtures of the opponent */
  opponentRecentFixtures: Fixture[];
  /** Players + attributes of the opponent squad */
  opponentSquad: (OpponentPlayer & { attributes: PlayerAttributes })[];
  /** Events grouped by fixture id */
  eventsByFixture: Map<number, MatchEvent[]>;
}

export function buildOpponentReport(input: BuildOpponentReportInput): OpponentReport {
  const {
    nextFixture,
    playerClubId,
    playerClubReputation,
    opponentClubId,
    opponentName,
    opponentReputation,
    opponentRecentFixtures,
    opponentSquad,
    eventsByFixture,
  } = input;

  const isHome = nextFixture.homeClubId === playerClubId;

  // Reputation label
  const repDiff = opponentReputation - playerClubReputation;
  let reputationLabel: 'Favorito' | 'Equilíbrio' | 'Zebra';
  if (repDiff > 15) reputationLabel = 'Favorito';
  else if (repDiff < -15) reputationLabel = 'Zebra';
  else reputationLabel = 'Equilíbrio';

  // Recent form
  const recentForm: RecentResult[] = opponentRecentFixtures.map((f) => {
    const isOppHome = f.homeClubId === opponentClubId;
    const gf = isOppHome ? (f.homeGoals ?? 0) : (f.awayGoals ?? 0);
    const ga = isOppHome ? (f.awayGoals ?? 0) : (f.homeGoals ?? 0);
    let result: 'W' | 'D' | 'L';
    if (gf > ga) result = 'W';
    else if (gf === ga) result = 'D';
    else result = 'L';
    return { fixtureId: f.id, result, goalsFor: gf, goalsAgainst: ga, week: f.week };
  });

  // Goals stats
  const goalsPerGame =
    recentForm.length > 0
      ? Math.round((recentForm.reduce((s, r) => s + r.goalsFor, 0) / recentForm.length) * 10) / 10
      : 0;
  const concededPerGame =
    recentForm.length > 0
      ? Math.round((recentForm.reduce((s, r) => s + r.goalsAgainst, 0) / recentForm.length) * 10) / 10
      : 0;

  // Compute overalls from attributes
  const playersWithOverall: OpponentPlayer[] = opponentSquad.map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    overall: calculateOverall(p.attributes, p.position),
  }));

  const overalls = playersWithOverall.map((p) => p.overall);
  const squadAvgOverall =
    overalls.length > 0
      ? Math.round(overalls.reduce((s, v) => s + v, 0) / overalls.length)
      : 0;

  // Top 3 by overall
  const topPlayers = [...playersWithOverall]
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 3);

  // Alert: 3+ consecutive wins or losses
  let alertMessage: string | null = null;
  if (recentForm.length >= 3) {
    const last3 = recentForm.slice(0, 3);
    if (last3.every((r) => r.result === 'W')) {
      alertMessage = `⚠️ ${opponentName} está em sequência de ${recentForm.filter((r) => r.result === 'W').length} vitórias!`;
    } else if (last3.every((r) => r.result === 'L')) {
      alertMessage = `${opponentName} está em queda livre — ${recentForm.filter((r) => r.result === 'L').length} derrotas seguidas.`;
    }
  }

  return {
    opponentId: opponentClubId,
    opponentName,
    opponentReputation,
    reputationLabel,
    fixtureWeek: nextFixture.week,
    isHome,
    recentForm,
    goalsPerGame,
    concededPerGame,
    topPlayers,
    squadAvgOverall,
    alertMessage,
  };
}
