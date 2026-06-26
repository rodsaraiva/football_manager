import { z, ZodObject } from 'zod';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';
import { PlayerStats } from '../../types/player';

// player_stats: todas as colunas NOT NULL; .passthrough() deixa save_id passar.
const playerStatsRowSchema = z
  .object({
    player_id: z.number(),
    season: z.number(),
    competition_id: z.number(),
    appearances: z.number(),
    goals: z.number(),
    assists: z.number(),
    yellow_cards: z.number(),
    red_cards: z.number(),
    avg_rating: z.number(),
    minutes_played: z.number(),
  })
  .passthrough();
type PlayerStatsRow = z.infer<typeof playerStatsRowSchema>;

// Projeções de colunas (subset), não linhas 1:1 de tabela: fora de __rowSchemas.
const recentFormRowSchema = z
  .object({ appearances: z.number(), avg_rating: z.number(), minutes_played: z.number() })
  .passthrough();
const lastNFormRowSchema = z.object({ avg_rating: z.number() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'player_stats', schema: playerStatsRowSchema },
];

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

export async function upsertPlayerStats(db: DbHandle, saveId: number, input: UpsertPlayerStatsInput): Promise<void> {
  const existingRow = await db
    .prepare('SELECT * FROM player_stats WHERE save_id = ? AND player_id = ? AND season = ? AND competition_id = ?')
    .get(saveId, input.playerId, input.season, input.competitionId);
  const existing = parseRow(playerStatsRowSchema.nullable(), existingRow, 'player-stats.upsertPlayerStats');

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO player_stats
          (save_id, player_id, season, competition_id, appearances, goals, assists,
           yellow_cards, red_cards, avg_rating, minutes_played)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        saveId,
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
       WHERE save_id = ? AND player_id = ? AND season = ? AND competition_id = ?`,
    )
    .run(
      input.appearances, input.goals, input.assists,
      input.yellowCards, input.redCards,
      newAvgRating, newMinutes,
      saveId, input.playerId, input.season, input.competitionId,
    );
}

export async function getPlayerStatsByCompetition(
  db: DbHandle,
  saveId: number,
  season: number,
  competitionId: number,
): Promise<PlayerStats[]> {
  const rows = await db
    .prepare('SELECT * FROM player_stats WHERE save_id = ? AND season = ? AND competition_id = ?')
    .all(saveId, season, competitionId);
  return parseRows(playerStatsRowSchema, rows, 'player-stats.getPlayerStatsByCompetition').map(rowToPlayerStats);
}

export async function getPlayerStatsForPlayer(
  db: DbHandle,
  saveId: number,
  playerId: number,
): Promise<PlayerStats[]> {
  const rows = await db
    .prepare('SELECT * FROM player_stats WHERE save_id = ? AND player_id = ? ORDER BY season ASC, competition_id ASC')
    .all(saveId, playerId);
  return parseRows(playerStatsRowSchema, rows, 'player-stats.getPlayerStatsForPlayer').map(rowToPlayerStats);
}

export interface RecentForm {
  minutesPlayed: number;
  totalPossibleMinutes: number;
  avgRating: number;
}

/**
 * Aggregates a player's real season form from player_stats: total minutes, the
 * appearance-based possible minutes (appearances * 90), and the minutes-weighted
 * average rating across competitions. avg_rating per row is already minutes-weighted
 * within its (player, season, competition) group, so weighting by minutes is correct.
 */
export async function getRecentForm(
  db: DbHandle,
  saveId: number,
  playerId: number,
  season: number,
): Promise<RecentForm> {
  const rawRows = await db
    .prepare(
      'SELECT appearances, avg_rating, minutes_played FROM player_stats WHERE save_id = ? AND player_id = ? AND season = ?',
    )
    .all(saveId, playerId, season);
  const rows = parseRows(recentFormRowSchema, rawRows, 'player-stats.getRecentForm');

  let minutesPlayed = 0;
  let totalPossibleMinutes = 0;
  let weightedRatingSum = 0;
  for (const r of rows) {
    minutesPlayed += r.minutes_played;
    totalPossibleMinutes += r.appearances * 90;
    weightedRatingSum += r.avg_rating * r.minutes_played;
  }
  const avgRating = minutesPlayed > 0 ? weightedRatingSum / minutesPlayed : 0;
  return { minutesPlayed, totalPossibleMinutes, avgRating };
}

/**
 * Últimos N avg_ratings do jogador na temporada (proxy de forma recente:
 * player_stats agrega por competição, sem rating por-jogo). Ordena por minutos
 * desc como aproximação de "jogos recentes". Save-isolado. Sem RNG.
 */
export async function getLastNMatchForm(
  db: DbHandle, saveId: number, playerId: number, season: number, n: number,
): Promise<number[]> {
  const rawRows = await db.prepare(
    `SELECT avg_rating FROM player_stats
     WHERE save_id = ? AND player_id = ? AND season = ? AND minutes_played > 0
     ORDER BY minutes_played DESC LIMIT ?`,
  ).all(saveId, playerId, season, n);
  const rows = parseRows(lastNFormRowSchema, rawRows, 'player-stats.getLastNMatchForm');
  return rows.map((r) => r.avg_rating);
}
