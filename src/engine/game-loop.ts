import { DbHandle } from '@/database/queries/players';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { getAssistantsBySave } from '@/database/queries/assistants';
import { maybeGenerateComment } from './assistant/comment-generator';
import { AssistantComment } from '@/types/assistant';
import { generateAiTransfer } from './transfer/transfer-ai';
import { processPendingOffers } from './transfer/offer-processor';
import { generateAiOffersForPlayerClub } from './transfer/ai-offer-generator';
import { expireStaleOffers, prunExpiredBlocks } from './transfer/negotiation';
import { formationToSlots } from './formations';
import {
  getFixturesByWeek,
  updateFixtureResult,
  addMatchEvent,
} from '@/database/queries/fixtures';
import { getClubById, updateClubBudget } from '@/database/queries/clubs';
import { getActiveTactic, getTacticLineup } from '@/database/queries/tactics';
import { addFinanceEntry } from '@/database/queries/finances';
import { updateSaveWeek } from '@/database/queries/saves';
import { getStaffByClub } from '@/database/queries/staff';
import { SeededRng } from './rng';
import { simulateMatch, MatchResult } from './simulation/match-engine';
import { assignMatchInjuries } from './simulation/injury';
import { PlayerForStrength } from './simulation/team-strength';
import { calculateWeeklyIncome, calculateWeeklyExpenses } from './finance/finance-engine';
import { calculateWeeklyProgression } from './training/progression';
import { calculateOverall } from '@/utils/overall';
import { Position, PlayerAttributes } from '@/types';
import { Fixture } from '@/types';
import { upsertPlayerStats } from '@/database/queries/player-stats';
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

// ─── Persist per-match player stats ──────────────────────────────────────────

async function persistMatchStats(
  db: DbHandle,
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
  for (const r of allRatings) {
    const tally = tallyFor(r.playerId);
    await upsertPlayerStats(db, {
      playerId: r.playerId,
      season: fixture.season,
      competitionId: fixture.competitionId,
      appearances: 1,
      goals: tally.goals,
      assists: tally.assists,
      yellowCards: tally.yellowCards,
      redCards: tally.redCards,
      rating: r.rating,
      minutesPlayed: tally.minutesPlayed,
    });
  }
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

// Formation slot layout + helpers live in ./formations.ts

interface PlayerForPick {
  id: number;
  position: Position;
  secondaryPosition: Position | null;
  attributes: PlayerAttributes;
  morale: number;
  fitness: number;
  injuryWeeksLeft: number;
}

const POSITION_GROUP: Record<string, string> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'FWD', RW: 'FWD', ST: 'FWD',
};

function pickStartingEleven(players: PlayerForPick[], formation: string): PlayerForStrength[] {
  const slots = formationToSlots(formation);
  const selected = new Set<number>();
  const eleven: PlayerForStrength[] = [];

  for (const slot of slots) {
    const targetGroup = POSITION_GROUP[slot] ?? 'MID';
    const candidates = players
      .filter(p => !selected.has(p.id) && p.fitness > 30 && p.injuryWeeksLeft === 0)
      .map(p => {
        const base = calculateOverall(p.attributes, slot);
        let bonus = 0;
        if (p.position === slot) bonus = 15;
        else if (p.secondaryPosition === slot) bonus = 8;
        else if (POSITION_GROUP[p.position] === targetGroup) bonus = 3;
        else if (slot === 'GK' && p.position !== 'GK') bonus = -30;
        else if (p.position === 'GK' && slot !== 'GK') bonus = -30;
        else bonus = -10;
        return { player: p, score: base + bonus };
      })
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const pick = candidates[0].player;
      selected.add(pick.id);
      eleven.push({
        id: pick.id,
        position: slot,
        secondaryPosition: pick.secondaryPosition,
        attributes: pick.attributes,
        morale: pick.morale,
        fitness: pick.fitness,
      });
    }
  }

  return eleven;
}

// ─── AI match simulation (reputation-based, no full engine) ──────────────────

