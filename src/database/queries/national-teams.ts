import { z, ZodObject } from 'zod';
import { parseRows, parseRow } from '../parse-rows';
import { saveOffset } from '../constants';
import { DbHandle } from './players';
import { getAllCountries } from './leagues';
import { calculateOverall } from '@/utils/overall';
import { Position, PlayerAttributes } from '@/types';
import {
  DEMONYM_TO_COUNTRY,
  PLAYABLE_NATIONAL_COUNTRIES,
  deriveNationalPool,
  computeNationalStrength,
  countryNameForDemonym,
  PoolCandidate,
} from '@/engine/national/nationality';
import { NATIONAL_POOL_TOP_N, NATIONAL_TEAM_ID_BASE } from '@/engine/balance';

export interface NationalTeam {
  id: number;
  countryId: number;
  name: string;
  continent: string;
  strength: number;
  isUserManaged: boolean;
}

const nationalTeamRowSchema = z
  .object({
    id: z.number(),
    country_id: z.number(),
    name: z.string(),
    continent: z.string(),
    strength: z.number(),
    is_user_managed: z.number(),
  })
  .passthrough();
type NationalTeamRow = z.infer<typeof nationalTeamRowSchema>;

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'national_teams', schema: nationalTeamRowSchema },
];

function rowToNationalTeam(row: NationalTeamRow): NationalTeam {
  return {
    id: row.id,
    countryId: row.country_id,
    name: row.name,
    continent: row.continent,
    strength: row.strength,
    isUserManaged: row.is_user_managed === 1,
  };
}

export async function loadNationalTeams(db: DbHandle, saveId: number): Promise<NationalTeam[]> {
  const rows = await db
    .prepare('SELECT * FROM national_teams WHERE save_id = ? ORDER BY id ASC')
    .all(saveId);
  return parseRows(nationalTeamRowSchema, rows, 'national-teams.loadNationalTeams').map(rowToNationalTeam);
}

const ATTRIBUTE_COLUMNS = [
  'finishing', 'passing', 'crossing', 'dribbling', 'heading', 'long_shots', 'free_kicks',
  'vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership',
  'pace', 'stamina', 'strength', 'agility', 'jumping',
] as const;

const poolRowSchema = z
  .object({
    id: z.number(),
    nationality: z.string(),
    position: z.string(),
    finishing: z.number(), passing: z.number(), crossing: z.number(), dribbling: z.number(),
    heading: z.number(), long_shots: z.number(), free_kicks: z.number(), vision: z.number(),
    composure: z.number(), decisions: z.number(), positioning: z.number(), aggression: z.number(),
    leadership: z.number(), pace: z.number(), stamina: z.number(), strength: z.number(),
    agility: z.number(), jumping: z.number(),
  })
  .passthrough();
type PoolRow = z.infer<typeof poolRowSchema>;

function rowToPoolCandidate(row: PoolRow): PoolCandidate {
  const attributes: PlayerAttributes = {
    finishing: row.finishing, passing: row.passing, crossing: row.crossing, dribbling: row.dribbling,
    heading: row.heading, longShots: row.long_shots, freeKicks: row.free_kicks, vision: row.vision,
    composure: row.composure, decisions: row.decisions, positioning: row.positioning,
    aggression: row.aggression, leadership: row.leadership, pace: row.pace, stamina: row.stamina,
    strength: row.strength, agility: row.agility, jumping: row.jumping,
  };
  return {
    id: row.id,
    nationality: row.nationality,
    overall: calculateOverall(attributes, row.position as Position),
  };
}

// Carrega todos os jogadores do save (id/nacionalidade/overall) num round-trip. Inclui
// free agents — o pool da seleção é por nacionalidade, não por clube.
async function loadPoolCandidates(db: DbHandle, saveId: number): Promise<PoolCandidate[]> {
  const cols = ATTRIBUTE_COLUMNS.map((c) => `a.${c}`).join(', ');
  const rows = await db
    .prepare(
      `SELECT p.id, p.nationality, p.position, ${cols}
       FROM players p JOIN player_attributes a ON a.player_id = p.id AND a.save_id = p.save_id
       WHERE p.save_id = ?`,
    )
    .all(saveId);
  return parseRows(poolRowSchema, rows, 'national-teams.loadPoolCandidates').map(rowToPoolCandidate);
}

