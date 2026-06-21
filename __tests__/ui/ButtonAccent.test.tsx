import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Button } from '@/components/kit/Button';
import { ClubAccentProvider } from '@/theme/ClubAccentProvider';
import { useGameStore } from '@/store/game-store';
import { colors } from '@/theme';

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

// Cor de fundo computada do botão (react-native-web emite background-color no style inline).
function bgColorOf(container: HTMLElement): string {
  const el = container.querySelector('[role="button"]') as HTMLElement;
  return el.style.backgroundColor;
}

describe('Button accent via context', () => {
  afterEach(() => act(() => useGameStore.setState({ playerClub: null } as never)));

  it('primary sem accent explícito herda o accent do clube via ClubAccentProvider', () => {
    act(() =>
      useGameStore.setState({
        playerClub: { primaryColor: '#FFFFFF', secondaryColor: '#000000' },
      } as never),
    );
    const { container, root } = render(
      <ClubAccentProvider>
        <Button label="Salvar" variant="primary" onPress={() => {}} />
      </ClubAccentProvider>,
    );
    // #FFFFFF → rgb(255, 255, 255)
    expect(bgColorOf(container)).toBe('rgb(255, 255, 255)');
    cleanup(root, container);
  });

  it('accent explícito tem precedência sobre o contexto', () => {
    act(() =>
      useGameStore.setState({
        playerClub: { primaryColor: '#FFFFFF', secondaryColor: '#000000' },
      } as never),
    );
    const { container, root } = render(
      <ClubAccentProvider>
        <Button label="x" variant="primary" accent="#22aa55" onPress={() => {}} />
      </ClubAccentProvider>,
    );
    expect(bgColorOf(container)).toBe('rgb(34, 170, 85)');
    cleanup(root, container);
  });

  it('fora do provider cai no default colors.primary (sem lançar)', () => {
    const { container, root } = render(<Button label="x" variant="primary" onPress={() => {}} />);
    const expected = colors.primary
      .replace('#', '')
      .match(/.{2}/g)!
      .map((h) => parseInt(h, 16));
    expect(bgColorOf(container)).toBe(`rgb(${expected[0]}, ${expected[1]}, ${expected[2]})`);
    cleanup(root, container);
  });
});
