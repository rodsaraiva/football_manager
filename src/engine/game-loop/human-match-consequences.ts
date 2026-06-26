import { getPlayersByClub, setPlayerSuspension } from '@/database/queries/players';
import { applyMatchPsychology } from '@/engine/morale/psychology-orchestrator';
import { getAssistantByRole } from '@/database/queries/assistants';
import { getClubById, getClubTrainingFocus } from '@/database/queries/clubs';
import { getStaffByClub } from '@/database/queries/staff';
import { getRecentForm } from '@/database/queries/player-stats';
import { getStaffEffects, assistantAbilityFromStars } from '@/engine/staff/staff-effects';
import { setPressPending } from '@/database/queries/save';
import { assignMatchInjuries, injuryRecoveryStep } from '@/engine/simulation/injury';
import { computeCongestion } from '@/engine/simulation/congestion';
import { resolveMatchSuspensions } from '@/engine/simulation/match-consequences';
import { calculateWeeklyProgression } from '@/engine/training/progression';
import { PlayerAttributes } from '@/types';
import { loadSquadWithAttributes } from './simulate-and-persist';
import { WeekContext } from './week-context';

// attribute change key → (INTEGER column, fractional *_progress accumulator column)
const ATTR_MAP: Array<{ change: keyof PlayerAttributes; col: string; prog: string }> = [
  { change: 'finishing', col: 'finishing', prog: 'finishing_progress' },
  { change: 'passing', col: 'passing', prog: 'passing_progress' },
  { change: 'crossing', col: 'crossing', prog: 'crossing_progress' },
  { change: 'dribbling', col: 'dribbling', prog: 'dribbling_progress' },
  { change: 'heading', col: 'heading', prog: 'heading_progress' },
  { change: 'longShots', col: 'long_shots', prog: 'long_shots_progress' },
  { change: 'freeKicks', col: 'free_kicks', prog: 'free_kicks_progress' },
  { change: 'vision', col: 'vision', prog: 'vision_progress' },
  { change: 'composure', col: 'composure', prog: 'composure_progress' },
  { change: 'decisions', col: 'decisions', prog: 'decisions_progress' },
  { change: 'positioning', col: 'positioning', prog: 'positioning_progress' },
  { change: 'aggression', col: 'aggression', prog: 'aggression_progress' },
  { change: 'leadership', col: 'leadership', prog: 'leadership_progress' },
  { change: 'pace', col: 'pace', prog: 'pace_progress' },
  { change: 'stamina', col: 'stamina', prog: 'stamina_progress' },
  { change: 'strength', col: 'strength', prog: 'strength_progress' },
  { change: 'agility', col: 'agility', prog: 'agility_progress' },
  { change: 'jumping', col: 'jumping', prog: 'jumping_progress' },
];

