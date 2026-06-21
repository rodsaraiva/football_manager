import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Badge } from '@/components/kit/Badge';

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

describe('Badge', () => {
  it('renderiza valor e snapshot por tone', () => {
    (['neutral', 'success', 'danger', 'accent'] as const).forEach((tone) => {
      const { container, root } = render(<Badge value={42} tone={tone} accent="#22aa55" />);
      expect(container.textContent).toContain('42');
      expect(container.innerHTML).toMatchSnapshot(tone);
      cleanup(root, container);
    });
  });
});
