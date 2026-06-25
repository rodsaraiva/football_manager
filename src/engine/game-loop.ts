import { DbHandle } from '@/database/queries/players';
import { getPlayersByClub, getPlayersWithAttributesByClub, setPlayerSuspension } from '@/database/queries/players';
import { applyMatchPsychology, applyWeeklyPsychology } from '@/engine/morale/psychology-orchestrator';
import { pruneMoraleEvents } from '@/database/queries/morale';
import { MORALE_EVENTS_KEEP_SEASONS } from '@/engine/balance';
import { getAssistantsBySave, getAssistantByRole } from '@/database/queries/assistants';
import { maybeGenerateComment } from './assistant/comment-generator';
import { AssistantComment } from '@/types/assistant';
import { processPendingOffers } from './transfer/offer-processor';
import { expireInboxDeadlines } from '@/engine/inbox/deadline-sweeper';
import { processYouthLoanWeek } from '@/engine/youth/youth-loans';
import { generateAiOffersForSquad, generateAiToAiOffers } from './transfer/ai-offer-generator';
import { expireStaleOffers, prunExpiredBlocks } from './transfer/negotiation';
import {
  pickStartingEleven,
  buildSquadFromSavedIds,
  buildBenchFromSavedIds,
  buildBench,
  PlayerForPick,
} from './simulation/squad-selection';
import {
  getFixturesByWeek,
  updateFixtureResult,
  addMatchEvent,
} from '@/database/queries/fixtures';
import { getClubById, getClubTrainingFocus } from '@/database/queries/clubs';
import { getStaffByClub } from '@/database/queries/staff';
import { getActiveAssignments, setKnowledge, getPlayerKnowledge } from '@/database/queries/scouting';
import { getPlayerById } from '@/database/queries/players';
import { insertNewsItem } from '@/database/queries/news';
import { advanceScouting, knowledgeTier, maskedRange } from '@/engine/scouting/scouting-engine';
import { getActiveMissions, completeMission, setMissionWeeks } from '@/database/queries/scout-missions';
import { advanceMission, missionVerdict } from '@/engine/scouting/scout-missions';
import { archetypeMultiplier } from '@/engine/scouting/scout-archetypes';
import { getRecentForm, getLastNMatchForm } from '@/database/queries/player-stats';
import { computeFormModifier } from './simulation/form';
import { getStaffEffects, assistantAbilityFromStars } from '@/engine/staff/staff-effects';
import { getActiveTactic, getTacticLineup } from '@/database/queries/tactics';
import { getSetPieceTakers } from '@/database/queries/set-piece-takers';
import { updateSaveWeek } from '@/database/queries/saves';
import { setPressPending } from '@/database/queries/save';
import { SeededRng } from './rng';
import { simulateMatch, MatchResult } from './simulation/match-engine';
import { assignMatchInjuries, injuryRecoveryStep } from './simulation/injury';
import { computeCongestion } from './simulation/congestion';
import { resolveMatchSuspensions } from './simulation/match-consequences';
import { maybeGenerateNextKnockoutRound } from './competition/round-progression';
import { PlayerForStrength } from './simulation/team-strength';
import { simulateWeekFixtures, ClubMatchData, FixtureSimInput } from './simulation/match-runner';
import { computeWeeklyClubFinance } from './finance/weekly-finance';
import { calculateWeeklyProgression } from './training/progression';
import { Fixture, PlayerAttributes, Position } from '@/types';
import { archiveSeason } from './history/season-archiver';
import { distributePrizeMoney } from './finance/rollover-economy';
import { archiveLegacy } from './legacy/legacy-archiver';
import { getRivalry } from '@/database/queries/legacy';
import { deriveDerbyBonus } from './legacy/derby-bonus';
import { retirePlayer } from '@/database/queries/players';
import {
  detectCompulsoryRetirements,
  shouldAnnounceRetirement,
  isInAnnounceWindow,
} from './retirement/retirement-engine';
import {
  isInternationalBreak,
  selectCallUps,
  applyTravelFatigue,
  CallUpCandidate,
} from './national/international-duty';
import { calculateOverall } from '@/utils/overall';
import {
  RETIREMENT_MIN_AGE,
  RETIREMENT_MAX_AGE,
  RETIREMENT_MORALE_THRESHOLD,
  SEASON_END_WEEK,
} from './balance';

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

