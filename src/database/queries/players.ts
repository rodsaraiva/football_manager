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
  loan_wage: number | null;
  consecutive_low_morale_weeks: number;
  will_retire_at_season_end: number;
  suspension_weeks_left: number;
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
    suspensionWeeksLeft: row.suspension_weeks_left ?? 0,
    isFreeAgent: row.is_free_agent === 1,
    preferredFoot: (row.preferred_foot === 'left' ? 'left' : 'right') as Foot,
    weakFootAbility: row.weak_foot_ability ?? 3,
    isTransferListed: row.is_transfer_listed === 1,
    isLoanListed: row.is_loan_listed === 1,
    askingPrice: row.asking_price ?? null,
    loanWageShare: row.loan_wage_share ?? null,
    loanWage: row.loan_wage ?? null,
    consecutiveLowMoraleWeeks: row.consecutive_low_morale_weeks ?? 0,
    willRetireAtSeasonEnd: (row.will_retire_at_season_end ?? 0) === 1,
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

export async function getPlayersByClub(db: DbHandle, saveId: number, clubId: number): Promise<Player[]> {
  // Defensive guard: a freed player (is_free_agent=1) must never count as squad,
  // even if a buggy path left club_id intact (economy-depth wage-bleed fix).
  const rows = await db
    .prepare('SELECT * FROM players WHERE save_id = ? AND club_id = ? AND is_free_agent = 0')
    .all(saveId, clubId) as PlayerRow[];
  return rows.map(rowToPlayer);
}

export async function getPlayersWithAttributesByClub(
  db: DbHandle,
  saveId: number,
  clubId: number,
): Promise<(Player & { attributes: PlayerAttributes })[]> {
  const playerRows = await db
    .prepare('SELECT * FROM players WHERE save_id = ? AND club_id = ?')
    .all(saveId, clubId) as PlayerRow[];
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
  saveId: number,
  playerId: number,
): Promise<(Player & { attributes: PlayerAttributes }) | null> {
  const playerRow = await db
    .prepare('SELECT * FROM players WHERE save_id = ? AND id = ?')
    .get(saveId, playerId) as PlayerRow | undefined;

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

export async function searchPlayers(db: DbHandle, saveId: number, filters: SearchPlayersFilters): Promise<Player[]> {
  const conditions: string[] = ['save_id = ?'];
  const params: unknown[] = [saveId];

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

  const sql = `SELECT * FROM players WHERE ${conditions.join(' AND ')}`;
  const rows = await db.prepare(sql).all(...params) as PlayerRow[];
  return rows.map(rowToPlayer);
}

export async function updatePlayerMorale(db: DbHandle, saveId: number, playerId: number, morale: number): Promise<void> {
  await db.prepare('UPDATE players SET morale = ? WHERE save_id = ? AND id = ?').run(morale, saveId, playerId);
}

export async function getFreeAgents(db: DbHandle, saveId: number): Promise<Player[]> {
  const rows = await db
    .prepare('SELECT * FROM players WHERE save_id = ? AND is_free_agent = 1')
    .all(saveId) as PlayerRow[];
  return rows.map(rowToPlayer);
}

export async function getFreeAgentsWithAttributes(
  db: DbHandle,
  saveId: number,
): Promise<(Player & { attributes: PlayerAttributes })[]> {
  const playerRows = await db
    .prepare('SELECT * FROM players WHERE save_id = ? AND is_free_agent = 1')
    .all(saveId) as PlayerRow[];
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
  saveId: number,
  playerId: number,
  listed: boolean,
  askingPrice: number | null,
): Promise<void> {
  await db
    .prepare('UPDATE players SET is_transfer_listed = ?, asking_price = ? WHERE save_id = ? AND id = ?')
    .run(listed ? 1 : 0, listed ? askingPrice : null, saveId, playerId);
}

export async function setLoanListing(
  db: DbHandle,
  saveId: number,
  playerId: number,
  listed: boolean,
  loanWageShare: number | null,
): Promise<void> {
  await db
    .prepare('UPDATE players SET is_loan_listed = ?, loan_wage_share = ? WHERE save_id = ? AND id = ?')
    .run(listed ? 1 : 0, listed ? loanWageShare : null, saveId, playerId);
}

// v0.1: sem coluna `is_retired` pra evitar migration agora; o par
// (club_id=NULL, is_free_agent=0) funciona como marker implícito — jogador
// some das queries atuais e se distingue de free agent (is_free_agent=1).
export async function retirePlayer(db: DbHandle, saveId: number, playerId: number): Promise<void> {
  await db
    .prepare(
      'UPDATE players SET club_id = NULL, is_free_agent = 0, contract_end = 0, wage = 0, is_transfer_listed = 0, is_loan_listed = 0 WHERE save_id = ? AND id = ?',
    )
    .run(saveId, playerId);
}

export async function getPlayersAboutToRetire(db: DbHandle, saveId: number, clubId: number): Promise<Player[]> {
  const rows = await db
    .prepare('SELECT * FROM players WHERE save_id = ? AND club_id = ? AND will_retire_at_season_end = 1')
    .all(saveId, clubId) as PlayerRow[];
  return rows.map(rowToPlayer);
}

export async function getListedPlayers(
  db: DbHandle,
  saveId: number,
  mode: 'transfer' | 'loan' | 'any',
): Promise<Player[]> {
  const where =
    mode === 'transfer' ? 'is_transfer_listed = 1' :
    mode === 'loan'     ? 'is_loan_listed = 1' :
    '(is_transfer_listed = 1 OR is_loan_listed = 1)';
  const rows = await db
    .prepare(`SELECT * FROM players WHERE save_id = ? AND ${where}`)
    .all(saveId) as PlayerRow[];
  return rows.map(rowToPlayer);
}

// Uma nova lesão sobrescreve a duração restante (a pancada mais recente define).
// id é PK global (offset por save), então dispensa saveId.
export async function setPlayerInjury(db: DbHandle, playerId: number, weeks: number): Promise<void> {
  await db.prepare('UPDATE players SET injury_weeks_left = ? WHERE id = ?').run(weeks, playerId);
}

// Suspensões acumulam (um vermelho durante uma suspensão estende a punição).
export async function setPlayerSuspension(db: DbHandle, playerId: number, weeks: number): Promise<void> {
  await db
    .prepare('UPDATE players SET suspension_weeks_left = suspension_weeks_left + ? WHERE id = ?')
    .run(weeks, playerId);
}

// Contract renewal: player ids are globally unique (offset per save), so id alone scopes.
export async function updatePlayerContract(
  db: DbHandle,
  playerId: number,
  wage: number,
  contractEnd: number,
): Promise<void> {
  await db
    .prepare('UPDATE players SET wage = ?, contract_end = ? WHERE id = ?')
    .run(wage, contractEnd, playerId);
}

export async function getPlayerContractInfo(
  db: DbHandle,
  playerId: number,
): Promise<{ wage: number; contractEnd: number; clubId: number | null } | null> {
  const row = (await db
    .prepare('SELECT wage, contract_end, club_id FROM players WHERE id = ?')
    .get(playerId)) as { wage: number; contract_end: number; club_id: number | null } | undefined;
  if (!row) return null;
  return { wage: row.wage, contractEnd: row.contract_end, clubId: row.club_id == null ? null : Number(row.club_id) };
}
