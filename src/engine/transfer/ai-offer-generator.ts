import { DbHandle } from '@/database/queries/players';
import { createOffer } from '@/database/queries/transfers';
import { SeededRng } from '@/engine/rng';
import { calculateOverall } from '@/utils/overall';
import { isClubBlocked } from './negotiation';

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
  isTransferListed: boolean;
  isLoanListed: boolean;
  askingPrice: number | null;
  loanWageShare: number | null;
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
  season: number = 0,
  week: number = 0,
): Promise<number> {
  // Load player club's squad with attributes to compute overall
  const squadRows = (await db
    .prepare(
      `SELECT p.id, p.position, p.market_value, p.wage, p.age, p.is_free_agent, p.injury_weeks_left,
              p.is_transfer_listed, p.is_loan_listed, p.asking_price, p.loan_wage_share,
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
    is_transfer_listed: number;
    is_loan_listed: number;
    asking_price: number | null;
    loan_wage_share: number | null;
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
      isTransferListed: row.is_transfer_listed === 1,
      isLoanListed: row.is_loan_listed === 1,
      askingPrice: row.asking_price ?? null,
      loanWageShare: row.loan_wage_share ?? null,
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

    // Listing boost: listed players attract significantly more offers
    const listingBoost =
      player.isTransferListed ? 2.5 :
      player.isLoanListed ? 2.0 :
      1.0;

    for (const suitor of lookers) {
      // ── Transfer offer path ──────────────────────────────────────────────

      // When an asking price is set, only clubs that can realistically meet it
      // should bother bidding (avoids futile low-ball offers).
      const hasAskingPrice = player.isTransferListed && player.askingPrice != null;
      const transferBudgetGate = hasAskingPrice
        ? suitor.budget >= player.askingPrice! * 0.8
        : suitor.budget >= player.marketValue * 0.8;

      if (player.isTransferListed || !player.isLoanListed) {
        // Include clubs that can afford the transfer
        if (transferBudgetGate) {
          const baseProbability = BASE_OFFER_CHANCE * attentionMultiplier;
          const effectiveProbability = Math.min(1, baseProbability * listingBoost);
          if (rng.next() <= effectiveProbability) {
            // Avoid duplicate pending offers for same player from same club
            const existing = (await db
              .prepare(
                `SELECT id FROM transfer_offers
                 WHERE player_id = ? AND offering_club_id = ? AND status IN ('pending','countered')
                   AND (offer_type IS NULL OR offer_type = 'transfer')
                 LIMIT 1`,
              )
              .get(player.id, suitor.id)) as { id: number } | undefined;

            if (!existing && !(await isClubBlocked(db, player.id, suitor.id, season, week))) {
              let feeOffered: number;
              if (hasAskingPrice) {
                // Bid within [0.7 * askingPrice, 1.0 * askingPrice]
                feeOffered = Math.round(
                  player.askingPrice! * (0.7 + rng.nextFloat(0, 0.3)),
                );
              } else {
                // Fee: 85-120% of market value depending on suitor reputation & budget
                const aggression = Math.min(
                  1.2,
                  0.85 + (suitor.reputation / 100) * 0.3 + rng.nextFloat(-0.05, 0.1),
                );
                feeOffered = Math.round(player.marketValue * aggression);
              }
              // Wage: 100-130% of current wage
              const wageMultiplier = 1.0 + rng.nextFloat(0, 0.3);
              const wageOffered = Math.round(player.wage * wageMultiplier);

              await createOffer(db, {
                playerId: player.id,
                offeringClubId: suitor.id,
                sellingClubId: playerClubId,
                feeOffered,
                wageOffered,
                createdSeason: season,
                createdWeek: week,
              });
              created++;
            }
          }
        }
      }

      // ── Loan offer path ──────────────────────────────────────────────────
      // Only generate loan offers when the player is loan-listed. The AI
      // considers a loan move it would otherwise skip, provided the suitor has
      // a positional need (check via a simple squad count) and the player fits.
      if (player.isLoanListed) {
        const loanProbability = Math.min(1, BASE_OFFER_CHANCE * attentionMultiplier * listingBoost);
        if (rng.next() <= loanProbability) {
          // Check suitor has fewer than 2 players at this position (slot need)
          const posCount = (await db
            .prepare(
              `SELECT COUNT(*) as cnt FROM players WHERE club_id = ? AND position = ? AND is_free_agent = 0`,
            )
            .get(suitor.id, player.position)) as { cnt: number } | undefined;
          const hasSlotNeed = !posCount || posCount.cnt < 2;

          if (hasSlotNeed) {
            // Avoid duplicate pending loan offers for same player from same club
            const existingLoan = (await db
              .prepare(
                `SELECT id FROM transfer_offers
                 WHERE player_id = ? AND offering_club_id = ? AND status IN ('pending','countered')
                   AND offer_type = 'loan'
                 LIMIT 1`,
              )
              .get(player.id, suitor.id)) as { id: number } | undefined;

            if (!existingLoan && !(await isClubBlocked(db, player.id, suitor.id, season, week))) {
              // Loan fee is zero; wage contribution is determined by loanWageShare.
              // loanWageShare is the fraction the borrowing club pays (0..1).
              // Default to 50/50 if not set.
              const wageShare = player.loanWageShare ?? 0.5;
              const wageOffered = Math.round(player.wage * wageShare);

              await createOffer(db, {
                playerId: player.id,
                offeringClubId: suitor.id,
                sellingClubId: playerClubId,
                feeOffered: 0,
                wageOffered,
                offerType: 'loan',
                createdSeason: season,
                createdWeek: week,
              });
              created++;
            }
          }
        }
      }
    }
  }

  return created;
}
