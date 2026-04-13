import { DbHandle } from '@/database/queries/players';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import {
  getFixturesByWeek,
  updateFixtureResult,
  addMatchEvent,
} from '@/database/queries/fixtures';
import { getClubById, updateClubBudget } from '@/database/queries/clubs';
import { getActiveTactic } from '@/database/queries/tactics';
import { addFinanceEntry } from '@/database/queries/finances';
import { updateSaveWeek } from '@/database/queries/saves';
import { getStaffByClub } from '@/database/queries/staff';
import { SeededRng } from './rng';
import { simulateMatch, MatchResult } from './simulation/match-engine';
import { PlayerForStrength } from './simulation/team-strength';
import { calculateWeeklyIncome, calculateWeeklyExpenses } from './finance/finance-engine';
import { calculateWeeklyProgression } from './training/progression';
import { calculateOverall } from '@/utils/overall';
import { Position, PlayerAttributes } from '@/types';
import { Fixture } from '@/types';

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
}

// ─── Formation helpers ────────────────────────────────────────────────────────

function formationToSlots(formation: string): Position[] {
  const parts = formation.split('-').map(Number);
  const slots: Position[] = ['GK'];

  if (parts.length === 3) {
    const [def, mid, fwd] = parts;
    // Defenders
    if (def === 3) slots.push('CB', 'CB', 'CB');
    else if (def === 4) slots.push('CB', 'CB', 'LB', 'RB');
    else if (def === 5) slots.push('CB', 'CB', 'CB', 'LB', 'RB');
    // Midfielders
    if (mid === 3) slots.push('CM', 'CM', 'CM');
    else if (mid === 4) slots.push('CM', 'CM', 'LM', 'RM');
    else if (mid === 5) slots.push('CDM', 'CM', 'CM', 'LM', 'RM');
    // Forwards
    if (fwd === 1) slots.push('ST');
    else if (fwd === 2) slots.push('ST', 'ST');
    else if (fwd === 3) slots.push('LW', 'ST', 'RW');
  } else if (parts.length === 4) {
    const [def, dmid, amid, fwd] = parts;
    if (def === 4) slots.push('CB', 'CB', 'LB', 'RB');
    else if (def === 3) slots.push('CB', 'CB', 'CB');
    slots.push(...Array(dmid).fill('CDM') as Position[]);
    if (amid === 3) slots.push('CAM', 'LM', 'RM');
    else if (amid === 4) slots.push('CAM', 'CM', 'LM', 'RM');
    if (fwd === 1) slots.push('ST');
    else if (fwd === 2) slots.push('ST', 'ST');
  }

  while (slots.length < 11) slots.push('CM');
  return slots.slice(0, 11);
}

interface PlayerForPick {
  id: number;
  position: Position;
  secondaryPosition: Position | null;
  attributes: PlayerAttributes;
  morale: number;
  fitness: number;
  injuryWeeksLeft: number;
}

