import { z, ZodObject } from 'zod';
import {
  Tactic,
  TacticPosition,
  Formation,
  Mentality,
  Pressing,
  PassingStyle,
  Tempo,
  Width,
  AttackFocus,
  SubstitutionStrategy,
} from '@/types';
import { parseRows, parseRow } from '../parse-rows';
import { DbHandle } from './players';
import { runInTransaction } from '../transaction';

// is_active é inteiro 0/1; attack_focus/sub_strategy mantêm nullable por fidelidade ao
// cast anterior (o código defaultava com ?? 'balanced').
const tacticRowSchema = z
  .object({
    id: z.number(),
    club_id: z.number(),
    name: z.string(),
    is_active: z.number(),
    formation: z.string(),
    mentality: z.string(),
    pressing: z.string(),
    passing_style: z.string(),
    tempo: z.string(),
    width: z.string(),
    attack_focus: z.string().nullable(),
    sub_strategy: z.string().nullable(),
  })
  .passthrough();
type TacticRow = z.infer<typeof tacticRowSchema>;

// player_id é nullable (coluna sem NOT NULL); demais campos NOT NULL.
const tacticPositionRowSchema = z
  .object({
    tactic_id: z.number(),
    slot: z.number(),
    player_id: z.number().nullable(),
    position_role: z.string(),
    instructions: z.string(),
  })
  .passthrough();
type TacticPositionRow = z.infer<typeof tacticPositionRowSchema>;

// Projeções (guard SELECT id / SELECT slot_index, player_id): fora de __rowSchemas.
const tacticIdRowSchema = z.object({ id: z.number() }).passthrough().nullable();
const lineupRowSchema = z.object({ slot_index: z.number(), player_id: z.number() }).passthrough();

export const __rowSchemas: Array<{ table: string; schema: ZodObject<any> }> = [
  { table: 'tactics', schema: tacticRowSchema },
  { table: 'tactic_positions', schema: tacticPositionRowSchema },
];

function rowToTactic(row: TacticRow): Tactic {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    isActive: row.is_active === 1,
    formation: row.formation as Formation,
    mentality: row.mentality as Mentality,
    pressing: row.pressing as Pressing,
    passingStyle: row.passing_style as PassingStyle,
    tempo: row.tempo as Tempo,
    width: row.width as Width,
    attackFocus: (row.attack_focus ?? 'balanced') as AttackFocus,
    subStrategy: (row.sub_strategy ?? 'balanced') as SubstitutionStrategy,
  };
}

function rowToTacticPosition(row: TacticPositionRow): TacticPosition {
  let instructions: Record<string, unknown> = {};
  try {
    instructions = JSON.parse(row.instructions);
  } catch {
    // leave as empty object
  }
  return {
    tacticId: row.tactic_id,
    slot: row.slot,
    playerId: row.player_id as number,
    positionRole: row.position_role,
    instructions,
  };
}

export async function getActiveTactic(db: DbHandle, saveId: number, clubId: number): Promise<Tactic | null> {
  const row = await db
    .prepare('SELECT * FROM tactics WHERE save_id = ? AND club_id = ? AND is_active = 1')
    .get(saveId, clubId);
  return row ? rowToTactic(parseRow(tacticRowSchema, row, 'tactics.getActiveTactic')) : null;
}

export async function getTacticPositions(db: DbHandle, saveId: number, tacticId: number): Promise<TacticPosition[]> {
  const rows = await db
    .prepare('SELECT tp.* FROM tactic_positions tp JOIN tactics t ON t.id = tp.tactic_id WHERE t.save_id = ? AND tp.tactic_id = ? ORDER BY tp.slot ASC')
    .all(saveId, tacticId);
  return parseRows(tacticPositionRowSchema, rows, 'tactics.getTacticPositions').map(rowToTacticPosition);
}

export interface UpdateTacticInput {
  formation?: Formation;
  mentality?: Mentality;
  pressing?: Pressing;
  passingStyle?: PassingStyle;
  tempo?: Tempo;
  width?: Width;
  attackFocus?: AttackFocus;
  subStrategy?: SubstitutionStrategy;
  name?: string;
}

export async function updateTactic(db: DbHandle, saveId: number, tacticId: number, updates: UpdateTacticInput): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.formation !== undefined) {
    fields.push('formation = ?');
    params.push(updates.formation);
  }
  if (updates.mentality !== undefined) {
    fields.push('mentality = ?');
    params.push(updates.mentality);
  }
  if (updates.pressing !== undefined) {
    fields.push('pressing = ?');
    params.push(updates.pressing);
  }
  if (updates.passingStyle !== undefined) {
    fields.push('passing_style = ?');
    params.push(updates.passingStyle);
  }
  if (updates.tempo !== undefined) {
    fields.push('tempo = ?');
    params.push(updates.tempo);
  }
  if (updates.width !== undefined) {
    fields.push('width = ?');
    params.push(updates.width);
  }
  if (updates.attackFocus !== undefined) {
    fields.push('attack_focus = ?');
    params.push(updates.attackFocus);
  }
  if (updates.subStrategy !== undefined) {
    fields.push('sub_strategy = ?');
    params.push(updates.subStrategy);
  }
  if (updates.name !== undefined) {
    fields.push('name = ?');
    params.push(updates.name);
  }

  if (fields.length === 0) return;

  params.push(saveId, tacticId);
  await db.prepare(`UPDATE tactics SET ${fields.join(', ')} WHERE save_id = ? AND id = ?`).run(...params);
}

export async function setTacticLineup(
  db: DbHandle,
  saveId: number,
  tacticId: number,
  starters: number[],
  bench: number[],
): Promise<void> {
  await runInTransaction(db, async () => {
    // Guard: verify the tactic belongs to this save before mutating lineup
    const tactic = parseRow(
      tacticIdRowSchema,
      await db.prepare('SELECT id FROM tactics WHERE save_id = ? AND id = ?').get(saveId, tacticId),
      'tactics.setTacticLineup',
    );
    if (!tactic) return;

    await db.prepare('DELETE FROM tactic_lineup WHERE tactic_id = ?').run(tacticId);
    const all = [...starters, ...bench];
    for (let i = 0; i < all.length; i++) {
      await db.prepare(
        'INSERT INTO tactic_lineup (tactic_id, slot_index, player_id) VALUES (?, ?, ?)',
      ).run(tacticId, i, all[i]);
    }
  });
}

export async function getTacticLineup(
  db: DbHandle,
  saveId: number,
  tacticId: number,
): Promise<{ starterIds: number[]; benchIds: number[] } | null> {
  // Guard: verify the tactic belongs to this save
  const tactic = parseRow(
    tacticIdRowSchema,
    await db.prepare('SELECT id FROM tactics WHERE save_id = ? AND id = ?').get(saveId, tacticId),
    'tactics.getTacticLineup',
  );
  if (!tactic) return null;

  const rows = await db
    .prepare('SELECT slot_index, player_id FROM tactic_lineup WHERE tactic_id = ? ORDER BY slot_index ASC')
    .all(tacticId);
  const parsed = parseRows(lineupRowSchema, rows, 'tactics.getTacticLineup');
  if (parsed.length === 0) return null;
  const starterIds = parsed.filter(r => r.slot_index < 11).map(r => r.player_id);
  const benchIds = parsed.filter(r => r.slot_index >= 11).map(r => r.player_id);
  return { starterIds, benchIds };
}
