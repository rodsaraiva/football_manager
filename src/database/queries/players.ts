import { Player, PlayerAttributes, Position, Foot } from '@/types';

export interface DbHandle {
  prepare(sql: string): {
    all(...params: unknown[]): Promise<unknown[]>;
    get(...params: unknown[]): Promise<unknown>;
    run(...params: unknown[]): Promise<{ lastInsertRowid: number | bigint } | void>;
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
  preferred_foot: string;
  weak_foot_ability: number;
  is_transfer_listed: number;
  is_loan_listed: number;
  asking_price: number | null;
  loan_wage_share: number | null;
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
    clubId: row.club_id == null ? null : Number(row.club_id),
    wage: row.wage,
    contractEnd: row.contract_end,
    marketValue: row.market_value,
    basePotential: row.base_potential,
    effectivePotential: row.effective_potential,
    morale: row.morale,
    fitness: row.fitness,
    injuryWeeksLeft: row.injury_weeks_left,
    isFreeAgent: row.is_free_agent === 1,
    preferredFoot: (row.preferred_foot === 'left' ? 'left' : 'right') as Foot,
    weakFootAbility: row.weak_foot_ability ?? 3,
    isTransferListed: row.is_transfer_listed === 1,
    isLoanListed: row.is_loan_listed === 1,
    askingPrice: row.asking_price ?? null,
    loanWageShare: row.loan_wage_share ?? null,
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

export async function getPlayersByClub(db: DbHandle, clubId: number): Promise<Player[]> {
  const rows = await db
    .prepare('SELECT * FROM players WHERE club_id = ?')
    .all(clubId) as PlayerRow[];
  return rows.map(rowToPlayer);
}

export async function getPlayersWithAttributesByClub(
  db: DbHandle,
  clubId: number,
): Promise<(Player & { attributes: PlayerAttributes })[]> {
  const playerRows = await db
    .prepare('SELECT * FROM players WHERE club_id = ?')
    .all(clubId) as PlayerRow[];
  if (playerRows.length === 0) return [];
  const attrRows = await db
    .prepare('SELECT * FROM player_attributes WHERE player_id IN (' + playerRows.map(() => '?').join(',') + ')')
    .all(...playerRows.map((p) => p.id)) as PlayerAttributesRow[];
  const attrsById = new Map(attrRows.map((a) => [a.player_id, rowToAttributes(a)]));
  return playerRows
    .filter((p) => attrsById.has(p.id))
    .map((p) => ({ ...rowToPlayer(p), attributes: attrsById.get(p.id)! }));
}

export async function getPlayerById(
  db: DbHandle,
  playerId: number,
): Promise<(Player & { attributes: PlayerAttributes }) | null> {
  const playerRow = await db
    .prepare('SELECT * FROM players WHERE id = ?')
    .get(playerId) as PlayerRow | undefined;

  if (!playerRow) return null;

  const attrRow = await db
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

export async function searchPlayers(db: DbHandle, filters: SearchPlayersFilters): Promise<Player[]> {
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
  const rows = await db.prepare(sql).all(...params) as PlayerRow[];
  return rows.map(rowToPlayer);
}

export async function updatePlayerMorale(db: DbHandle, playerId: number, morale: number): Promise<void> {
  await db.prepare('UPDATE players SET morale = ? WHERE id = ?').run(morale, playerId);
}

export async function getFreeAgents(db: DbHandle): Promise<Player[]> {
  const rows = await db
    .prepare('SELECT * FROM players WHERE is_free_agent = 1')
    .all() as PlayerRow[];
  return rows.map(rowToPlayer);
}

export async function getFreeAgentsWithAttributes(
  db: DbHandle,
): Promise<(Player & { attributes: PlayerAttributes })[]> {
  const playerRows = await db
    .prepare('SELECT * FROM players WHERE is_free_agent = 1')
    .all() as PlayerRow[];
  if (playerRows.length === 0) return [];
  const attrRows = await db
    .prepare('SELECT * FROM player_attributes WHERE player_id IN (' + playerRows.map(() => '?').join(',') + ')')
    .all(...playerRows.map((p) => p.id)) as PlayerAttributesRow[];
  const attrsById = new Map(attrRows.map((a) => [a.player_id, rowToAttributes(a)]));
  return playerRows
    .filter((p) => attrsById.has(p.id))
    .map((p) => ({ ...rowToPlayer(p), attributes: attrsById.get(p.id)! }));
}

export async function setTransferListing(
  db: DbHandle,
  playerId: number,
  listed: boolean,
  askingPrice: number | null,
): Promise<void> {
  await db
    .prepare('UPDATE players SET is_transfer_listed = ?, asking_price = ? WHERE id = ?')
    .run(listed ? 1 : 0, listed ? askingPrice : null, playerId);
}

export async function setLoanListing(
  db: DbHandle,
  playerId: number,
  listed: boolean,
  loanWageShare: number | null,
): Promise<void> {
  await db
    .prepare('UPDATE players SET is_loan_listed = ?, loan_wage_share = ? WHERE id = ?')
    .run(listed ? 1 : 0, listed ? loanWageShare : null, playerId);
}

// v0.1: sem coluna `is_retired` pra evitar migration agora; o par
// (club_id=NULL, is_free_agent=0) funciona como marker implícito — jogador
// some das queries atuais e se distingue de free agent (is_free_agent=1).
export async function retirePlayer(db: DbHandle, playerId: number): Promise<void> {
  await db
    .prepare(
      'UPDATE players SET club_id = NULL, is_free_agent = 0, contract_end = 0, wage = 0, is_transfer_listed = 0, is_loan_listed = 0 WHERE id = ?',
    )
    .run(playerId);
}

export async function getListedPlayers(
  db: DbHandle,
  mode: 'transfer' | 'loan' | 'any',
): Promise<Player[]> {
  const where =
    mode === 'transfer' ? 'is_transfer_listed = 1' :
    mode === 'loan'     ? 'is_loan_listed = 1' :
    '(is_transfer_listed = 1 OR is_loan_listed = 1)';
  const rows = await db
    .prepare(`SELECT * FROM players WHERE ${where}`)
    .all() as PlayerRow[];
  return rows.map(rowToPlayer);
}
