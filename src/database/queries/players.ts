import { Player, PlayerAttributes, Position } from '@/types';

export interface DbHandle {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { lastInsertRowid: number | bigint } | void;
  };
}

interface PlayerRow {
  id: number;
  name: string;
  nationality: string;
  age: number;
  position: string;
  secondary_position: string | null;
  club_id: number | null;
  wage: number;
  contract_end: number;
  market_value: number;
  base_potential: number;
  effective_potential: number;
  morale: number;
  fitness: number;
  injury_weeks_left: number;
  is_free_agent: number;
}

interface PlayerAttributesRow {
  player_id: number;
  finishing: number;
  passing: number;
  crossing: number;
  dribbling: number;
  heading: number;
  long_shots: number;
  free_kicks: number;
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

function rowToPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    nationality: row.nationality,
    age: row.age,
    position: row.position as Position,
    secondaryPosition: row.secondary_position as Position | null,
    clubId: row.club_id as number,
    wage: row.wage,
    contractEnd: row.contract_end,
    marketValue: row.market_value,
    basePotential: row.base_potential,
    effectivePotential: row.effective_potential,
    morale: row.morale,
    fitness: row.fitness,
    injuryWeeksLeft: row.injury_weeks_left,
    isFreeAgent: row.is_free_agent === 1,
  };
}

function rowToAttributes(row: PlayerAttributesRow): PlayerAttributes {
  return {
    finishing: row.finishing,
    passing: row.passing,
    crossing: row.crossing,
    dribbling: row.dribbling,
    heading: row.heading,
    longShots: row.long_shots,
    freeKicks: row.free_kicks,
    vision: row.vision,
    composure: row.composure,
    decisions: row.decisions,
    positioning: row.positioning,
    aggression: row.aggression,
    leadership: row.leadership,
    pace: row.pace,
    stamina: row.stamina,
    strength: row.strength,
    agility: row.agility,
    jumping: row.jumping,
  };
}

export function getPlayersByClub(db: DbHandle, clubId: number): Player[] {
  const rows = db
    .prepare('SELECT * FROM players WHERE club_id = ?')
    .all(clubId) as PlayerRow[];
  return rows.map(rowToPlayer);
}

export function getPlayerById(
  db: DbHandle,
  playerId: number,
): (Player & { attributes: PlayerAttributes }) | null {
  const playerRow = db
    .prepare('SELECT * FROM players WHERE id = ?')
    .get(playerId) as PlayerRow | undefined;

  if (!playerRow) return null;

  const attrRow = db
    .prepare('SELECT * FROM player_attributes WHERE player_id = ?')
    .get(playerId) as PlayerAttributesRow | undefined;

  if (!attrRow) return null;

  return {
    ...rowToPlayer(playerRow),
    attributes: rowToAttributes(attrRow),
  };
}

export interface SearchPlayersFilters {
  position?: Position;
  minAge?: number;
  maxAge?: number;
  clubId?: number;
  maxWage?: number;
}

export function searchPlayers(db: DbHandle, filters: SearchPlayersFilters): Player[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.position !== undefined) {
    conditions.push('position = ?');
    params.push(filters.position);
  }
  if (filters.minAge !== undefined) {
    conditions.push('age >= ?');
    params.push(filters.minAge);
  }
  if (filters.maxAge !== undefined) {
    conditions.push('age <= ?');
    params.push(filters.maxAge);
  }
  if (filters.clubId !== undefined) {
    conditions.push('club_id = ?');
    params.push(filters.clubId);
  }
  if (filters.maxWage !== undefined) {
    conditions.push('wage <= ?');
    params.push(filters.maxWage);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM players ${where}`;
  const rows = db.prepare(sql).all(...params) as PlayerRow[];
  return rows.map(rowToPlayer);
}

export function updatePlayerMorale(db: DbHandle, playerId: number, morale: number): void {
  db.prepare('UPDATE players SET morale = ? WHERE id = ?').run(morale, playerId);
}

export function getFreeAgents(db: DbHandle): Player[] {
  const rows = db
    .prepare('SELECT * FROM players WHERE is_free_agent = 1')
    .all() as PlayerRow[];
  return rows.map(rowToPlayer);
}
