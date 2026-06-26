/**
 * View-model puro para os mapas 2D (L2.5). Sem React, sem RN — só transforma
 * `MatchEvent[]` (já com geometria normalizada [0,1]×[0,1]) em estruturas que os
 * componentes SVG plotam. Determinístico e unit-testável isoladamente.
 */
import { MatchEvent, MatchEventType } from '@/types';
import { colors } from '@/theme/tokens';

export type ShotResult = 'goal' | 'on_target' | 'off_target' | 'saved';

export interface Shot {
  x: number;
  y: number;
  xg: number;
  result: ShotResult;
  minute: number;
  playerId: number;
}

// Tipos de evento que representam uma finalização com posição. `save` é o lado do
// goleiro (chute no alvo defendido); `shot_on_target` cru sobra como no-alvo.
const RESULT_BY_TYPE: Partial<Record<MatchEventType, ShotResult>> = {
  goal: 'goal',
  penalty_scored: 'goal',
  free_kick_scored: 'goal',
  shot_on_target: 'on_target',
  shot_off_target: 'off_target',
  save: 'saved',
};

// xG default p/ chutes sem qualidade persistida (bola parada legada): raio mínimo.
const DEFAULT_XG = 0.04;

/** Extrai finalizações posicionadas dos eventos. Ignora eventos sem (x,y). */
export function extractShots(events: MatchEvent[]): Shot[] {
  const shots: Shot[] = [];
  for (const e of events) {
    const result = RESULT_BY_TYPE[e.type];
    if (!result) continue;
    if (e.x == null || e.y == null) continue;
    shots.push({
      x: e.x,
      y: e.y,
      xg: e.xg ?? DEFAULT_XG,
      result,
      minute: e.minute,
      playerId: e.playerId,
    });
  }
  return shots;
}

/** Cor (token) por resultado da finalização. */
export function shotColor(result: ShotResult): string {
  switch (result) {
    case 'goal':
      return colors.success;
    case 'on_target':
      return colors.primary;
    case 'saved':
      return colors.warning;
    case 'off_target':
      return colors.textMuted;
  }
}

export interface HeatCell {
  col: number;
  row: number;
  count: number;
  /** count / maxCount ∈ [0,1]. */
  intensity: number;
}

export interface HeatBins {
  cols: number;
  rows: number;
  maxCount: number;
  /** Apenas células com count>0, ordenadas (row, col) p/ snapshot determinístico. */
  cells: HeatCell[];
}

function clampIndex(v: number, max: number): number {
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}

/** Densidade das posições (x,y) de todos os eventos num grid cols×rows. */
export function binHeatmap(events: MatchEvent[], cols: number, rows: number): HeatBins {
  const counts = new Map<string, number>();
  let maxCount = 0;
  for (const e of events) {
    if (e.x == null || e.y == null) continue;
    const col = clampIndex(Math.floor(e.x * cols), cols - 1);
    const row = clampIndex(Math.floor(e.y * rows), rows - 1);
    const key = `${col},${row}`;
    const c = (counts.get(key) ?? 0) + 1;
    counts.set(key, c);
    if (c > maxCount) maxCount = c;
  }
  const cells: HeatCell[] = [...counts.entries()]
    .map(([k, count]) => {
      const [col, row] = k.split(',').map(Number);
      return { col, row, count, intensity: maxCount ? count / maxCount : 0 };
    })
    .sort((a, b) => a.row - b.row || a.col - b.col);
  return { cols, rows, maxCount, cells };
}