// ─── Persist per-match player stats ──────────────────────────────────────────

async function persistMatchStats(
  db: DbHandle,
  saveId: number,
  fixture: Fixture,
  result: MatchResult,
): Promise<void> {
  // Derive per-player tallies from the match events (PlayerRating only carries
  // playerId + rating; goals/assists/cards must be counted from events).
  const tallyFor = (playerId: number) => {
    let goals = 0;
    let assists = 0;
    let yellowCards = 0;
    let redCards = 0;
    let minutesPlayed = 90; // default; subtract from red-card minute if red
    for (const e of result.events) {
      if (e.playerId === playerId) {
        switch (e.type) {
          case 'goal':
          case 'penalty_scored':
          case 'free_kick_scored':
            goals++;
            break;
          case 'assist':
            assists++;
            break;
          case 'yellow':
            yellowCards++;
            break;
          case 'red':
            redCards++;
            minutesPlayed = Math.min(minutesPlayed, e.minute);
            break;
          case 'substitution':
            // player subbed off — use event minute as minutes played
            minutesPlayed = Math.min(minutesPlayed, e.minute);
            break;
        }
      }
    }
    return { goals, assists, yellowCards, redCards, minutesPlayed };
  };

  const allRatings = [...result.homeRatings, ...result.awayRatings];
  if (allRatings.length === 0) return;

  // One batched upsert per match instead of a SELECT+UPSERT per player. On
  // expo-sqlite web each await is a worker round-trip; routing ALL fixtures through
  // the real engine means ~20 matches × 22 players/week, so per-player awaits made a
  // week-advance take ~minutes. ON CONFLICT accumulates with a minutes-weighted avg.
  const params: unknown[] = [];
  const rowsSql: string[] = [];
  for (const r of allRatings) {
    const t = tallyFor(r.playerId);
    rowsSql.push('(?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)');
    params.push(
      saveId, r.playerId, fixture.season, fixture.competitionId,
      t.goals, t.assists, t.yellowCards, t.redCards, r.rating, t.minutesPlayed,
    );
  }
  await db.prepare(
    `INSERT INTO player_stats
       (save_id, player_id, season, competition_id, appearances, goals, assists,
        yellow_cards, red_cards, avg_rating, minutes_played)
     VALUES ${rowsSql.join(',')}
     ON CONFLICT(player_id, season, competition_id) DO UPDATE SET
       appearances    = appearances + excluded.appearances,
       goals          = goals + excluded.goals,
       assists        = assists + excluded.assists,
       yellow_cards   = yellow_cards + excluded.yellow_cards,
       red_cards      = red_cards + excluded.red_cards,
       avg_rating     = CASE WHEN (minutes_played + excluded.minutes_played) > 0
                          THEN (avg_rating * minutes_played + excluded.avg_rating * excluded.minutes_played)
                               / (minutes_played + excluded.minutes_played)
                          ELSE avg_rating END,
       minutes_played = minutes_played + excluded.minutes_played`,
  ).run(...params);
}

export interface AdvanceWeekParams {
  dbHandle: DbHandle;
  season: number;
  week: number;
  playerClubId: number;
  saveId: number;
  rng: SeededRng;
  // P4 (halftime): when present, the user's fixture is NOT re-simulated — this
  // already-computed result (from the watched/resumed match) is persisted and
  // its consequences applied instead. AI fixtures still run with the week rng,
  // excluding the user's fixture from the batch so the stream is unaffected.
  userMatchResultOverride?: MatchResult;
}

