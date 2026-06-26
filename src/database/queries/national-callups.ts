import { z, ZodObject } from 'zod';
import { parseRows } from '../parse-rows';
import { DbHandle } from './players';

// Convocação por janela FIFA. source='auto' = pré-convocação da IA; 'manual' = override
// do usuário (tem precedência na montagem do XI). Uma linha por (seleção, season, window,
// jogador), garantida pela UNIQUE no schema — o upsert troca a fonte/titularidade.
export type CallUpSource = 'auto' | 'manual';

export interface NationalCallUp {
  id: number;
  nationalTeamId: number;
  season: number;
  window: number;
  playerId: number;
  isStarter: boolean;
  source: CallUpSource;
}

const nationalCallUpRowSchema = z
  .object({
    id: z.number(),
    national_team_id: z.number(),
    season: z.number(),
    window: z.number(),
    player_id: z.number(),
    is_starter: z.number(),
    source: z.string(),
  })
  .passthrough();
type NationalCallUpRow = z.infer<typeof nationalCallUpRowSchema>;

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'national_callups', schema: nationalCallUpRowSchema },
];

function rowToCallUp(row: NationalCallUpRow): NationalCallUp {
  return {
    id: row.id,
    nationalTeamId: row.national_team_id,
    season: row.season,
    window: row.window,
    playerId: row.player_id,
    isStarter: row.is_starter === 1,
    source: row.source === 'manual' ? 'manual' : 'auto',
  };
}

export async function getCallUps(
  db: DbHandle,
  saveId: number,
  nationalTeamId: number,
  season: number,
  window: number,
): Promise<NationalCallUp[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM national_callups
       WHERE save_id = ? AND national_team_id = ? AND season = ? AND window = ?
       ORDER BY player_id ASC`,
    )
    .all(saveId, nationalTeamId, season, window);
  return parseRows(nationalCallUpRowSchema, rows, 'national-callups.getCallUps').map(rowToCallUp);
}

export async function countCallUps(
  db: DbHandle,
  saveId: number,
  nationalTeamId: number,
  season: number,
  window: number,
): Promise<number> {
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM national_callups
       WHERE save_id = ? AND national_team_id = ? AND season = ? AND window = ?`,
    )
    .get(saveId, nationalTeamId, season, window)) as { cnt: number };
  return row.cnt;
}

// Insere/atualiza uma convocação. ON CONFLICT na UNIQUE troca titularidade e fonte —
// uma 2ª chamada manual sobre uma linha 'auto' a promove a 'manual'.
export async function upsertCallUp(
  db: DbHandle,
  saveId: number,
  callUp: {
    nationalTeamId: number;
    season: number;
    window: number;
    playerId: number;
    isStarter: boolean;
    source: CallUpSource;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO national_callups
         (save_id, national_team_id, season, window, player_id, is_starter, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(save_id, national_team_id, season, window, player_id) DO UPDATE SET
         is_starter = excluded.is_starter,
         source     = excluded.source`,
    )
    .run(
      saveId,
      callUp.nationalTeamId,
      callUp.season,
      callUp.window,
      callUp.playerId,
      callUp.isStarter ? 1 : 0,
      callUp.source,
    );
}

// Override do usuário: força um jogador na convocação como 'manual' (titular por padrão).
export async function setManualCallUp(
  db: DbHandle,
  saveId: number,
  nationalTeamId: number,
  season: number,
  window: number,
  playerId: number,
  isStarter = true,
): Promise<void> {
  await upsertCallUp(db, saveId, {
    nationalTeamId,
    season,
    window,
    playerId,
    isStarter,
    source: 'manual',
  });
}

export async function clearWindowCallUps(
  db: DbHandle,
  saveId: number,
  nationalTeamId: number,
  season: number,
  window: number,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM national_callups
       WHERE save_id = ? AND national_team_id = ? AND season = ? AND window = ?`,
    )
    .run(saveId, nationalTeamId, season, window);
}
