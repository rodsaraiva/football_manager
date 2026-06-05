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
import { DbHandle } from './players';
import { runInTransaction } from '../transaction';

interface TacticRow {
  id: number;
  club_id: number;
  name: string;
  is_active: number;
  formation: string;
  mentality: string;
  pressing: string;
  passing_style: string;
  tempo: string;
  width: string;
  attack_focus: string | null;
  sub_strategy: string | null;
}

interface TacticPositionRow {
  tactic_id: number;
  slot: number;
  player_id: number | null;
  position_role: string;
  instructions: string;
}

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
    .get(saveId, clubId) as TacticRow | undefined;
  return row ? rowToTactic(row) : null;
}

export async function getTacticPositions(db: DbHandle, saveId: number, tacticId: number): Promise<TacticPosition[]> {
  const rows = await db
    .prepare('SELECT tp.* FROM tactic_positions tp JOIN tactics t ON t.id = tp.tactic_id WHERE t.save_id = ? AND tp.tactic_id = ? ORDER BY tp.slot ASC')
    .all(saveId, tacticId) as TacticPositionRow[];
  return rows.map(rowToTacticPosition);
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
    const tactic = await db
      .prepare('SELECT id FROM tactics WHERE save_id = ? AND id = ?')
      .get(saveId, tacticId) as { id: number } | undefined;
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
  const tactic = await db
    .prepare('SELECT id FROM tactics WHERE save_id = ? AND id = ?')
    .get(saveId, tacticId) as { id: number } | undefined;
  if (!tactic) return null;

  const rows = await db
    .prepare('SELECT slot_index, player_id FROM tactic_lineup WHERE tactic_id = ? ORDER BY slot_index ASC')
    .all(tacticId) as { slot_index: number; player_id: number }[];
  if (rows.length === 0) return null;
  const starterIds = rows.filter(r => r.slot_index < 11).map(r => r.player_id);
  const benchIds = rows.filter(r => r.slot_index >= 11).map(r => r.player_id);
  return { starterIds, benchIds };
}
