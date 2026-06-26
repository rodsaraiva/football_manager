import { z, ZodObject } from 'zod';
import { parseRow } from '../parse-rows';
import { DbHandle } from './players';

// Acumulado de carreira de cada jogador na seleção: jogos (caps) e gols. Uma linha por
// (save, jogador), garantida pela UNIQUE no schema. Só jogadores da seleção DIRIGIDA pelo
// usuário acumulam aqui — rivais abstratos não geram caps individuais.
export interface NationalCaps {
  caps: number;
  goals: number;
}

const nationalCapsRowSchema = z
  .object({
    caps: z.number(),
    goals: z.number(),
  })
  .passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'national_caps', schema: nationalCapsRowSchema },
];

// Incrementa em 1 o cap de cada jogador (titulares de um jogo real da seleção). Upsert: a
// 1ª aparição cria a linha; as seguintes somam. Sem efeito para lista vazia.
export async function incrementCaps(db: DbHandle, saveId: number, playerIds: number[]): Promise<void> {
  for (const playerId of playerIds) {
    await db
      .prepare(
        `INSERT INTO national_caps (save_id, player_id, caps, goals)
         VALUES (?, ?, 1, 0)
         ON CONFLICT(save_id, player_id) DO UPDATE SET caps = caps + 1`,
      )
      .run(saveId, playerId);
  }
}

// Soma `goals` ao acumulado do jogador (gols reais a partir dos match events). Cria a linha
// se necessário (ex.: reserva que entrou e marcou sem ter cap registrado ainda).
export async function addGoals(db: DbHandle, saveId: number, playerId: number, goals: number): Promise<void> {
  if (goals <= 0) return;
  await db
    .prepare(
      `INSERT INTO national_caps (save_id, player_id, caps, goals)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(save_id, player_id) DO UPDATE SET goals = goals + excluded.goals`,
    )
    .run(saveId, playerId, goals);
}

// Caps/gols acumulados de um jogador. Sem linha registrada ⇒ {caps:0, goals:0}.
export async function getCaps(db: DbHandle, saveId: number, playerId: number): Promise<NationalCaps> {
  const row = parseRow(
    nationalCapsRowSchema.nullable(),
    await db.prepare('SELECT caps, goals FROM national_caps WHERE save_id = ? AND player_id = ?').get(saveId, playerId),
    'national-caps.getCaps',
  );
  return { caps: row?.caps ?? 0, goals: row?.goals ?? 0 };
}
