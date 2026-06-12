import { DbHandle } from '@/database/queries/players';
import { getPlayersByClub, getPlayersWithAttributesByClub, setPlayerSuspension, updatePlayerMorale } from '@/database/queries/players';
import { computeMatchMoraleDelta, computeWeeklyMoraleDrift, applyMoraleDelta } from '@/engine/morale/morale-engine';
import { getAssistantsBySave } from '@/database/queries/assistants';
import { maybeGenerateComment } from './assistant/comment-generator';
import { AssistantComment } from '@/types/assistant';
import { processPendingOffers } from './transfer/offer-processor';
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
import { getRecentForm } from '@/database/queries/player-stats';
import { getStaffEffects } from '@/engine/staff/staff-effects';
import { getActiveTactic, getTacticLineup } from '@/database/queries/tactics';
import { updateSaveWeek } from '@/database/queries/saves';
import { SeededRng } from './rng';
import { simulateMatch, MatchResult } from './simulation/match-engine';
import { assignMatchInjuries } from './simulation/injury';
import { resolveMatchSuspensions } from './simulation/match-consequences';
import { maybeGenerateNextKnockoutRound } from './competition/round-progression';
import { PlayerForStrength } from './simulation/team-strength';
import { simulateWeekFixtures, ClubMatchData, FixtureSimInput } from './simulation/match-runner';
import { computeWeeklyClubFinance } from './finance/weekly-finance';
import { calculateWeeklyProgression } from './training/progression';
import { Fixture, PlayerAttributes } from '@/types';
import { archiveSeason } from './history/season-archiver';
import { retirePlayer } from '@/database/queries/players';
import {
  detectCompulsoryRetirements,
  shouldAnnounceRetirement,
  isInAnnounceWindow,
} from './retirement/retirement-engine';
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

