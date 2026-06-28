import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ClubAccentProvider, useClubAccentContext } from '@/theme/ClubAccentProvider';
import { useGameStore } from '@/store/game-store';

function captureWithin(): string {
  let accent!: string;
  function Probe() {
    accent = useClubAccentContext().accent;
    return null;
  }
  const container = document.createElement('div');
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(
      <ClubAccentProvider>
        <Probe />
      </ClubAccentProvider>,
    );
  });
  act(() => root.unmount());
  return accent;
}

describe('ClubAccentProvider', () => {
  afterEach(() => act(() => useGameStore.setState({ playerClub: null } as never)));

  it('expõe o accent default sem clube', () => {
    act(() => useGameStore.setState({ playerClub: null } as never));
    expect(captureWithin()).toBe('#4361ee');
  });

  it('expõe o accent do clube selecionado', () => {
    act(() =>
      useGameStore.setState({
        playerClub: { primaryColor: '#FFFFFF', secondaryColor: '#000000' },
      } as never),
    );
    expect(captureWithin()).toBe('#FFFFFF');
  });

  it('useClubAccentContext fora do provider lança erro claro', () => {
    function Bare() {
      useClubAccentContext();
      return null;
    }
    const container = document.createElement('div');
    expect(() =>
      act(() => {
        createRoot(container).render(<Bare />);
      }),
    ).toThrow(/ClubAccentProvider/);
  });
});
