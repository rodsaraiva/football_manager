import { z, ZodObject } from 'zod';
import { Player, PlayerAttributes, Position, Foot, SquadTier } from '@/types';
import { parseRows, parseRow } from '../parse-rows';

export interface DbHandle {
  prepare(sql: string): {
    all(...params: unknown[]): Promise<unknown[]>;
    get(...params: unknown[]): Promise<unknown>;
    run(...params: unknown[]): Promise<{ lastInsertRowid: number | bigint } | void>;
  };
}

// Só os campos consumidos por rowToPlayer; .passthrough() deixa as demais colunas
// (match_sharpness, injury_severity, save_id, etc.) passarem intactas.
// Nullability fiel a schema.ts: secondary_position/club_id/asking_price/loan_wage_share/
// loan_wage não têm NOT NULL → .nullable(); booleanos são inteiros 0/1 → z.number().
const playerRowSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    nationality: z.string(),
    age: z.number(),
    position: z.string(),
    secondary_position: z.string().nullable(),
    club_id: z.number().nullable(),
    wage: z.number(),
    contract_end: z.number(),
    market_value: z.number(),
    base_potential: z.number(),
    effective_potential: z.number(),
    morale: z.number(),
    fitness: z.number(),
    injury_weeks_left: z.number(),
    is_free_agent: z.number(),
    preferred_foot: z.string().optional(),
    weak_foot_ability: z.number().optional(),
    is_transfer_listed: z.number(),
    is_loan_listed: z.number(),
    asking_price: z.number().nullable(),
    loan_wage_share: z.number().nullable(),
    loan_wage: z.number().nullable(),
    consecutive_low_morale_weeks: z.number(),
    will_retire_at_season_end: z.number(),
    suspension_weeks_left: z.number().optional(),
    squad_tier: z.string(),
    personality: z.string(),
    fallout_state: z.string(),
  })
  .passthrough();
type PlayerRow = z.infer<typeof playerRowSchema>;

const playerAttributesRowSchema = z
  .object({
    player_id: z.number(),
    finishing: z.number(),
    passing: z.number(),
    crossing: z.number(),
    dribbling: z.number(),
    heading: z.number(),
    long_shots: z.number(),
    free_kicks: z.number(),
    vision: z.number(),
    composure: z.number(),
    decisions: z.number(),
    positioning: z.number(),
    aggression: z.number(),
    leadership: z.number(),
    pace: z.number(),
    stamina: z.number(),
    strength: z.number(),
    agility: z.number(),
    jumping: z.number(),
  })
  .passthrough();
type PlayerAttributesRow = z.infer<typeof playerAttributesRowSchema>;

// Projeção (subconjunto de colunas de players): fica fora de __rowSchemas.
const playerContractInfoRowSchema = z
  .object({
    wage: z.number(),
    contract_end: z.number(),
    club_id: z.number().nullable(),
  })
  .passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'players', schema: playerRowSchema },
  { table: 'player_attributes', schema: playerAttributesRowSchema },
];

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
    squadTier: (row.squad_tier as SquadTier) ?? 'first',
    personality: (row.personality ?? 'balanced') as Player['personality'],
    falloutState: (row.fallout_state ?? 'none') as Player['falloutState'],
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

export async function getPlayersByClub(
  db: DbHandle, saveId: number, clubId: number, tier?: SquadTier,
): Promise<Player[]> {
  // Defensive guard: a freed player (is_free_agent=1) must never count as squad,
  // even if a buggy path left club_id intact (economy-depth wage-bleed fix).
  const rows = tier
    ? await db
        .prepare('SELECT * FROM players WHERE save_id = ? AND club_id = ? AND is_free_agent = 0 AND squad_tier = ?')
        .all(saveId, clubId, tier)
    : await db
        .prepare('SELECT * FROM players WHERE save_id = ? AND club_id = ? AND is_free_agent = 0')
        .all(saveId, clubId);
  return parseRows(playerRowSchema, rows, 'players.getPlayersByClub').map(rowToPlayer);
}

export async function getPlayersWithAttributesByClub(
  db: DbHandle,
  saveId: number,
  clubId: number,
): Promise<(Player & { attributes: PlayerAttributes })[]> {
  const playerRows = parseRows(
    playerRowSchema,
    await db.prepare('SELECT * FROM players WHERE save_id = ? AND club_id = ?').all(saveId, clubId),
    'players.getPlayersWithAttributesByClub',
  );
  if (playerRows.length === 0) return [];
  const attrRows = parseRows(
    playerAttributesRowSchema,
    await db
      .prepare('SELECT * FROM player_attributes WHERE player_id IN (' + playerRows.map(() => '?').join(',') + ')')
      .all(...playerRows.map((p) => p.id)),
    'players.getPlayersWithAttributesByClub.attrs',
  );
  const attrsById = new Map(attrRows.map((a) => [a.player_id, rowToAttributes(a)]));
  return playerRows
    .filter((p) => attrsById.has(p.id))
    .map((p) => ({ ...rowToPlayer(p), attributes: attrsById.get(p.id)! }));
}

