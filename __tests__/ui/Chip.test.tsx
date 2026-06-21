import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Chip } from '@/components/kit/Chip';

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

describe('Chip', () => {
  it('dispara onPress e reflete selected com o accent no fundo', () => {
    const onPress = jest.fn();
    const { container, root } = render(
      <Chip label="2024" selected onPress={onPress} accent="#22aa55" testID="chip" />,
    );
    const node = container.querySelector('[data-testid="chip"]') as HTMLElement;
    // RN-web renderiza accessibilityRole=button como <button role=button> (sem aria-selected);
    // o selected é observável via o accent no fundo (#22aa55 → rgb(34, 170, 85)).
    expect(node.style.backgroundColor).toBe('rgb(34, 170, 85)');
    click(node);
    expect(onPress).toHaveBeenCalledTimes(1);
    cleanup(root, container);
  });

  it('snapshot estável selecionado vs não', () => {
    const idle = render(<Chip label="A" onPress={() => {}} />);
    expect(idle.container.innerHTML).toMatchSnapshot('idle');
    cleanup(idle.root, idle.container);
    const sel = render(<Chip label="A" selected onPress={() => {}} accent="#22aa55" />);
    expect(sel.container.innerHTML).toMatchSnapshot('selected');
    cleanup(sel.root, sel.container);
  });
});
