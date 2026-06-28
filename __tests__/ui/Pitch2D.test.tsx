import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Pitch2D } from '@/components/Pitch2D';
import { ShotMap } from '@/components/ShotMap';
import { HeatMap } from '@/components/HeatMap';
import { MatchEvent } from '@/types';

function render(element: React.ReactElement): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  return { container, root };
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => root.unmount());
  container.remove();
}

function ev(p: Partial<MatchEvent>): MatchEvent {
  return { fixtureId: 1, minute: 10, type: 'shot_off_target', playerId: 1, secondaryPlayerId: null, ...p };
}

const EVENTS: MatchEvent[] = [
  ev({ type: 'goal', x: 0.9, y: 0.5, xg: 0.42 }),
  ev({ type: 'shot_on_target', x: 0.78, y: 0.4, xg: 0.18 }),
  ev({ type: 'shot_off_target', x: 0.6, y: 0.7, xg: 0.08 }),
  ev({ type: 'save', x: 0.85, y: 0.55, xg: 0.3 }),
  ev({ type: 'goal', x: 0.12, y: 0.45, xg: 0.5 }),
];

describe('Pitch2D / ShotMap / HeatMap', () => {
  it('Pitch2D renderiza o campo (snapshot)', () => {
    const { container, root } = render(<Pitch2D testID="pitch" />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.innerHTML).toMatchSnapshot();
    cleanup(root, container);
  });

  it('ShotMap plota chutes e legenda (snapshot)', () => {
    const { container, root } = render(
      <ShotMap
        testID="shotmap"
        events={EVENTS}
        labels={{ goal: 'Gol', onTarget: 'No alvo', offTarget: 'Para fora', saved: 'Defendido' }}
      />,
    );
    expect(container.querySelector('[data-testid="shotmap"]')).toBeTruthy();
    expect(container.textContent).toContain('Gol');
    expect(container.textContent).toContain('Defendido');
    expect(container.innerHTML).toMatchSnapshot();
    cleanup(root, container);
  });

  it('HeatMap renderiza grid e legenda (snapshot)', () => {
    const { container, root } = render(
      <HeatMap testID="heatmap" events={EVENTS} cols={6} rows={4} labels={{ less: 'Menos', more: 'Mais' }} />,
    );
    expect(container.querySelector('[data-testid="heatmap"]')).toBeTruthy();
    expect(container.textContent).toContain('Menos');
    expect(container.innerHTML).toMatchSnapshot();
    cleanup(root, container);
  });

  it('ShotMap sem eventos não quebra', () => {
    const { container, root } = render(<ShotMap testID="empty" events={[]} />);
    expect(container.querySelector('[data-testid="empty"]')).toBeTruthy();
    cleanup(root, container);
  });
});
