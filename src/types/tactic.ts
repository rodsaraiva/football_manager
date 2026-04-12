export type Formation = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '3-4-3' | '4-5-1' | '4-1-4-1' | '5-3-2' | '5-4-1';
export type Mentality = 'defensive' | 'balanced' | 'attacking';
export type Pressing = 'low' | 'medium' | 'high';
export type PassingStyle = 'short' | 'mixed' | 'direct';
export type Tempo = 'slow' | 'normal' | 'fast';
export type Width = 'narrow' | 'normal' | 'wide';

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
}

export interface TacticPosition {
  tacticId: number;
  slot: number;
  playerId: number;
  positionRole: string;
  instructions: Record<string, unknown>;
}