export interface AdvanceWeekResult {
  newSeason: number;
  newWeek: number;
  isSeasonEnd: boolean;
  playerMatchResult: MatchResult | null;
  updatedBudget: number;
  // Anunciados nesta semana (flag will_retire_at_season_end acabou de ser setada).
  newlyAnnouncedRetirementIds: number[];
  // Efetivamente aposentados nesta semana — só populado em isSeasonEnd.
  retiringPlayerIds: number[];
  // Comentário espontâneo de assistente (null se nenhum ativou esta semana).
  assistantComment: AssistantComment | null;
  // P9: jogadores do elenco convocados para suas seleções nesta semana (vazio fora
  // de janela FIFA). Cada convocado leva uma penalidade de fitness por viagem.
  internationalCallUps: number[];
}

// Squad selection (pickStartingEleven / buildSquadFromSavedIds / buildBench /
// PlayerForPick / POSITION_GROUP) lives in ./simulation/squad-selection.ts.

// ─── Player data helpers ──────────────────────────────────────────────────────

async function loadSquadWithAttributes(db: DbHandle, saveId: number, clubId: number): Promise<PlayerForPick[]> {
  // 2 queries (players + attributes batched) instead of the old 1+N getPlayerById
  // loop — critical on expo-sqlite web where every await is a worker round-trip and
  // the weekly loop loads ~40 clubs.
  const players = await getPlayersWithAttributesByClub(db, saveId, clubId);
  return players.map((p) => ({
    id: p.id,
    position: p.position,
    secondaryPosition: p.secondaryPosition,
    attributes: p.attributes,
    morale: p.morale,
    fitness: p.fitness,
    injuryWeeksLeft: p.injuryWeeksLeft,
    suspensionWeeksLeft: p.suspensionWeeksLeft,
  }));
}

// Loads one club's XI + bench (saved lineup or best-available) + tactic +
// reputation as the engine needs it. Shared by the weekly batch loader and the
// P4 halftime helper. Touches DB, so it lives in the loop file.
export async function loadClubMatchData(
  db: DbHandle,
  saveId: number,
  clubId: number,
): Promise<ClubMatchData> {
  const raw = await loadSquadWithAttributes(db, saveId, clubId);
  const club = await getClubById(db, saveId, clubId);
  const tactic = await getActiveTactic(db, saveId, clubId);
  const formation = tactic?.formation ?? '4-4-2';
  const lineup = tactic ? await getTacticLineup(db, saveId, tactic.id) : null;

  const squad = lineup
    ? buildSquadFromSavedIds(lineup.starterIds, raw, formation)
    : pickStartingEleven(raw, formation);
  const startIds = new Set(squad.map(p => p.id));
  const bench = lineup
    ? buildBenchFromSavedIds(lineup.benchIds, raw, startIds)
    : buildBench(raw, startIds);

  const resolvedTactic = tactic ?? {
    id: 0, clubId, name: 'Default', isActive: true,
    formation: '4-4-2' as const, mentality: 'balanced' as const,
    pressing: 'medium' as const, passingStyle: 'mixed' as const,
    tempo: 'normal' as const, width: 'normal' as const,
    attackFocus: 'balanced' as const, subStrategy: 'balanced' as const,
  };

  // P7: designated set-piece takers (null when no row — AI clubs and any club the
  // user never configured → undefined → engine auto-picks = legacy behavior).
  const setPieceTakers = (await getSetPieceTakers(db, saveId, clubId)) ?? undefined;

  return { clubId, reputation: club?.reputation ?? 50, squad, bench, tactic: resolvedTactic, setPieceTakers };
}

// Loads each club appearing in this week's fixtures once, keyed by clubId. Feeds
// the real engine for every match (human + AI).
async function loadWeekClubData(
  db: DbHandle,
  saveId: number,
  fixtures: Fixture[],
): Promise<Map<number, ClubMatchData>> {
  const clubIds = new Set<number>();
  for (const f of fixtures) { clubIds.add(f.homeClubId); clubIds.add(f.awayClubId); }

  const map = new Map<number, ClubMatchData>();
  for (const clubId of clubIds) {
    map.set(clubId, await loadClubMatchData(db, saveId, clubId));
  }
  return map;
}

