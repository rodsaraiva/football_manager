import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { rankLegends, LegendCandidate } from './legends-engine';
import { computeClubRecords } from './records-engine';
import { generateRivalries, reinforceIntensity, RivalryClub } from './rivalry-engine';
import {
  replaceClubLegends, replaceClubRecords, upsertRivalry, getRivalry, getHeadToHead,
} from '@/database/queries/legacy';
import { LEGENDS_LIMIT } from '@/engine/balance';

interface AggRow { player_id: number; appearances: number; goals: number; assists: number; first_season: number; last_season: number; }

async function loadLegendCandidates(db: DbHandle, saveId: number, clubId: number): Promise<LegendCandidate[]> {
  const stats = (await db.prepare(
    `SELECT ps.player_id AS player_id,
            SUM(ps.appearances) AS appearances, SUM(ps.goals) AS goals, SUM(ps.assists) AS assists,
            MIN(ps.season) AS first_season, MAX(ps.season) AS last_season
     FROM player_stats ps JOIN players p ON p.id = ps.player_id AND p.save_id = ps.save_id
     WHERE ps.save_id = ? AND p.club_id = ? GROUP BY ps.player_id`,
  ).all(saveId, clubId)) as AggRow[];
  const titles = (await db.prepare(
    'SELECT player_id, COUNT(*) AS n FROM season_player_titles WHERE save_id = ? AND club_id = ? GROUP BY player_id',
  ).all(saveId, clubId)) as Array<{ player_id: number; n: number }>;
  const awards = (await db.prepare(
    `SELECT player_id, COUNT(*) AS n FROM season_awards
     WHERE save_id = ? AND club_id = ? AND ((award_type IN ('mvp','breakthrough')) OR (award_type IN ('top_scorer','top_assister') AND rank = 1))
     GROUP BY player_id`,
  ).all(saveId, clubId)) as Array<{ player_id: number; n: number }>;
  const tMap = new Map(titles.map((t) => [t.player_id, t.n]));
  const aMap = new Map(awards.map((a) => [a.player_id, a.n]));
  return stats.map((s) => ({
    playerId: s.player_id, clubId,
    appearances: s.appearances ?? 0, goals: s.goals ?? 0, assists: s.assists ?? 0,
    trophies: tMap.get(s.player_id) ?? 0, individualAwards: aMap.get(s.player_id) ?? 0,
    firstSeason: s.first_season ?? 0, lastSeason: s.last_season ?? 0,
  }));
}

export async function archiveLegacy(db: DbHandle, saveId: number, season: number, clubId: number): Promise<void> {
  // 1. Legends
  const candidates = await loadLegendCandidates(db, saveId, clubId);
  await replaceClubLegends(db, saveId, clubId, rankLegends(candidates, LEGENDS_LIMIT));

  // 2. Records
  const scorers = candidates.map((c) => ({ playerId: c.playerId, goals: c.goals }));
  const appearances = candidates.map((c) => ({ playerId: c.playerId, games: c.appearances }));
  const fixtures = (await db.prepare(
    `SELECT id, season, home_club_id, away_club_id, home_goals, away_goals
     FROM fixtures WHERE save_id = ? AND played = 1 AND (home_club_id = ? OR away_club_id = ?)
       AND home_goals IS NOT NULL AND away_goals IS NOT NULL`,
  ).all(saveId, clubId, clubId)) as Array<{ id: number; season: number; home_club_id: number; away_club_id: number; home_goals: number; away_goals: number }>;
  const results = fixtures.map((f) => {
    const home = f.home_club_id === clubId;
    return { fixtureId: f.id, season: f.season,
      gf: home ? f.home_goals : f.away_goals, ga: home ? f.away_goals : f.home_goals,
      opponentId: home ? f.away_club_id : f.home_club_id };
  });
  const trophyRows = (await db.prepare(
    'SELECT season, COUNT(*) AS n FROM season_competition_results WHERE save_id = ? AND champion_club_id = ? GROUP BY season',
  ).all(saveId, clubId)) as Array<{ season: number; n: number }>;
  const trophiesBySeason = new Map(trophyRows.map((t) => [t.season, t.n]));
  await replaceClubRecords(db, saveId, clubId, computeClubRecords({ clubId, scorers, appearances, results, trophiesBySeason }));

  // 3. Reforço de rivalidades nos confrontos desta temporada
  const opponents = (await db.prepare(
    `SELECT DISTINCT CASE WHEN home_club_id = ? THEN away_club_id ELSE home_club_id END AS opp
     FROM fixtures WHERE save_id = ? AND season = ? AND played = 1 AND (home_club_id = ? OR away_club_id = ?)`,
  ).all(clubId, saveId, season, clubId, clubId)) as Array<{ opp: number }>;
  for (const { opp } of opponents) {
    const base = await getRivalry(db, saveId, clubId, opp);
    if (!base) continue;
    const h2h = await getHeadToHead(db, saveId, clubId, opp);
    const next = reinforceIntensity(base, h2h);
    await upsertRivalry(db, saveId, { ...base, intensity: next });
  }
}

export async function bootstrapRivalries(db: DbHandle, saveId: number): Promise<void> {
  const rows = (await db.prepare(
    `SELECT c.id AS id, c.league_id AS leagueId, c.country_id AS countryId, c.reputation AS reputation, l.division_level AS divisionLevel
     FROM clubs c JOIN leagues l ON l.id = c.league_id WHERE c.save_id = ?`,
  ).all(saveId)) as RivalryClub[];
  const rivalries = generateRivalries(rows, new SeededRng(saveId));
  for (const r of rivalries) await upsertRivalry(db, saveId, r);
}
