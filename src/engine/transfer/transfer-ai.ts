import { SeededRng } from '@/engine/rng';

export interface OfferEvalInput {
  playerMarketValue: number;
  feeOffered: number;
  playerIsStarter: boolean;
  clubHasReplacement: boolean;
  playerAge: number;
  contractYearsLeft: number;
}

export interface OfferEvalResult {
  decision: 'accept' | 'reject' | 'counter';
  counterFee?: number;
}

export interface AiTransferInput {
  clubId: number;
  clubBudget: number;
  clubReputation: number;
  squadPositions: string[];
  availablePlayers: {
    id: number;
    position: string;
    overall: number;
    marketValue: number;
    wage: number;
    clubReputation: number;
  }[];
  rng: SeededRng;
}

export interface AiTransferResult {
  targetPlayerId: number;
  offeredFee: number;
  offeredWage: number;
}

export function evaluateOffer(input: OfferEvalInput): OfferEvalResult {
  const { playerMarketValue, feeOffered, playerIsStarter, clubHasReplacement, playerAge, contractYearsLeft } = input;

  const isOldShortContract = playerAge >= 32 && contractYearsLeft <= 1;
  const ratio = feeOffered / playerMarketValue;

  // Accept: fee >= market value and (has replacement or old+short contract)
  if (ratio >= 1.0 && (clubHasReplacement || isOldShortContract)) {
    return { decision: 'accept' };
  }

  // Accept below market for old player with short contract
  if (isOldShortContract && ratio >= 0.6) {
    return { decision: 'accept' };
  }

  // Reject: fee < 70% AND starter AND no replacement
  if (ratio < 0.7 && playerIsStarter && !clubHasReplacement) {
    return { decision: 'reject' };
  }

  // Counter: offer is close but not enough
  if (ratio >= 0.7) {
    return { decision: 'counter', counterFee: Math.round(playerMarketValue * 1.1) };
  }

  // Default counter for other cases
  return { decision: 'counter', counterFee: Math.round(playerMarketValue * 1.1) };
}

export function generateAiTransfer(input: AiTransferInput): AiTransferResult | null {
  const { clubBudget, clubReputation, squadPositions, availablePlayers, rng } = input;

  // Count players per position
  const positionCounts: Record<string, number> = {};
  for (const pos of squadPositions) {
    positionCounts[pos] = (positionCounts[pos] ?? 0) + 1;
  }

  // Find positions with fewer than 2 players
  const neededPositions = new Set<string>();
  for (const [pos, count] of Object.entries(positionCounts)) {
    if (count < 2) neededPositions.add(pos);
  }

  // Also consider positions not represented at all in squad
  // (no need — they simply won't be in positionCounts)

  // Filter available players
  const candidates = availablePlayers.filter(player => {
    // Must fill a needed position
    if (!neededPositions.has(player.position)) return false;
    // Must be affordable
    if (player.marketValue > clubBudget) return false;
    // Source club reputation must not exceed this club's + 10
    if (player.clubReputation > clubReputation + 10) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Pick best overall/marketValue ratio (value for money)
  const scored = candidates.map(p => ({
    player: p,
    score: p.overall / (p.marketValue / 1_000_000),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Use rng to add slight randomness among top candidates
  const topCount = Math.min(3, scored.length);
  const chosen = scored[rng.nextInt(0, topCount - 1)].player;

  return {
    targetPlayerId: chosen.id,
    offeredFee: chosen.marketValue,
    offeredWage: chosen.wage,
  };
}
