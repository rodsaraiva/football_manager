import {
  Tactic,
  TacticPosition,
  Formation,
  Mentality,
  Pressing,
  PassingStyle,
  Tempo,
  Width,
} from '@/types';
import { DbHandle } from './players';

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

export function getActiveTactic(db: DbHandle, clubId: number): Tactic | null {
  const row = db
    .prepare('SELECT * FROM tactics WHERE club_id = ? AND is_active = 1')
    .get(clubId) as TacticRow | undefined;
  return row ? rowToTactic(row) : null;
}

export function getTacticPositions(db: DbHandle, tacticId: number): TacticPosition[] {
  const rows = db
    .prepare('SELECT * FROM tactic_positions WHERE tactic_id = ? ORDER BY slot ASC')
    .all(tacticId) as TacticPositionRow[];
  return rows.map(rowToTacticPosition);
}

export interface UpdateTacticInput {
  formation?: Formation;
  mentality?: Mentality;
  pressing?: Pressing;
  passingStyle?: PassingStyle;
  tempo?: Tempo;
  width?: Width;
  name?: string;
}

export function updateTactic(db: DbHandle, tacticId: number, updates: UpdateTacticInput): void {
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
  if (updates.name !== undefined) {
    fields.push('name = ?');
    params.push(updates.name);
  }

  if (fields.length === 0) return;

  params.push(tacticId);
  db.prepare(`UPDATE tactics SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}
