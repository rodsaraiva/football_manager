import type { DbHandle } from '@/database/queries/players';
import type { TKey } from '@/i18n/translate';
import type { InboxActionChoice } from './inbox-types';
import { getThreadView, appendMessage, setThreadStatus } from '@/database/queries/inbox';
import {
  acceptIncomingOffer, rejectIncomingOffer, counterIncomingOffer,
} from '@/engine/transfer/offer-processor';
import { setJobOfferStatus } from '@/database/queries/job-offers';

export interface ResolveActionParams {
  threadId: number;
  choice: InboxActionChoice;
  season: number;
  week: number;
  playerClubId: number | null;
  counterFee?: number;
}
export interface ResolveActionResult {
  ok: boolean;
  reason?: string;
  newStatus: 'open' | 'resolved' | 'expired';
}

function isExpired(deadlineSeason: number | null, deadlineWeek: number | null, season: number, week: number): boolean {
  if (deadlineSeason === null || deadlineWeek === null) return false;
  return deadlineSeason < season || (deadlineSeason === season && deadlineWeek < week);
}

export async function resolveInboxAction(
  db: DbHandle, saveId: number, params: ResolveActionParams,
): Promise<ResolveActionResult> {
  const view = await getThreadView(db, saveId, params.threadId);
  if (!view) return { ok: false, reason: 'inbox.err_not_found', newStatus: 'expired' };
  if (view.status !== 'open') return { ok: false, reason: 'inbox.err_resolved', newStatus: view.status };

  if (isExpired(view.deadlineSeason, view.deadlineWeek, params.season, params.week)) {
    await setThreadStatus(db, saveId, params.threadId, 'expired');
    return { ok: false, reason: 'inbox.err_expired', newStatus: 'expired' };
  }

  const { season, week } = params;

  if (view.actionKind === 'offer_response') {
    if (params.playerClubId === null) return { ok: false, reason: 'inbox.err_no_club', newStatus: 'open' };
    if (view.refId === null) return { ok: false, reason: 'inbox.err_not_found', newStatus: 'open' };
    if (params.choice === 'accept') {
      const res = await acceptIncomingOffer(db, saveId, view.refId, season, week);
      if (!res.success) return { ok: false, reason: 'inbox.err_offer_gone', newStatus: 'open' };
      await closeWithReply(db, saveId, params.threadId, season, week, 'inbox.offer_accepted_title', 'inbox.offer_accepted_body', '✅');
      return { ok: true, newStatus: 'resolved' };
    }
    if (params.choice === 'reject') {
      await rejectIncomingOffer(db, saveId, view.refId, week);
      await closeWithReply(db, saveId, params.threadId, season, week, 'inbox.offer_rejected_title', 'inbox.offer_rejected_body', '🚫');
      return { ok: true, newStatus: 'resolved' };
    }
    if (params.choice === 'counter') {
      if (!params.counterFee || params.counterFee <= 0) return { ok: false, reason: 'inbox.err_counter_fee', newStatus: 'open' };
      await counterIncomingOffer(db, saveId, view.refId, params.counterFee);
      await closeWithReply(db, saveId, params.threadId, season, week, 'inbox.offer_countered_title', 'inbox.offer_countered_body', '↔️');
      return { ok: true, newStatus: 'resolved' };
    }
    return { ok: false, reason: 'inbox.err_bad_choice', newStatus: 'open' };
  }

  if (view.actionKind === 'job_offer_response') {
    if (view.refId === null) return { ok: false, reason: 'inbox.err_not_found', newStatus: 'open' };
    const status = params.choice === 'accept' ? 'accepted' : 'expired';
    await setJobOfferStatus(db, saveId, season, view.refId, status);
    await closeWithReply(db, saveId, params.threadId, season, week,
      params.choice === 'accept' ? 'inbox.job_accepted_title' : 'inbox.job_rejected_title',
      params.choice === 'accept' ? 'inbox.job_accepted_body' : 'inbox.job_rejected_body', '🤝');
    return { ok: true, newStatus: 'resolved' };
  }

  // acknowledge / contract_renew: só fecha (open p/ navegação tratada na UI)
  await closeWithReply(db, saveId, params.threadId, season, week, 'inbox.ack_title', 'inbox.ack_body', '👍');
  return { ok: true, newStatus: 'resolved' };
}

async function closeWithReply(
  db: DbHandle, saveId: number, threadId: number, season: number, week: number,
  titleKey: TKey, bodyKey: TKey, icon: string,
): Promise<void> {
  await appendMessage(db, saveId, threadId, {
    season, week, titleKey, bodyKey, icon, fromSelf: true,
  });
  await setThreadStatus(db, saveId, threadId, 'resolved');
}
