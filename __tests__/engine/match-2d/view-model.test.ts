import { extractShots, shotColor, binHeatmap, ShotResult } from '@/engine/match-2d/view-model';
import { colors } from '@/theme/tokens';
import { MatchEvent } from '@/types';

function ev(partial: Partial<MatchEvent>): MatchEvent {
  return {
    fixtureId: 1,
    minute: 10,
    type: 'shot_off_target',
    playerId: 1,
    secondaryPlayerId: null,
    ...partial,
  };
}

describe('extractShots', () => {
  it('mantém apenas finalizações com geometria e mapeia o resultado', () => {
    const events: MatchEvent[] = [
      ev({ type: 'goal', x: 0.9, y: 0.5, xg: 0.4 }),
      ev({ type: 'penalty_scored', x: 0.88, y: 0.5, xg: 0.76 }),
      ev({ type: 'shot_on_target', x: 0.8, y: 0.4, xg: 0.2 }),
      ev({ type: 'shot_off_target', x: 0.7, y: 0.6, xg: 0.1 }),
      ev({ type: 'save', x: 0.85, y: 0.55, xg: 0.3 }),
      ev({ type: 'yellow', x: 0.5, y: 0.5 }), // não é chute → fora
      ev({ type: 'goal', xg: 0.5 }), // sem (x,y) → fora
    ];
    const shots = extractShots(events);
    expect(shots.map((s) => s.result)).toEqual<ShotResult[]>([
      'goal',
      'goal',
      'on_target',
      'off_target',
      'saved',
    ]);
    expect(shots[0]).toMatchObject({ x: 0.9, y: 0.5, xg: 0.4, minute: 10 });
  });

  it('aplica xG default quando ausente', () => {
    const shots = extractShots([ev({ type: 'goal', x: 0.5, y: 0.5 })]);
    expect(shots[0].xg).toBeCloseTo(0.04);
  });
});

describe('shotColor', () => {
  it('mapeia cada resultado p/ um token distinto', () => {
    expect(shotColor('goal')).toBe(colors.success);
    expect(shotColor('on_target')).toBe(colors.primary);
    expect(shotColor('saved')).toBe(colors.warning);
    expect(shotColor('off_target')).toBe(colors.textMuted);
    const all = new Set([
      shotColor('goal'),
      shotColor('on_target'),
      shotColor('saved'),
      shotColor('off_target'),
    ]);
    expect(all.size).toBe(4);
  });
});

describe('binHeatmap', () => {
  it('conta posições por célula e normaliza intensidade', () => {
    const events: MatchEvent[] = [
      ev({ x: 0.05, y: 0.05 }), // col 0 row 0
      ev({ x: 0.1, y: 0.1 }), // col 0 row 0
      ev({ x: 0.95, y: 0.95 }), // última col/row
    ];
    const bins = binHeatmap(events, 4, 2);
    expect(bins.cols).toBe(4);
    expect(bins.rows).toBe(2);
    expect(bins.maxCount).toBe(2);
    const c00 = bins.cells.find((c) => c.col === 0 && c.row === 0);
    expect(c00).toMatchObject({ count: 2, intensity: 1 });
    const last = bins.cells.find((c) => c.col === 3 && c.row === 1);
    expect(last).toMatchObject({ count: 1, intensity: 0.5 });
  });

  it('clampa x=1/y=1 para a última célula e ignora eventos sem geometria', () => {
    const bins = binHeatmap([ev({ x: 1, y: 1 }), ev({ type: 'yellow' })], 3, 3);
    expect(bins.cells).toEqual([{ col: 2, row: 2, count: 1, intensity: 1 }]);
  });

  it('grid vazio → sem células, maxCount 0', () => {
    const bins = binHeatmap([], 6, 4);
    expect(bins.cells).toEqual([]);
    expect(bins.maxCount).toBe(0);
  });
});
