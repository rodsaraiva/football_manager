import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { getYouthLoanById } from '@/database/queries/youth';

export interface YouthLoanWeekResult { trackedPlayerIds: number[]; }

/**
 * Acumula, por empréstimo de base ativo, os minutos/appearances/rating da
 * temporada a partir de player_stats (engine grava acumulado por temporada).
 * Como player_stats é cumulativo na temporada, sincronizamos os contadores do
 * loan ao snapshot atual da temporada.
 */
export async function processYouthLoanWeek(
  db: DbHandle, saveId: number, _season: number, _week: number,
): Promise<YouthLoanWeekResult> {
  const loans = (await db
    .prepare('SELECT * FROM youth_loans WHERE save_id = ? AND settled = 0 AND recalled = 0')
    .all(saveId)) as Array<{ id: number; player_id: number; start_season: number }>;
  const tracked: number[] = [];
  for (const loan of loans) {
    const st = (await db
      .prepare(
        `SELECT COALESCE(SUM(appearances),0) AS apps, COALESCE(SUM(minutes_played),0) AS mins,
                COALESCE(AVG(NULLIF(avg_rating,0)),0) AS rating
         FROM player_stats WHERE save_id = ? AND player_id = ? AND season >= ?`,
      )
      .get(saveId, loan.player_id, loan.start_season)) as { apps: number; mins: number; rating: number };
    if (st.apps <= 0 && st.mins <= 0) continue;
    await db
      .prepare(
        'UPDATE youth_loans SET minutes_played = ?, appearances = ?, rating_sum = ? WHERE save_id = ? AND id = ?',
      )
      .run(st.mins, st.apps, st.rating * st.apps, saveId, loan.id);
    tracked.push(loan.player_id);
  }
  return { trackedPlayerIds: tracked };
}

/**
 * Recall mid-season: restaura o jovem ao clube-pai, limpa o override de loan_wage
 * (espelha loan-returns.ts) e marca recalled=1. Guarda settled=0 && recalled=0.
 */
export async function recallYouthLoan(
  db: DbHandle, saveId: number, loanId: number, _season: number, _week: number,
): Promise<{ recalled: boolean; reason?: string }> {
  const loan = await getYouthLoanById(db, saveId, loanId);
  if (!loan) return { recalled: false, reason: 'not_found' };
  if (loan.settled === 1 || loan.recalled === 1) return { recalled: false, reason: 'already_closed' };
  // só age se o clube-pai ainda existe (guarda análoga a loan-returns.ts)
  const parent = (await db
    .prepare('SELECT id FROM clubs WHERE save_id = ? AND id = ?')
    .get(saveId, loan.parentClubId)) as { id: number } | undefined;
  if (!parent) return { recalled: false, reason: 'no_parent' };
  await db
    .prepare('UPDATE players SET club_id = ?, loan_wage = NULL WHERE save_id = ? AND id = ?')
    .run(loan.parentClubId, saveId, loan.playerId);
  await db
    .prepare('UPDATE youth_loans SET recalled = 1 WHERE save_id = ? AND id = ?')
    .run(saveId, loanId);
  return { recalled: true };
}

/**
 * No rollover: converte minutos/rating do empréstimo em ganho de potencial.
 * appearances=0 ⇒ ganho neutro/levemente negativo (estagnou). Idempotente via settled=1.
 */
export async function settleYouthLoanDevelopment(
  db: DbHandle, saveId: number, endedSeason: number, rng: SeededRng,
): Promise<number[]> {
  const loans = (await db
    .prepare(
      `SELECT * FROM youth_loans WHERE save_id = ? AND settled = 0 AND start_season <= ? AND loan_end <= ?`,
    )
    .all(saveId, endedSeason, endedSeason)) as Array<{
      id: number; player_id: number; minutes_played: number; appearances: number; rating_sum: number;
    }>;
  const settled: number[] = [];
  for (const loan of loans) {
    const avg = loan.appearances > 0 ? loan.rating_sum / loan.appearances : 0;
    // ganho: minutos jogados (proxy de exposição) × qualidade (rating acima de 6.0).
    const minutesFactor = Math.min(1, loan.minutes_played / 2700); // 30 jogos × 90'
    const qualityFactor = avg > 0 ? Math.max(-0.5, (avg - 6.0) / 2) : -0.25; // [-0.5,+1.x]
    const jitter = rng.nextInt(0, 1); // desempate determinístico de fronteira
    const gain = Math.round(minutesFactor * qualityFactor * 6 + jitter * (qualityFactor > 0 ? 1 : 0));

    const player = (await db
      .prepare('SELECT effective_potential, base_potential FROM players WHERE save_id = ? AND id = ?')
      .get(saveId, loan.player_id)) as { effective_potential: number; base_potential: number } | undefined;
    if (player) {
      const newPot = Math.max(1, Math.min(100, player.effective_potential + gain));
      await db
        .prepare('UPDATE players SET effective_potential = ? WHERE save_id = ? AND id = ?')
        .run(newPot, saveId, loan.player_id);
    }
    await db.prepare('UPDATE youth_loans SET settled = 1 WHERE save_id = ? AND id = ?').run(saveId, loan.id);
    settled.push(loan.player_id);
  }
  return settled;
}
