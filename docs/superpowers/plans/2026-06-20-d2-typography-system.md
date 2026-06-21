# D2 — Sistema de Tipografia (expo-font + componentes semânticos de texto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2-5 min). Sem placeholders: todo código aparece por inteiro. Os Steps de "commit" descrevem o que commitar — **subagents NÃO commitam**, o orquestrador commita.

**Goal:** Trocar a fonte de sistema por um par tipográfico premium (**Manrope** para UI, **Saira Condensed** para números/stats) carregado via `expo-font`, com gate de render em `App.tsx`, e expor **componentes semânticos de texto** (`Display/Headline/Title/Subheading/Body/Label/Caption/Stat`) que leem size/lineHeight/weight/family dos tokens v2 — cada um testado por render + snapshot, com fallback de sistema seguro.

**Architecture:** Os tokens de tipografia (D1) viram a **única fonte da verdade** de `size/lineHeight/weight/family`. Um helper puro `textStyle(variant, overrides?)` resolve um `TextStyle` a partir de um `typography[variant]` token; cada componente semântico é um wrapper fino sobre `<Text>` que aplica `textStyle(...)` + `style` do consumidor. As fontes são registradas como assets em `assets/fonts/` + `app.json`, carregadas por `useFonts` num hook `useAppFonts`, e o `App.tsx` ganha um segundo gate (`fontsReady`) ao lado do `isReady` do `database-store`. Render puro testável via `react-test-renderer` (env node), sem depender de fontes carregadas (família é só string — fallback de sistema cobre o teste).

**Tech Stack:** Expo 54 / RN 0.81 / React 19.1 / TS 5.9 strict / Jest 29 + ts-jest (`testEnvironment: 'node'`) / `expo-font` (a adicionar a `dependencies`; já presente transitivamente em `node_modules`, v14.0.11) / `react-test-renderer` (a adicionar a `devDependencies`, alinhado a React 19.1).

**Convenções:**
- pt-BR. Engine puro intocado (D2 só toca `src/theme/`, `src/components/`, `App.tsx`, `package.json`, `app.json`, `assets/fonts/`).
- Tokens **sempre** de `@/theme`; **zero** literal de fontSize/lineHeight/weight nos componentes de texto.
- `src/theme/tokens.ts` é **puro** (sem `import 'react-native'`) — o tipo `TextStyle['fontWeight']` é importável de `react-native` apenas em `index.ts`/componentes, **não** em `tokens.ts`. Em `tokens.ts` os pesos são `string` literais (`'400'|'600'|'700'|'800'`).
- i18n pt/en intocado (D2 não adiciona strings).
- TDD: teste falhando → ver falhar → implementação mínima → ver passar → commit.
- Branch `feat/d2-typography-system`. Mensagens de commit terminam com:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Zero `Math.random`/`Date.now` (tudo aqui é constante/render).

**Precedente a espelhar:**
- `docs/superpowers/plans/2026-06-14-w1-staff-hiring.md` (formato deste plano).
- `src/theme/tokens.ts` (tokens puros, sem RN) e `src/theme/index.ts` (re-export + `commonStyles` com `StyleSheet`).
- `src/components/LoadingScreen.tsx` (componente RN simples consumindo `@/theme`).
- `App.tsx:11-36` (padrão de gate `isReady` + `LoadingScreen`).
- `__tests__/theme/tokens.test.ts` (teste puro de tokens).
- `jest.config.js` (preset ts-jest, env node, `moduleNameMapper` `^@/(.*)$`).

> **Dependência de D1.** Este plano assume que **D1 (Tokens v2)** já adicionou a chave `typography` em `src/theme/tokens.ts`. No estado atual (lido em 2026-06-20) `tokens.ts` ainda é chapado (`fontSize` é número cru, sem `typography`). **Task 1 abaixo cria a chave `typography` caso D1 ainda não a tenha materializado** — é idempotente: se D1 já definiu `typography` com as mesmas chaves, a Task 1 vira um no-op verificável (o teste passa direto). Isso destrava D2 sem bloquear em D1.

---

## File Structure