async function simulateAiMatch(
  fixture: Fixture,
  rng: SeededRng,
  db: DbHandle,
): Promise<{ homeGoals: number; awayGoals: number }> {
  const home = await getClubById(db, fixture.homeClubId);
  const away = await getClubById(db, fixture.awayClubId);
  const homeRep = home?.reputation ?? 50;
  const awayRep = away?.reputation ?? 50;

  const homeStrength = homeRep / 100 + 0.05; // slight home advantage
  const awayStrength = awayRep / 100;
  const total = homeStrength + awayStrength;

  const homeGoalBase = (homeStrength / total) * 2.5;
  const awayGoalBase = (awayStrength / total) * 2.5;

  const homeGoals = Math.max(0, Math.round(homeGoalBase + rng.nextFloat(-1.5, 1.5)));
  const awayGoals = Math.max(0, Math.round(awayGoalBase + rng.nextFloat(-1.5, 1.5)));

  return { homeGoals, awayGoals };
}

// ─── Player data helpers ──────────────────────────────────────────────────────

async function loadSquadWithAttributes(db: DbHandle, clubId: number): Promise<PlayerForPick[]> {
  const players = await getPlayersByClub(db, clubId);
  const result: PlayerForPick[] = [];
  for (const p of players) {
    const full = await getPlayerById(db, p.id);
    if (full) {
      result.push({
        id: full.id,
        position: full.position,
        secondaryPosition: full.secondaryPosition,
        attributes: full.attributes,
        morale: full.morale,
        fitness: full.fitness,
        injuryWeeksLeft: full.injuryWeeksLeft,
      });
    }
  }
  return result;
}

// ─── Transfer window helpers ──────────────────────────────────────────────────

function isTransferWindow(week: number): boolean {
  return (week >= 1 && week <= 6) || (week >= 23 && week <= 26);
}

