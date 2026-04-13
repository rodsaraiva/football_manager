import * as fs from 'fs';
import * as path from 'path';
import { SeededRng } from '../src/engine/rng';
import { Position, StaffRole, Formation, Mentality, Pressing, PassingStyle, Tempo, Width } from '../src/types';
import { LEAGUES, LeagueDef, TeamDef } from './data/leagues';
import { FIRST_NAMES, LAST_NAMES, NATIONALITIES_BY_COUNTRY } from './data/names';

// ─── Seed data output types ───────────────────────────────────────────────────

export interface SeedCountry {
  id: number;
  name: string;
  code: string;
  continent: string;
}

export interface SeedLeague {
  id: number;
  name: string;
  countryId: number;
  divisionLevel: number;
  numTeams: number;
  promotionSpots: number;
  relegationSpots: number;
}

export interface SeedClub {
  id: number;
  name: string;
  shortName: string;
  countryId: number;
  leagueId: number;
  reputation: number;
  budget: number;
  wageBudget: number;
  stadiumName: string;
  stadiumCapacity: number;
  trainingFacilities: number;
  youthAcademy: number;
  medicalDepartment: number;
  primaryColor: string;
  secondaryColor: string;
}

export interface SeedPlayer {
  id: number;
  name: string;
  nationality: string;
  age: number;
  position: Position;
  secondaryPosition: Position | null;
  clubId: number;
  wage: number;
  contractEnd: number;
  marketValue: number;
  basePotential: number;
  effectivePotential: number;
  morale: number;
  fitness: number;
  injuryWeeksLeft: number;
  isFreeAgent: boolean;
}

export interface SeedPlayerAttributes {
  playerId: number;
  finishing: number;
  passing: number;
  crossing: number;
  dribbling: number;
  heading: number;
  longShots: number;
  freeKicks: number;
  vision: number;
  composure: number;
  decisions: number;
  positioning: number;
  aggression: number;
  leadership: number;
  pace: number;
  stamina: number;
  strength: number;
  agility: number;
  jumping: number;
}

export interface SeedStaff {
  id: number;
  name: string;
  role: StaffRole;
  clubId: number;
  ability: number;
  wage: number;
  contractEnd: number;
}

export interface SeedTactic {
  id: number;
  clubId: number;
  name: string;
  isActive: boolean;
  formation: Formation;
  mentality: Mentality;
  pressing: Pressing;
  passingStyle: PassingStyle;
  tempo: Tempo;
  width: Width;
}

