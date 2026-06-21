import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  Display, Headline, Title, Subheading, Body, Label, Caption, Stat,
} from '@/components/typography';
import { typography } from '@/theme/tokens';

// react-native-web serializa <Text> p/ um elemento DOM com estilo inline (CSS).
// Renderizamos via react-dom (mesmo motor das telas em __tests__/ui) e lemos o
// computed style do nó de texto — react-test-renderer não casa com o alvo DOM do RN-web.
function renderToDom(element: React.ReactElement): { node: HTMLElement; root: Root; container: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  const node = container.firstElementChild as HTMLElement;
  return { node, root, container };
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => root.unmount());
  container.remove();
}

describe('componentes de tipografia', () => {
  it('cada wrapper renderiza com o estilo do seu variant', () => {
    const cases: [React.ComponentType<any>, keyof typeof typography][] = [
      [Display, 'display'], [Headline, 'headline'], [Title, 'title'],
      [Subheading, 'subheading'], [Body, 'body'], [Label, 'label'],
      [Caption, 'caption'], [Stat, 'stat'],
    ];
    for (const [Comp, variant] of cases) {
      const { node, root, container } = renderToDom(<Comp>texto</Comp>);
      const s = node.style;
      expect(s.fontSize).toBe(`${typography[variant].size}px`);
      expect(s.fontFamily).toContain(typography[variant].family);
      expect(s.fontWeight).toBe(typography[variant].weight);
      cleanup(root, container);
    }
  });

  it('Stat usa a família Saira Condensed (números/stats)', () => {
    // react-native-web descarta fontVariant ao serializar p/ DOM; o contrato
    // tabular-nums é asserido no nível do token/textStyle (theme). No render, o
    // diferencial observável de Stat é a família monoespaçada de números.
    const { node, root, container } = renderToDom(<Stat>99</Stat>);
    expect(node.style.fontFamily).toContain('SairaCondensed');
    cleanup(root, container);
  });

  it('prop color sobrescreve a cor', () => {
    const { node, root, container } = renderToDom(<Body color="#123456">x</Body>);
    // react-native-web normaliza #123456 → rgb(18, 52, 86)
    expect(node.style.color).toBe('rgb(18, 52, 86)');
    cleanup(root, container);
  });

  it('style do consumidor compõe sobre o variant', () => {
    const { node, root, container } = renderToDom(<Title style={{ marginTop: 7 }}>t</Title>);
    expect(node.style.marginTop).toBe('7px');
    expect(node.style.fontSize).toBe(`${typography.title.size}px`); // base preservada
    cleanup(root, container);
  });

  it('renderiza o children como texto', () => {
    const { node, root, container } = renderToDom(<Body>Olá</Body>);
    expect(node.textContent).toContain('Olá');
    cleanup(root, container);
  });

  it('snapshot estável dos 8 variants', () => {
    const { container, root } = renderToDom(
      <>
        <Display>D</Display><Headline>H</Headline><Title>T</Title>
        <Subheading>S</Subheading><Body>B</Body><Label>L</Label>
        <Caption>C</Caption><Stat>1</Stat>
      </>
    );
    expect(container.innerHTML).toMatchSnapshot();
    cleanup(root, container);
  });
});
