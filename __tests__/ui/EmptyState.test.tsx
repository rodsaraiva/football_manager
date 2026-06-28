import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EmptyState } from '@/components/kit/EmptyState';

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

describe('EmptyState', () => {
  it('renderiza título/descrição e dispara CTA', () => {
    const onCta = jest.fn();
    const { container, root } = render(
      <EmptyState art="search" title="Sem resultados" description="Ajuste os filtros" ctaLabel="Limpar" onCtaPress={onCta} />,
    );
    expect(container.textContent).toContain('Sem resultados');
    expect(container.textContent).toContain('Limpar');
    const cta = container.querySelector('[role="button"]')!;
    click(cta);
    expect(onCta).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toMatchSnapshot();
    cleanup(root, container);
  });

  it('sem ctaLabel não renderiza botão', () => {
    const { container, root } = render(<EmptyState title="Vazio" />);
    expect(container.querySelector('[role="button"]')).toBeNull();
    cleanup(root, container);
  });
});