export interface SeedData {
  countries: SeedCountry[];
  leagues: SeedLeague[];
  clubs: SeedClub[];
  players: SeedPlayer[];
  playerAttributes: SeedPlayerAttributes[];
  staff: SeedStaff[];
  tactics: SeedTactic[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];

// Secondary positions map: for each primary position, the possible secondary positions
const SECONDARY_POSITION_MAP: Record<Position, Position[]> = {
  GK: [],
  CB: ['RB', 'LB', 'CDM'],
  LB: ['CB', 'LM', 'RB'],
  RB: ['CB', 'RM', 'LB'],
  CDM: ['CM', 'CB', 'CAM'],
  CM: ['CDM', 'CAM', 'LM', 'RM'],
  CAM: ['CM', 'LM', 'RM', 'LW', 'RW'],
  LM: ['LW', 'CM', 'LB', 'CAM'],
  RM: ['RW', 'CM', 'RB', 'CAM'],
  LW: ['LM', 'ST', 'CAM'],
  RW: ['RM', 'ST', 'CAM'],
  ST: ['LW', 'RW', 'CAM'],
};

// Squad template: [position, count]
// GK:3, DEF:7(CB3+LB2+RB2), MID:7(CDM2+CM2+CAM1+LM1+RM1), FWD:5(LW1+RW1+ST3) = 22 base
// We expand to 23-26 by adding extras, capped per group.
const SQUAD_TEMPLATE: Array<{ position: Position; count: number }> = [
  { position: 'GK', count: 3 },
  { position: 'CB', count: 3 },
  { position: 'LB', count: 2 },
  { position: 'RB', count: 2 },
  { position: 'CDM', count: 2 },
  { position: 'CM', count: 2 },
  { position: 'CAM', count: 1 },
  { position: 'LM', count: 1 },
  { position: 'RM', count: 1 },
  { position: 'LW', count: 1 },
  { position: 'RW', count: 1 },
  { position: 'ST', count: 3 },
];
// Total base: 22 players. We'll vary between 23-26 per club by adding extras.

const FORMATIONS: Formation[] = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-5-1'];
const MENTALITIES: Mentality[] = ['defensive', 'balanced', 'attacking'];
const PRESSINGS: Pressing[] = ['low', 'medium', 'high'];
const PASSING_STYLES: PassingStyle[] = ['short', 'mixed', 'direct'];
const TEMPOS: Tempo[] = ['slow', 'normal', 'fast'];
const WIDTHS: Width[] = ['narrow', 'normal', 'wide'];
const STAFF_ROLES: StaffRole[] = ['scout', 'physio', 'assistant', 'youth_coach', 'fitness_coach'];

// Age distribution weights: young(16-19), developing(20-23), prime(24-28), experienced(29-32), veteran(33-36)
const AGE_BANDS = [
  { min: 16, max: 19, weight: 12 },
  { min: 20, max: 23, weight: 23 },
  { min: 24, max: 28, weight: 35 },
  { min: 29, max: 32, weight: 20 },
  { min: 33, max: 36, weight: 10 },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickAge(rng: SeededRng): number {
  const weights = AGE_BANDS.map((b) => b.weight);
  const band = rng.weightedPick(AGE_BANDS, weights);
  return rng.nextInt(band.min, band.max);
}

function targetOverallForClub(reputation: number, rng: SeededRng, isStar: boolean): number {
  if (isStar) {
    if (reputation >= 85) return rng.nextInt(72, 80);
    return rng.nextInt(65, 74);
  }
  if (reputation >= 85) return rng.nextInt(60, 75);
  if (reputation >= 60) return rng.nextInt(52, 68);
  return rng.nextInt(44, 60);
}

/** Generate attributes for a player given target overall and position */
function generateAttributes(
  rng: SeededRng,
  targetOverall: number,
  position: Position,
  age: number,
): SeedPlayerAttributes {
  const base = targetOverall;
  const variance = 12;

  // Position-specific boosts — which attributes are primary for this position
  const boosts: Partial<Record<keyof Omit<SeedPlayerAttributes, 'playerId'>, number>> = {};

  switch (position) {
    case 'GK':
      // GKs use completely different scale — non-GK attrs are much lower
      break;
    case 'CB':
      boosts.heading = 8;
      boosts.strength = 8;
      boosts.aggression = 6;
      boosts.positioning = 6;
      boosts.jumping = 6;
      boosts.decisions = 4;
      break;
    case 'LB':
    case 'RB':
      boosts.crossing = 8;
      boosts.pace = 8;
      boosts.stamina = 6;
      boosts.agility = 5;
      boosts.positioning = 4;
      break;
    case 'CDM':
      boosts.strength = 6;
      boosts.aggression = 6;
      boosts.stamina = 7;
      boosts.positioning = 6;
      boosts.decisions = 5;
      break;
    case 'CM':
      boosts.passing = 8;
      boosts.vision = 7;
      boosts.stamina = 7;
      boosts.decisions = 6;
      break;
    case 'CAM':
      boosts.passing = 7;
      boosts.vision = 9;
      boosts.dribbling = 7;
      boosts.freeKicks = 5;
      boosts.longShots = 5;
      break;
    case 'LM':
    case 'RM':
      boosts.pace = 8;
      boosts.crossing = 8;
      boosts.stamina = 7;
      boosts.dribbling = 6;
      break;
    case 'LW':
    case 'RW':
      boosts.pace = 9;
      boosts.dribbling = 8;
      boosts.agility = 7;
      boosts.finishing = 5;
      break;
    case 'ST':
      boosts.finishing = 10;
      boosts.heading = 6;
      boosts.strength = 6;
      boosts.positioning = 7;
      boosts.composure = 6;
      break;
  }

  const attr = (boost: number = 0): number => {
    const raw = base + boost + rng.nextInt(-variance, variance);
    return clamp(raw, 1, 99);
  };

  if (position === 'GK') {
    // GK: physical and mental good, technical very low except composure/decisions
    const gkBase = base;
    return {
      playerId: 0,
      finishing: clamp(rng.nextInt(5, 25), 1, 99),
      passing: clamp(gkBase - 10 + rng.nextInt(-8, 8), 1, 99),
      crossing: clamp(rng.nextInt(5, 20), 1, 99),
      dribbling: clamp(rng.nextInt(5, 20), 1, 99),
      heading: clamp(gkBase - 5 + rng.nextInt(-8, 8), 1, 99),
      longShots: clamp(rng.nextInt(5, 20), 1, 99),
      freeKicks: clamp(rng.nextInt(5, 20), 1, 99),
      vision: clamp(gkBase - 5 + rng.nextInt(-6, 6), 1, 99),
      composure: clamp(gkBase + rng.nextInt(-6, 8), 1, 99),
      decisions: clamp(gkBase + rng.nextInt(-4, 8), 1, 99),
      positioning: clamp(gkBase + 6 + rng.nextInt(-6, 6), 1, 99),
      aggression: clamp(gkBase - 8 + rng.nextInt(-6, 6), 1, 99),
      leadership: clamp(gkBase + rng.nextInt(-8, 8), 1, 99),
      pace: clamp(gkBase - 10 + rng.nextInt(-8, 8), 1, 99),
      stamina: clamp(gkBase - 8 + rng.nextInt(-6, 6), 1, 99),
      strength: clamp(gkBase + rng.nextInt(-8, 8), 1, 99),
      agility: clamp(gkBase + 4 + rng.nextInt(-6, 6), 1, 99),
      jumping: clamp(gkBase + 8 + rng.nextInt(-6, 6), 1, 99),
    };
  }

  // Apply age penalty for veterans (smoothly reduce physical attrs)
  const agePenalty = age > 31 ? (age - 31) * 3 : 0;
  const ageBoostYoung = age < 21 ? (21 - age) * 2 : 0; // young players less physical strength

  return {
    playerId: 0,
    finishing: attr(boosts.finishing ?? 0),
    passing: attr(boosts.passing ?? 0),
    crossing: attr(boosts.crossing ?? 0),
    dribbling: attr(boosts.dribbling ?? 0),
    heading: attr((boosts.heading ?? 0) - ageBoostYoung),
    longShots: attr(boosts.longShots ?? 0),
    freeKicks: attr(boosts.freeKicks ?? 0),
    vision: attr(boosts.vision ?? 0),
    composure: attr((boosts.composure ?? 0) - ageBoostYoung),
    decisions: attr((boosts.decisions ?? 0) - ageBoostYoung / 2),
    positioning: attr(boosts.positioning ?? 0),
    aggression: attr(boosts.aggression ?? 0),
    leadership: attr(boosts.leadership ?? 0),
    pace: clamp(attr((boosts.pace ?? 0) - agePenalty), 1, 99),
    stamina: clamp(attr((boosts.stamina ?? 0) - agePenalty / 2), 1, 99),
    strength: attr((boosts.strength ?? 0) - ageBoostYoung),
    agility: clamp(attr((boosts.agility ?? 0) - agePenalty / 2), 1, 99),
    jumping: attr(boosts.jumping ?? 0),
  };
}

function computeMarketValue(age: number, overall: number, potential: number): number {
  // Base value in thousands
  const ageMultiplier = age <= 24 ? 1.5 : age <= 28 ? 1.2 : age <= 31 ? 0.9 : 0.5;
  const potentialBonus = (potential - overall) * 0.3;
  const base = Math.pow(overall / 50, 2.5) * 5000;
  return Math.round(base * ageMultiplier * (1 + potentialBonus / 100) * 1000);
}

function computeWage(overall: number, reputation: number): number {
  const repFactor = reputation / 100;
  const base = Math.pow(overall / 50, 2) * 1000;
  return Math.round(base * (0.5 + repFactor) * 10) * 10;
}

function computePotential(rng: SeededRng, age: number, overall: number): number {
  if (age <= 19) {
    // Young players have high growth potential
    return clamp(overall + rng.nextInt(8, 22), overall, 99);
  } else if (age <= 22) {
    return clamp(overall + rng.nextInt(4, 16), overall, 99);
  } else if (age <= 26) {
    return clamp(overall + rng.nextInt(0, 8), overall, 99);
  } else {
    // Older players at their peak/declining
    return clamp(overall + rng.nextInt(-2, 4), 1, 99);
  }
}

function generatePlayerName(rng: SeededRng, nationality: string): string {
  const firstNames = FIRST_NAMES[nationality] ?? FIRST_NAMES['English'];
  const lastNames = LAST_NAMES[nationality] ?? LAST_NAMES['English'];
  const first = rng.pick(firstNames);
  const last = rng.pick(lastNames);
  return `${first} ${last}`;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateSeedData(seed: number): SeedData {
  const rng = new SeededRng(seed);

  const countries: SeedCountry[] = [];
  const leagues: SeedLeague[] = [];
  const clubs: SeedClub[] = [];
  const players: SeedPlayer[] = [];
  const playerAttributes: SeedPlayerAttributes[] = [];
  const staff: SeedStaff[] = [];
  const tactics: SeedTactic[] = [];

  let countryId = 1;
  let leagueId = 1;
  let clubId = 1;
  let playerId = 1;
  let staffId = 1;
  let tacticId = 1;

  // Build country → id map
  const countryIdMap: Record<string, number> = {};

  for (const leagueDef of LEAGUES) {
    const cId = countryId++;
    countryIdMap[leagueDef.countryCode] = cId;

    countries.push({
      id: cId,
      name: leagueDef.country,
      code: leagueDef.countryCode,
      continent: 'Europe',
    });

    const lId = leagueId++;
    leagues.push({
      id: lId,
      name: leagueDef.name,
      countryId: cId,
      divisionLevel: 1,
      numTeams: leagueDef.teams.length,
      promotionSpots: 0,
      relegationSpots: 3,
    });

    for (const teamDef of leagueDef.teams) {
      const cCode = leagueDef.countryCode;
      const rep = teamDef.reputation;
      const cIdClub = clubId++;

      // Club facilities scale with reputation
      const facilityBase = Math.round(rep / 10);
      const trainingFacilities = clamp(facilityBase + rng.nextInt(-1, 1), 1, 10);
      const youthAcademy = clamp(facilityBase + rng.nextInt(-1, 1), 1, 10);
      const medicalDepartment = clamp(facilityBase + rng.nextInt(-1, 1), 1, 10);

      // Budget scales with reputation
      const budgetBase = Math.pow(rep / 100, 2) * 200_000_000;
      const budget = Math.round(budgetBase * rng.nextFloat(0.8, 1.2));
      const wageBudget = Math.round(budget * 0.15);

      clubs.push({
        id: cIdClub,
        name: teamDef.name,
        shortName: teamDef.shortName,
        countryId: countryIdMap[cCode],
        leagueId: lId,
        reputation: rep,
        budget,
        wageBudget,
        stadiumName: teamDef.stadiumName,
        stadiumCapacity: teamDef.stadiumCapacity,
        trainingFacilities,
        youthAcademy,
        medicalDepartment,
        primaryColor: teamDef.primaryColor,
        secondaryColor: teamDef.secondaryColor,
      });

      // ── Generate players ──────────────────────────────────────────────────

      // Determine squad size 23-26
      const squadSize = rng.nextInt(23, 26);

      // Expand the template to a list of positions, then adjust to hit squadSize
      const positionList: Position[] = [];
      for (const { position, count } of SQUAD_TEMPLATE) {
        for (let i = 0; i < count; i++) {
          positionList.push(position);
        }
      }
      // Base template has 22. Add extras to reach squadSize (23-26).
      // We must stay within: DEF≤8, MID≤9, FWD≤6
      while (positionList.length < squadSize) {
        const curDefs = positionList.filter((p) => ['CB', 'LB', 'RB'].includes(p)).length;
        const curMids = positionList.filter((p) => ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p)).length;
        const curFwds = positionList.filter((p) => ['LW', 'RW', 'ST'].includes(p)).length;

        // Build allowed extras based on current counts
        const allowed: Position[] = [];
        if (curDefs < 8) allowed.push('CB', 'LB', 'RB');
        if (curMids < 9) allowed.push('CM', 'CDM', 'CAM');
        if (curFwds < 6) allowed.push('ST');

        if (allowed.length > 0) {
          positionList.push(rng.pick(allowed));
        } else {
          break; // safety: can't add without violating limits
        }
      }
      // Safety trim if somehow over
      while (positionList.length > squadSize) {
        const removableMid = positionList.findIndex(
          (p) => ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p),
        );
        if (removableMid !== -1) positionList.splice(removableMid, 1);
        else positionList.pop();
      }

      // Determine number of star players
      let numStars = 0;
      if (rep >= 85) numStars = rng.nextInt(3, 4);
      else if (rep >= 60) numStars = rng.nextInt(1, 2);
      else numStars = rng.nextInt(0, 1);

      const starIndices = new Set<number>();
      while (starIndices.size < numStars && starIndices.size < positionList.length) {
        // Stars tend to be forwards/attackers but can be anywhere
        const idx = rng.nextInt(0, positionList.length - 1);
        starIndices.add(idx);
      }

      const natConfig = NATIONALITIES_BY_COUNTRY[cCode];

      for (let i = 0; i < positionList.length; i++) {
        const position = positionList[i];
        const isStar = starIndices.has(i);

        // Nationality: 65% local, 35% foreign
        const isLocal = rng.next() < 0.65;
        const nationality = isLocal
          ? natConfig.primary
          : rng.pick(natConfig.secondary);

        const age = pickAge(rng);
        const targetOverall = targetOverallForClub(rep, rng, isStar);

        // Young players (16-22) get reduced current stats but higher potential
        const youthPenalty = age <= 22 ? (22 - age) * 2.5 : 0;
        const effectiveOverall = clamp(Math.round(targetOverall - youthPenalty), 30, 99);

        const potential = computePotential(rng, age, effectiveOverall);

        const name = generatePlayerName(rng, nationality);

        // Secondary position (40% chance, not for GKs)
        let secondaryPosition: Position | null = null;
        if (position !== 'GK' && rng.next() < 0.4) {
          const secondaries = SECONDARY_POSITION_MAP[position];
          if (secondaries.length > 0) {
            secondaryPosition = rng.pick(secondaries);
          }
        }

        const wage = computeWage(effectiveOverall, rep);
        const marketValue = computeMarketValue(age, effectiveOverall, potential);
        const contractEnd = 2025 + rng.nextInt(1, 5); // season years

        const pid = playerId++;

        players.push({
          id: pid,
          name,
          nationality,
          age,
          position,
          secondaryPosition,
          clubId: cIdClub,
          wage,
          contractEnd,
          marketValue,
          basePotential: potential,
          effectivePotential: potential,
          morale: rng.nextInt(60, 100),
          fitness: rng.nextInt(70, 100),
          injuryWeeksLeft: 0,
          isFreeAgent: false,
        });

        const attrs = generateAttributes(rng, effectiveOverall, position, age);
        attrs.playerId = pid;
        playerAttributes.push(attrs);
      }

      // ── Generate staff ────────────────────────────────────────────────────

      const staffCount = rng.nextInt(3, 5);
      const shuffledRoles = rng.shuffle([...STAFF_ROLES]).slice(0, staffCount);

      for (const role of shuffledRoles) {
        const abilityBase = Math.round((rep / 100) * 80) + rng.nextInt(-10, 10);
        const ability = clamp(abilityBase, 20, 99);
        const staffWage = Math.round(ability * 100 * rng.nextFloat(0.8, 1.2));
        const staffNationality = rng.next() < 0.7 ? natConfig.primary : rng.pick(natConfig.secondary);
        const staffName = generatePlayerName(rng, staffNationality);

        staff.push({
          id: staffId++,
          name: staffName,
          role,
          clubId: cIdClub,
          ability,
          wage: Math.round(staffWage / 100) * 100,
          contractEnd: 2025 + rng.nextInt(1, 4),
        });
      }

      // ── Generate tactic ───────────────────────────────────────────────────

      const formation = rng.pick(FORMATIONS);
      const mentality = rng.pick(MENTALITIES);
      const pressing = rng.pick(PRESSINGS);
      const passingStyle = rng.pick(PASSING_STYLES);
      const tempo = rng.pick(TEMPOS);
      const width = rng.pick(WIDTHS);

      tactics.push({
        id: tacticId++,
        clubId: cIdClub,
        name: `${teamDef.shortName} Default`,
        isActive: true,
        formation,
        mentality,
        pressing,
        passingStyle,
        tempo,
        width,
      });
    }
  }

  return {
    countries,
    leagues,
    clubs,
    players,
    playerAttributes,
    staff,
    tactics,
  };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const seed = parseInt(process.argv[2] ?? '42', 10);
  console.log(`Generating seed data with seed=${seed}...`);

  const data = generateSeedData(seed);

  const outputDir = path.join(__dirname, '..', 'assets', 'seed');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files: Array<{ name: string; data: unknown }> = [
    { name: 'countries.json', data: data.countries },
    { name: 'leagues.json', data: data.leagues },
    { name: 'clubs.json', data: data.clubs },
    { name: 'players.json', data: data.players },
    { name: 'player_attributes.json', data: data.playerAttributes },
    { name: 'staff.json', data: data.staff },
    { name: 'tactics.json', data: data.tactics },
  ];

  for (const file of files) {
    const filePath = path.join(outputDir, file.name);
    fs.writeFileSync(filePath, JSON.stringify(file.data, null, 2), 'utf-8');
    console.log(`  Wrote ${filePath} (${(file.data as unknown[]).length} records)`);
  }

  console.log(`\nDone! Summary:`);
  console.log(`  Countries: ${data.countries.length}`);
  console.log(`  Leagues:   ${data.leagues.length}`);
  console.log(`  Clubs:     ${data.clubs.length}`);
  console.log(`  Players:   ${data.players.length}`);
  console.log(`  Staff:     ${data.staff.length}`);
  console.log(`  Tactics:   ${data.tactics.length}`);
}