// Loads each club appearing in this week's fixtures once: XI + bench (saved or
// best-available) + tactic + reputation, keyed by clubId. Feeds the real engine
// for every match (human + AI). Touches DB, so it lives in the loop file.
async function loadWeekClubData(
  db: DbHandle,
  saveId: number,
  fixtures: Fixture[],
): Promise<Map<number, ClubMatchData>> {
  const clubIds = new Set<number>();
  for (const f of fixtures) { clubIds.add(f.homeClubId); clubIds.add(f.awayClubId); }

  const map = new Map<number, ClubMatchData>();
  for (const clubId of clubIds) {
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

    map.set(clubId, { clubId, reputation: club?.reputation ?? 50, squad, bench, tactic: resolvedTactic });
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
  const { dbHandle: db, season, week, playerClubId, saveId, rng } = params;

  // 1. Fixtures + batch-load every club playing this week (one query set per club).
  const fixtures = await getFixturesByWeek(db, saveId, season, week);
  const clubData = await loadWeekClubData(db, saveId, fixtures);

  // 2. Simulate ALL fixtures with the real engine (human + AI, same engine — no
  //    reputation coin-flip). The runner sorts by fixture id for determinism.
  const simInputs: FixtureSimInput[] = fixtures.map(f => ({
    fixtureId: f.id, homeClubId: f.homeClubId, awayClubId: f.awayClubId,
  }));
  const simulated = simulateWeekFixtures({ fixtures: simInputs, clubData, rng });
  const resultByFixture = new Map(simulated.map(s => [s.fixtureId, s.result]));

  const playerFixture = fixtures.find(
    f => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  );
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
        staffTrainingBonus: staffEffects.trainingBonus,
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
    for (const p of playerSquadRaw) {
      const played = startingIds.has(p.id);
      let newFitness: number;
      if (played) {
        const drop = rng.nextInt(5, 15);
        newFitness = Math.max(30, p.fitness - drop);
      } else {
        const gain = rng.nextInt(5, 15);
        newFitness = Math.min(100, p.fitness + gain);
      }
      await db.prepare('UPDATE players SET fitness = ? WHERE save_id = ? AND id = ?').run(newFitness, saveId, p.id);
    }

    // 7. Recover existing injuries first (decrement), THEN apply this match's new
    // injuries — otherwise the freshly-set duration would be decremented in the
    // same week (gap-audit:163: injuries were cosmetic, never sidelining a player).
    await db.prepare(
      'UPDATE players SET injury_weeks_left = MAX(0, injury_weeks_left - 1) WHERE save_id = ? AND injury_weeks_left > 0 AND club_id = ?',
    ).run(saveId, playerClubId);

    const playerClubIds = new Set((await getPlayersByClub(db, saveId, playerClubId)).map(p => p.id));
    for (const inj of assignMatchInjuries(matchResult.events, playerClubIds, rng)) {
      await db.prepare('UPDATE players SET injury_weeks_left = ? WHERE save_id = ? AND id = ?').run(inj.weeksLeft, saveId, inj.playerId);
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

    // 9. Post-match morale for the player's squad (result + who played).
    const isHomeForMorale = playerFixture.homeClubId === playerClubId;
    const myGoals = isHomeForMorale ? matchResult.homeGoals : matchResult.awayGoals;
    const oppGoals = isHomeForMorale ? matchResult.awayGoals : matchResult.homeGoals;
    const goalDiff = myGoals - oppGoals;
    const matchOutcome: 'win' | 'draw' | 'loss' = goalDiff > 0 ? 'win' : goalDiff < 0 ? 'loss' : 'draw';

    const moraleSquad = await getPlayersByClub(db, saveId, playerClubId);
    for (const mp of moraleSquad) {
      const played = startingIds.has(mp.id);
      const delta = computeMatchMoraleDelta({
        result: matchOutcome,
        played,
        minutesPlayed: played ? 90 : 0,
        goalDiff,
        benchStreakWeeks: played ? 0 : (mp.consecutiveLowMoraleWeeks ?? 0),
      });
      const newMorale = applyMoraleDelta(mp.morale, delta);
      if (newMorale !== mp.morale) {
        await updatePlayerMorale(db, saveId, mp.id, newMorale);
      }
    }
  }

  // (all fixtures were already simulated + persisted above by the real engine)

  // 3a. Advance any knockout competition whose current round just finished.
  await maybeGenerateNextKnockoutRound(db, saveId, season, week, rng);

  // 3b. Transfers via the real market: AI→AI offers + AI→human offers (in-window),
  //     then process every pending offer (acceptance doesn't distinguish human/AI).
  if (isTransferWindow(week)) {
    await generateAiToAiOffers(db, saveId, rng, season, week, playerClubId);
    await generateAiOffersForSquad(db, saveId, playerClubId, rng, season, week);
  }

  // 3c. Process pending offers submitted by the player (always, not gated by window)
  await processPendingOffers(db, saveId, season, week, playerClubId);

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

    const fin = computeWeeklyClubFinance({
      clubId, reputation: club.reputation, budget: club.budget,
      stadiumCapacity: club.stadium_capacity, trainingFacilities: club.training_facilities,
      youthAcademy: club.youth_academy, medicalDepartment: club.medical_department,
      totalPlayerWages: playerWageByClub.get(clubId) ?? 0,
      totalStaffWages: staffWageByClub.get(clubId) ?? 0,
      hasHomeMatch, actualAttendance, leaguePosition: 1,
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

  // 7a. Idle-week morale drift when the player's club did not play this week — pulls
  // morale toward the neutral target, so the streak SQL below sees the drifted value.
  if (!playerFixture) {
    const idleSquad = await getPlayersByClub(db, saveId, playerClubId);
    for (const sp of idleSquad) {
      const newMorale = applyMoraleDelta(sp.morale, computeWeeklyMoraleDrift(sp.morale));
      if (newMorale !== sp.morale) {
        await updatePlayerMorale(db, saveId, sp.id, newMorale);
      }
    }
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

    await archiveSeason(db, saveId, season);
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
  };
}