// Carrega jogadores (com atributos) por um conjunto de ids do save, num round-trip.
// Usado pela escalação da seleção (convocados podem vir de clubes distintos).
export async function getPlayersWithAttributesByIds(
  db: DbHandle,
  saveId: number,
  ids: number[],
): Promise<(Player & { attributes: PlayerAttributes })[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const playerRows = parseRows(
    playerRowSchema,
    await db.prepare(`SELECT * FROM players WHERE save_id = ? AND id IN (${placeholders})`).all(saveId, ...ids),
    'players.getPlayersWithAttributesByIds',
  );
  if (playerRows.length === 0) return [];
  const attrRows = parseRows(
    playerAttributesRowSchema,
    await db
      .prepare('SELECT * FROM player_attributes WHERE player_id IN (' + playerRows.map(() => '?').join(',') + ')')
      .all(...playerRows.map((p) => p.id)),
    'players.getPlayersWithAttributesByIds.attrs',
  );
  const attrsById = new Map(attrRows.map((a) => [a.player_id, rowToAttributes(a)]));
  return playerRows
    .filter((p) => attrsById.has(p.id))
    .map((p) => ({ ...rowToPlayer(p), attributes: attrsById.get(p.id)! }));
}

// Carrega jogadores (com atributos) por demônimos de nacionalidade — pool da seleção
// (independe de clube). Usado para escalar a seleção rival e a pré-convocação da IA.
export async function getPlayersWithAttributesByNationalities(
  db: DbHandle,
  saveId: number,
  nationalities: string[],
): Promise<(Player & { attributes: PlayerAttributes })[]> {
  if (nationalities.length === 0) return [];
  const placeholders = nationalities.map(() => '?').join(',');
  const playerRows = parseRows(
    playerRowSchema,
    await db
      .prepare(`SELECT * FROM players WHERE save_id = ? AND nationality IN (${placeholders})`)
      .all(saveId, ...nationalities),
    'players.getPlayersWithAttributesByNationalities',
  );
  if (playerRows.length === 0) return [];
  const attrRows = parseRows(
    playerAttributesRowSchema,
    await db
      .prepare('SELECT * FROM player_attributes WHERE player_id IN (' + playerRows.map(() => '?').join(',') + ')')
      .all(...playerRows.map((p) => p.id)),
    'players.getPlayersWithAttributesByNationalities.attrs',
  );
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
  const playerRow = parseRow(
    playerRowSchema.nullable(),
    await db.prepare('SELECT * FROM players WHERE save_id = ? AND id = ?').get(saveId, playerId),
    'players.getPlayerById',
  );

  if (!playerRow) return null;

  const attrRow = parseRow(
    playerAttributesRowSchema.nullable(),
    await db.prepare('SELECT * FROM player_attributes WHERE player_id = ?').get(playerId),
    'players.getPlayerById.attrs',
  );

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
  const rows = await db.prepare(sql).all(...params);
  return parseRows(playerRowSchema, rows, 'players.searchPlayers').map(rowToPlayer);
}

export async function updatePlayerMorale(db: DbHandle, saveId: number, playerId: number, morale: number): Promise<void> {
  await db.prepare('UPDATE players SET morale = ? WHERE save_id = ? AND id = ?').run(morale, saveId, playerId);
}

export async function getFreeAgents(db: DbHandle, saveId: number): Promise<Player[]> {
  const rows = await db
    .prepare('SELECT * FROM players WHERE save_id = ? AND is_free_agent = 1')
    .all(saveId);
  return parseRows(playerRowSchema, rows, 'players.getFreeAgents').map(rowToPlayer);
}

export async function getFreeAgentsWithAttributes(
  db: DbHandle,
  saveId: number,
): Promise<(Player & { attributes: PlayerAttributes })[]> {
  const playerRows = parseRows(
    playerRowSchema,
    await db.prepare('SELECT * FROM players WHERE save_id = ? AND is_free_agent = 1').all(saveId),
    'players.getFreeAgentsWithAttributes',
  );
  if (playerRows.length === 0) return [];
  const attrRows = parseRows(
    playerAttributesRowSchema,
    await db
      .prepare('SELECT * FROM player_attributes WHERE player_id IN (' + playerRows.map(() => '?').join(',') + ')')
      .all(...playerRows.map((p) => p.id)),
    'players.getFreeAgentsWithAttributes.attrs',
  );
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
    .all(saveId, clubId);
  return parseRows(playerRowSchema, rows, 'players.getPlayersAboutToRetire').map(rowToPlayer);
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
    .all(saveId);
  return parseRows(playerRowSchema, rows, 'players.getListedPlayers').map(rowToPlayer);
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
  const row = parseRow(
    playerContractInfoRowSchema.nullable(),
    await db.prepare('SELECT wage, contract_end, club_id FROM players WHERE id = ?').get(playerId),
    'players.getPlayerContractInfo',
  );
  if (!row) return null;
  return { wage: row.wage, contractEnd: row.contract_end, clubId: row.club_id == null ? null : Number(row.club_id) };
}
