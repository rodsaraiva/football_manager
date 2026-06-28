import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ProgressBar from '@/components/ProgressBar';
import { ClubAccentProvider } from '@/theme/ClubAccentProvider';
import { useGameStore } from '@/store/game-store';

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

// O fill é o div com width percentual definido inline pelo react-native-web.
function fillEl(container: HTMLElement): HTMLElement {
  const els = Array.from(container.querySelectorAll('div')) as HTMLElement[];
  return els.find((e) => /%$/.test(e.style.width))!;
}

describe('ProgressBar', () => {
  beforeEach(() =>
    act(() =>
      useGameStore.setState({
        playerClub: { primaryColor: '#FFFFFF', secondaryColor: '#000' },
      } as never),
    ),
  );
  afterEach(() => act(() => useGameStore.setState({ playerClub: null } as never)));

  it('fill usa o accent do clube e largura proporcional ao progress', () => {
    const { container, root } = render(
      <ClubAccentProvider>
        <ProgressBar progress={0.5} />
      </ClubAccentProvider>,
    );
    const fill = fillEl(container);
    expect(fill.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(fill.style.width).toBe('50%');
    cleanup(root, container);
  });

  it('clampa progress acima de 1 e abaixo de 0', () => {
    const hi = render(
      <ClubAccentProvider>
        <ProgressBar progress={2} />
      </ClubAccentProvider>,
    );
    expect(fillEl(hi.container).style.width).toBe('100%');
    cleanup(hi.root, hi.container);

    const lo = render(
      <ClubAccentProvider>
        <ProgressBar progress={-1} />
      </ClubAccentProvider>,
    );
    expect(fillEl(lo.container).style.width).toBe('0%');
    cleanup(lo.root, lo.container);
  });
});
