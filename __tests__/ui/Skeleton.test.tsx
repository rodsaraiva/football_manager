import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Skeleton } from '@/components/kit/Skeleton';

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

describe('Skeleton', () => {
  it('renderiza com dimensões custom', () => {
    const { container, root } = render(<Skeleton width={120} height={16} />);
    expect(container.innerHTML).toMatchSnapshot();
    cleanup(root, container);
  });
});
