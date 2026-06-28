import { DbHandle } from '@/database/queries/players';
import { getMediaSentiment, setMediaSentiment } from '@/database/queries/save';
import { mediaTierForReputation, nextMediaSentiment } from './media-sentiment';
import type { PressTone, PressOutcome } from './press-engine';

/**
 * Orquestra puro→DB: lê o sentimento atual do save, computa o próximo a partir
 * da coletiva (tom + resultado, amplificado pelo tier do clube) e persiste.
 * Coletiva pulada não deve chamar esta função (sentimento inalterado).
 */
export async function applyPressSentiment(
  db: DbHandle, saveId: number, clubReputation: number, tone: PressTone, outcome: PressOutcome,
): Promise<number> {
  const current = await getMediaSentiment(db, saveId);
  const tier = mediaTierForReputation(clubReputation);
  const next = nextMediaSentiment({ current, outcome, tone, tier });
  await setMediaSentiment(db, saveId, next);
  return next;
}
