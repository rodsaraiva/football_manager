import { processPendingOffers } from '@/engine/transfer/offer-processor';
import { expireInboxDeadlines } from '@/engine/inbox/deadline-sweeper';
import { processYouthLoanWeek } from '@/engine/youth/youth-loans';
import { generateAiOffersForSquad, generateAiToAiOffers } from '@/engine/transfer/ai-offer-generator';
import { expireStaleOffers, prunExpiredBlocks } from '@/engine/transfer/negotiation';
import { maybeGenerateNextKnockoutRound } from '@/engine/competition/round-progression';
import { WeekContext } from './week-context';

function isTransferWindow(week: number): boolean {
  return (week >= 1 && week <= 6) || (week >= 23 && week <= 26);
}

// AI→AI transfers now flow through the real market (generateAiToAiOffers +
// processPendingOffers), replacing the old reputation/overall-70 coin-flip path.

// Fase: progressão de eliminatórias + mercado de transferências. Consome o rng
// principal (knockout draw + geração de ofertas de IA) — roda DEPOIS das
// consequências da partida humana p/ preservar a ordem do stream.
export async function transferMarket(ctx: WeekContext): Promise<void> {
  const { db, saveId, season, week, playerClubId, rng } = ctx;

  // 3a. Advance any knockout competition whose current round just finished.
  await maybeGenerateNextKnockoutRound(db, saveId, season, week, rng);

  // 3b. Transfers via the real market: AI→AI offers + AI→human offers (in-window),
  //     then process every pending offer (acceptance doesn't distinguish human/AI).
  if (isTransferWindow(week)) {
    await generateAiToAiOffers(db, saveId, rng, season, week, playerClubId);
    await generateAiOffersForSquad(db, saveId, playerClubId, rng, season, week);
  }

  // 3c-pre. Expira itens acionáveis da Inbox cujo prazo venceu (default action) antes de
  //         processar novas ofertas, p/ o badge refletir só pendências reais da semana.
  await expireInboxDeadlines(db, saveId, season, week);

  // 3c. Process pending offers submitted by the player (always, not gated by window)
  await processPendingOffers(db, saveId, season, week, playerClubId);

  // 3c2. C2: acumula minutos/rating dos empréstimos de desenvolvimento desta rodada.
  await processYouthLoanWeek(db, saveId, season, week);

  // 3d. Expire stale offers (no response within 2 weeks) and prune old blocks
  await expireStaleOffers(db, saveId, season, week);
  await prunExpiredBlocks(db, saveId, season, week);
}
