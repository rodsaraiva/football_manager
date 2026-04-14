/**
 * Analista de Dados.
 *
 * Ranks the player's club against every other club in the same league across
 * multiple dimensions (overall, attack, defense, points-per-game, etc).
 */
import { Fixture } from '@/types';

export interface ClubSample {
  clubId: number;
  name: string;
  /** Average overall of all non-injured squad players. */
  squadOverall: number;
  /** Best single-player overall in the squad. */
  bestOverall: number;
  /** Aggregate points earned in played league fixtures so far. */
  points: number;
  matchesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface RankLine {
  metric: string;
  rank: number;      // 1-based rank of the player's club
  total: number;     // total clubs ranked
  value: number;     // the player's club value
  leader: { clubId: number; name: string; value: number };
  playerClubName: string;
  /** Human-readable phrase summarising the ranking. */
  description: string;
}

export interface AnalyticsReport {
  playerClubId: number;
  lines: RankLine[];
}

export interface AnalyticsInput {
  playerClubId: number;
  samples: ClubSample[];
  /** Optional for UIs that want to list the raw top list. */
  includeLeaderboards?: boolean;
}

function ordinal(n: number): string {
  if (n === 1) return '1º';
  if (n === 2) return '2º';
  if (n === 3) return '3º';
  return `${n}º`;
}

function rankOne(
  samples: ClubSample[],
  getValue: (s: ClubSample) => number,
  higherIsBetter: boolean,
): { sorted: ClubSample[]; rankByClub: Map<number, number> } {
  const sorted = [...samples].sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    return higherIsBetter ? vb - va : va - vb;
  });
  const rankByClub = new Map<number, number>();
  sorted.forEach((s, i) => rankByClub.set(s.clubId, i + 1));
  return { sorted, rankByClub };
}

export function buildAnalyticsReport(input: AnalyticsInput): AnalyticsReport {
  const { samples, playerClubId } = input;
  const player = samples.find((s) => s.clubId === playerClubId);
  if (!player || samples.length < 2) {
    return { playerClubId, lines: [] };
  }

  const total = samples.length;
  const lines: RankLine[] = [];

  const push = (
    metric: string,
    getValue: (s: ClubSample) => number,
    higherIsBetter: boolean,
    formatDescription: (rank: number, value: number, leader: ClubSample, leaderValue: number) => string,
  ) => {
    const { sorted, rankByClub } = rankOne(samples, getValue, higherIsBetter);
    const rank = rankByClub.get(playerClubId) ?? total;
    const leader = sorted[0];
    const leaderValue = getValue(leader);
    lines.push({
      metric,
      rank,
      total,
      value: getValue(player),
      leader: { clubId: leader.clubId, name: leader.name, value: leaderValue },
      playerClubName: player.name,
      description: formatDescription(rank, getValue(player), leader, leaderValue),
    });
  };

  push(
    'Overall do elenco',
    (s) => s.squadOverall,
    true,
    (rank, value) => `Seu elenco é o ${ordinal(rank)} melhor da liga (overall médio ${value.toFixed(1)}).`,
  );

  push(
    'Craque do time',
    (s) => s.bestOverall,
    true,
    (rank, value) =>
      `Seu melhor jogador tem overall ${value}, ${ordinal(rank)} entre os melhores da liga.`,
  );

  push(
    'Ataque',
    (s) => (s.matchesPlayed > 0 ? s.goalsFor / s.matchesPlayed : 0),
    true,
    (rank, value, leader, leaderValue) =>
      `Ataque médio de ${value.toFixed(2)} gols por jogo — ${ordinal(rank)} melhor da liga (líder: ${leader.name} com ${leaderValue.toFixed(2)}).`,
  );

  push(
    'Defesa',
    (s) => (s.matchesPlayed > 0 ? s.goalsAgainst / s.matchesPlayed : 999),
    false,
    (rank, value) =>
      `Defesa sofre ${value.toFixed(2)} gol(s) por jogo — ${ordinal(rank)} menos vazada da liga.`,
  );

  push(
    'Aproveitamento',
    (s) => (s.matchesPlayed > 0 ? (s.points / (s.matchesPlayed * 3)) * 100 : 0),
    true,
    (rank, value) =>
      `Aproveitamento de ${value.toFixed(0)}% dos pontos disputados — ${ordinal(rank)} na liga.`,
  );

  return { playerClubId, lines };
}
