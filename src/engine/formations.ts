/**
 * Formation metadata: visual row layout (for the pitch view) and tactical
 * modifiers (applied to team strength / match engine probabilities).
 *
 * Kept separate from the match-engine so the UI can import it cheaply.
 */
import { Formation, Position } from '@/types';

/**
 * Visual row layout used by the TacticsScreen pitch view and the HomeScreen
 * opponent preview. Rows are rendered from top (attack) to bottom (keeper),
 * so the first row is the forwards and the last row is the GK.
 */
export const FORMATION_ROWS: Record<Formation, string[][]> = {
  // Original
  '4-4-2':     [['ST', 'ST'], ['LM', 'CM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '4-3-3':     [['LW', 'ST', 'RW'], ['CM', 'CDM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '4-2-3-1':   [['ST'], ['LM', 'CAM', 'RM'], ['CDM', 'CDM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '3-5-2':     [['ST', 'ST'], ['LM', 'CM', 'CDM', 'CM', 'RM'], ['CB', 'CB', 'CB'], ['GK']],
  '3-4-3':     [['LW', 'ST', 'RW'], ['LM', 'CM', 'CM', 'RM'], ['CB', 'CB', 'CB'], ['GK']],
  '4-5-1':     [['ST'], ['LM', 'CM', 'CDM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '4-1-4-1':   [['ST'], ['LM', 'CM', 'CM', 'RM'], ['CDM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '5-3-2':     [['ST', 'ST'], ['CM', 'CDM', 'CM'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['GK']],
  '5-4-1':     [['ST'], ['LM', 'CM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'CB', 'RB'], ['GK']],
  // New
  '4-4-1-1':   [['ST'], ['CAM'], ['LM', 'CM', 'CM', 'RM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '4-1-2-1-2': [['ST', 'ST'], ['CAM'], ['CM', 'CM'], ['CDM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '4-2-2-2':   [['ST', 'ST'], ['LM', 'RM'], ['CDM', 'CDM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '3-4-2-1':   [['ST'], ['CAM', 'CAM'], ['LM', 'CM', 'CM', 'RM'], ['CB', 'CB', 'CB'], ['GK']],
  '4-3-1-2':   [['ST', 'ST'], ['CAM'], ['CM', 'CDM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
  '3-4-1-2':   [['ST', 'ST'], ['CAM'], ['LM', 'CM', 'CM', 'RM'], ['CB', 'CB', 'CB'], ['GK']],
  '4-2-4':     [['LW', 'ST', 'ST', 'RW'], ['CM', 'CM'], ['LB', 'CB', 'CB', 'RB'], ['GK']],
};

/**
 * Flat list of 11 position tokens used by the engine to pick a starting XI.
 * Always starts with 'GK'.
 */
export const FORMATION_SLOTS: Record<Formation, Position[]> = {
  '4-4-2':     ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'],
  '4-3-3':     ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'LW', 'ST', 'RW'],
  '4-2-3-1':   ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'LM', 'CAM', 'RM', 'ST'],
  '3-5-2':     ['GK', 'CB', 'CB', 'CB', 'LM', 'CDM', 'CM', 'CM', 'RM', 'ST', 'ST'],
  '3-4-3':     ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'LW', 'ST', 'RW'],
  '4-5-1':     ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CDM', 'CM', 'RM', 'ST'],
  '4-1-4-1':   ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'LM', 'CM', 'CM', 'RM', 'ST'],
  '5-3-2':     ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'CM', 'CDM', 'CM', 'ST', 'ST'],
  '5-4-1':     ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST'],
  '4-4-1-1':   ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'CAM', 'ST'],
  '4-1-2-1-2': ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'ST', 'ST'],
  '4-2-2-2':   ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'LM', 'RM', 'ST', 'ST'],
  '3-4-2-1':   ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'CAM', 'CAM', 'ST'],
  '4-3-1-2':   ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'ST', 'ST'],
  '3-4-1-2':   ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'CAM', 'ST', 'ST'],
  '4-2-4':     ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'LW', 'RW', 'ST', 'ST'],
};

export function formationToSlots(formation: string): Position[] {
  const preset = FORMATION_SLOTS[formation as Formation];
  return preset ? [...preset] : [...FORMATION_SLOTS['4-4-2']];
}

// ─── Tactical modifiers per formation ──────────────────────────────────────

/**
 * Multipliers applied on top of the tactical/attack-focus modifiers.
 * Kept modest (±10-15%) so formation choice shapes the feel of a match
 * without dominating player quality or attack focus.
 */
export interface FormationModifiers {
  /** Scales base open-play goal probability. */
  attackMult: number;
  /** Scales opponent attack probability against this team. 1.0 = neutral. */
  defenseMult: number;
  /** Scales corner-goal probability (wide attacking play). */
  wingPlayMult: number;
  /** Adds to possession percentage (in absolute points, before clamping). */
  possessionDelta: number;
  /** Short label for UI hints. */
  label: string;
}

export function formationModifiers(formation: string): FormationModifiers {
  switch (formation as Formation) {
    // Balanced / neutral
    case '4-4-2':
      return { attackMult: 1.0, defenseMult: 1.0, wingPlayMult: 1.0, possessionDelta: 0, label: 'Clássica equilibrada' };
    case '4-2-3-1':
      return { attackMult: 1.02, defenseMult: 1.02, wingPlayMult: 1.0, possessionDelta: 2, label: 'Controle moderno' };
    case '4-4-1-1':
      return { attackMult: 1.02, defenseMult: 1.0, wingPlayMult: 0.95, possessionDelta: 3, label: 'Enganche atrás do 9' };

    // Attacking
    case '4-3-3':
      return { attackMult: 1.08, defenseMult: 0.97, wingPlayMult: 1.08, possessionDelta: 1, label: 'Pressão alta' };
    case '3-4-3':
      return { attackMult: 1.10, defenseMult: 0.92, wingPlayMult: 1.12, possessionDelta: 0, label: 'Ofensiva com alas' };
    case '3-5-2':
      return { attackMult: 1.05, defenseMult: 0.95, wingPlayMult: 1.10, possessionDelta: 2, label: 'Wingbacks ofensivos' };
    case '4-2-2-2':
      return { attackMult: 1.08, defenseMult: 1.0, wingPlayMult: 1.05, possessionDelta: 3, label: 'Quadrado mágico' };
    case '3-4-2-1':
      return { attackMult: 1.06, defenseMult: 0.95, wingPlayMult: 1.05, possessionDelta: 2, label: 'Dois 10 criativos' };
    case '4-3-1-2':
      return { attackMult: 1.06, defenseMult: 1.0, wingPlayMult: 0.90, possessionDelta: 3, label: 'Enganche e dois atacantes' };
    case '3-4-1-2':
      return { attackMult: 1.08, defenseMult: 0.93, wingPlayMult: 1.0, possessionDelta: 2, label: 'Ofensiva com 3 zagueiros' };

    // Midfield-dense / possession
    case '4-1-2-1-2':
      return { attackMult: 1.04, defenseMult: 1.03, wingPlayMult: 0.80, possessionDelta: 5, label: 'Diamante estreito' };

    // Defensive / low block
    case '4-5-1':
      return { attackMult: 0.92, defenseMult: 1.08, wingPlayMult: 1.0, possessionDelta: -2, label: 'Bloco médio-baixo' };
    case '4-1-4-1':
      return { attackMult: 0.94, defenseMult: 1.06, wingPlayMult: 1.0, possessionDelta: 0, label: 'Volante destacado' };
    case '5-3-2':
      return { attackMult: 0.90, defenseMult: 1.10, wingPlayMult: 0.95, possessionDelta: -3, label: 'Bloco baixo sólido' };
    case '5-4-1':
      return { attackMult: 0.85, defenseMult: 1.15, wingPlayMult: 0.95, possessionDelta: -5, label: 'Muralha defensiva' };

    // Ultra-offensive
    case '4-2-4':
      return { attackMult: 1.15, defenseMult: 0.82, wingPlayMult: 1.15, possessionDelta: -2, label: 'Tudo ou nada' };

    default:
      return { attackMult: 1.0, defenseMult: 1.0, wingPlayMult: 1.0, possessionDelta: 0, label: '' };
  }
}
