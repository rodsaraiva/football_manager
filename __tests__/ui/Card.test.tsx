import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Text } from 'react-native';
import { Card } from '@/components/kit/Card';

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

describe('Card', () => {
  it('renderiza filhos e aceita variante hero', () => {
    const { container, root } = render(
      <Card variant="hero" testID="c"><Text>oi</Text></Card>,
    );
    expect(container.querySelector('[data-testid="c"]')).toBeTruthy();
    expect(container.textContent).toContain('oi');
    expect(container.innerHTML).toMatchSnapshot();
    cleanup(root, container);
  });
});