function pickStartingEleven(players: PlayerForPick[], formation: string): PlayerForStrength[] {
  const slots = formationToSlots(formation);
  const selected = new Set<number>();
  const eleven: PlayerForStrength[] = [];

  for (const slot of slots) {
    const candidates = players
      .filter(p => !selected.has(p.id) && p.fitness > 30 && p.injuryWeeksLeft === 0)
      .map(p => ({
        player: p,
        score:
          calculateOverall(p.attributes, slot) +
          (p.position === slot ? 5 : p.secondaryPosition === slot ? 2 : 0),
      }))
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

function simulateAiMatch(
  fixture: Fixture,
  rng: SeededRng,
  db: DbHandle,
): { homeGoals: number; awayGoals: number } {
  const home = getClubById(db, fixture.homeClubId);
  const away = getClubById(db, fixture.awayClubId);
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

function loadSquadWithAttributes(db: DbHandle, clubId: number): PlayerForPick[] {
  const players = getPlayersByClub(db, clubId);
  const result: PlayerForPick[] = [];
  for (const p of players) {
    const full = getPlayerById(db, p.id);
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

// ─── Main function ────────────────────────────────────────────────────────────

export function advanceGameWeek(params: AdvanceWeekParams): AdvanceWeekResult {
  const { dbHandle: db, season, week, playerClubId, saveId, rng } = params;

  // 1. Get fixtures for this week
  const fixtures = getFixturesByWeek(db, season, week);

  // 2. Simulate the player's match with the real engine
  let playerMatchResult: MatchResult | null = null;
  const playerFixture = fixtures.find(
    f => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
  );

  if (playerFixture) {
    const homeSquadRaw = loadSquadWithAttributes(db, playerFixture.homeClubId);
    const awaySquadRaw = loadSquadWithAttributes(db, playerFixture.awayClubId);

    const homeTactic = getActiveTactic(db, playerFixture.homeClubId);
    const awayTactic = getActiveTactic(db, playerFixture.awayClubId);

    const homeFormation = homeTactic?.formation ?? '4-4-2';
    const awayFormation = awayTactic?.formation ?? '4-4-2';

    const homeSquad = pickStartingEleven(homeSquadRaw, homeFormation);
    const awaySquad = pickStartingEleven(awaySquadRaw, awayFormation);

    const homeClub = getClubById(db, playerFixture.homeClubId);
    const awayClub = getClubById(db, playerFixture.awayClubId);

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
    };

    const matchResult = simulateMatch({
      fixtureId: playerFixture.id,
      homeSquad,
      awaySquad,
      homeTactic: homeTactic ?? defaultTactic,
      awayTactic: awayTactic ?? { ...defaultTactic, id: -1, clubId: playerFixture.awayClubId },
      homeClubReputation: homeClub?.reputation ?? 50,
      awayClubReputation: awayClub?.reputation ?? 50,
      rng,
    });

    // Persist result
    updateFixtureResult(
      db,
      playerFixture.id,
      matchResult.homeGoals,
      matchResult.awayGoals,
      matchResult.attendance,
    );

    for (const event of matchResult.events) {
      addMatchEvent(db, {
        fixtureId: playerFixture.id,
        minute: event.minute,
        type: event.type,
        playerId: event.playerId,
        secondaryPlayerId: event.secondaryPlayerId,
      });
    }

    playerMatchResult = matchResult;

    // 5. Apply player progression for player's squad (home or away)
    const playerSquadRaw =
      playerFixture.homeClubId === playerClubId ? homeSquadRaw : awaySquadRaw;
    const playerClubData = getClubById(db, playerClubId);
    const trainingFacilityLevel = playerClubData?.trainingFacilities ?? 3;

    for (const p of playerSquadRaw) {
      const progression = calculateWeeklyProgression({
        age: (() => {
          const fullPlayer = getPlayersByClub(db, playerClubId).find(pl => pl.id === p.id);
          return fullPlayer?.age ?? 25;
        })(),
        attributes: p.attributes,
        effectivePotential: (() => {
          const fullPlayer = getPlayersByClub(db, playerClubId).find(pl => pl.id === p.id);
          return fullPlayer?.effectivePotential ?? 60;
        })(),
        minutesPlayedRecent: 90,
        totalPossibleMinutes: 90,
        avgRatingRecent: 6.5,
        trainingFocus: 'balanced',
        trainingFacilityLevel,
      });

      // Apply attribute changes to DB
      const changes = progression.attributeChanges;
      const attrs = p.attributes;
      db.prepare(
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
      db.prepare('UPDATE players SET fitness = ? WHERE id = ?').run(newFitness, p.id);
    }
    void playerClubSquadIds; // used above via playerSquadRaw

    // 7. Update injuries for player's club
    db.prepare(
      'UPDATE players SET injury_weeks_left = MAX(0, injury_weeks_left - 1) WHERE injury_weeks_left > 0 AND club_id = ?',
    ).run(playerClubId);
  }

  // 3. Simulate other AI vs AI matches
  for (const fixture of fixtures) {
    if (fixture.id === playerFixture?.id) continue;
    const { homeGoals, awayGoals } = simulateAiMatch(fixture, rng, db);
    updateFixtureResult(db, fixture.id, homeGoals, awayGoals);
  }

  // 4. Process weekly finances for player's club
  const playerClub = getClubById(db, playerClubId);
  let updatedBudget = playerClub?.budget ?? 0;

  if (playerClub) {
    const players = getPlayersByClub(db, playerClubId);
    const totalPlayerWages = players.reduce((sum, p) => sum + p.wage, 0);

    const staffList = getStaffByClub(db, playerClubId);
    const totalStaffWages = staffList.reduce((sum, s) => sum + s.wage, 0);

    const hasHomeMatch = playerFixture?.homeClubId === playerClubId;

    const income = calculateWeeklyIncome({
      clubReputation: playerClub.reputation,
      stadiumCapacity: playerClub.stadiumCapacity,
      hasHomeMatch,
      leaguePosition: 1,
      season,
      week,
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
    addFinanceEntry(db, {
      clubId: playerClubId,
      season,
      week,
      type: 'tv',
      amount: income.tv,
      description: 'Weekly TV rights income',
    });

    addFinanceEntry(db, {
      clubId: playerClubId,
      season,
      week,
      type: 'sponsor',
      amount: income.sponsor,
      description: 'Weekly sponsorship income',
    });

    if (hasHomeMatch && income.ticket > 0) {
      addFinanceEntry(db, {
        clubId: playerClubId,
        season,
        week,
        type: 'ticket',
        amount: income.ticket,
        description: 'Home match ticket sales',
      });
    }

    addFinanceEntry(db, {
      clubId: playerClubId,
      season,
      week,
      type: 'wages',
      amount: -expenses.wages,
      description: 'Weekly wages (players + staff)',
    });

    addFinanceEntry(db, {
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
    updateClubBudget(db, playerClubId, updatedBudget);
  }

  // 8. Advance week
  const isSeasonEnd = week >= 46;
  const newWeek = isSeasonEnd ? 1 : week + 1;
  const newSeason = isSeasonEnd ? season + 1 : season;

  // Update save if valid saveId
  if (saveId >= 0) {
    updateSaveWeek(db, saveId, newSeason, newWeek);
  }

  return {
    newSeason,
    newWeek,
    isSeasonEnd,
    playerMatchResult,
    updatedBudget,
  };
}
