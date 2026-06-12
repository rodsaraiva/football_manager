import { DbHandle } from '@/database/queries/players';
import { getPlayersWithAttributesByClub, retirePlayer } from '@/database/queries/players';
import { getClubById, getClubCountryCode } from '@/database/queries/clubs';
import { getStaffByClub } from '@/database/queries/staff';
import { getStaffEffects } from '@/engine/staff/staff-effects';
import { calculateOverall } from '@/utils/overall';
import { recalculatePotential } from '@/engine/training/potential';
import { generateYouthPlayers } from '@/engine/youth/youth-academy';
import { detectOrdinaryRetirements, RetirementDecision } from '@/engine/retirement/retirement-engine';
import { SeededRng } from '@/engine/rng';
import { saveOffset } from '@/database/constants';

// Country code → display nationality for youth players.
const COUNTRY_NAME: Record<string, string> = {
  EN: 'English', ES: 'Spanish', DE: 'German', BR: 'Brazilian', FR: 'French',
};

/**
 * Recompute effective potential for the club squad using each player's REAL overall.
 * Returns the ids whose potential actually changed.
 */
export async function recalcSquadPotential(
  db: DbHandle,
  saveId: number,
  clubId: number,
  endedSeason: number,
): Promise<number[]> {
  const updated: number[] = [];
  const squad = await getPlayersWithAttributesByClub(db, saveId, clubId);
  for (const player of squad) {
    const seasonStats = (await db
      .prepare('SELECT avg_rating, minutes_played FROM player_stats WHERE save_id = ? AND player_id = ? AND season = ?')
      .get(saveId, player.id, endedSeason)) as { avg_rating: number; minutes_played: number } | undefined;
    if (!seasonStats) continue;

    const minutesPercent = Math.min(100, (seasonStats.minutes_played / (38 * 90)) * 100);
    const currentOverall = calculateOverall(player.attributes, player.position);

    const result = recalculatePotential({
      basePotential: player.basePotential,
      effectivePotential: player.effectivePotential,
      currentOverall,
      seasonRatings: [{ avgRating: seasonStats.avg_rating, minutesPercent }],
    });

    if (result.newEffectivePotential !== player.effectivePotential) {
      await db.prepare('UPDATE players SET effective_potential = ? WHERE save_id = ? AND id = ?')
        .run(result.newEffectivePotential, saveId, player.id);
      updated.push(player.id);
    }
  }
  return updated;
}

/** Generate youth using real staff youth bonus + club country code. Returns the new ids. */
export async function generateClubYouth(
  db: DbHandle,
  saveId: number,
  clubId: number,
  newSeason: number,
  rng: SeededRng,
): Promise<number[]> {
  const generated: number[] = [];
  const club = await getClubById(db, saveId, clubId);
  const staff = await getStaffByClub(db, saveId, clubId);
  const youthCoachAbility = staff.find((s) => s.role === 'youth_coach')?.ability ?? 0;
  const youthCoachBonus = getStaffEffects({
    fitnessCoachAbility: 0, physioAbility: 0, scoutAbility: 0,
    youthCoachAbility, assistantAbility: 0,
  }).youthQualityBonus;
  const countryCode = (await getClubCountryCode(db, clubId)) ?? 'EN';
  const nationality = COUNTRY_NAME[countryCode] ?? countryCode;

  const youth = generateYouthPlayers({
    clubId,
    academyLevel: club?.youthAcademy ?? 3,
    youthCoachBonus,
    countryCode,
    rng,
  });

  const maxIdRow = (await db.prepare('SELECT MAX(id) as maxId FROM players WHERE save_id = ?').get(saveId)) as { maxId: number | null };
  let nextId = (maxIdRow?.maxId ?? saveOffset(saveId)) + 1;

  for (const y of youth) {
    await db.prepare(
      'INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      nextId, saveId, y.name, nationality, y.age, y.position, null,
      clubId, 5000, newSeason + 3, 100000,
      y.basePotential, y.basePotential, 70, 100, 0, 0,
    );
    const a = y.attributes;
    await db.prepare(
      'INSERT INTO player_attributes (player_id, save_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      nextId, saveId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading,
      a.longShots, a.freeKicks, a.vision, a.composure, a.decisions,
      a.positioning, a.aggression, a.leadership, a.pace, a.stamina,
      a.strength, a.agility, a.jumping,
    );
    generated.push(nextId);
    nextId++;
  }
  return generated;
}

/** Age-based ordinary retirement across every club (incl. AI) for this save. */
export async function applyOrdinaryRetirements(
  db: DbHandle,
  saveId: number,
  rng: SeededRng,
): Promise<RetirementDecision[]> {
  const rows = (await db
    .prepare(
      'SELECT id, name, age, is_free_agent, will_retire_at_season_end FROM players WHERE save_id = ? AND club_id IS NOT NULL',
    )
    .all(saveId)) as Array<{ id: number; name: string; age: number; is_free_agent: number; will_retire_at_season_end: number }>;
  const decisions = detectOrdinaryRetirements(
    rows.map((r) => ({
      id: r.id, name: r.name, age: r.age,
      isFreeAgent: r.is_free_agent === 1,
      willRetireAtSeasonEnd: r.will_retire_at_season_end === 1,
    })),
    rng,
  );
  for (const d of decisions) await retirePlayer(db, saveId, d.playerId);
  return decisions;
}
