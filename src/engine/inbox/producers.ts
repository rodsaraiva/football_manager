import type { DbHandle } from '@/database/queries/players';
import { openThread } from '@/database/queries/inbox';
import { SEASON_END_WEEK } from '@/engine/balance';

export const OFFER_TTL_WEEKS = 3;
// Última semana do calendário de uma temporada; o rollover de prazo usa esse limite
// (vem de balance.SEASON_END_WEEK p/ não divergir do relógio real do jogo).
export const WEEKS_PER_SEASON = SEASON_END_WEEK;

export function addDeadlineWeeks(
  season: number, week: number, ttl: number,
): { deadlineSeason: number; deadlineWeek: number } {
  const total = week + ttl;
  if (total <= WEEKS_PER_SEASON) return { deadlineSeason: season, deadlineWeek: total };
  return { deadlineSeason: season + 1, deadlineWeek: total - WEEKS_PER_SEASON };
}

export async function emitOfferReceived(
  db: DbHandle, saveId: number,
  args: { offerId: number; playerName: string; offeringClubName: string; fee: number; season: number; week: number },
): Promise<number> {
  const { deadlineSeason, deadlineWeek } = addDeadlineWeeks(args.season, args.week, OFFER_TTL_WEEKS);
  return openThread(
    db, saveId,
    { category: 'transfer', refKind: 'transfer_offer', refId: args.offerId, actionKind: 'offer_response', deadlineSeason, deadlineWeek },
    {
      season: args.season, week: args.week,
      titleKey: 'inbox.offer_received_title',
      titleVars: { player: args.playerName },
      bodyKey: 'inbox.offer_received_body',
      bodyVars: { club: args.offeringClubName, fee: args.fee },
      icon: '💰',
    },
  );
}

export async function emitLoanReturn(
  db: DbHandle, saveId: number,
  args: { playerName: string; parentClubName: string; season: number; week: number },
): Promise<number> {
  return openThread(
    db, saveId,
    { category: 'loan', refKind: 'player', actionKind: 'none' },
    {
      season: args.season, week: args.week,
      titleKey: 'inbox.loan_return_title',
      titleVars: { player: args.playerName },
      bodyKey: 'inbox.loan_return_body',
      bodyVars: { club: args.parentClubName },
      icon: '↩️',
    },
  );
}
