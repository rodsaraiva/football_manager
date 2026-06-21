import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Toast } from '@/components/kit/Toast';

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

describe('Toast', () => {
  it('renderiza título/mensagem e dispara onDismiss ao tocar', () => {
    const onDismiss = jest.fn();
    const { container, root } = render(
      <Toast title="Salvo" message="Tudo certo" tone="success" onDismiss={onDismiss} testID="toast" />,
    );
    expect(container.textContent).toContain('Salvo');
    expect(container.textContent).toContain('Tudo certo');
    click(container.querySelector('[data-testid="toast"]')!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    cleanup(root, container);
  });

  it('snapshot por tone', () => {
    (['info', 'success', 'danger', 'gold'] as const).forEach((tone) => {
      const { container, root } = render(<Toast title="T" tone={tone} onDismiss={() => {}} />);
      expect(container.innerHTML).toMatchSnapshot(tone);
      cleanup(root, container);
    });
  });
});
