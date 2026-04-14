import { DbHandle } from '@/database/queries/players';
import { createOffer } from '@/database/queries/transfers';
import { SeededRng } from '@/engine/rng';
import { calculateOverall } from '@/utils/overall';

/**
 * Chance per eligible interested club per week to submit an offer for a given
 * player (dampened by the player's overall — top stars attract more attention).
 */
const BASE_OFFER_CHANCE = 0.05;

interface PlayerCandidate {
  id: number;
  position: string;
  marketValue: number;
  wage: number;
  overall: number;
  age: number;
}

interface SuitorClub {
  id: number;
  reputation: number;
  budget: number;
}

/**
 * Generates AI-initiated offers for the player club's squad. Other clubs look
 * at the squad and submit bids for interesting players.
 *
 * Runs only during transfer windows.
 */
export async function generateAiOffersForPlayerClub(
  db: DbHandle,
  playerClubId: number,
  rng: SeededRng,
): Promise<number> {
  // Load player club's squad with attributes to compute overall
  const squadRows = (await db
    .prepare(
      `SELECT p.id, p.position, p.market_value, p.wage, p.age, p.is_free_agent, p.injury_weeks_left,
              a.finishing, a.passing, a.crossing, a.dribbling, a.heading, a.long_shots, a.free_kicks,
              a.vision, a.composure, a.decisions, a.positioning, a.aggression, a.leadership,
              a.pace, a.stamina, a.strength, a.agility, a.jumping
       FROM players p JOIN player_attributes a ON a.player_id = p.id
       WHERE p.club_id = ? AND p.is_free_agent = 0`,
    )
    .all(playerClubId)) as Array<{
    id: number;
    position: string;
    market_value: number;
    wage: number;
    age: number;
    is_free_agent: number;
    injury_weeks_left: number;
    finishing: number;
    passing: number;
    crossing: number;
    dribbling: number;
    heading: number;
    long_shots: number;
    free_kicks: number;
    vision: number;
    composure: number;
    decisions: number;
    positioning: number;
    aggression: number;
    leadership: number;
    pace: number;
    stamina: number;
    strength: number;
    agility: number;
    jumping: number;
  }>;

  const squad: PlayerCandidate[] = squadRows.map((row) => {
    const attrs = {
      finishing: row.finishing,
      passing: row.passing,
      crossing: row.crossing,
      dribbling: row.dribbling,
      heading: row.heading,
      longShots: row.long_shots,
      freeKicks: row.free_kicks,
      vision: row.vision,
      composure: row.composure,
      decisions: row.decisions,
      positioning: row.positioning,
      aggression: row.aggression,
      leadership: row.leadership,
      pace: row.pace,
      stamina: row.stamina,
      strength: row.strength,
      agility: row.agility,
      jumping: row.jumping,
    };
    return {
      id: row.id,
      position: row.position,
      marketValue: row.market_value,
      wage: row.wage,
      age: row.age,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      overall: calculateOverall(attrs as any, row.position as any),
    };
  });

  if (squad.length === 0) return 0;

  // Candidate suitors: other clubs with some budget
  const suitors = (await db
    .prepare(
      `SELECT id, reputation, budget FROM clubs
       WHERE id != ? AND budget > 1000000
       ORDER BY RANDOM() LIMIT 10`,
    )
    .all(playerClubId)) as SuitorClub[];

  if (suitors.length === 0) return 0;

  let created = 0;

  for (const player of squad) {
    // Attention weighted by overall (60 ovr ≈ baseline, 85+ attracts a lot more)
    const attentionMultiplier = Math.max(0.2, (player.overall - 50) / 30);
    // Only 3 suitors at most look at this player per week
    const lookers = suitors.slice(0, 3);

    for (const suitor of lookers) {
      // Suitor must be at least roughly in the league (reputation gap within 15 is OK)
      // and their budget must cover the market value
      if (suitor.budget < player.marketValue * 0.8) continue;

      const chance = BASE_OFFER_CHANCE * attentionMultiplier;
      if (rng.next() > chance) continue;

      // Avoid duplicate pending offers for same player from same club
      const existing = (await db
        .prepare(
          `SELECT id FROM transfer_offers
           WHERE player_id = ? AND offering_club_id = ? AND status IN ('pending','countered')
           LIMIT 1`,
        )
        .get(player.id, suitor.id)) as { id: number } | undefined;
      if (existing) continue;

      // Fee: 85-120% of market value depending on suitor reputation & budget
      const aggression = Math.min(1.2, 0.85 + (suitor.reputation / 100) * 0.3 + rng.nextFloat(-0.05, 0.1));
      const feeOffered = Math.round(player.marketValue * aggression);
      // Wage: 100-130% of current wage
      const wageMultiplier = 1.0 + rng.nextFloat(0, 0.3);
      const wageOffered = Math.round(player.wage * wageMultiplier);

      await createOffer(db, {
        playerId: player.id,
        offeringClubId: suitor.id,
        sellingClubId: playerClubId,
        feeOffered,
        wageOffered,
      });
      created++;
    }
  }

  return created;
}
