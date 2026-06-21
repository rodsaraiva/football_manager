import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useClubAccent } from '@/theme/useClubAccent';
import { useGameStore } from '@/store/game-store';
import { luminance } from '@/theme/club-accent';

// Captura o valor do hook num Probe renderizado via react-dom (mesmo motor das telas).
function capture(): ReturnType<typeof useClubAccent> {
  let ramp!: ReturnType<typeof useClubAccent>;
  function Probe() {
    ramp = useClubAccent();
    return null;
  }
  const container = document.createElement('div');
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<Probe />);
  });
  act(() => root.unmount());
  return ramp;
}

const setClub = (club: unknown) =>
  act(() => {
    useGameStore.setState({ playerClub: club } as never);
  });

describe('useClubAccent', () => {
  afterEach(() => setClub(null));

  it('sem clube → default azul, rampa completa, texto branco', () => {
    setClub(null);
    const ramp = capture();
    expect(ramp.accent).toBe('#4361ee');
    expect(ramp.onAccent).toBe('#ffffff');
    expect(luminance(ramp.accentDim)).toBeLessThan(luminance(ramp.accent));
    expect(luminance(ramp.accentBright)).toBeGreaterThan(luminance(ramp.accent));
  });

  it('clube de cor escura → accent passa pelo floor de luminância e onAccent fica legível', () => {
    setClub({ primaryColor: '#101010', secondaryColor: '#080808' });
    const ramp = capture();
    // deriveClubAccent clareia cores escuras (mixWithWhite) até cruzar o floor de 60.
    expect(luminance(ramp.accent)).toBeGreaterThanOrEqual(60);
    // onAccent segue a regra de flip: preto sobre accent claro, branco sobre escuro.
    expect(ramp.onAccent).toBe(luminance(ramp.accent) >= 140 ? '#000000' : '#ffffff');
  });

  it('clube de cor clara → texto preto sobre accent', () => {
    setClub({ primaryColor: '#FFFFFF', secondaryColor: '#000000' });
    const ramp = capture();
    expect(ramp.accent).toBe('#FFFFFF');
    expect(ramp.onAccent).toBe('#000000');
  });
});
