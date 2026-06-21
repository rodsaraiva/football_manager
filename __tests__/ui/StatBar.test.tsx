import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StatBar from '@/components/StatBar';

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

describe('StatBar', () => {
  it('renderiza label e valor', () => {
    const { container, root } = render(<StatBar label="Velocidade" value={80} />);
    expect(container.textContent).toContain('Velocidade');
    expect(container.textContent).toContain('80');
    expect(container.innerHTML).toMatchSnapshot();
    cleanup(root, container);
  });
});