- **Modify** `src/theme/tokens.ts:49` — adicionar token `typography` (escala semântica: size/lineHeight/weight/family por variante) e constantes de família (`FONT_FAMILY`). Manter `fontSize` como alias retrocompatível.
- **Modify** `src/theme/index.ts:5` — re-exportar `typography`, `FONT_FAMILY` e o helper `textStyle`.
- **Create** `src/theme/typography.ts` — helper puro `textStyle(variant, overrides?)` + tipos `TypographyVariant`/`TypographyToken`.
- **Create** `src/components/typography/Text.tsx` — base `<AppText variant=...>` + os 8 wrappers semânticos exportados (`Display/Headline/Title/Subheading/Body/Label/Caption/Stat`).
- **Create** `src/components/typography/index.ts` — barrel de re-export.
- **Create** `src/theme/useAppFonts.ts` — hook `useAppFonts(): boolean` envolvendo `useFonts` do `expo-font`.
- **Modify** `App.tsx:1-36` — importar `useAppFonts`, gate `fontsReady` ao lado de `isReady`.
- **Modify** `app.json` — registrar assets de fonte (web) e plugin `expo-font`.
- **Modify** `package.json` — `expo-font` em `dependencies`, `react-test-renderer` em `devDependencies`.
- **Create** `assets/fonts/` — `.ttf` de Manrope (Regular/SemiBold/Bold/ExtraBold) e Saira Condensed (SemiBold/Bold).
- **Test** `__tests__/theme/typography.test.ts` — token `typography` + helper `textStyle` (puro).
- **Test** `__tests__/components/typography.test.tsx` — render + snapshot dos 8 componentes (react-test-renderer).
- **Test** `__tests__/theme/useAppFonts.test.tsx` — hook retorna boolean (mock de `expo-font`).

**Contract (assinaturas exatas):**

```ts
// src/theme/tokens.ts (adicionar)
export const FONT_FAMILY = {
  ui: 'Manrope',                  // peso 400
  uiSemibold: 'Manrope-SemiBold', // peso 600
  uiBold: 'Manrope-Bold',         // peso 700
  uiExtra: 'Manrope-ExtraBold',   // peso 800
  stat: 'SairaCondensed-SemiBold',
  statBold: 'SairaCondensed-Bold',
} as const;

export interface TypographyToken {
  size: number;
  lineHeight: number;
  weight: '400' | '600' | '700' | '800';
  family: string;        // um valor de FONT_FAMILY
  letterSpacing?: number;
  tabular?: boolean;     // true → fontVariant ['tabular-nums'] (Stat)
}
export const typography: Record<
  'display' | 'headline' | 'title' | 'subheading' | 'body' | 'label' | 'caption' | 'stat',
  TypographyToken
>;

// src/theme/typography.ts
import type { TextStyle } from 'react-native';
export type TypographyVariant = keyof typeof typography; // 'display' | ... | 'stat'
export function textStyle(variant: TypographyVariant, overrides?: Partial<TextStyle>): TextStyle;

// src/components/typography/Text.tsx
import type { TextProps } from 'react-native';
export interface AppTextProps extends TextProps { variant?: TypographyVariant; color?: string; }
export function Display(props: AppTextProps): JSX.Element;
export function Headline(props: AppTextProps): JSX.Element;
export function Title(props: AppTextProps): JSX.Element;
export function Subheading(props: AppTextProps): JSX.Element;
export function Body(props: AppTextProps): JSX.Element;
export function Label(props: AppTextProps): JSX.Element;
export function Caption(props: AppTextProps): JSX.Element;
export function Stat(props: AppTextProps): JSX.Element;

// src/theme/useAppFonts.ts
export function useAppFonts(): boolean; // true quando fontes carregaram (ou falharam → fallback sistema)
```

---

## Task 1: Token `typography` + `FONT_FAMILY` nos tokens puros (TDD)

**Files:** Modify `src/theme/tokens.ts`; Create `__tests__/theme/typography.test.ts`.
**Interfaces:** Consumes: (nada). Produces: `typography`, `FONT_FAMILY`, `TypographyToken` exportados de `@/theme/tokens`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/theme/typography.test.ts`:
```ts
import { typography, FONT_FAMILY, fontSize } from '@/theme/tokens';

const VARIANTS = ['display','headline','title','subheading','body','label','caption','stat'] as const;

