import { applyWeeklyPsychology } from '@/engine/morale/psychology-orchestrator';
import { pruneMoraleEvents } from '@/database/queries/morale';
import { MORALE_EVENTS_KEEP_SEASONS } from '@/engine/balance';
import { SeededRng } from '@/engine/rng';
import { archiveSeason } from '@/engine/history/season-archiver';
import { distributePrizeMoney } from '@/engine/finance/rollover-economy';
import { archiveLegacy } from '@/engine/legacy/legacy-archiver';
import { retirePlayer } from '@/database/queries/players';
import {
  detectCompulsoryRetirements,
  shouldAnnounceRetirement,
  isInAnnounceWindow,
} from '@/engine/retirement/retirement-engine';
import {
  RETIREMENT_MIN_AGE,
  RETIREMENT_MAX_AGE,
  RETIREMENT_MORALE_THRESHOLD,
} from '@/engine/balance';
import { WeekContext } from './week-context';

export interface RetirementDelta {
  newlyAnnouncedRetirementIds: number[];
  retiringPlayerIds: number[];
}

// Fase: drift de moral idle (semana sem jogo do humano) + streak de baixa moral +
// anúncio antecipado de aposentadoria + rollover de fim de temporada (aposentadorias
// efetivas, arquivamento, prêmios, legado). isSeasonEnd vem do sequenciador.
export async function retirementPhase(ctx: WeekContext, isSeasonEnd: boolean): Promise<RetirementDelta> {
  const { db, saveId, season, week, playerClubId, playerFixture } = ctx;

  // 7a. Idle-week psychology when the player's club did not play this week — drift toward
  // the neutral target + chemistry drift + fallout escalation, all save-isolated &
  // deterministic (seed derived from save/season/week). Runs before the streak SQL below.
  if (!playerFixture) {
    await applyWeeklyPsychology(
      db, saveId, playerClubId, season, week,
      new SeededRng(saveId * 1_000_000 + season * 1000 + week),
    );
  }

  // 7b. Update low-morale streak para jogadores na janela etária, ainda não anunciados.
  // Incrementa se moral < threshold, zera caso contrário. Batch em SQL por perf.
  await db.prepare(
    `UPDATE players
       SET consecutive_low_morale_weeks = CASE
         WHEN morale < ? THEN consecutive_low_morale_weeks + 1
         ELSE 0
       END
     WHERE save_id = ? AND age >= ? AND age <= ? AND will_retire_at_season_end = 0 AND club_id IS NOT NULL AND is_free_agent = 0`,
  ).run(RETIREMENT_MORALE_THRESHOLD, saveId, RETIREMENT_MIN_AGE, RETIREMENT_MAX_AGE);

  // 7c. Trigger antecipado: anunciar aposentadoria se streak+janela batem.
  // Roda só no clube do player (v0.1: low_morale é escopo do jogador humano).
  const newlyAnnouncedRetirementIds: number[] = [];
  const retiringPlayerIds: number[] = [];
  if (isInAnnounceWindow(week)) {
    const candidates = await db.prepare(
      `SELECT id, name, age, consecutive_low_morale_weeks as streak
         FROM players
        WHERE club_id = ? AND is_free_agent = 0
          AND will_retire_at_season_end = 0
          AND age >= ? AND age <= ?`,
    ).all(playerClubId, RETIREMENT_MIN_AGE, RETIREMENT_MAX_AGE) as Array<{
      id: number;
      name: string;
      age: number;
      streak: number;
    }>;
    for (const c of candidates) {
      if (shouldAnnounceRetirement({
        age: c.age,
        streak: c.streak,
        currentWeek: week,
        alreadyAnnounced: false,
      })) {
        await db.prepare(
          'UPDATE players SET will_retire_at_season_end = 1 WHERE id = ?',
        ).run(c.id);
        newlyAnnouncedRetirementIds.push(c.id);
      }
    }
  }

  // 8. Season-end rollover.
  if (isSeasonEnd) {
    // Aposentadoria anunciada fira independente de clube — flag persiste após transferência.
    const announced = await db.prepare(
      'SELECT id FROM players WHERE save_id = ? AND club_id IS NOT NULL AND will_retire_at_season_end = 1',
    ).all(saveId) as Array<{ id: number }>;
    for (const row of announced) {
      await retirePlayer(db, saveId, row.id);
      retiringPlayerIds.push(row.id);
    }

    // Compulsório (max_age) em todos os clubes, incluindo IA.
    const allPlayers = await db.prepare(
      'SELECT id, name, age, is_free_agent FROM players WHERE save_id = ? AND club_id IS NOT NULL',
    ).all(saveId) as Array<{ id: number; name: string; age: number; is_free_agent: number }>;
    const compulsory = detectCompulsoryRetirements(
      allPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        age: p.age,
        isFreeAgent: p.is_free_agent === 1,
      })),
    );
    for (const d of compulsory) {
      await retirePlayer(db, saveId, d.playerId);
      if (!retiringPlayerIds.includes(d.playerId)) retiringPlayerIds.push(d.playerId);
    }

    // Reset flag+streak pros remanescentes começarem a próxima temporada limpos.
    // Restrito a quem está em clube — aposentados (club_id=NULL) ficam fora da rotina ativa.
    await db.prepare(
      'UPDATE players SET will_retire_at_season_end = 0, consecutive_low_morale_weeks = 0, suspension_weeks_left = 0, injury_weeks_left = 0 WHERE save_id = ? AND club_id IS NOT NULL',
    ).run(saveId);

    const prizeAwards = await archiveSeason(db, saveId, season);
    await distributePrizeMoney(db, saveId, prizeAwards, season, week);
    // C1: materialize hall-of-fame/records for the player's club and reinforce
    // rivalries from this season's head-to-heads.
    await archiveLegacy(db, saveId, season, playerClubId);
    // C5: prune the morale-driver ledger to a rolling window at the rollover.
    await pruneMoraleEvents(db, saveId, MORALE_EVENTS_KEEP_SEASONS, season);
  }

  return { newlyAnnouncedRetirementIds, retiringPlayerIds };
}