export async function processAiTransfers(db: DbHandle, season: number, week: number, rng: SeededRng): Promise<void> {
  if (!isTransferWindow(week)) return;

  const clubs = await db.prepare(
    'SELECT id, reputation, budget FROM clubs ORDER BY RANDOM() LIMIT 5',
  ).all() as Array<{ id: number; reputation: number; budget: number }>;

  for (const club of clubs) {
    const squadRows = await db.prepare(
      'SELECT position FROM players WHERE club_id = ?',
    ).all(club.id) as Array<{ position: string }>;

    const available = await db.prepare(
      `SELECT p.id, p.position, p.market_value, p.wage, p.club_id as from_club_id, c.reputation as club_reputation
       FROM players p JOIN clubs c ON p.club_id = c.id
       WHERE p.club_id != ? AND p.is_free_agent = 0
       ORDER BY RANDOM() LIMIT 20`,
    ).all(club.id) as Array<{
      id: number;
      position: string;
      market_value: number;
      wage: number;
      from_club_id: number;
      club_reputation: number;
    }>;

    const result = generateAiTransfer({
      clubId: club.id,
      clubBudget: club.budget,
      clubReputation: club.reputation,
      squadPositions: squadRows.map(r => r.position),
      availablePlayers: available.map(p => ({
        id: p.id,
        position: p.position,
        overall: 70, // simplified
        marketValue: p.market_value,
        wage: p.wage,
        clubReputation: p.club_reputation,
      })),
      rng,
    });

    if (result) {
      const player = available.find(p => p.id === result.targetPlayerId);
      if (!player) continue;

      // Move player to buying club
      await db.prepare('UPDATE players SET club_id = ?, wage = ? WHERE id = ?').run(
        club.id,
        result.offeredWage,
        result.targetPlayerId,
      );
      // Deduct fee from buyer
      await db.prepare('UPDATE clubs SET budget = budget - ? WHERE id = ?').run(
        result.offeredFee,
        club.id,
      );
      // Add fee to seller
      await db.prepare('UPDATE clubs SET budget = budget + ? WHERE id = ?').run(
        result.offeredFee,
        player.from_club_id,
      );
      // Write finance ledger entries for both clubs
      await addFinanceEntry(db, {
        clubId: club.id,
        season,
        week,
        type: 'transfer_out',
        amount: -result.offeredFee,
        description: `Transfer fee paid for player #${result.targetPlayerId}`,
      });
      await addFinanceEntry(db, {
        clubId: player.from_club_id,
        season,
        week,
        type: 'transfer_in',
        amount: result.offeredFee,
        description: `Transfer fee received for player #${result.targetPlayerId}`,
      });
    }
  }
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function advanceGameWeek(params: AdvanceWeekParams): Promise<AdvanceWeekResult> {
  const { dbHandle: db, season, week, playerClubId, saveId, rng } = params;

  // 1. Get fixtures for this week
  const fixtures = await getFixturesByWeek(db, season, week);

  // 2. Simulate the player's match with the real engine
  let playerMatchResult: MatchResult | null = null;
  const playerFixture = fixtures.find(
    f => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  );

  if (playerFixture) {
    const homeSquadRaw = await loadSquadWithAttributes(db, playerFixture.homeClubId);
    const awaySquadRaw = await loadSquadWithAttributes(db, playerFixture.awayClubId);

    const homeTactic = await getActiveTactic(db, playerFixture.homeClubId);
    const awayTactic = await getActiveTactic(db, playerFixture.awayClubId);

    const homeFormation = homeTactic?.formation ?? '4-4-2';
    const awayFormation = awayTactic?.formation ?? '4-4-2';

    const homeLineupSaved = homeTactic ? await getTacticLineup(db, homeTactic.id) : null;
    const awayLineupSaved = awayTactic ? await getTacticLineup(db, awayTactic.id) : null;

    function buildSquadFromSavedIds(
      savedIds: number[],
      rawPlayers: PlayerForPick[],
      formation: string,
    ): PlayerForStrength[] {
      const byId = new Map(rawPlayers.map(p => [p.id, p]));
      const slots = formationToSlots(formation);
      const result: PlayerForStrength[] = [];
      const usedIds = new Set<number>();
      for (let i = 0; i < slots.length; i++) {
        const pid = savedIds[i];
        const p = pid != null ? byId.get(pid) : undefined;
        if (p && p.injuryWeeksLeft === 0 && p.fitness > 30 && !usedIds.has(p.id)) {
          usedIds.add(p.id);
          result.push({ id: p.id, position: slots[i], secondaryPosition: p.secondaryPosition, attributes: p.attributes, morale: p.morale, fitness: p.fitness });
        } else {
          // fallback: best available for this slot
          const fallback = rawPlayers
            .filter(q => !usedIds.has(q.id) && q.injuryWeeksLeft === 0 && q.fitness > 30)
            .sort((a, b) => {
              const target = POSITION_GROUP[slots[i]] ?? 'MID';
              const scoreA = calculateOverall(a.attributes, slots[i]) + (a.position === slots[i] ? 15 : POSITION_GROUP[a.position] === target ? 3 : -10);
              const scoreB = calculateOverall(b.attributes, slots[i]) + (b.position === slots[i] ? 15 : POSITION_GROUP[b.position] === target ? 3 : -10);
              return scoreB - scoreA;
            })[0];
          if (fallback) {
            usedIds.add(fallback.id);
            result.push({ id: fallback.id, position: slots[i], secondaryPosition: fallback.secondaryPosition, attributes: fallback.attributes, morale: fallback.morale, fitness: fallback.fitness });
          }
        }
      }
      return result;
    }

    const homeSquad = homeLineupSaved
      ? buildSquadFromSavedIds(homeLineupSaved.starterIds, homeSquadRaw, homeFormation)
      : pickStartingEleven(homeSquadRaw, homeFormation);
    const awaySquad = awayLineupSaved
      ? buildSquadFromSavedIds(awayLineupSaved.starterIds, awaySquadRaw, awayFormation)
      : pickStartingEleven(awaySquadRaw, awayFormation);

    // Build benches: saved bench or best available, cap 8
    const homeStartIds = new Set(homeSquad.map(p => p.id));
    const awayStartIds = new Set(awaySquad.map(p => p.id));

    function buildBenchFromSavedIds(
      savedIds: number[],
      rawPlayers: PlayerForPick[],
      startIds: Set<number>,
    ): PlayerForStrength[] {
      const byId = new Map(rawPlayers.map(p => [p.id, p]));
      return savedIds
        .map(id => byId.get(id))
        .filter((p): p is PlayerForPick => p != null && !startIds.has(p.id) && p.injuryWeeksLeft === 0 && p.fitness > 30)
        .slice(0, 8)
        .map(p => ({ id: p.id, position: p.position, secondaryPosition: p.secondaryPosition, attributes: p.attributes, morale: p.morale, fitness: p.fitness }));
    }

    const homeBench: PlayerForStrength[] = homeLineupSaved
      ? buildBenchFromSavedIds(homeLineupSaved.benchIds, homeSquadRaw, homeStartIds)
      : homeSquadRaw
          .filter(p => !homeStartIds.has(p.id) && p.injuryWeeksLeft === 0 && p.fitness > 30)
          .slice(0, 8)
          .map(p => ({ id: p.id, position: p.position, secondaryPosition: p.secondaryPosition, attributes: p.attributes, morale: p.morale, fitness: p.fitness }));
    const awayBench: PlayerForStrength[] = awayLineupSaved
      ? buildBenchFromSavedIds(awayLineupSaved.benchIds, awaySquadRaw, awayStartIds)
      : awaySquadRaw
          .filter(p => !awayStartIds.has(p.id) && p.injuryWeeksLeft === 0 && p.fitness > 30)
          .slice(0, 8)
          .map(p => ({ id: p.id, position: p.position, secondaryPosition: p.secondaryPosition, attributes: p.attributes, morale: p.morale, fitness: p.fitness }));

    const homeClub = await getClubById(db, playerFixture.homeClubId);
    const awayClub = await getClubById(db, playerFixture.awayClubId);

    const defaultTactic = {
      id: 0,
      clubId: playerClubId,
      name: 'Default',
      isActive: true,
      formation: '4-4-2' as const,
      mentality: 'balanced' as const,
      pressing: 'medium' as const,
      passingStyle: 'mixed' as const,
      tempo: 'normal' as const,
      width: 'normal' as const,
      attackFocus: 'balanced' as const,
      subStrategy: 'balanced' as const,
    };

    const matchResult = simulateMatch({
      fixtureId: playerFixture.id,
      homeSquad,
      awaySquad,
      homeBench,
      awayBench,
      homeTactic: homeTactic ?? defaultTactic,
      awayTactic: awayTactic ?? { ...defaultTactic, id: -1, clubId: playerFixture.awayClubId },
      homeClubReputation: homeClub?.reputation ?? 50,
      awayClubReputation: awayClub?.reputation ?? 50,
      rng,
    });

    // Persist result
    await updateFixtureResult(
      db,
      playerFixture.id,
      matchResult.homeGoals,
      matchResult.awayGoals,
      matchResult.attendance,
    );

    for (const event of matchResult.events) {
      await addMatchEvent(db, {
        fixtureId: playerFixture.id,
        minute: event.minute,
        type: event.type,
        playerId: event.playerId,
        secondaryPlayerId: event.secondaryPlayerId,
      });
    }

    playerMatchResult = matchResult;

    // Persist per-player stats for this real-engine match
    await persistMatchStats(db, playerFixture, matchResult);

    // 5. Apply player progression for player's squad (home or away)
    const playerSquadRaw =
      playerFixture.homeClubId === playerClubId ? homeSquadRaw : awaySquadRaw;
    const playerClubData = await getClubById(db, playerClubId);
    const trainingFacilityLevel = playerClubData?.trainingFacilities ?? 3;

    const playerClubPlayers = await getPlayersByClub(db, playerClubId);
    for (const p of playerSquadRaw) {
      const fullPlayer = playerClubPlayers.find(pl => pl.id === p.id);
      const progression = calculateWeeklyProgression({
        age: fullPlayer?.age ?? 25,
        attributes: p.attributes,
        effectivePotential: fullPlayer?.effectivePotential ?? 60,
        minutesPlayedRecent: 90,
        totalPossibleMinutes: 90,
        avgRatingRecent: 6.5,
        trainingFocus: 'balanced',
        trainingFacilityLevel,
      });

      // Apply attribute changes to DB
      const changes = progression.attributeChanges;
      const attrs = p.attributes;
      await db.prepare(
        `UPDATE player_attributes SET
          finishing = ?, passing = ?, crossing = ?, dribbling = ?, heading = ?,
          long_shots = ?, free_kicks = ?, vision = ?, composure = ?, decisions = ?,
          positioning = ?, aggression = ?, leadership = ?,
          pace = ?, stamina = ?, strength = ?, agility = ?, jumping = ?
         WHERE player_id = ?`,
      ).run(
        Math.round(Math.min(99, Math.max(1, attrs.finishing + (changes.finishing ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.passing + (changes.passing ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.crossing + (changes.crossing ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.dribbling + (changes.dribbling ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.heading + (changes.heading ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.longShots + (changes.longShots ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.freeKicks + (changes.freeKicks ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.vision + (changes.vision ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.composure + (changes.composure ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.decisions + (changes.decisions ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.positioning + (changes.positioning ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.aggression + (changes.aggression ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.leadership + (changes.leadership ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.pace + (changes.pace ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.stamina + (changes.stamina ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.strength + (changes.strength ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.agility + (changes.agility ?? 0)))),
        Math.round(Math.min(99, Math.max(1, attrs.jumping + (changes.jumping ?? 0)))),
        p.id,
      );
    }

    // 6. Update fitness for player's club squad
    const startingIds = new Set(homeSquad.concat(awaySquad).map(p => p.id));
    // Players in player's club who played vs those who rested
    const playerClubSquadIds = playerSquadRaw.map(p => p.id);
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
      await db.prepare('UPDATE players SET fitness = ? WHERE id = ?').run(newFitness, p.id);
    }
    void playerClubSquadIds; // used above via playerSquadRaw

    // 7. Recover existing injuries first (decrement), THEN apply this match's new
    // injuries — otherwise the freshly-set duration would be decremented in the
    // same week (gap-audit:163: injuries were cosmetic, never sidelining a player).
    await db.prepare(
      'UPDATE players SET injury_weeks_left = MAX(0, injury_weeks_left - 1) WHERE injury_weeks_left > 0 AND club_id = ?',
    ).run(playerClubId);

    const playerClubIds = new Set((await getPlayersByClub(db, playerClubId)).map(p => p.id));
    for (const inj of assignMatchInjuries(matchResult.events, playerClubIds, rng)) {
      await db.prepare('UPDATE players SET injury_weeks_left = ? WHERE id = ?').run(inj.weeksLeft, inj.playerId);
    }
  }

  // 3. Simulate other AI vs AI matches
  for (const fixture of fixtures) {
    if (fixture.id === playerFixture?.id) continue;
    const { homeGoals, awayGoals } = await simulateAiMatch(fixture, rng, db);
    await updateFixtureResult(db, fixture.id, homeGoals, awayGoals);
  }

  // 3b. Process AI transfers during transfer windows
  await processAiTransfers(db, season, week, rng);

  // 3c. AI clubs submit offers for the player's squad (in-window only)
  if (isTransferWindow(week)) {
    await generateAiOffersForPlayerClub(db, playerClubId, rng, season, week);
  }

  // 3d. Process pending offers submitted by the player (always, not gated by window)
  await processPendingOffers(db, season, week, playerClubId);

  // 3e. Expire stale offers (no response within 2 weeks) and prune old blocks
  await expireStaleOffers(db, season, week);
  await prunExpiredBlocks(db, season, week);

  // 4. Process weekly finances for player's club
  const playerClub = await getClubById(db, playerClubId);
  let updatedBudget = playerClub?.budget ?? 0;

  if (playerClub) {
    const players = await getPlayersByClub(db, playerClubId);
    const totalPlayerWages = players.reduce((sum, p) => sum + p.wage, 0);

    const staffList = await getStaffByClub(db, playerClubId);
    const totalStaffWages = staffList.reduce((sum, s) => sum + s.wage, 0);

    const hasHomeMatch = playerFixture?.homeClubId === playerClubId;
    // Use the persisted attendance from the played fixture when available so
    // ticket revenue reflects the real crowd, not just a rep-based estimate.
    const actualAttendance = hasHomeMatch ? (playerMatchResult?.attendance ?? playerFixture?.attendance ?? null) : null;

    const income = calculateWeeklyIncome({
      clubReputation: playerClub.reputation,
      stadiumCapacity: playerClub.stadiumCapacity,
      hasHomeMatch,
      leaguePosition: 1,
      season,
      week,
      actualAttendance,
    });

    const expenses = calculateWeeklyExpenses({
      totalPlayerWages,
      totalStaffWages,
      stadiumCapacity: playerClub.stadiumCapacity,
      trainingFacilities: playerClub.trainingFacilities,
      youthAcademy: playerClub.youthAcademy,
      medicalDepartment: playerClub.medicalDepartment,
    });

    // Add finance entries
    await addFinanceEntry(db, {
      clubId: playerClubId,
      season,
      week,
      type: 'tv',
      amount: income.tv,
      description: 'Weekly TV rights income',
    });

    await addFinanceEntry(db, {
      clubId: playerClubId,
      season,
      week,
      type: 'sponsor',
      amount: income.sponsor,
      description: 'Weekly sponsorship income',
    });

    if (hasHomeMatch && income.ticket > 0) {
      await addFinanceEntry(db, {
        clubId: playerClubId,
        season,
        week,
        type: 'ticket',
        amount: income.ticket,
        description: 'Home match ticket sales',
      });
    }

    await addFinanceEntry(db, {
      clubId: playerClubId,
      season,
      week,
      type: 'wages',
      amount: -expenses.wages,
      description: 'Weekly wages (players + staff)',
    });

    await addFinanceEntry(db, {
      clubId: playerClubId,
      season,
      week,
      type: 'maintenance',
      amount: -expenses.maintenance,
      description: 'Stadium and facility maintenance',
    });

    const totalIncome =
      income.tv + income.sponsor + (hasHomeMatch ? income.ticket : 0);
    const totalExpenses = expenses.wages + expenses.maintenance;
    updatedBudget = playerClub.budget + totalIncome - totalExpenses;

    // Monthly assistant wages (every 4 weeks)
    if (saveId >= 0 && week % 4 === 0) {
      const assistants = await getAssistantsBySave(db, saveId);
      let totalAssistantWages = 0;
      for (const a of assistants) {
        totalAssistantWages += a.wagePerMonth;
      }
      if (totalAssistantWages > 0) {
        await addFinanceEntry(db, {
          clubId: playerClubId,
          season,
          week,
          type: 'assistant_wage',
          amount: -totalAssistantWages,
          description: 'Monthly assistant staff wages',
        });
        updatedBudget -= totalAssistantWages;
      }
    }

    await updateClubBudget(db, playerClubId, updatedBudget);
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
      'SELECT id FROM players WHERE club_id IS NOT NULL AND will_retire_at_season_end = 1',
    ).all() as Array<{ id: number }>;
    for (const row of announced) {
      await retirePlayer(db, row.id);
      retiringPlayerIds.push(row.id);
    }

    // Compulsório (max_age) em todos os clubes, incluindo IA.
    const allPlayers = await db.prepare(
      'SELECT id, name, age, is_free_agent FROM players WHERE club_id IS NOT NULL',
    ).all() as Array<{ id: number; name: string; age: number; is_free_agent: number }>;
    const compulsory = detectCompulsoryRetirements(
      allPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        age: p.age,
        isFreeAgent: p.is_free_agent === 1,
      })),
    );
    for (const d of compulsory) {
      await retirePlayer(db, d.playerId);
      if (!retiringPlayerIds.includes(d.playerId)) retiringPlayerIds.push(d.playerId);
    }

    // Reset flag+streak pros remanescentes começarem a próxima temporada limpos.
    // Restrito a quem está em clube — aposentados (club_id=NULL) ficam fora da rotina ativa.
    await db.prepare(
      'UPDATE players SET will_retire_at_season_end = 0, consecutive_low_morale_weeks = 0 WHERE club_id IS NOT NULL',
    ).run();

    await archiveSeason(db, season);
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
