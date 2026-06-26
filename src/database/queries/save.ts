import { z, ZodObject } from 'zod';
import { parseRow } from '../parse-rows';
import { DbHandle } from './players';

// Cada query lê uma única coluna de save_games por id; os campos são opcionais porque
// nenhuma linha seleciona todos de uma vez. Todos são INTEGER NOT NULL exceto
// unemployed_since_season (sem NOT NULL → .nullable()). .passthrough() deixa id/name/etc.
const saveGameRowSchema = z
  .object({
    ended: z.number().optional(),
    preseason_pending: z.number().optional(),
    press_pending: z.number().optional(),
    manager_reputation: z.number().optional(),
    media_sentiment: z.number().optional(),
    job_offers_pending: z.number().optional(),
    unemployed: z.number().optional(),
    onboarding_seen: z.number().optional(),
    manager_savings: z.number().optional(),
    unemployed_since_season: z.number().nullable().optional(),
  })
  .passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'save_games', schema: saveGameRowSchema },
];

export async function markSaveEnded(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('UPDATE save_games SET ended = 1 WHERE id = ?').run(saveId);
}

export async function isSaveEnded(db: DbHandle, saveId: number): Promise<boolean> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT ended FROM save_games WHERE id = ?').get(saveId),
    'save.isSaveEnded',
  );
  return row?.ended === 1;
}

export async function setPreseasonPending(db: DbHandle, saveId: number, pending: boolean): Promise<void> {
  await db.prepare('UPDATE save_games SET preseason_pending = ? WHERE id = ?').run(pending ? 1 : 0, saveId);
}

export async function isPreseasonPending(db: DbHandle, saveId: number): Promise<boolean> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT preseason_pending FROM save_games WHERE id = ?').get(saveId),
    'save.isPreseasonPending',
  );
  return row?.preseason_pending === 1;
}

export async function setPressPending(db: DbHandle, saveId: number, pending: boolean): Promise<void> {
  await db.prepare('UPDATE save_games SET press_pending = ? WHERE id = ?').run(pending ? 1 : 0, saveId);
}

export async function isPressPending(db: DbHandle, saveId: number): Promise<boolean> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT press_pending FROM save_games WHERE id = ?').get(saveId),
    'save.isPressPending',
  );
  return row?.press_pending === 1;
}

// ─── P6 manager career: reputation + job-offers gate ──────────────────────────

export async function getManagerReputation(db: DbHandle, saveId: number): Promise<number> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT manager_reputation FROM save_games WHERE id = ?').get(saveId),
    'save.getManagerReputation',
  );
  return row?.manager_reputation ?? 50;
}

export async function setManagerReputation(db: DbHandle, saveId: number, rep: number): Promise<void> {
  await db.prepare('UPDATE save_games SET manager_reputation = ? WHERE id = ?').run(rep, saveId);
}

export async function getMediaSentiment(db: DbHandle, saveId: number): Promise<number> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT media_sentiment FROM save_games WHERE id = ?').get(saveId),
    'save.getMediaSentiment',
  );
  return row?.media_sentiment ?? 0;
}

export async function setMediaSentiment(db: DbHandle, saveId: number, value: number): Promise<void> {
  const clamped = Math.max(-100, Math.min(100, value));
  await db.prepare('UPDATE save_games SET media_sentiment = ? WHERE id = ?').run(clamped, saveId);
}

export async function setJobOffersPending(db: DbHandle, saveId: number, pending: boolean): Promise<void> {
  await db.prepare('UPDATE save_games SET job_offers_pending = ? WHERE id = ?').run(pending ? 1 : 0, saveId);
}

export async function isJobOffersPending(db: DbHandle, saveId: number): Promise<boolean> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT job_offers_pending FROM save_games WHERE id = ?').get(saveId),
    'save.isJobOffersPending',
  );
  return row?.job_offers_pending === 1;
}

// ─── W2 rescue offers: dismissed-manager gate ─────────────────────────────────
// Set when the manager is fired at season-end and routed to smaller-club rescue
// offers. Decline all → game over. Mirrors the job-offers gate exactly.

export async function setUnemployed(db: DbHandle, saveId: number, v: boolean): Promise<void> {
  await db.prepare('UPDATE save_games SET unemployed = ? WHERE id = ?').run(v ? 1 : 0, saveId);
}

export async function isUnemployed(db: DbHandle, saveId: number): Promise<boolean> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT unemployed FROM save_games WHERE id = ?').get(saveId),
    'save.isUnemployed',
  );
  return row?.unemployed === 1;
}

// ─── P8 onboarding gate ───────────────────────────────────────────────────────
// One-time per-save welcome. Mirrors the preseason gate exactly.

export async function setOnboardingSeen(db: DbHandle, saveId: number, seen: boolean): Promise<void> {
  await db.prepare('UPDATE save_games SET onboarding_seen = ? WHERE id = ?').run(seen ? 1 : 0, saveId);
}

export async function isOnboardingSeen(db: DbHandle, saveId: number): Promise<boolean> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT onboarding_seen FROM save_games WHERE id = ?').get(saveId),
    'save.isOnboardingSeen',
  );
  return row?.onboarding_seen === 1;
}

// ─── C4 manager job market: poupança pessoal + temporada de início do desemprego ──

export async function getManagerSavings(db: DbHandle, saveId: number): Promise<number> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT manager_savings FROM save_games WHERE id = ?').get(saveId),
    'save.getManagerSavings',
  );
  return row?.manager_savings ?? 0;
}

export async function setManagerSavings(db: DbHandle, saveId: number, v: number): Promise<void> {
  await db.prepare('UPDATE save_games SET manager_savings = ? WHERE id = ?').run(v, saveId);
}

export async function getUnemployedSince(db: DbHandle, saveId: number): Promise<number | null> {
  const row = parseRow(
    saveGameRowSchema.nullable(),
    await db.prepare('SELECT unemployed_since_season FROM save_games WHERE id = ?').get(saveId),
    'save.getUnemployedSince',
  );
  return row?.unemployed_since_season ?? null;
}

export async function setUnemployedSince(db: DbHandle, saveId: number, season: number | null): Promise<void> {
  await db.prepare('UPDATE save_games SET unemployed_since_season = ? WHERE id = ?').run(season, saveId);
}
