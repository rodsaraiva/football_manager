export type Formation = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '3-4-3' | '4-5-1' | '4-1-4-1' | '5-3-2' | '5-4-1';
export type Mentality = 'defensive' | 'balanced' | 'attacking';
export type Pressing = 'low' | 'medium' | 'high';
export type PassingStyle = 'short' | 'mixed' | 'direct';
export type Tempo = 'slow' | 'normal' | 'fast';
export type Width = 'narrow' | 'normal' | 'wide';
export type AttackFocus =
  | 'through_middle'  // verticality through central midfielders
  | 'down_the_flanks' // exploits wingers, crosses
  | 'balanced'        // mixes both
  | 'counter_attack'  // sits back, springs quick transitions
  | 'possession';     // slow build-up, holds the ball
export type SubstitutionStrategy =
  | 'minimal'         // only injuries/exhaustion
  | 'balanced'        // default behaviour
  | 'heavy_rotation'  // uses all 5 subs, rotates freely
  | 'youth_chances'   // prefers youth (<=21) from the bench when possible
  | 'chase_the_game'; // losing → attack, winning → defend

export interface Tactic {
  id: number;
  clubId: number;
  name: string;
  isActive: boolean;
  formation: Formation;
  mentality: Mentality;
  pressing: Pressing;
  passingStyle: PassingStyle;
  tempo: Tempo;
  width: Width;
  attackFocus: AttackFocus;
  subStrategy: SubstitutionStrategy;
}

export interface TacticPosition {
  tacticId: number;
  slot: number;
  playerId: number;
  positionRole: string;
  instructions: Record<string, unknown>;
}
