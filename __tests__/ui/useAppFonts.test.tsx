import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

let mockReturn: [boolean, Error | null] = [false, null];
jest.mock('expo-font', () => ({
  useFonts: () => mockReturn,
}));

import { useAppFonts } from '@/theme/useAppFonts';

function Probe({ onValue }: { onValue: (v: boolean) => void }) {
  onValue(useAppFonts());
  return null;
}

function render(): boolean {
  let value = false;
  act(() => { TestRenderer.create(<Probe onValue={(v) => { value = v; }} />); });
  return value;
}

describe('useAppFonts', () => {
  it('false enquanto carrega (loaded=false, error=null)', () => {
    mockReturn = [false, null];
    expect(render()).toBe(false);
  });
  it('true quando carregou', () => {
    mockReturn = [true, null];
    expect(render()).toBe(true);
  });
  it('true mesmo com erro (fallback de sistema, não trava o app)', () => {
    mockReturn = [false, new Error('font load failed')];
    expect(render()).toBe(true);
  });
});
