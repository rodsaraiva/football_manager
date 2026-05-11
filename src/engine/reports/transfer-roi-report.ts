/**
 * Histórico de Transferências com ROI.
 *
 * Computes the return on investment for each signing and sale made by the club.
 */
import { Transfer, Position } from '@/types';
import { PlayerStats } from '@/types/player';
import { calculateOverall } from '@/utils/overall';
import { PlayerAttributes } from '@/types/player';

export interface TransferROIEntry {
  transfer: Transfer;
  playerId: number;
  playerName: string;
  position: Position;
  currentOverall: number;
  currentMarketValue: number;
  /** Fee paid on signing (0 for free transfers) */
  feePaid: number;
  /** currentMarketValue - feePaid (for signings still at the club) */
  valueDelta: number;
  /** Total goals + assists since arrival season */
  goalsAndAssists: number;
  season: number;
  /** Player is still at the club */
  stillAtClub: boolean;
  isLoan: boolean;
}

export interface TransferROIReport {
  signings: TransferROIEntry[];
  sales: TransferROIEntry[];
}

export interface PlayerForROI {
  id: number;
  name: string;
  position: Position;
  clubId: number | null; // null quando aposentado (sem clube)
  marketValue: number;
  attributes: PlayerAttributes;
}

export function buildTransferROIReport(
  transfers: Transfer[],
  playerClubId: number,
  playersById: Map<number, PlayerForROI>,
  statsByPlayerId: Map<number, PlayerStats[]>,
): TransferROIReport {
  const signings: TransferROIEntry[] = [];
  const sales: TransferROIEntry[] = [];

  for (const t of transfers) {
    const player = playersById.get(t.playerId);
    // We need at least player info from the transfer record — skip if no data
    if (!player && t.playerId == null) continue;

    const isLoan = t.type === 'loan';
    const stillAtClub = player != null && player.clubId === playerClubId;

    const currentOverall =
      player?.attributes != null ? calculateOverall(player.attributes, player.position) : 0;
    const currentMarketValue = player?.marketValue ?? 0;
    const position = player?.position ?? ('ST' as Position);
    const playerName = player?.name ?? `Jogador #${t.playerId}`;

    // Aggregate goals + assists from all seasons >= transfer.season
    const allStats = statsByPlayerId.get(t.playerId) ?? [];
    const goalsAndAssists = allStats
      .filter((s) => s.season >= t.season)
      .reduce((sum, s) => sum + s.goals + s.assists, 0);

    const entry: TransferROIEntry = {
      transfer: t,
      playerId: t.playerId,
      playerName,
      position,
      currentOverall,
      currentMarketValue,
      feePaid: t.fee,
      valueDelta: stillAtClub ? currentMarketValue - t.fee : 0,
      goalsAndAssists,
      season: t.season,
      stillAtClub,
      isLoan,
    };

    if (t.toClubId === playerClubId) {
      signings.push(entry);
    } else if (t.fromClubId === playerClubId) {
      sales.push(entry);
    }
  }

  // Sort signings by valueDelta descending (highest ROI first)
  signings.sort((a, b) => b.valueDelta - a.valueDelta);
  // Sort sales by fee descending
  sales.sort((a, b) => b.feePaid - a.feePaid);

  return { signings, sales };
}