// ─── Transfer window helpers ──────────────────────────────────────────────────

function isTransferWindow(week: number): boolean {
  return (week >= 1 && week <= 6) || (week >= 23 && week <= 26);
}

// AI→AI transfers now flow through the real market (generateAiToAiOffers +
// processPendingOffers), replacing the old reputation/overall-70 coin-flip path.

// ─── Main function ────────────────────────────────────────────────────────────

export async function advanceGameWeek(params: AdvanceWeekParams): Promise<AdvanceWeekResult> {
  const { dbHandle: db, season, week, playerClubId, saveId, rng, userMatchResultOverride } = params;

  // 1. Fixtures + batch-load every club playing this week (one query set per club).
  const fixtures = await getFixturesByWeek(db, saveId, season, week);
  const clubData = await loadWeekClubData(db, saveId, fixtures);

  // C8-e: recent-form modifier por jogador — só p/ o clube do usuário (custo
  // baixo). AI clubs ficam sem formModifiers ⇒ rating legado byte-for-byte. Não
  // consome RNG (formModifier é somado ao rating sem rolagem).
  const userClubData = clubData.get(playerClubId);
  if (userClubData) {
    const formMods = new Map<number, number>();
    for (const p of userClubData.squad) {
      const recent = await getLastNMatchForm(db, saveId, p.id, season, 5);
      const mod = computeFormModifier(recent);
      if (mod !== 0) formMods.set(p.id, mod);
    }
    if (formMods.size > 0) userClubData.formModifiers = formMods;
  }

  const playerFixture = fixtures.find(
    f => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  );

  // 2. Simulate fixtures with the real engine (human + AI, same engine — no
  //    reputation coin-flip). The runner sorts by fixture id for determinism.
  //    When the user's match was watched and resumed elsewhere, its result is
  //    supplied via userMatchResultOverride; we exclude that fixture from the
  //    batch (so the week rng stream is identical to the AI-only path) and inject
  //    the override into the result map afterwards.
  const useOverride = userMatchResultOverride != null && playerFixture != null;
  const simInputs: FixtureSimInput[] = fixtures
    .filter(f => !(useOverride && f.id === playerFixture!.id))
    .map(f => ({ fixtureId: f.id, homeClubId: f.homeClubId, awayClubId: f.awayClubId }));
  // C1: derby atmosphere per fixture. getRivalry does not consume the rng and the
  // fixture order is unchanged, so the match rng stream is identical when no rivalry
  // exists (deriveDerbyBonus(null) ⇒ neutral).
  const simInputsWithDerby: FixtureSimInput[] = [];
  for (const f of simInputs) {
    const rivalry = await getRivalry(db, saveId, f.homeClubId, f.awayClubId);
    simInputsWithDerby.push({ ...f, derbyBonus: deriveDerbyBonus(rivalry?.intensity ?? null) });
  }
  const simulated = simulateWeekFixtures({ fixtures: simInputsWithDerby, clubData, rng });
  const resultByFixture = new Map(simulated.map(s => [s.fixtureId, s.result]));
  if (useOverride) {
    resultByFixture.set(playerFixture!.id, userMatchResultOverride!);
  }

  let playerMatchResult: MatchResult | null = null;

  // 3. Persist every fixture; player_stats for ALL clubs; full event log only for
  //    the human match (the UI consumes it).
  for (const fixture of fixtures) {
    const result = resultByFixture.get(fixture.id);
    if (!result) continue;
    await updateFixtureResult(db, saveId, fixture.id, result.homeGoals, result.awayGoals, result.attendance);
    await persistMatchStats(db, saveId, fixture, result);
    if (playerFixture && fixture.id === playerFixture.id) {
      playerMatchResult = result;
      for (const event of result.events) {
        await addMatchEvent(db, {
          fixtureId: fixture.id,
          minute: event.minute,
          type: event.type,
          playerId: event.playerId,
          secondaryPlayerId: event.secondaryPlayerId,
        });
      }
    }
  }

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

  // 9c. P9 international duty: on FIFA-break weeks the user's international-caliber
  // players are called up to their national teams and return with TRAVEL FATIGUE.
  // Runs independently of whether the user had a league fixture this week — the
  // break is a separate calendar event. Travel fatigue STACKS with any match
  // fitness change applied above (returning from internationals tired is realistic).
  const internationalCallUps: number[] = [];
  if (isInternationalBreak(week)) {
    const squad = await getPlayersWithAttributesByClub(db, saveId, playerClubId);
    const candidates: CallUpCandidate[] = squad
      .filter((p) => !p.isFreeAgent)
      .map((p) => ({
        id: p.id,
        nationality: p.nationality,
        overall: calculateOverall(p.attributes, p.position),
      }));
    const fitnessById = new Map(squad.map((p) => [p.id, p.fitness]));
    for (const id of selectCallUps(candidates)) {
      const current = fitnessById.get(id);
      if (current == null) continue;
      const next = applyTravelFatigue(current);
      await db.prepare('UPDATE players SET fitness = ? WHERE save_id = ? AND id = ?').run(next, saveId, id);
      internationalCallUps.push(id);
    }
    if (internationalCallUps.length > 0) {
      await insertNewsItem(db, saveId, {
        season, week, category: 'callup', icon: '🌍', priority: 75,
        titleKey: 'news.persist_callup_title',
        bodyKey: internationalCallUps.length === 1 ? 'news.persist_callup_body_one' : 'news.persist_callup_body_other',
        bodyVars: { count: internationalCallUps.length },
      });
    }
  }

  // (all fixtures were already simulated + persisted above by the real engine)

  // 3·5 Scouting progression: each active assignment for the human club accrues
  // knowledge based on the assigned scout's ability. Persisting 100 frees the scout.
  if (saveId >= 0) {
    const assignments = await getActiveAssignments(db, saveId);
    if (assignments.length > 0) {
      const scoutStaff = await getStaffByClub(db, saveId, playerClubId);
      const abilityById = new Map(scoutStaff.map((s) => [s.id, s.ability]));
      for (const a of assignments) {
        const ability = abilityById.get(a.scoutId);
        if (ability == null) continue; // scout no longer at the club — skip
        const current = (await db
          .prepare('SELECT knowledge FROM scouting WHERE save_id = ? AND player_id = ?')
          .get(saveId, a.playerId)) as { knowledge: number } | undefined;
        const [advanced] = advanceScouting([
          { playerId: a.playerId, knowledge: current?.knowledge ?? 0, scoutAbility: ability },
        ]);
        await setKnowledge(db, saveId, a.playerId, advanced.knowledge);
        if (advanced.reachedFull) {
          const p = (await db
            .prepare('SELECT name, position, age FROM players WHERE save_id = ? AND id = ?')
            .get(saveId, a.playerId)) as { name: string; position: string; age: number } | undefined;
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.persist_scouting_title', titleVars: { name: p?.name ?? '' },
            bodyKey: 'news.persist_scouting_body',
            bodyVars: { name: p?.name ?? '', position: p?.position ?? '', age: p?.age ?? 0, verdict: 'verdict.solid' },
          });
        }
      }
    }
  }

  // 3·5b C3 Scouting missions: each active mission for the human club advances by its
  // type/pace/archetype. Completing a mission frees the scout and fires a news item with
  // REAL titleVars/bodyVars (player name + verdict). Orphan missions (scout gone) expire
  // with an interruption notice. Additive to (and independent of) the legacy assignment
  // path above — the scouting table stays a cache; scout_missions drives the new flow.
  if (saveId >= 0) {
    const missions = await getActiveMissions(db, saveId);
    if (missions.length > 0) {
      const scouts = (await getStaffByClub(db, saveId, playerClubId)).filter((s) => s.role === 'scout');
      const scoutById = new Map(scouts.map((s) => [s.id, s]));

      for (const m of missions) {
        const scout = scoutById.get(m.scoutId);
        if (scout == null) {
          // scout left the club → orphan mission expires + interruption news.
          await completeMission(db, saveId, m.id, 'expired');
          let orphanName = '';
          if (m.targetPlayerId != null) {
            const op = (await db
              .prepare('SELECT name FROM players WHERE save_id = ? AND id = ?')
              .get(saveId, m.targetPlayerId)) as { name: string } | undefined;
            orphanName = op?.name ?? '';
          }
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 70,
            titleKey: 'news.scouting_interrupted_title',
            bodyKey: 'news.scouting_interrupted_body',
            bodyVars: { name: orphanName },
          });
          continue;
        }

        // Build the archetype target from the real player (neutral for intel/youth).
        // region-base proxy: the user's club country (no dedicated scout-region column).
        const scoutRegionCode = '';
        let target = { age: 24, position: 'CM' as Position, regionCode: '' };
        let knowledgeBefore = 0;
        if (m.targetPlayerId != null) {
          const tp = (await db
            .prepare('SELECT age, position, nationality FROM players WHERE save_id = ? AND id = ?')
            .get(saveId, m.targetPlayerId)) as { age: number; position: Position; nationality: string } | undefined;
          if (tp == null) {
            // target vanished → expire silently.
            await completeMission(db, saveId, m.id, 'expired');
            continue;
          }
          target = { age: tp.age, position: tp.position, regionCode: tp.nationality };
          knowledgeBefore = await getPlayerKnowledge(db, saveId, m.targetPlayerId);
        }

        const archetypeMult = archetypeMultiplier(
          scout.archetype ?? 'generalist',
          target,
          { scoutRegionCode },
        );
        const result = advanceMission({
          missionId: m.id,
          type: m.type,
          knowledge: knowledgeBefore,
          weeksElapsed: m.weeksElapsed,
          scoutAbility: scout.ability,
          archetypeMult,
        });

        if (m.targetPlayerId != null) {
          await setKnowledge(db, saveId, m.targetPlayerId, result.knowledge);
        }
        await setMissionWeeks(db, saveId, m.id, result.weeksElapsed);

        if (!result.completed) continue;
        await completeMission(db, saveId, m.id, result.expiredEarly ? 'expired' : 'completed');

        // Type-specific report callback (news with real vars).
        if (m.type === 'opponent_intel' && m.targetClubId != null) {
          const club = (await db
            .prepare('SELECT name FROM clubs WHERE save_id = ? AND id = ?')
            .get(saveId, m.targetClubId)) as { name: string } | undefined;
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.scouting_intel_title', titleVars: { club: club?.name ?? '' },
            bodyKey: 'news.scouting_intel_body', bodyVars: { club: club?.name ?? '' },
          });
        } else if (m.type === 'youth_prospect') {
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.scouting_youth_title', titleVars: { name: '' },
            bodyKey: 'news.scouting_youth_body',
            bodyVars: { name: '', position: '', age: 0, potLo: 0, potHi: 0 },
          });
        } else if (m.targetPlayerId != null) {
          // short_eval / long_project: verdict over the real player.
          const full = await getPlayerById(db, saveId, m.targetPlayerId);
          const scoutAccuracy = getStaffEffects({
            fitnessCoachAbility: 0, physioAbility: 0, scoutAbility: scout.ability,
            youthCoachAbility: 0, assistantAbility: 0,
          }).scoutAccuracy;
          const overall = full ? calculateOverall(full.attributes, full.position) : 0;
          const masked = maskedRange(overall, knowledgeTier(result.knowledge), scoutAccuracy);
          const maskedOvr = masked ? Math.round((masked.lo + masked.hi) / 2) : overall;
          const { verdictKey } = missionVerdict(result.knowledge, maskedOvr);
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.persist_scouting_title', titleVars: { name: full?.name ?? '' },
            bodyKey: 'news.persist_scouting_body',
            bodyVars: {
              name: full?.name ?? '', position: full?.position ?? '', age: full?.age ?? 0,
              verdict: verdictKey,
            },
          });
        }
      }
    }
  }

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

  // 4. Process weekly finances for player's club
  // Every club with a fixture this week runs the same weekly finance model; the
  // human club is always included (it pays wages even on a bye week). Bulk-loaded in
  // a handful of aggregate queries instead of ~9 awaits/club — the per-week loop spans
  // ~40 clubs and on expo-sqlite web each await is a worker round-trip.
  const financeClubIds = new Set<number>();
  for (const f of fixtures) { financeClubIds.add(f.homeClubId); financeClubIds.add(f.awayClubId); }
  financeClubIds.add(playerClubId);
  const financeClubList = [...financeClubIds];
  const inHolders = financeClubList.map(() => '?').join(',');

  const clubRows = (await db.prepare(
    `SELECT id, reputation, budget, stadium_capacity, training_facilities, youth_academy, medical_department
     FROM clubs WHERE save_id = ? AND id IN (${inHolders})`,
  ).all(saveId, ...financeClubList)) as Array<{
    id: number; reputation: number; budget: number; stadium_capacity: number;
    training_facilities: number; youth_academy: number; medical_department: number;
  }>;
  const clubById = new Map(clubRows.map(c => [c.id, c]));

  const wageRows = (await db.prepare(
    `SELECT club_id, COALESCE(SUM(wage), 0) AS w FROM players
     WHERE save_id = ? AND is_free_agent = 0 AND club_id IN (${inHolders}) GROUP BY club_id`,
  ).all(saveId, ...financeClubList)) as Array<{ club_id: number; w: number }>;
  const playerWageByClub = new Map(wageRows.map(r => [r.club_id, r.w]));

  const staffRows = (await db.prepare(
    `SELECT club_id, COALESCE(SUM(wage), 0) AS w FROM staff
     WHERE save_id = ? AND club_id IN (${inHolders}) GROUP BY club_id`,
  ).all(saveId, ...financeClubList)) as Array<{ club_id: number; w: number }>;
  const staffWageByClub = new Map(staffRows.map(r => [r.club_id, r.w]));

  // Competition type per home fixture — scales gate receipts (cup/continental > league).
  const compIds = [...new Set(fixtures.map(f => f.competitionId))];
  const compTypeById = new Map<number, 'league' | 'cup' | 'continental'>();
  if (compIds.length > 0) {
    const compRows = (await db.prepare(
      `SELECT id, type FROM competitions WHERE id IN (${compIds.map(() => '?').join(',')})`,
    ).all(...compIds)) as Array<{ id: number; type: string }>;
    for (const r of compRows) {
      if (r.type === 'cup' || r.type === 'continental') compTypeById.set(r.id, r.type);
      else compTypeById.set(r.id, 'league');
    }
  }

  const financeEntries: { clubId: number; season: number; week: number; type: string; amount: number; description: string }[] = [];
  const budgetByClub = new Map<number, number>();
  let updatedBudget = 0;

  for (const clubId of financeClubList) {
    const club = clubById.get(clubId);
    if (!club) continue;

    const homeFixture = fixtures.find(f => f.homeClubId === clubId);
    const hasHomeMatch = homeFixture != null;
    const actualAttendance = hasHomeMatch
      ? (resultByFixture.get(homeFixture!.id)?.attendance ?? homeFixture!.attendance ?? null)
      : null;
    const competitionType = hasHomeMatch
      ? (compTypeById.get(homeFixture!.competitionId) ?? 'league')
      : 'league';

    const fin = computeWeeklyClubFinance({
      clubId, reputation: club.reputation, budget: club.budget,
      stadiumCapacity: club.stadium_capacity, trainingFacilities: club.training_facilities,
      youthAcademy: club.youth_academy, medicalDepartment: club.medical_department,
      totalPlayerWages: playerWageByClub.get(clubId) ?? 0,
      totalStaffWages: staffWageByClub.get(clubId) ?? 0,
      hasHomeMatch, actualAttendance, leaguePosition: 1, competitionType,
    }, season, week);

    financeEntries.push(...fin.entries);
    let budget = fin.newBudget;

    // Human-only: monthly assistant wages every 4 weeks.
    if (clubId === playerClubId && saveId >= 0 && week % 4 === 0) {
      const assistants = await getAssistantsBySave(db, saveId);
      const totalAssistantWages = assistants.reduce((s, a) => s + a.wagePerMonth, 0);
      if (totalAssistantWages > 0) {
        financeEntries.push({
          clubId, season, week, type: 'assistant_wage',
          amount: -totalAssistantWages, description: 'Monthly assistant staff wages',
        });
        budget -= totalAssistantWages;
      }
    }

    budgetByClub.set(clubId, budget);
    if (clubId === playerClubId) updatedBudget = budget;
  }

  // One batched INSERT for every finance entry this week.
  if (financeEntries.length > 0) {
    const rowsSql = financeEntries.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
    const params: unknown[] = [];
    for (const e of financeEntries) params.push(saveId, e.clubId, e.season, e.week, e.type, e.amount, e.description);
    await db.prepare(
      `INSERT INTO club_finances (save_id, club_id, season, week, type, amount, description) VALUES ${rowsSql}`,
    ).run(...params);
  }

  // One batched budget UPDATE (CASE per club) instead of one per club.
  if (budgetByClub.size > 0) {
    const ids = [...budgetByClub.keys()];
    const caseSql = ids.map(() => 'WHEN ? THEN ?').join(' ');
    const caseParams: unknown[] = [];
    for (const id of ids) caseParams.push(id, budgetByClub.get(id));
    await db.prepare(
      `UPDATE clubs SET budget = CASE id ${caseSql} END WHERE save_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    ).run(...caseParams, saveId, ...ids);
  }

  // Debt signal for board-stakes: consecutive weeks the human club stays in the red.
  const prevDebt = (await db
    .prepare('SELECT debt_weeks FROM clubs WHERE save_id = ? AND id = ?')
    .get(saveId, playerClubId)) as { debt_weeks: number } | undefined;
  const newDebtWeeks = updatedBudget < 0 ? (prevDebt?.debt_weeks ?? 0) + 1 : 0;
  await db
    .prepare('UPDATE clubs SET debt_weeks = ? WHERE save_id = ? AND id = ?')
    .run(newDebtWeeks, saveId, playerClubId);

  // 4b. Generate assistant comment (max 1 per week, 15% chance)
  let assistantComment: AssistantComment | null = null;
  if (saveId >= 0) {
    const assistants = await getAssistantsBySave(db, saveId);
    const commentRng = new SeededRng(saveId * season * (week + 1));
    for (const assistant of assistants) {
      const comment = maybeGenerateComment(assistant, {
        leaguePosition: null,
        totalTeams: 20,
        week,
        season,
        budgetBalance: updatedBudget,
        squadAvgAge: 26,
        topYouthPotential: null,
      }, commentRng);
      if (comment) { assistantComment = comment; break; }
    }
  }

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
     WHERE age >= ? AND age <= ? AND will_retire_at_season_end = 0 AND club_id IS NOT NULL AND is_free_agent = 0`,
  ).run(RETIREMENT_MORALE_THRESHOLD, RETIREMENT_MIN_AGE, RETIREMENT_MAX_AGE);

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

  // 8. Advance week
  const isSeasonEnd = week >= SEASON_END_WEEK;
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
  const newWeek = isSeasonEnd ? 1 : week + 1;
  const newSeason = isSeasonEnd ? season + 1 : season;

  // Update save if valid saveId
  if (saveId >= 0) {
    await updateSaveWeek(db, saveId, newSeason, newWeek);
  }

  return {
    newSeason,
    newWeek,
    isSeasonEnd,
    playerMatchResult,
    updatedBudget,
    newlyAnnouncedRetirementIds,
    retiringPlayerIds,
    assistantComment,
    internationalCallUps,
  };
}
