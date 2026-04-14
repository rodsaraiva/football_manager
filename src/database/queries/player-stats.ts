import { DbHandle } from './players';
import { PlayerStats } from '../../types/player';

interface PlayerStatsRow {
  player_id: number;
  season: number;
  competition_id: number;
  appearances: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  avg_rating: number;
  minutes_played: number;
}

function rowToPlayerStats(row: PlayerStatsRow): PlayerStats {
  return {
    playerId: row.player_id,
    season: row.season,
    competitionId: row.competition_id,
    appearances: row.appearances,
    goals: row.goals,
    assists: row.assists,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    avgRating: row.avg_rating,
    minutesPlayed: row.minutes_played,
  };
}

export interface UpsertPlayerStatsInput {
  playerId: number;
  season: number;
  competitionId: number;
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number;          // this match's rating
  minutesPlayed: number;   // this match's minutes
}

export async function upsertPlayerStats(db: DbHandle, input: UpsertPlayerStatsInput): Promise<void> {
  const existing = await db
    .prepare('SELECT * FROM player_stats WHERE player_id = ? AND season = ? AND competition_id = ?')
    .get(input.playerId, input.season, input.competitionId) as PlayerStatsRow | undefined;

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO player_stats
          (player_id, season, competition_id, appearances, goals, assists,
           yellow_cards, red_cards, avg_rating, minutes_played)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.playerId, input.season, input.competitionId,
        input.appearances, input.goals, input.assists,
        input.yellowCards, input.redCards, input.rating, input.minutesPlayed,
      );
    return;
  }

  const newMinutes = existing.minutes_played + input.minutesPlayed;
  const newAvgRating =
    newMinutes > 0
      ? (existing.avg_rating * existing.minutes_played + input.rating * input.minutesPlayed) / newMinutes
      : existing.avg_rating;

  await db
    .prepare(
      `UPDATE player_stats SET
        appearances = appearances + ?,
        goals = goals + ?,
        assists = assists + ?,
        yellow_cards = yellow_cards + ?,
        red_cards = red_cards + ?,
        avg_rating = ?,
        minutes_played = ?
       WHERE player_id = ? AND season = ? AND competition_id = ?`,
    )
    .run(
      input.appearances, input.goals, input.assists,
      input.yellowCards, input.redCards,
      newAvgRating, newMinutes,
      input.playerId, input.season, input.competitionId,
    );
}

export async function getPlayerStatsByCompetition(
  db: DbHandle,
  season: number,
  competitionId: number,
): Promise<PlayerStats[]> {
  const rows = await db
    .prepare('SELECT * FROM player_stats WHERE season = ? AND competition_id = ?')
    .all(season, competitionId) as PlayerStatsRow[];
  return rows.map(rowToPlayerStats);
}

export async function getPlayerStatsForPlayer(
  db: DbHandle,
  playerId: number,
): Promise<PlayerStats[]> {
  const rows = await db
    .prepare('SELECT * FROM player_stats WHERE player_id = ? ORDER BY season ASC, competition_id ASC')
    .all(playerId) as PlayerStatsRow[];
  return rows.map(rowToPlayerStats);
}
