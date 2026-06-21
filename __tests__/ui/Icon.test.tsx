import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Icon } from '@/components/kit/Icon';

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

describe('Icon', () => {
  it('renderiza um svg com cor custom e snapshot', () => {
    const { container, root } = render(<Icon name="goal" size={32} color="#22aa55" />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.innerHTML).toMatchSnapshot();
    cleanup(root, container);
  });
});
