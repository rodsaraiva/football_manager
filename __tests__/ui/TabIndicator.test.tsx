import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TabIndicator } from '@/components/kit/TabIndicator';

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

describe('TabIndicator', () => {
  it('ativo usa accent; inativo é transparente', () => {
    const a = render(<TabIndicator active accent="#22aa55" />);
    expect(a.container.innerHTML).toMatchSnapshot('active');
    cleanup(a.root, a.container);
    const i = render(<TabIndicator active={false} accent="#22aa55" />);
    expect(i.container.innerHTML).toMatchSnapshot('inactive');
    cleanup(i.root, i.container);
  });
});
