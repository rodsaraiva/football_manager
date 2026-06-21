import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { regenerateAiSquadSeason } from '@/engine/rollover/squad-regeneration';
import { calculateOverall } from '@/utils/overall';
import { recalcSquadPotential, generateClubYouth, applyOrdinaryRetirements } from '@/engine/season/end-of-season-ops';
import { returnExpiredLoans } from '@/engine/transfer/loan-returns';
import { settleYouthLoanDevelopment } from '@/engine/youth/youth-loans';
import { evaluateTierTransitions } from '@/engine/youth/youth-progression';
import { applyAcademyReputation } from '@/engine/youth/academy-reputation';
import { promotePlayerTier } from '@/database/queries/youth';
import { SquadTier } from '@/types';
import { expireContracts, recalculateMarketValues } from '@/engine/finance/rollover-economy';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';
import { runInTransaction } from '@/database/transaction';

export interface RolloverSeasonParams {
  dbHandle: DbHandle;
  playerClubId: number;
  saveId: number; // -1 when no save (parity with game-loop)
  endedSeason: number;
  newSeason: number;
  youthAcademyLevel: number;
  rng: SeededRng;
}

export interface RolloverSeasonResult {
  freedAgentCount: number;
  youthGeneratedIds: number[];
  potentialUpdatedIds: number[];
  competitionsCreated: number;
  fixturesCreated: number;
}

/**
 * Season-rollover orchestration extracted 1:1 from EndOfSeasonScreen.handleContinue:
 * age players, expire contracts, return loans, recalc potential, generate youth,
 * regenerate the new-season calendar. Wrapped in the canonical runInTransaction so a
 * partial failure rolls the whole batch back. Pure of React — takes a DbHandle.
 */
