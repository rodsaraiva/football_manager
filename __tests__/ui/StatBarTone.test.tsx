import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StatBar from '@/components/StatBar';
import { ClubAccentProvider } from '@/theme/ClubAccentProvider';
import { useGameStore } from '@/store/game-store';
import { getBarColor } from '@/utils/player-colors';

function hexToRgb(hex: string): string {
  const [r, g, b] = hex.replace('#', '').match(/.{2}/g)!.map((h) => parseInt(h, 16));
  return `rgb(${r}, ${g}, ${b})`;
}

function render(element: React.ReactElement): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  // StatBar mede a track via onLayout antes de pintar o SVG; força um frame.
  act(() => {
    container.querySelectorAll('div').forEach((d) => {
      Object.defineProperty(d, 'offsetWidth', { value: 100, configurable: true });
    });
  });
  return { container, root };
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => root.unmount());
  container.remove();
}

describe('StatBar tone', () => {
  beforeEach(() =>
    act(() =>
      useGameStore.setState({
        playerClub: { primaryColor: '#FFFFFF', secondaryColor: '#000' },
      } as never),
    ),
  );
  afterEach(() => act(() => useGameStore.setState({ playerClub: null } as never)));

  it('default (rating) usa getBarColor na cor do valor', () => {
    const { container, root } = render(
      <ClubAccentProvider>
        <StatBar label="Velocidade" value={80} />
      </ClubAccentProvider>,
    );
    // o número (valueColor) recebe a cor de rating
    expect(container.innerHTML).toContain(hexToRgb(getBarColor(80)));
    cleanup(root, container);
  });

  it('tone=accent usa a cor do clube', () => {
    const { container, root } = render(
      <ClubAccentProvider>
        <StatBar label="Velocidade" value={80} tone="accent" />
      </ClubAccentProvider>,
    );
    // valueColor vira o accent do clube (#FFFFFF -> rgb(255,255,255) no inline style)
    expect(container.innerHTML.toLowerCase()).toMatch(/rgb\(255, 255, 255\)|#ffffff/);
    cleanup(root, container);
  });
});
