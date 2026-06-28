import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Button } from '@/components/kit/Button';

// Render via react-dom + react-native-web (mesmo motor das telas em __tests__/ui).
// react-test-renderer não casa com o alvo DOM do RN-web (ver typography.test.tsx).
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

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

describe('Button', () => {
  it('renderiza com label e dispara onPress', () => {
    const onPress = jest.fn();
    const { container, root } = render(<Button label="Contratar" onPress={onPress} testID="btn" />);
    expect(container.textContent).toContain('Contratar');
    const node = container.querySelector('[data-testid="btn"]')!;
    click(node);
    expect(onPress).toHaveBeenCalledTimes(1);
    cleanup(root, container);
  });

  it('disabled não dispara onPress', () => {
    const onPress = jest.fn();
    const { container, root } = render(<Button label="X" onPress={onPress} disabled testID="btn" />);
    const node = container.querySelector('[data-testid="btn"]')!;
    click(node);
    expect(onPress).not.toHaveBeenCalled();
    cleanup(root, container);
  });

  it('snapshot estável por variante', () => {
    (['primary', 'secondary', 'ghost', 'danger'] as const).forEach((v) => {
      const { container, root } = render(<Button label="A" variant={v} onPress={() => {}} />);
      expect(container.innerHTML).toMatchSnapshot(v);
      cleanup(root, container);
    });
  });
});