describe('typography token', () => {
  it('tem as 8 variantes com size/lineHeight/weight/family', () => {
    for (const v of VARIANTS) {
      const t = typography[v];
      expect(t).toBeDefined();
      expect(typeof t.size).toBe('number');
      expect(t.size).toBeGreaterThan(0);
      expect(t.lineHeight).toBeGreaterThanOrEqual(t.size); // line-height nunca < size
      expect(['400','600','700','800']).toContain(t.weight);
      expect(typeof t.family).toBe('string');
      expect(t.family.length).toBeGreaterThan(0);
    }
  });

  it('escala de tamanho é decrescente de display→caption', () => {
    expect(typography.display.size).toBeGreaterThan(typography.headline.size);
    expect(typography.headline.size).toBeGreaterThan(typography.title.size);
    expect(typography.title.size).toBeGreaterThan(typography.subheading.size);
    expect(typography.subheading.size).toBeGreaterThanOrEqual(typography.body.size);
    expect(typography.body.size).toBeGreaterThan(typography.caption.size);
  });

  it('família das variantes de UI é Manrope; stat usa Saira Condensed tabular', () => {
    for (const v of ['display','headline','title','subheading','body','label','caption'] as const) {
      expect(typography[v].family).toMatch(/^Manrope/);
    }
    expect(typography.stat.family).toMatch(/^SairaCondensed/);
    expect(typography.stat.tabular).toBe(true);
  });

  it('FONT_FAMILY mapeia famílias usadas pelas variantes', () => {
    const families = Object.values(FONT_FAMILY);
    for (const v of VARIANTS) expect(families).toContain(typography[v].family);
  });

  it('fontSize legado segue exportado (retrocompat)', () => {
    expect(fontSize.md).toBe(14);
    expect(fontSize.display).toBe(56);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/theme/typography.test.ts`
  → esperado: falha de compilação/import — `typography` e `FONT_FAMILY` não existem em `@/theme/tokens` (`Module '"@/theme/tokens"' has no exported member 'typography'`).
- [ ] **Step 3 — implementar:** em `src/theme/tokens.ts`, **após** a linha `export const radius = ...` (`tokens.ts:50`), adicionar (se D1 já adicionou `typography`/`FONT_FAMILY` com estas chaves, pular — o teste do Step 4 confirma):
```ts
export const FONT_FAMILY = {
  ui: 'Manrope',
  uiSemibold: 'Manrope-SemiBold',
  uiBold: 'Manrope-Bold',
  uiExtra: 'Manrope-ExtraBold',
  stat: 'SairaCondensed-SemiBold',
  statBold: 'SairaCondensed-Bold',
} as const;

export interface TypographyToken {
  size: number;
  lineHeight: number;
  weight: '400' | '600' | '700' | '800';
  family: string;
  letterSpacing?: number;
  tabular?: boolean;
}

// Escala semântica. Sizes ancorados em `fontSize` (legado) p/ continuidade visual.
// line-height ≈ 1.2–1.4× size; weights mapeiam às variantes de FONT_FAMILY.
export const typography: Record<
  'display' | 'headline' | 'title' | 'subheading' | 'body' | 'label' | 'caption' | 'stat',
  TypographyToken
> = {
  display:    { size: 40, lineHeight: 46, weight: '800', family: FONT_FAMILY.uiExtra,    letterSpacing: -0.5 },
  headline:   { size: 28, lineHeight: 34, weight: '700', family: FONT_FAMILY.uiBold,     letterSpacing: -0.3 },
  title:      { size: 20, lineHeight: 26, weight: '700', family: FONT_FAMILY.uiBold },
  subheading: { size: 16, lineHeight: 22, weight: '600', family: FONT_FAMILY.uiSemibold },
  body:       { size: 14, lineHeight: 20, weight: '400', family: FONT_FAMILY.ui },
  label:      { size: 11, lineHeight: 14, weight: '600', family: FONT_FAMILY.uiSemibold, letterSpacing: 1 },
  caption:    { size: 10, lineHeight: 13, weight: '400', family: FONT_FAMILY.ui },
  stat:       { size: 22, lineHeight: 24, weight: '600', family: FONT_FAMILY.stat, tabular: true },
};
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/typography.test.ts` → 5 testes verdes. Depois `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:**
  `git add src/theme/tokens.ts __tests__/theme/typography.test.ts`
  msg: `feat(d2): token typography + FONT_FAMILY (escala semântica Manrope/Saira)`

---

## Task 2: Helper puro `textStyle` (TDD)

**Files:** Create `src/theme/typography.ts`; Modify `__tests__/theme/typography.test.ts` (adicionar bloco); Modify `src/theme/index.ts`.
**Interfaces:** Consumes: `typography`, `TypographyToken` (Task 1). Produces: `textStyle(variant, overrides?): TextStyle`, `TypographyVariant`.

- [ ] **Step 1 — teste falhando:** adicionar ao fim de `__tests__/theme/typography.test.ts`:
```ts
import { textStyle } from '@/theme/typography';

describe('textStyle helper', () => {
  it('resolve fontSize/lineHeight/fontWeight/fontFamily do token', () => {
    const s = textStyle('title');
    expect(s.fontSize).toBe(typography.title.size);
    expect(s.lineHeight).toBe(typography.title.lineHeight);
    expect(s.fontWeight).toBe(typography.title.weight);
    expect(s.fontFamily).toBe(typography.title.family);
  });

  it('aplica letterSpacing quando o token tem', () => {
    expect(textStyle('label').letterSpacing).toBe(typography.label.letterSpacing);
    expect(textStyle('body').letterSpacing).toBeUndefined();
  });

  it('stat recebe fontVariant tabular-nums', () => {
    expect(textStyle('stat').fontVariant).toEqual(['tabular-nums']);
    expect(textStyle('body').fontVariant).toBeUndefined();
  });

  it('overrides têm precedência sobre o token', () => {
    const s = textStyle('body', { fontSize: 99, color: '#abcdef' });
    expect(s.fontSize).toBe(99);
    expect(s.color).toBe('#abcdef');
    expect(s.fontFamily).toBe(typography.body.family); // não sobrescrito permanece
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/theme/typography.test.ts`
  → esperado: `Cannot find module '@/theme/typography'`.
- [ ] **Step 3 — implementar:** criar `src/theme/typography.ts`:
```ts
import type { TextStyle } from 'react-native';
import { typography, type TypographyToken } from './tokens';

export type TypographyVariant = keyof typeof typography;

// Resolve um TextStyle a partir do token semântico. `overrides` (cor, size pontual,
// alinhamento) têm precedência. Único ponto que traduz TypographyToken → TextStyle RN.
export function textStyle(variant: TypographyVariant, overrides?: Partial<TextStyle>): TextStyle {
  const t: TypographyToken = typography[variant];
  const base: TextStyle = {
    fontSize: t.size,
    lineHeight: t.lineHeight,
    fontWeight: t.weight,
    fontFamily: t.family,
  };
  if (t.letterSpacing !== undefined) base.letterSpacing = t.letterSpacing;
  if (t.tabular) base.fontVariant = ['tabular-nums'];
  return { ...base, ...overrides };
}
```
- [ ] **Step 4 — re-exportar de `@/theme`:** em `src/theme/index.ts`, alterar a linha de re-export de tokens (`index.ts:5`) e adicionar a do helper. Trocar:
```ts
export { colors, spacing, fontSize, radius } from './tokens';
```
por:
```ts
export { colors, spacing, fontSize, radius, typography, FONT_FAMILY } from './tokens';
export type { TypographyToken } from './tokens';
export { textStyle, type TypographyVariant } from './typography';
```
- [ ] **Step 5 — rodar (passa):** `npx jest __tests__/theme/typography.test.ts` → todos verdes. `npx tsc --noEmit` → exit 0.
- [ ] **Step 6 — commit:**
  `git add src/theme/typography.ts src/theme/index.ts __tests__/theme/typography.test.ts`
  msg: `feat(d2): helper textStyle resolvendo TextStyle dos tokens de tipografia`

---

## Task 3: Componentes semânticos de texto (TDD render+snapshot)

**Files:** Create `src/components/typography/Text.tsx`, `src/components/typography/index.ts`, `__tests__/components/typography.test.tsx`; Modify `package.json` (devDep `react-test-renderer`).
**Interfaces:** Consumes: `textStyle`, `TypographyVariant` (Task 2). Produces: `Display/Headline/Title/Subheading/Body/Label/Caption/Stat`, `AppTextProps`.

> **Setup de teste de render.** O jest atual roda `testEnvironment: 'node'` e não há precedente de render de componente (`__tests__/screens/*` são `.test.ts` de lógica). `react-test-renderer` funciona em env node (não precisa de jsdom). Esta task adiciona `react-test-renderer` como devDep e cria o **primeiro** teste de render do projeto. Não altera `jest.config.js` (env node serve; `react-test-renderer` não usa DOM).

- [ ] **Step 1 — adicionar devDep:** `npm install --save-dev react-test-renderer@19.1.0`
  → esperado: instala `react-test-renderer` alinhado a `react@19.1.0` (mesma major.minor), adiciona a `devDependencies` em `package.json`. Sem instalação global. (Se a versão exata 19.1.0 não existir no registry, usar a 19.1.x mais próxima — `npm view react-test-renderer versions | tail` para confirmar.)
- [ ] **Step 2 — teste falhando:** criar `__tests__/components/typography.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  Display, Headline, Title, Subheading, Body, Label, Caption, Stat,
} from '@/components/typography';
import { typography } from '@/theme/tokens';

// Encontra o nó <Text> raiz e devolve seu style achatado.
function flatStyle(tree: TestRenderer.ReactTestRenderer): Record<string, unknown> {
  const root = tree.root.findByType(Text) as ReactTestInstance;
  const s = root.props.style;
  return Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : (s ?? {});
}

describe('componentes de tipografia', () => {
  it('cada wrapper renderiza Text com o estilo do seu variant', () => {
    const cases: [React.ComponentType<any>, keyof typeof typography][] = [
      [Display, 'display'], [Headline, 'headline'], [Title, 'title'],
      [Subheading, 'subheading'], [Body, 'body'], [Label, 'label'],
      [Caption, 'caption'], [Stat, 'stat'],
    ];
    for (const [Comp, variant] of cases) {
      const tree = TestRenderer.create(<Comp>texto</Comp>);
      const style = flatStyle(tree);
      expect(style.fontSize).toBe(typography[variant].size);
      expect(style.fontFamily).toBe(typography[variant].family);
      expect(style.fontWeight).toBe(typography[variant].weight);
    }
  });

  it('Stat aplica tabular-nums', () => {
    const tree = TestRenderer.create(<Stat>99</Stat>);
    expect(flatStyle(tree).fontVariant).toEqual(['tabular-nums']);
  });

  it('prop color sobrescreve a cor', () => {
    const tree = TestRenderer.create(<Body color="#123456">x</Body>);
    expect(flatStyle(tree).color).toBe('#123456');
  });

  it('style do consumidor compõe sobre o variant', () => {
    const tree = TestRenderer.create(<Title style={{ marginTop: 7 }}>t</Title>);
    const style = flatStyle(tree);
    expect(style.marginTop).toBe(7);
    expect(style.fontSize).toBe(typography.title.size); // base preservada
  });

  it('renderiza o children como texto', () => {
    const tree = TestRenderer.create(<Body>Olá</Body>);
    expect(tree.toJSON()).toBeTruthy();
    expect(JSON.stringify(tree.toJSON())).toContain('Olá');
  });

  it('snapshot estável dos 8 variants', () => {
    const tree = TestRenderer.create(
      <>
        <Display>D</Display><Headline>H</Headline><Title>T</Title>
        <Subheading>S</Subheading><Body>B</Body><Label>L</Label>
        <Caption>C</Caption><Stat>1</Stat>
      </>
    );
    expect(tree.toJSON()).toMatchSnapshot();
  });
});
```
- [ ] **Step 3 — rodar (falha):** `npx jest __tests__/components/typography.test.tsx`
  → esperado: `Cannot find module '@/components/typography'`.
- [ ] **Step 4 — implementar base:** criar `src/components/typography/Text.tsx`:
```tsx
import React from 'react';
import { Text, type TextProps } from 'react-native';
import { colors } from '@/theme';
import { textStyle, type TypographyVariant } from '@/theme/typography';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
}

// Wrapper fino sobre <Text>: aplica textStyle(variant) + cor + style do consumidor.
// `style` vem por último p/ permitir override pontual (margin, align) sem perder a base.
function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[textStyle(variant, color ? { color } : undefined), style]} />;
}

const make = (variant: TypographyVariant) => {
  const C = (props: AppTextProps) => <AppText variant={variant} {...props} />;
  C.displayName = variant[0].toUpperCase() + variant.slice(1);
  return C;
};

export const Display = make('display');
export const Headline = make('headline');
export const Title = make('title');
export const Subheading = make('subheading');
export const Body = make('body');
export const Label = make('label');
export const Caption = make('caption');
export const Stat = make('stat');
```
Nota: `color` default não é forçado aqui — o consumidor herda a cor do contexto/`style`; quando precisar de `colors.text` explícito, passa `color={colors.text}`. (`colors` importado p/ disponibilizar nas telas via re-export, sem uso obrigatório.)

  Criar `src/components/typography/index.ts`:
```ts
export {
  Display, Headline, Title, Subheading, Body, Label, Caption, Stat,
  type AppTextProps,
} from './Text';
```
- [ ] **Step 5 — rodar (passa):** `npx jest __tests__/components/typography.test.tsx`
  → 6 testes verdes; snapshot novo escrito (`__tests__/components/__snapshots__/typography.test.tsx.snap`). `npx tsc --noEmit` → exit 0.
- [ ] **Step 6 — commit:**
  `git add src/components/typography/ __tests__/components/typography.test.tsx __tests__/components/__snapshots__/ package.json package-lock.json`
  msg: `feat(d2): componentes semânticos de texto (Display..Stat) lendo tokens v2`

---

## Task 4: Assets de fonte + registro no `app.json` e `package.json`

**Files:** Create `assets/fonts/*.ttf`; Modify `app.json`; Modify `package.json` (dep `expo-font`).
**Interfaces:** Consumes: nada. Produces: arquivos `.ttf` em `assets/fonts/` + plugin `expo-font` configurado.

> **De onde vêm os `.ttf`.** Manrope (OFL) e Saira Condensed (OFL) são fontes do Google Fonts — licença permite redistribuição/empacotamento. Baixar os pesos exatos usados pelas variantes (Task 1 `FONT_FAMILY`): Manrope Regular/SemiBold/Bold/ExtraBold + SairaCondensed SemiBold/Bold.

- [ ] **Step 1 — criar dir + baixar fontes:**
```bash
mkdir -p assets/fonts
cd assets/fonts
# Manrope (repo oficial OFL no GitHub)
curl -fsSLo Manrope-Regular.ttf    https://github.com/sharanda/manrope/raw/master/fonts/ttf/Manrope-Regular.ttf
curl -fsSLo Manrope-SemiBold.ttf   https://github.com/sharanda/manrope/raw/master/fonts/ttf/Manrope-SemiBold.ttf
curl -fsSLo Manrope-Bold.ttf       https://github.com/sharanda/manrope/raw/master/fonts/ttf/Manrope-Bold.ttf
curl -fsSLo Manrope-ExtraBold.ttf  https://github.com/sharanda/manrope/raw/master/fonts/ttf/Manrope-ExtraBold.ttf
# Saira Condensed (Google Fonts repo)
curl -fsSLo SairaCondensed-SemiBold.ttf https://github.com/google/fonts/raw/main/ofl/sairacondensed/SairaCondensed-SemiBold.ttf
curl -fsSLo SairaCondensed-Bold.ttf     https://github.com/google/fonts/raw/main/ofl/sairacondensed/SairaCondensed-Bold.ttf
```
  → esperado: 6 arquivos `.ttf`, cada um > 20 KB. Verificar:
  `ls -la assets/fonts/` (6 ttf não-vazios) e `file assets/fonts/*.ttf` (cada um: `TrueType Font data`).
  **Fallback se um URL 404:** baixar via `npx google-webfonts-helper` ou do Google Fonts manualmente; o nome do arquivo final **deve** bater com `FONT_FAMILY` (`Manrope-SemiBold.ttf` etc.). Se algum peso não puder ser obtido, manter a fonte da variante apontando para um peso disponível e ajustar `FONT_FAMILY` na Task 1 **antes** de prosseguir (e re-rodar os testes da Task 1/3).
- [ ] **Step 2 — adicionar `expo-font` a `dependencies`:** `npx expo install expo-font`
  → esperado: adiciona `"expo-font": "~14.0.x"` em `package.json:dependencies` (já presente em `node_modules` transitivamente; `expo install` fixa a versão compatível com Expo 54). Confirmar: `grep expo-font package.json` mostra a linha em `dependencies`.
- [ ] **Step 3 — registrar plugin + assets no `app.json`:** em `app.json`, dentro de `expo`, adicionar a chave `plugins` (logo após `"newArchEnabled": true,`):
```json
    "newArchEnabled": true,
    "plugins": [
      [
        "expo-font",
        {
          "fonts": [
            "./assets/fonts/Manrope-Regular.ttf",
            "./assets/fonts/Manrope-SemiBold.ttf",
            "./assets/fonts/Manrope-Bold.ttf",
            "./assets/fonts/Manrope-ExtraBold.ttf",
            "./assets/fonts/SairaCondensed-SemiBold.ttf",
            "./assets/fonts/SairaCondensed-Bold.ttf"
          ]
        }
      ]
    ],
```
- [ ] **Step 4 — validar JSON + tsc:** `node -e "JSON.parse(require('fs').readFileSync('app.json','utf8')); console.log('ok')"` → imprime `ok`. `npx tsc --noEmit` → exit 0 (não afeta TS, mas sanity).
- [ ] **Step 5 — commit:**
  `git add assets/fonts/ app.json package.json package-lock.json`
  msg: `chore(d2): adiciona expo-font + assets Manrope/Saira Condensed (OFL)`

---

## Task 5: Hook `useAppFonts` (TDD com mock de expo-font)

**Files:** Create `src/theme/useAppFonts.ts`, `__tests__/theme/useAppFonts.test.tsx`.
**Interfaces:** Consumes: `FONT_FAMILY` (nomes das famílias), `expo-font.useFonts`. Produces: `useAppFonts(): boolean`.

> **Por que mock de `expo-font` no teste.** `useFonts` carrega assets reais — indisponível e desnecessário no ambiente de teste node. Mockamos `expo-font` para retornar `[loaded, error]` controlado e asserir que `useAppFonts` devolve `true` quando carregou **ou** quando falhou (fallback de sistema não deve travar o app — DoD §D2). Esta é a única exceção a "DB nunca mock" — aqui não há DB; é I/O de asset de plataforma.

- [ ] **Step 1 — teste falhando:** criar `__tests__/theme/useAppFonts.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let mockReturn: [boolean, Error | null] = [false, null];
jest.mock('expo-font', () => ({
  useFonts: () => mockReturn,
}));

import { useAppFonts } from '@/theme/useAppFonts';

function Probe({ onValue }: { onValue: (v: boolean) => void }) {
  onValue(useAppFonts());
  return null;
}

function render(): boolean {
  let value = false;
  act(() => { TestRenderer.create(<Probe onValue={(v) => { value = v; }} />); });
  return value;
}

describe('useAppFonts', () => {
  it('false enquanto carrega (loaded=false, error=null)', () => {
    mockReturn = [false, null];
    expect(render()).toBe(false);
  });
  it('true quando carregou', () => {
    mockReturn = [true, null];
    expect(render()).toBe(true);
  });
  it('true mesmo com erro (fallback de sistema, não trava o app)', () => {
    mockReturn = [false, new Error('font load failed')];
    expect(render()).toBe(true);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/theme/useAppFonts.test.tsx`
  → esperado: `Cannot find module '@/theme/useAppFonts'`.
- [ ] **Step 3 — implementar:** criar `src/theme/useAppFonts.ts`:
```ts
import { useFonts } from 'expo-font';

// Mapeia FONT_FAMILY → assets. Mantém os nomes em sincronia com FONT_FAMILY (tokens.ts).
// require() de .ttf é resolvido pelo bundler do Expo (metro/web).
const FONT_MAP = {
  Manrope: require('../../assets/fonts/Manrope-Regular.ttf'),
  'Manrope-SemiBold': require('../../assets/fonts/Manrope-SemiBold.ttf'),
  'Manrope-Bold': require('../../assets/fonts/Manrope-Bold.ttf'),
  'Manrope-ExtraBold': require('../../assets/fonts/Manrope-ExtraBold.ttf'),
  'SairaCondensed-SemiBold': require('../../assets/fonts/SairaCondensed-SemiBold.ttf'),
  'SairaCondensed-Bold': require('../../assets/fonts/SairaCondensed-Bold.ttf'),
};

// true quando as fontes carregaram OU falharam — em ambos os casos o app pode
// renderizar (fallback de sistema cobre a falha). Só segura o gate enquanto carrega.
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_MAP);
  return loaded || error != null;
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/useAppFonts.test.tsx` → 3 verdes. `npx tsc --noEmit` → exit 0.
  Nota: o teste mocka `expo-font`, então os `require('.ttf')` não executam no teste (módulo inteiro substituído). Não é preciso transform de `.ttf` no jest.
- [ ] **Step 5 — commit:**
  `git add src/theme/useAppFonts.ts __tests__/theme/useAppFonts.test.tsx`
  msg: `feat(d2): hook useAppFonts com gate tolerante a falha (fallback de sistema)`

---

## Task 6: Gate de fonte em `App.tsx`

**Files:** Modify `App.tsx:1-36`.
**Interfaces:** Consumes: `useAppFonts` (Task 5), `LoadingScreen` (existente). Produces: gate `fontsReady` no boot.

> **Sem teste automatizado de App.tsx** (não há precedente de teste do root e o gate é composição de hooks já testados). Validação é via tsc + browser (Task 7).

- [ ] **Step 1 — importar o hook:** em `App.tsx`, após a linha `import { useDatabaseStore } from '@/store/database-store';` (`App.tsx:8`), adicionar:
```ts
import { useAppFonts } from '@/theme/useAppFonts';
```
- [ ] **Step 2 — chamar o hook e estender o gate:** em `App.tsx`, dentro de `App()`, logo após `const { isReady, error, initialize, dbHandle } = useDatabaseStore();` (`App.tsx:12`), adicionar:
```ts
  const fontsReady = useAppFonts();
```
  e trocar o gate `if (!isReady) {` (`App.tsx:34`) por:
```ts
  if (!isReady || !fontsReady) {
    return <LoadingScreen message="Initializing..." />;
  }
```
  (substitui o bloco `if (!isReady) { return <LoadingScreen ... />; }` inteiro — o `return` interno permanece igual.)
- [ ] **Step 3 — rodar:** `npx tsc --noEmit` → exit 0. `npx jest` → suíte inteira verde (nenhum teste de App existe, mas garante que nada quebrou).
- [ ] **Step 4 — commit:**
  `git add App.tsx`
  msg: `feat(d2): gate de carregamento de fontes no boot (fontsReady ao lado de isReady)`

---

## Task 7: Verificação no browser (DoD)

**Files:** (nenhum — validação manual via Playwright MCP).
**Interfaces:** Consumes: app rodando em `localhost:8082`.

- [ ] **Step 1 — subir o dev server:** `nohup npm run web >/tmp/fm-web.log 2>&1 & disown` e aguardar bundle (`grep -q "Web Bundled" /tmp/fm-web.log` num loop, timeout ~120s). Antes, `pkill -f "expo start"` para limpar instância anterior.
- [ ] **Step 2 — abrir no browser (Playwright MCP):** navegar a `http://localhost:8082`, aguardar a tela inicial (não fica preso em "Initializing...") → confirma que o gate de fonte resolve. Tirar screenshot.
- [ ] **Step 3 — validar fonte aplicada:** via Playwright, inspecionar `getComputedStyle` de um texto de título → `font-family` deve conter `Manrope`. Se algum texto usar `<Stat>`, confirmar `font-family` `SairaCondensed` e `font-variant-numeric: tabular-nums`. Confirmar **zero** erro de console (sem 404 de `.ttf`, sem warning de fonte não encontrada).
- [ ] **Step 4 — DoD checklist:**
  - `npm test` verde (incl. `typography.test.ts`, `typography.test.tsx`, `useAppFonts.test.tsx`).
  - `npx tsc --noEmit` exit 0.
  - Fontes carregam no web; app não fica preso no gate; sem FOUT visível persistente.
  - Fallback: simular falha (renomear temporariamente um `.ttf` → recarregar → app ainda renderiza com fonte de sistema, sem white-screen) e **reverter** o rename.
  - i18n inalterado (nenhuma string adicionada/removida).
- [ ] **Step 5 — encerrar:** `pkill -f "expo start"`. (Sem commit — etapa de verificação.)

---

## Self-Review

1. **Cobertura do spec §D2:**
   - "Adicionar expo-font (ausente)" → Task 4 Step 2 (`npx expo install expo-font` → `dependencies`).
   - "carregar Manrope + Saira Condensed via useFonts" → Task 5 (`useAppFonts` envolve `useFonts` com `FONT_MAP`).
   - "gate de render em App.tsx ao lado do isReady" → Task 6 (`!isReady || !fontsReady`).
   - "componentes semânticos em src/components/typography/ (Display..Stat) com tabular-nums" → Task 3 (8 wrappers; `Stat` tabular).
   - "cada um lê size/lineHeight/weight/family dos tokens v2" → Task 1 (`typography` token) + Task 2 (`textStyle`) + Task 3 (wrappers usam `textStyle`).
   - "TDD de render+snapshot" → Task 3 (render asserts + `toMatchSnapshot`).
   - "fallback de sistema" → Task 5 (`loaded || error != null`) + Task 7 Step 4 (validação de falha).
   - "assets em assets/fonts/" → Task 4 Step 1; "config no app.json" → Task 4 Step 3.
   - DoD "App.tsx não pisca FOUT visível" → gate (Task 6) + verificação browser (Task 7). "i18n inalterado" → nenhuma string tocada.
2. **Placeholder scan:** sem "TBD"/"adicionar X" vago. Único ponto condicional é a obtenção dos `.ttf` (URLs com fallback explícito + critério: nome do arquivo = `FONT_FAMILY`). Token `typography` definido por inteiro; helper, hook e componentes com código completo.
3. **Consistência de tipos:** `TypographyToken` (tokens.ts) → `textStyle(variant): TextStyle` (typography.ts) → `AppTextProps.variant: TypographyVariant` (Text.tsx). `FONT_FAMILY` (tokens) = chaves de `FONT_MAP` (useAppFonts) = nomes em `app.json`. `fontWeight` é `'400'|'600'|'700'|'800'` (string) em ambos token e `TextStyle` (compatível com RN). `tokens.ts` permanece puro (sem `import 'react-native'`); o tipo `TextStyle` só aparece em `typography.ts`/`Text.tsx`.
4. **Determinismo / pureza:** zero `Math.random`/`Date.now`. Engine intocado. `tokens.ts` constante.
5. **Dependência de D1:** Task 1 é idempotente — cria `typography` se ausente, no-op verificável se D1 já adicionou com as mesmas chaves.
