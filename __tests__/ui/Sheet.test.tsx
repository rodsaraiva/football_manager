import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Text } from 'react-native';
import { Sheet } from '@/components/kit/Sheet';

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

// RN-web Modal renderiza num portal no document.body; buscamos por testID global.
function byTestId(id: string): HTMLElement {
  return document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
}

describe('Sheet', () => {
  it('renderiza filhos quando visível e fecha pelo backdrop', () => {
    const onClose = jest.fn();
    const { container, root } = render(
      <Sheet visible onClose={onClose} testID="sheet"><Text>conteudo</Text></Sheet>,
    );
    expect(document.body.textContent).toContain('conteudo');
    click(byTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup(root, container);
  });

  it('clique no corpo da folha não fecha (stopPropagation)', () => {
    const onClose = jest.fn();
    const { container, root } = render(
      <Sheet visible onClose={onClose} testID="sheet"><Text>x</Text></Sheet>,
    );
    click(byTestId('sheet-body'));
    expect(onClose).not.toHaveBeenCalled();
    cleanup(root, container);
  });
});
