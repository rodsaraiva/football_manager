import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { getPlayersByClub } from '@/database/queries/players';
import { recalculatePotential } from '@/engine/training/potential';
import { generateYouthPlayers } from '@/engine/youth/youth-academy';
import { returnExpiredLoans } from '@/engine/transfer/loan-returns';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';
import { saveOffset } from '@/database/constants';
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
  const { dbHandle: db, saveId, playerClubId, endedSeason, newSeason, youthAcademyLevel } = p;
  const youthGeneratedIds: number[] = [];
  const potentialUpdatedIds: number[] = [];

  return runInTransaction(db, async () => {
    // 1. Age all non-retired players (EndOfSeasonScreen.tsx:337-339).
    await db
      .prepare('UPDATE players SET age = age + 1 WHERE save_id = ? AND (club_id IS NOT NULL OR is_free_agent = 1)')
      .run(saveId);

    // 2. Contract expiry (EndOfSeasonScreen.tsx:362).
    await db
      .prepare('UPDATE players SET is_free_agent = 1 WHERE save_id = ? AND contract_end <= ? AND club_id IS NOT NULL')
      .run(saveId, endedSeason);
    const freed = (await db
      .prepare('SELECT COUNT(*) as n FROM players WHERE save_id = ? AND is_free_agent = 1')
      .get(saveId)) as { n: number };

    // 2b. Return loaned players (EndOfSeasonScreen.tsx:365).
    await returnExpiredLoans(db, saveId, endedSeason);

    // 3. Dynamic potential recalculation for the player's squad (EndOfSeasonScreen.tsx:368-393).
    const squad = await getPlayersByClub(db, saveId, playerClubId);
    for (const player of squad) {
      const seasonStats = (await db
        .prepare('SELECT avg_rating, minutes_played FROM player_stats WHERE save_id = ? AND player_id = ? AND season = ?')
        .get(saveId, player.id, endedSeason)) as { avg_rating: number; minutes_played: number } | undefined;
      if (!seasonStats) continue;

      const minutesPercent = Math.min(100, (seasonStats.minutes_played / (38 * 90)) * 100);
      const result = recalculatePotential({
        basePotential: player.basePotential,
        effectivePotential: player.effectivePotential,
        currentOverall: 70, // simplified — parity with current screen
        seasonRatings: [{ avgRating: seasonStats.avg_rating, minutesPercent }],
      });
      if (result.newEffectivePotential !== player.effectivePotential) {
        await db.prepare('UPDATE players SET effective_potential = ? WHERE save_id = ? AND id = ?').run(result.newEffectivePotential, saveId, player.id);
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
    const maxIdRow = (await db.prepare('SELECT MAX(id) as maxId FROM players WHERE save_id = ?').get(saveId)) as { maxId: number | null };
    let nextId = (maxIdRow?.maxId ?? saveOffset(saveId)) + 1;
    for (const y of youth) {
      await db.prepare(
        'INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(nextId, saveId, y.name, 'Local', y.age, y.position, null, playerClubId, 5000, newSeason + 3, 100000, y.basePotential, y.basePotential, 70, 100, 0, 0);
      const a = y.attributes;
      await db.prepare(
        'INSERT INTO player_attributes (player_id, save_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(nextId, saveId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading, a.longShots, a.freeKicks, a.vision, a.composure, a.decisions, a.positioning, a.aggression, a.leadership, a.pace, a.stamina, a.strength, a.agility, a.jumping);
      youthGeneratedIds.push(nextId);
      nextId++;
    }

    // 5. Regenerate the calendar for the new season. ensureSeasonFixtures is already
    // save-scoped + offset, so we delegate instead of duplicating the offset math here.
    await ensureSeasonFixtures(db, saveId, newSeason);
    const competitionsCreated = ((await db
      .prepare('SELECT COUNT(*) as n FROM competitions WHERE save_id = ? AND season = ?')
      .get(saveId, newSeason)) as { n: number }).n;
    const fixturesCreated = ((await db
      .prepare('SELECT COUNT(*) as n FROM fixtures WHERE save_id = ? AND season = ?')
      .get(saveId, newSeason)) as { n: number }).n;

    return {
      freedAgentCount: freed.n,
      youthGeneratedIds,
      potentialUpdatedIds,
      competitionsCreated,
      fixturesCreated,
    };
  });
}