// Fase: consequências do clube humano (progressão/fitness/lesão/suspensão/moral).
// No-op quando o clube humano não jogou nesta semana.
export async function humanMatchConsequences(ctx: WeekContext): Promise<void> {
  const { db, saveId, season, week, playerClubId, rng, clubData, playerFixture, playerMatchResult } = ctx;

  // 4. Human-club consequences (progression/fitness/injury/suspension). Same logic
  //    as before; XI ids come from the batch cache, full squad re-loaded for deltas.
  if (playerFixture && playerMatchResult) {
    const matchResult = playerMatchResult;
    const playerSquadRaw = await loadSquadWithAttributes(db, saveId, playerClubId);
    const homeXiIds = clubData.get(playerFixture.homeClubId)?.squad.map(p => p.id) ?? [];
    const awayXiIds = clubData.get(playerFixture.awayClubId)?.squad.map(p => p.id) ?? [];
    const startingIds = new Set<number>([...homeXiIds, ...awayXiIds]);

    // 5. Apply real weekly progression for the player's squad: staff bonus + club
    //    training focus + real recent form feed the pure engine; fractional weekly
    //    gains accumulate in *_progress instead of being rounded away each week.
    const playerClubData = await getClubById(db, saveId, playerClubId);
    const trainingFacilityLevel = playerClubData?.trainingFacilities ?? 3;

    const staff = await getStaffByClub(db, saveId, playerClubId);
    const abilityByRole = (role: string) => staff.find((s) => s.role === role)?.ability ?? 0;
    const staffEffects = getStaffEffects({
      fitnessCoachAbility: abilityByRole('fitness_coach'),
      physioAbility: abilityByRole('physio'),
      scoutAbility: abilityByRole('scout'),
      youthCoachAbility: abilityByRole('youth_coach'),
      assistantAbility: abilityByRole('assistant'),
    });
    const trainingFocus = await getClubTrainingFocus(db, playerClubId);

    // Squad assistant (assistants table) adds to the hired-staff training bonus.
    let assistantTrainingBonus = 0;
    if (saveId >= 0) {
      const squadAssistant = await getAssistantByRole(db, saveId, 'squad');
      if (squadAssistant) {
        const ability = assistantAbilityFromStars(squadAssistant.qualityStars);
        assistantTrainingBonus = getStaffEffects({
          fitnessCoachAbility: ability, physioAbility: 0, scoutAbility: 0,
          youthCoachAbility: 0, assistantAbility: ability,
        }).trainingBonus;
      }
    }
    const totalTrainingBonus = staffEffects.trainingBonus + assistantTrainingBonus;

    const playerClubPlayers = await getPlayersByClub(db, saveId, playerClubId);
    for (const p of playerSquadRaw) {
      const fullPlayer = playerClubPlayers.find(pl => pl.id === p.id);
      const form = await getRecentForm(db, saveId, p.id, season);
      const progression = calculateWeeklyProgression({
        age: fullPlayer?.age ?? 25,
        attributes: p.attributes,
        effectivePotential: fullPlayer?.effectivePotential ?? 60,
        minutesPlayedRecent: form.minutesPlayed,
        totalPossibleMinutes: form.totalPossibleMinutes,
        avgRatingRecent: form.avgRating,
        trainingFocus,
        trainingFacilityLevel,
        staffTrainingBonus: totalTrainingBonus,
      });

      // Read current fractional accumulators, carry whole points into the INTEGER
      // column, keep the residue.
      const progRow = (await db
        .prepare(`SELECT ${ATTR_MAP.map((m) => m.prog).join(', ')} FROM player_attributes WHERE player_id = ?`)
        .get(p.id)) as Record<string, number> | undefined;

      const changes = progression.attributeChanges;
      const attrs = p.attributes as Record<keyof PlayerAttributes, number>;
      const newInts: number[] = [];
      const newProgs: number[] = [];
      for (const m of ATTR_MAP) {
        const acc = (progRow?.[m.prog] ?? 0) + (changes[m.change] ?? 0);
        const whole = Math.trunc(acc);
        const residue = acc - whole;
        const nextInt = Math.min(99, Math.max(1, attrs[m.change] + whole));
        const clampedAtTop = attrs[m.change] + whole >= 99 && residue > 0;
        const clampedAtBottom = attrs[m.change] + whole <= 1 && residue < 0;
        newInts.push(nextInt);
        newProgs.push(clampedAtTop || clampedAtBottom ? 0 : residue);
      }

      const setClause =
        ATTR_MAP.map((m) => `${m.col} = ?`).join(', ') + ', ' +
        ATTR_MAP.map((m) => `${m.prog} = ?`).join(', ');
      await db
        .prepare(`UPDATE player_attributes SET ${setClause} WHERE player_id = ?`)
        .run(...newInts, ...newProgs, p.id);
    }

    // 6. Update fitness for player's club squad (played → drop, rested → recover).
    //    Fixture congestion (jogos recentes na janela [week-3, week-1] + esta
    //    partida) escala o drop e o risco de lesão. gamesInWindow<=1 → legado.
    const windowStart = Math.max(1, week - 3);
    const congestionRow = (await db.prepare(
      `SELECT COUNT(*) AS n FROM fixtures
       WHERE save_id = ? AND (home_club_id = ? OR away_club_id = ?)
         AND season = ? AND week BETWEEN ? AND ? AND home_goals IS NOT NULL`,
    ).get(saveId, playerClubId, playerClubId, season, windowStart, week - 1)) as { n: number };
    const gamesInWindow = congestionRow.n + 1; // +1 = a partida desta semana
    for (const p of playerSquadRaw) {
      const played = startingIds.has(p.id);
      let newFitness: number;
      if (played) {
        const baseDrop = rng.nextInt(5, 15);
        const { fitnessDrop } = computeCongestion({ gamesInWindow, baseFitnessDrop: baseDrop });
        newFitness = Math.max(30, p.fitness - fitnessDrop);
      } else {
        const gain = rng.nextInt(5, 15);
        newFitness = Math.min(100, p.fitness + gain);
      }
      await db.prepare('UPDATE players SET fitness = ? WHERE save_id = ? AND id = ?').run(newFitness, saveId, p.id);
    }

    // 7. Recover existing injuries first (physio-modulated), THEN apply this
    // match's new injuries — otherwise the freshly-set duration would be
    // decremented in the same week (gap-audit:163: injuries were cosmetic).
    // Physio (0..20) accelerates recovery; on full recovery, fitness is capped
    // at injury_return_fitness (worse injuries return less sharp).
    const physioAbility = abilityByRole('physio');
    const injured = (await db.prepare(
      'SELECT id, injury_weeks_left, injury_return_fitness, fitness FROM players WHERE save_id = ? AND club_id = ? AND injury_weeks_left > 0',
    ).all(saveId, playerClubId)) as Array<{ id: number; injury_weeks_left: number; injury_return_fitness: number | null; fitness: number }>;
    for (const row of injured) {
      const nextWeeks = injuryRecoveryStep(row.injury_weeks_left, physioAbility);
      if (nextWeeks === 0) {
        const cap = row.injury_return_fitness ?? row.fitness;
        const cappedFitness = Math.min(row.fitness, cap);
        await db.prepare(
          'UPDATE players SET injury_weeks_left = 0, injury_severity = NULL, injury_return_fitness = NULL, fitness = ? WHERE save_id = ? AND id = ?',
        ).run(cappedFitness, saveId, row.id);
      } else {
        await db.prepare('UPDATE players SET injury_weeks_left = ? WHERE save_id = ? AND id = ?').run(nextWeeks, saveId, row.id);
      }
    }

    const playerClubIds = new Set((await getPlayersByClub(db, saveId, playerClubId)).map(p => p.id));
    const { injuryRiskMult } = computeCongestion({ gamesInWindow, baseFitnessDrop: 0 });
    for (const inj of assignMatchInjuries(matchResult.events, playerClubIds, rng, injuryRiskMult)) {
      await db.prepare('UPDATE players SET injury_weeks_left = ?, injury_severity = ?, injury_return_fitness = ? WHERE save_id = ? AND id = ?')
        .run(inj.weeksLeft, inj.severity, inj.returnFitnessCap, saveId, inj.playerId);
    }

    // 8. Suspensions: tick down current bans first, THEN apply this match's cards
    // (same decrement-before-apply ordering as injuries, so a fresh ban survives).
    await db.prepare(
      'UPDATE players SET suspension_weeks_left = MAX(0, suspension_weeks_left - 1) WHERE save_id = ? AND suspension_weeks_left > 0 AND club_id = ?',
    ).run(saveId, playerClubId);

    // priorYellows = season-to-date yellows BEFORE this match. persistMatchStats
    // already wrote this match's yellows, so subtract them out of the threshold check.
    const priorYellowsBySeason = new Map<number, number>();
    for (const pid of playerClubIds) {
      const row = await db.prepare(
        'SELECT COALESCE(SUM(yellow_cards), 0) AS y FROM player_stats WHERE save_id = ? AND player_id = ? AND season = ?',
      ).get(saveId, pid, playerFixture.season) as { y: number };
      const thisMatchYellows = matchResult.events.filter(
        e => e.type === 'yellow' && e.playerId === pid,
      ).length;
      priorYellowsBySeason.set(pid, Math.max(0, row.y - thisMatchYellows));
    }
    for (const s of resolveMatchSuspensions(matchResult.events, priorYellowsBySeason, rng)) {
      if (playerClubIds.has(s.playerId)) {
        await setPlayerSuspension(db, s.playerId, s.weeks);
      }
    }

    // 9. Post-match morale for the player's squad (C5 psychology: drivers modulated
    // by personality + persisted to the ledger).
    const isHomeForMorale = playerFixture.homeClubId === playerClubId;
    const myGoals = isHomeForMorale ? matchResult.homeGoals : matchResult.awayGoals;
    const oppGoals = isHomeForMorale ? matchResult.awayGoals : matchResult.homeGoals;
    const goalDiff = myGoals - oppGoals;
    const matchOutcome: 'win' | 'draw' | 'loss' = goalDiff > 0 ? 'win' : goalDiff < 0 ? 'loss' : 'draw';

    await applyMatchPsychology(
      db, saveId, playerClubId,
      { outcome: matchOutcome, goalDiff, startingIds },
      season, week,
    );

    // 9b. P5: a user match was played this week → arm the post-match press
    // conference gate. Both the instant and halftime-resume paths call
    // advanceGameWeek, so this single set covers both. Cleared on the press screen.
    if (saveId >= 0) {
      await setPressPending(db, saveId, true);
    }
  }
}
