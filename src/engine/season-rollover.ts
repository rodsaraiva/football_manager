import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';
import { recalculatePotential } from '@/engine/training/potential';
import { generateYouthPlayers } from '@/engine/youth/youth-academy';
import { returnExpiredLoans } from '@/engine/transfer/loan-returns';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { getAllLeagues, createCompetition, addCompetitionEntry } from '@/database/queries/leagues';
import { getClubsByLeague } from '@/database/queries/clubs';
import { createFixture } from '@/database/queries/fixtures';
import { runInTransaction } from '@/database/transaction';

export interface RolloverSeasonParams {
  dbHandle: DbHandle;
  playerClubId: number;
  saveId: number; // -1 when no save (parity with game-loop)
  endedSeason: number;
  newSeason: number;
  youthAcademyLevel: number;
  rng: SeededRng;
}

export interface RolloverSeasonResult {
  freedAgentCount: number;
  youthGeneratedIds: number[];
  potentialUpdatedIds: number[];
  competitionsCreated: number;
  fixturesCreated: number;
}

/**
 * Season-rollover orchestration extracted 1:1 from EndOfSeasonScreen.handleContinue:
 * age players, expire contracts, return loans, recalc potential, generate youth,
 * regenerate the new-season calendar. Wrapped in the canonical runInTransaction so a
 * partial failure rolls the whole batch back. Pure of React — takes a DbHandle.
 */
export async function rolloverSeason(p: RolloverSeasonParams): Promise<RolloverSeasonResult> {
  const { dbHandle: db, playerClubId, endedSeason, newSeason, youthAcademyLevel } = p;
  const youthGeneratedIds: number[] = [];
  const potentialUpdatedIds: number[] = [];

  return runInTransaction(db, async () => {
    // 1. Age all non-retired players (EndOfSeasonScreen.tsx:337-339).
    await db
      .prepare('UPDATE players SET age = age + 1 WHERE club_id IS NOT NULL OR is_free_agent = 1')
      .run();

    // 2. Contract expiry (EndOfSeasonScreen.tsx:362).
    await db
      .prepare('UPDATE players SET is_free_agent = 1 WHERE contract_end <= ? AND club_id IS NOT NULL')
      .run(endedSeason);
    const freed = (await db
      .prepare('SELECT COUNT(*) as n FROM players WHERE is_free_agent = 1')
      .get()) as { n: number };

    // 2b. Return loaned players (EndOfSeasonScreen.tsx:365).
    await returnExpiredLoans(db, endedSeason);

    // 3. Dynamic potential recalculation for the player's squad (EndOfSeasonScreen.tsx:368-393).
    const squad = await getPlayersByClub(db, playerClubId);
    for (const player of squad) {
      const seasonStats = (await db
        .prepare('SELECT avg_rating, minutes_played FROM player_stats WHERE player_id = ? AND season = ?')
        .get(player.id, endedSeason)) as { avg_rating: number; minutes_played: number } | undefined;
      if (!seasonStats) continue;

      const minutesPercent = Math.min(100, (seasonStats.minutes_played / (38 * 90)) * 100);
      const result = recalculatePotential({
        basePotential: player.basePotential,
        effectivePotential: player.effectivePotential,
        currentOverall: 70, // simplified — parity with current screen
        seasonRatings: [{ avgRating: seasonStats.avg_rating, minutesPercent }],
      });
      if (result.newEffectivePotential !== player.effectivePotential) {
        await db.prepare('UPDATE players SET effective_potential = ? WHERE id = ?').run(result.newEffectivePotential, player.id);
        potentialUpdatedIds.push(player.id);
      }
    }

    // 4. Youth academy generation (EndOfSeasonScreen.tsx:396-429).
    const youth = generateYouthPlayers({
      clubId: playerClubId,
      academyLevel: youthAcademyLevel,
      youthCoachBonus: 5, // simplified — parity with current screen
      countryCode: 'EN', // simplified — parity with current screen
      rng: new SeededRng(newSeason * 7777),
    });
    const maxIdRow = (await db.prepare('SELECT MAX(id) as maxId FROM players').get()) as { maxId: number };
    let nextId = (maxIdRow?.maxId ?? 0) + 1;
    for (const y of youth) {
      await db.prepare(
        'INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(nextId, y.name, 'Local', y.age, y.position, null, playerClubId, 5000, newSeason + 3, 100000, y.basePotential, y.basePotential, 70, 100, 0, 0);
      const a = y.attributes;
      await db.prepare(
        'INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(nextId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading, a.longShots, a.freeKicks, a.vision, a.composure, a.decisions, a.positioning, a.aggression, a.leadership, a.pace, a.stamina, a.strength, a.agility, a.jumping);
      youthGeneratedIds.push(nextId);
      nextId++;
    }

    // 5. Regenerate the calendar for the new season (EndOfSeasonScreen.tsx:432-515).
    const leagues = await getAllLeagues(db);
    const clubsByLeague: Record<number, number[]> = {};
    const championsLeagueClubs: number[] = [];
    for (const league of leagues) {
      const clubs = await getClubsByLeague(db, league.id);
      const sorted = [...clubs].sort((a, b) => b.reputation - a.reputation);
      clubsByLeague[league.id] = clubs.map(c => c.id);
      if (championsLeagueClubs.length < 8) {
        for (const club of sorted.slice(0, 2)) {
          if (championsLeagueClubs.length < 8) championsLeagueClubs.push(club.id);
        }
      }
    }
    if (championsLeagueClubs.length < 8) {
      for (const id of Object.values(clubsByLeague).flat()) {
        if (!championsLeagueClubs.includes(id) && championsLeagueClubs.length < 8) championsLeagueClubs.push(id);
      }
    }

    const calendar = generateSeasonCalendar({ season: newSeason, leagues, clubsByLeague, championsLeagueClubs });

    let competitionsCreated = 0;
    for (const comp of calendar.competitions) {
      try {
        await createCompetition(db, { id: comp.id + newSeason * 10000, name: comp.name, type: comp.type, format: comp.format, season: newSeason, leagueId: comp.leagueId });
        competitionsCreated++;
      } catch { /* may already exist */ }
    }
    for (const entry of calendar.entries) {
      try {
        await addCompetitionEntry(db, { competitionId: entry.competitionId + newSeason * 10000, clubId: entry.clubId, groupName: entry.groupName, seed: entry.seed });
      } catch { /* may already exist */ }
    }
    let fixturesCreated = 0;
    for (const fixture of calendar.fixtures) {
      try {
        await createFixture(db, {
          id: fixture.id + newSeason * 100000,
          competitionId: fixture.competitionId + newSeason * 10000,
          season: newSeason,
          week: fixture.week,
          round: typeof fixture.round === 'number' ? String(fixture.round) : fixture.round,
          homeClubId: fixture.homeClubId,
          awayClubId: fixture.awayClubId,
        });
        fixturesCreated++;
      } catch { /* may already exist */ }
    }

    return {
      freedAgentCount: freed.n,
      youthGeneratedIds,
      potentialUpdatedIds,
      competitionsCreated,
      fixturesCreated,
    };
  });
}