export async function rolloverSeason(p: RolloverSeasonParams): Promise<RolloverSeasonResult> {
  const { dbHandle: db, saveId, playerClubId, endedSeason, newSeason, youthAcademyLevel } = p;
  const youthGeneratedIds: number[] = [];
  const potentialUpdatedIds: number[] = [];

  return runInTransaction(db, async () => {
    // 1. Age all non-retired players (EndOfSeasonScreen.tsx:337-339).
    await db
      .prepare('UPDATE players SET age = age + 1 WHERE save_id = ? AND (club_id IS NOT NULL OR is_free_agent = 1)')
      .run(saveId);

    // 2. Return loaned players to their parent clubs FIRST, so a player on loan
    //    whose contract ended is restored to the parent before expiry releases him.
    await returnExpiredLoans(db, saveId, endedSeason);

    // 2c. C2: liquida o desenvolvimento dos empréstimos de base ANTES de incrementar
    //     idade/expirar contrato, espelhando a ordem do loan genérico.
    await settleYouthLoanDevelopment(db, saveId, endedSeason, p.rng);

    // 2b. Contract expiry — release players whose contract ended with the full
    //     free-agent state (club_id NULL, wage 0) so they stop being paid.
    await expireContracts(db, saveId, endedSeason);
    const freed = (await db
      .prepare('SELECT COUNT(*) as n FROM players WHERE save_id = ? AND is_free_agent = 1')
      .get(saveId)) as { n: number };

    // 3. Dynamic potential recalculation for the player's squad — now uses each
    //    player's REAL overall (was a hardcoded 70).
    potentialUpdatedIds.push(...await recalcSquadPotential(db, saveId, playerClubId, endedSeason));

    // 4. Youth academy generation — real staff youth bonus + club country nationality.
    youthGeneratedIds.push(...await generateClubYouth(db, saveId, playerClubId, newSeason, p.rng));

    // 4a. C2: transições automáticas de tier (youth→reserve→first) para o clube humano.
    //     currentOverall usa effective_potential como proxy (overall real exige carregar
    //     atributos; o motor é testado com overall real isoladamente na Task 4).
    {
      const tierRows = (await db
        .prepare("SELECT id, age, effective_potential, squad_tier FROM players WHERE save_id = ? AND club_id = ? AND is_free_agent = 0")
        .all(saveId, playerClubId)) as Array<{ id: number; age: number; effective_potential: number; squad_tier: string }>;
      const candidates = [];
      for (const r of tierRows) {
        const st = (await db
          .prepare('SELECT minutes_played FROM player_stats WHERE save_id = ? AND player_id = ? AND season = ?')
          .get(saveId, r.id, endedSeason)) as { minutes_played: number } | undefined;
        candidates.push({
          playerId: r.id, age: r.age, currentOverall: r.effective_potential,
          effectivePotential: r.effective_potential, squadTier: r.squad_tier as SquadTier,
          seasonMinutesPercent: Math.min(100, ((st?.minutes_played ?? 0) / (38 * 90)) * 100),
        });
      }
      const firstCount = candidates.filter((c) => c.squadTier === 'first').length;
      const benchmark = candidates.length
        ? Math.round(candidates.reduce((s, c) => s + c.currentOverall, 0) / candidates.length)
        : 70;
      const transitions = evaluateTierTransitions(candidates, { firstTeamSize: firstCount, starterAvgOverall: benchmark }, p.rng);
      for (const t of transitions) await promotePlayerTier(db, saveId, t.playerId, t.to);
    }

    // 4b. AI squad regeneration (ai-world-alive): every non-player club re-evaluates
    // potential with the REAL overall (not the hardcoded 70) + market value, and takes
    // a youth intake, so AI league quality does not collapse over seasons.
    const aiClubs = (await db
      .prepare('SELECT id, youth_academy FROM clubs WHERE save_id = ? AND id != ?')
      .all(saveId, playerClubId)) as Array<{ id: number; youth_academy: number }>;

    for (const club of aiClubs) {
      const squad = await getPlayersWithAttributesByClub(db, saveId, club.id);
      const inputs = squad.map((pl) => ({
        playerId: pl.id,
        age: pl.age,
        currentOverall: Math.round(calculateOverall(pl.attributes, pl.position)),
        basePotential: pl.basePotential,
        effectivePotential: pl.effectivePotential,
        contractYearsLeft: Math.max(0, pl.contractEnd - endedSeason),
        seasonAvgRating: null as number | null,
        minutesPercent: 0,
      }));
      // Pull real season stats per player (potential only moves with qualifying minutes).
      for (const inp of inputs) {
        const st = (await db
          .prepare('SELECT avg_rating, minutes_played FROM player_stats WHERE save_id = ? AND player_id = ? AND season = ?')
          .get(saveId, inp.playerId, endedSeason)) as { avg_rating: number; minutes_played: number } | undefined;
        if (st) {
          inp.seasonAvgRating = st.avg_rating;
          inp.minutesPercent = Math.min(100, (st.minutes_played / (38 * 90)) * 100);
        }
      }
      for (const d of regenerateAiSquadSeason({ players: inputs, rng: p.rng })) {
        await db
          .prepare('UPDATE players SET effective_potential = ?, market_value = ? WHERE save_id = ? AND id = ?')
          .run(d.newEffectivePotential, d.newMarketValue, saveId, d.playerId);
      }

      // Youth intake for the AI club (same staff/country-aware generator as the human).
      await generateClubYouth(db, saveId, club.id, newSeason, p.rng);
    }

    // 4c. Ordinary age-based retirement across every club (progression-wired).
    await applyOrdinaryRetirements(db, saveId, p.rng);

    // 4e. C2: reputação de academia da temporada encerrada (todos os clubes).
    await applyAcademyReputation(db, saveId, endedSeason);

    // 4d. Recompute market values for every attached/free player with fresh
    //     overall/age/potential/contract — values stop being frozen at seed.
    await recalculateMarketValues(db, saveId, newSeason);

    // 5. Regenerate the calendar for the new season. ensureSeasonFixtures is already
    // save-scoped + offset, so we delegate instead of duplicating the offset math here.
    await ensureSeasonFixtures(db, saveId, newSeason);

    // 5b. Open the pre-season window for the new season (player plays friendlies
    // before round 1). Cleared by the user via PreSeasonScreen.
    if (saveId >= 0) {
      await db.prepare('UPDATE save_games SET preseason_pending = 1 WHERE id = ?').run(saveId);
    }
    const competitionsCreated = ((await db
      .prepare('SELECT COUNT(*) as n FROM competitions WHERE save_id = ? AND season = ?')
      .get(saveId, newSeason)) as { n: number }).n;
    const fixturesCreated = ((await db
      .prepare('SELECT COUNT(*) as n FROM fixtures WHERE save_id = ? AND season = ?')
      .get(saveId, newSeason)) as { n: number }).n;

    return {
      freedAgentCount: freed.n,
      youthGeneratedIds,
      potentialUpdatedIds,
      competitionsCreated,
      fixturesCreated,
    };
  });
}