/**
 * Seeds one national_team per playable country at new-game time. is_user_managed goes
 * to the nation supplying the most players to the user's club (tiebreak: lower
 * country_id). Idempotent: no-op if teams already exist for the save.
 */
export async function seedNationalTeams(db: DbHandle, saveId: number): Promise<number> {
  const existing = (await db
    .prepare('SELECT COUNT(*) AS cnt FROM national_teams WHERE save_id = ?')
    .get(saveId)) as { cnt: number };
  if (existing.cnt > 0) return 0;

  const countries = (await getAllCountries(db)).filter((c) => PLAYABLE_NATIONAL_COUNTRIES.has(c.name));
  const candidates = await loadPoolCandidates(db, saveId);
  const off = saveOffset(saveId);

  let created = 0;
  for (const country of countries) {
    const pool = deriveNationalPool(candidates, country.name, NATIONAL_POOL_TOP_N);
    const strength = computeNationalStrength(pool);
    await db
      .prepare(
        `INSERT INTO national_teams (id, save_id, country_id, name, continent, strength, is_user_managed)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(off + NATIONAL_TEAM_ID_BASE + country.id, saveId, country.id, country.name, country.continent, strength);
    created++;
  }

  const userCountryId = await deriveUserManagedCountryId(db, saveId, off);
  if (userCountryId !== null) await setUserManagedNation(db, saveId, userCountryId);

  return created;
}

// Nação com mais jogadores no clube do usuário (desempate por country_id menor).
async function deriveUserManagedCountryId(
  db: DbHandle,
  saveId: number,
  off: number,
): Promise<number | null> {
  const save = (await db
    .prepare('SELECT player_club_id FROM save_games WHERE id = ?')
    .get(saveId)) as { player_club_id: number } | undefined;
  if (!save) return null;

  const rows = (await db
    .prepare('SELECT nationality FROM players WHERE save_id = ? AND club_id = ?')
    .all(saveId, save.player_club_id)) as { nationality: string }[];

  const teams = await loadNationalTeams(db, saveId);
  const countryIdByName = new Map(teams.map((t) => [t.name, t.countryId]));

  const counts = new Map<number, number>();
  for (const r of rows) {
    const name = countryNameForDemonym(r.nationality);
    if (name === undefined) continue;
    const countryId = countryIdByName.get(name);
    if (countryId === undefined) continue;
    counts.set(countryId, (counts.get(countryId) ?? 0) + 1);
  }

  let best: number | null = null;
  let bestCount = -1;
  for (const [countryId, count] of counts) {
    if (count > bestCount || (count === bestCount && (best === null || countryId < best))) {
      best = countryId;
      bestCount = count;
    }
  }
  return best;
}

/** Marks exactly one nation as user-managed (clears the others). Save-isolated. */
export async function setUserManagedNation(db: DbHandle, saveId: number, countryId: number): Promise<void> {
  await db
    .prepare(
      'UPDATE national_teams SET is_user_managed = CASE WHEN country_id = ? THEN 1 ELSE 0 END WHERE save_id = ?',
    )
    .run(countryId, saveId);
}

export async function getUserManagedNation(db: DbHandle, saveId: number): Promise<NationalTeam | null> {
  const row = await db
    .prepare('SELECT * FROM national_teams WHERE save_id = ? AND is_user_managed = 1')
    .get(saveId);
  return row ? rowToNationalTeam(parseRow(nationalTeamRowSchema, row, 'national-teams.getUserManagedNation')) : null;
}

// Re-export para consumidores que só conhecem a camada de query.
export { DEMONYM_TO_COUNTRY };
