import type { DbHandle } from '@/database/queries/players';
import { getExpiredActionableThreads, setThreadStatus } from '@/database/queries/inbox';
import { rejectIncomingOffer } from '@/engine/transfer/offer-processor';
import { setJobOfferStatus } from '@/database/queries/job-offers';

// Varre as threads acionáveis cujo prazo venceu e aplica a ação default (recusar oferta /
// expirar emprego), depois marca a thread como expired. Idempotente: getExpiredActionableThreads
// só devolve status='open', então uma segunda passada não conta nada.
export async function expireInboxDeadlines(
  db: DbHandle, saveId: number, season: number, week: number,
): Promise<number> {
  const expired = await getExpiredActionableThreads(db, saveId, season, week);
  let count = 0;
  for (const thread of expired) {
    if (thread.actionKind === 'offer_response' && thread.refId !== null) {
      await rejectIncomingOffer(db, saveId, thread.refId, week);
    } else if (thread.actionKind === 'job_offer_response' && thread.refId !== null) {
      await setJobOfferStatus(db, saveId, season, thread.refId, 'expired');
    }
    await setThreadStatus(db, saveId, thread.id, 'expired');
    count += 1;
  }
  return count;
}
