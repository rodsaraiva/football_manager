# D3 — Kit de Componentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação de 2–5 min. **Subagents NÃO commitam** — o passo "commit" descreve o que o orquestrador deve commitar.

**Goal:** Entregar um kit de componentes reutilizáveis (Card, Button, Chip/Filter, Badge preenchido, StatBar com gradiente, TabIndicator, Modal/Sheet, Skeleton, Toast, Icon SVG, EmptyState v2, useConfirm) que consome **apenas** tokens de `@/theme`, é **aditivo** (nenhuma tela migra aqui — isso é D5) e tem cobertura de teste por componente.

**Architecture:** O ambiente de teste é `node` + `ts-jest` puro — **não existe renderer React nos testes hoje** (0 arquivos `*.test.tsx`, sem `react-test-renderer`, sem jsdom). Em vez de inventar infra de render frágil, cada componente é dividido em duas partes: (1) um **resolver de estilo/variante puro** (função TS sem React, ex.: `resolveButtonStyle(variant, state, accent)`) que carrega TODA a lógica e é testado por TDD via ts-jest exatamente como `getBarColor`/`buildTopScorers` já são; (2) um componente RN fino que só consome o resolver. Para os componentes que o spec exige snapshot de render (`useConfirm` resolvendo true/false, `StatBar`, `EmptyState`), adicionamos `react-test-renderer` como devDep — ele roda em ambiente `node` sem DOM. Kit consome só tokens v2 (D1) e a rampa de accent (D4 `ClubAccentRamp`); onde D4 ainda não está pronto, o componente aceita o accent por prop com default `colors.primary`.

**Tech Stack:** TS 5.9 strict, React 19.1, RN 0.81, `react-native-svg ^15.12.1` (já instalado), `react-native-reanimated ~4.1.1` (já instalado — **não usado em D3**, motion é D6), Jest 29 + ts-jest, `react-test-renderer` (a adicionar como devDep).

**Convenções:**
- pt-BR. Engine puro **não** é tocado. Componentes ficam em `src/components/`.
- Tokens **sempre** de `@/theme` — zero literal de cor/spacing/radius/fontSize.
- TDD obrigatório: resolver puro → teste falha → implementa → passa.
- i18n pt/en com paridade (`__tests__/i18n/parity.test.ts`). Toda string nova entra em `src/i18n/pt.ts` E `src/i18n/en.ts`.
- Sem `Math.random`/`Date.now` em código de componente (a animação fica fora do escopo de D3).
- Branch `feat/d3-component-kit`.
- Mensagens de commit terminam com: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Precedente a espelhar:**
- Resolver puro testável: `src/utils/player-colors.ts` (`getBarColor`) + `__tests__/theme/player-colors.test.ts`.
- Lógica de tela extraída e testada por ts-jest: `src/screens/league/top-scorers.ts` + `__tests__/screens/top-scorers.test.ts`.
- Componente SVG existente: `src/components/RadarChart.tsx` (importa `Svg, { Polygon, Circle, Line, Text as SvgText }` de `react-native-svg`).
- Componentes-base a evoluir/substituir: `src/components/StatBar.tsx`, `ValueBadge.tsx`, `SectionCard.tsx`, `EmptyState.tsx`, `AchievementToast.tsx`, `OnboardingModal.tsx`, `ContextualHint.tsx`, `MatchEventItem.tsx`.
- Accent: `src/theme/club-accent.ts` (`ClubAccent`, `mixWithWhite`, `luminance`), `src/theme/useClubAccent.ts`.

**Dependência de D1/D2 (assumida pronta):** D1 exporta de `@/theme`: `elevation` (`{e0,e1,e2,e3}`), `motion`, `spacing.xxl`. D4 exporta o tipo `ClubAccentRamp` (`{accent,accentDim,accentBright,onAccent}`) de `@/theme/club-accent`. **Mitigação se D1/D4 não estiverem prontos:** cada resolver aceita o accent (string base) por parâmetro com default `colors.primary`, e `elevation` cai para `radius`/`border` existentes — ver Task 0 (sondagem de pré-requisitos) que decide isso na execução.

---

## File Structure

- **Create** `src/components/kit/buttonStyle.ts` — resolver puro de variante/estado do Button.
- **Create** `src/components/kit/Button.tsx` — componente Button.
- **Create** `src/components/kit/cardStyle.ts` — resolver puro de variante/elevação do Card.
- **Create** `src/components/kit/Card.tsx` — componente Card (hero/summary/detail).
- **Create** `src/components/kit/Chip.tsx` — Chip/Filter selecionável.
- **Create** `src/components/kit/badgeStyle.ts` — resolver puro de tone do Badge preenchido.
- **Create** `src/components/kit/Badge.tsx` — Badge preenchido.
- **Create** `src/components/kit/statBarStyle.ts` — resolver puro de fill/cor/gradiente do StatBar.
- **Create** `src/components/kit/TabIndicator.tsx` — sublinhado/pill ativo com accent.
- **Create** `src/components/kit/Sheet.tsx` — Modal/Sheet padronizado (backdrop + folha).
- **Create** `src/components/kit/Skeleton.tsx` — placeholder estático (shimmer fica para D6).
- **Create** `src/components/kit/Toast.tsx` — toast genérico (tone/título/corpo).
- **Create** `src/components/kit/icons.ts` — mapa puro de paths SVG dos ícones (`IconName` → paths).
- **Create** `src/components/kit/Icon.tsx` — componente Icon SVG (`name/size/color`).
- **Create** `src/components/kit/emptyStateArt.ts` — mapa puro de ilustrações SVG do EmptyState v2.
- **Create** `src/components/kit/EmptyState.tsx` — EmptyState v2 (ilustração + título + descrição + CTA).
- **Create** `src/components/kit/useConfirm.tsx` — `ConfirmProvider` + `useConfirm` (substitui `Alert.alert`).
- **Create** `src/components/kit/index.ts` — barrel de export do kit.
- **Modify** `src/components/StatBar.tsx` — passa a consumir `statBarStyle` + gradiente SVG (API `{label,value,maxValue}` preservada).
- **Modify** `src/components/ValueBadge.tsx` — re-exporta `Badge` mantendo a API `{value,tone,size}` (compat).
- **Modify** `package.json` — devDep `react-test-renderer` + `@types/react-test-renderer`.
- **Modify** `jest.config.js` — incluir `*.test.tsx` (já roda `.tsx`? confirmar em Task 0).
- **Modify** `src/i18n/pt.ts` + `src/i18n/en.ts` — chaves `kit.confirm_default`, `kit.cancel`, `kit.empty_cta` etc.
- **Test** `__tests__/components/buttonStyle.test.ts`, `cardStyle.test.ts`, `badgeStyle.test.ts`, `statBarStyle.test.ts`, `icons.test.ts`, `emptyStateArt.test.ts`.
- **Test** `__tests__/components/useConfirm.test.tsx`, `StatBar.test.tsx`, `EmptyState.test.tsx`, `Button.test.tsx`, `Chip.test.tsx`, `Badge.test.tsx`, `Toast.test.tsx`, `Icon.test.tsx`.

**Contract (assinaturas exatas):**

```ts
// src/components/kit/buttonStyle.ts
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonState = 'default' | 'pressed' | 'disabled' | 'loading';
export interface ButtonResolved {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  opacity: number;
  showSpinner: boolean;
}
export function resolveButtonStyle(
  variant: ButtonVariant,
  state: ButtonState,
  accent: string,          // base accent do clube (D4); default colors.primary no componente
): ButtonResolved;

// src/components/kit/Button.tsx
export function Button(props: {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accent?: string;
  testID?: string;
  accessibilityLabel?: string;
}): JSX.Element;

// src/components/kit/cardStyle.ts
export type CardVariant = 'hero' | 'summary' | 'detail';
export interface CardResolved {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
  padding: number;
  elevation: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
}
export function resolveCardStyle(variant: CardVariant, accent: string): CardResolved;

// src/components/kit/Card.tsx
export function Card(props: {
  variant?: CardVariant;
  accent?: string;
  selected?: boolean;
  style?: object;
  children?: React.ReactNode;
  testID?: string;
}): JSX.Element;

// src/components/kit/Chip.tsx
export function Chip(props: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accent?: string;
  testID?: string;
  accessibilityLabel?: string;
}): JSX.Element;

// src/components/kit/badgeStyle.ts
export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'primary' | 'accent';
export interface BadgeResolved { backgroundColor: string; textColor: string; }
export function resolveBadgeStyle(tone: BadgeTone, accent: string): BadgeResolved;

// src/components/kit/Badge.tsx
export function Badge(props: {
  value: string | number;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  accent?: string;
}): JSX.Element;

// src/components/kit/statBarStyle.ts
export interface StatBarResolved {
  fillPercent: number;       // 0..100
  colorStart: string;        // gradiente: stop 0
  colorEnd: string;          // gradiente: stop 1
  valueColor: string;
}
export function resolveStatBar(value: number, maxValue: number): StatBarResolved;

// src/components/StatBar.tsx (API preservada)
export default function StatBar(props: { label: string; value: number; maxValue?: number }): JSX.Element;

// src/components/kit/TabIndicator.tsx
export function TabIndicator(props: {
  active: boolean;
  shape?: 'underline' | 'pill';
  accent?: string;
  width?: number;
}): JSX.Element;

// src/components/kit/Sheet.tsx
export function Sheet(props: {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  testID?: string;
}): JSX.Element;

// src/components/kit/Skeleton.tsx
export function Skeleton(props: { width?: number | string; height?: number; radius?: number; style?: object }): JSX.Element;

// src/components/kit/Toast.tsx
export type ToastTone = 'info' | 'success' | 'danger' | 'gold';
export function Toast(props: {
  title: string;
  message?: string;
  tone?: ToastTone;
  onDismiss: () => void;
  testID?: string;
}): JSX.Element;

// src/components/kit/icons.ts
export type IconName =
  | 'play' | 'squad' | 'news' | 'tactics' | 'money' | 'chart'   // TabNavigator
  | 'goal' | 'assist' | 'yellow' | 'red' | 'sub' | 'injury'     // MatchEventItem
  | 'whistle' | 'shield' | 'target' | 'glove'
  | 'arrowRight' | 'check' | 'close';                            // genéricos / onboarding
export interface IconDef { viewBox: string; paths: { d: string; fillRule?: 'evenodd' }[]; }
export const ICONS: Record<IconName, IconDef>;

// src/components/kit/Icon.tsx
export function Icon(props: { name: IconName; size?: number; color?: string }): JSX.Element;

// src/components/kit/emptyStateArt.ts
export type EmptyArt = 'inbox' | 'search' | 'squad' | 'generic';
export const EMPTY_ART: Record<EmptyArt, IconDef>;   // reusa IconDef

// src/components/kit/EmptyState.tsx (substitui src/components/EmptyState.tsx no D5; aditivo aqui)
export function EmptyState(props: {
  art?: EmptyArt;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  accent?: string;
}): JSX.Element;

// src/components/kit/useConfirm.tsx
export interface ConfirmOptions {
  title: string; message?: string;
  confirmLabel?: string; cancelLabel?: string;
  tone?: 'default' | 'danger';
}
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean>;
export function ConfirmProvider(props: { children: React.ReactNode }): JSX.Element;
```

---

## Task 0: Pré-requisitos — branch, sondagem de tokens/D4, infra de teste tsx

**Files:** Modify `package.json`, `jest.config.js`.
**Interfaces:** Consumes: `@/theme` (sondar `elevation`, `spacing.xxl`), `@/theme/club-accent` (sondar `ClubAccentRamp`). Produces: branch + capacidade de rodar `*.test.tsx`.

- [ ] **Step 1 — branch:** `git checkout -b feat/d3-component-kit`.
- [ ] **Step 2 — sondar D1/D4:** rodar:
```bash
grep -nE "export const elevation|xxl" src/theme/tokens.ts; \
grep -nE "ClubAccentRamp|deriveAccentRamp" src/theme/club-accent.ts
```
  → **Decisão:** se `elevation`/`ClubAccentRamp` existem, os resolvers os consomem direto. Se **não** existem (D1/D4 ainda não mergeados), os resolvers usam fallbacks locais: `ELEV` interno `{e0..e3}` derivado de `colors.border`/`alpha`, e `accent` recebido sempre como **string base** (não rampa). Registrar a decisão no topo de `buttonStyle.ts` como comentário de uma linha. Os resolvers nunca importam `ClubAccentRamp` se ele não existir — recebem `accent: string`.
- [ ] **Step 3 — confirmar que ts-jest roda `.tsx`:** criar um teste-sonda `__tests__/components/_probe.test.tsx`:
```tsx
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

it('renderiza um nó RN sob react-test-renderer em ambiente node', () => {
  const tree = TestRenderer.create(<Text>ok</Text>).toJSON();
  expect(tree).toBeTruthy();
});
```
- [ ] **Step 4 — instalar renderer e rodar a sonda:**
```bash
npm install --save-dev react-test-renderer@19.1.0 @types/react-test-renderer
npx jest __tests__/components/_probe.test.tsx
```
  → Esperado: **PASS**. Se falhar por transform de `.tsx`, ajustar `jest.config.js` adicionando `transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }] }` e re-rodar até PASS. Se `react-native` não resolver sob ts-jest (provável, pois usa flow/babel), adicionar ao `jest.config.js`: `preset: undefined` é arriscado — em vez disso usar `transformIgnorePatterns: []` **só** se necessário; documentar. **Critério de parada:** a sonda passa.
- [ ] **Step 5 — fallback se RN não renderiza sob ts-jest:** se Step 4 não passar de jeito nenhum, **não** bloquear o épico: marcar os testes de render (`*.test.tsx`) como o subconjunto que usa `react-test-renderer` com `jest.mock('react-native', ...)` mínimo OU mover a asserção de cada componente 100% para o resolver puro (`*.test.ts`), mantendo apenas `useConfirm.test.tsx` com renderer (que não toca componentes RN nativos pesados). Registrar a escolha em comentário no `jest.config.js`. **Saída desta task:** `npx jest __tests__/components/` roda sem erro de infraestrutura.
- [ ] **Step 6 — limpar a sonda:** `git rm -f __tests__/components/_probe.test.tsx` (era só validação de infra).
- [ ] **Step 7 — commit:** orquestrador: `git add package.json jest.config.js && git commit -m "build(d3): react-test-renderer + suporte a *.test.tsx no kit"`.

---

## Task 1: `resolveButtonStyle` (resolver puro, TDD)

**Files:** Create `src/components/kit/buttonStyle.ts`, `__tests__/components/buttonStyle.test.ts`.
**Interfaces:** Consumes: `colors` de `@/theme`. Produces: `resolveButtonStyle`, `ButtonVariant`, `ButtonState`, `ButtonResolved`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/components/buttonStyle.test.ts`:
```ts
import { resolveButtonStyle } from '@/components/kit/buttonStyle';
import { colors } from '@/theme';

const ACCENT = '#22aa55';

describe('resolveButtonStyle', () => {
  it('primary usa accent como fundo e onAccent legível', () => {
    const r = resolveButtonStyle('primary', 'default', ACCENT);
    expect(r.backgroundColor).toBe(ACCENT);
    expect(r.borderWidth).toBe(0);
    expect(r.opacity).toBe(1);
    expect(r.showSpinner).toBe(false);
    expect(['#ffffff', '#000000']).toContain(r.textColor);
  });

  it('secondary é outline (borda accent, fundo transparente)', () => {
    const r = resolveButtonStyle('secondary', 'default', ACCENT);
    expect(r.backgroundColor).toBe('transparent');
    expect(r.borderColor).toBe(ACCENT);
    expect(r.borderWidth).toBe(1);
    expect(r.textColor).toBe(ACCENT);
  });

  it('ghost não tem fundo nem borda', () => {
    const r = resolveButtonStyle('ghost', 'default', ACCENT);
    expect(r.backgroundColor).toBe('transparent');
    expect(r.borderWidth).toBe(0);
    expect(r.textColor).toBe(ACCENT);
  });

  it('danger usa colors.danger independente do accent', () => {
    const r = resolveButtonStyle('danger', 'default', ACCENT);
    expect(r.backgroundColor).toBe(colors.danger);
  });

  it('disabled reduz opacidade e não mostra spinner', () => {
    const r = resolveButtonStyle('primary', 'disabled', ACCENT);
    expect(r.opacity).toBeLessThan(1);
    expect(r.showSpinner).toBe(false);
  });

  it('loading mostra spinner e mantém aparência clicável', () => {
    const r = resolveButtonStyle('primary', 'loading', ACCENT);
    expect(r.showSpinner).toBe(true);
  });

  it('pressed escurece levemente vs default (opacity < 1)', () => {
    const r = resolveButtonStyle('primary', 'pressed', ACCENT);
    expect(r.opacity).toBeLessThan(1);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/buttonStyle.test.ts` → esperado: `Cannot find module '@/components/kit/buttonStyle'`.
- [ ] **Step 3 — implementar** `src/components/kit/buttonStyle.ts`:
```ts
import { colors } from '@/theme';
import { luminance } from '@/theme/club-accent';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonState = 'default' | 'pressed' | 'disabled' | 'loading';

export interface ButtonResolved {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  opacity: number;
  showSpinner: boolean;
}

const TEXT_FLIP_LUM = 140; // espelha club-accent.ts

function onColor(bg: string): string {
  return luminance(bg) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff';
}

export function resolveButtonStyle(
  variant: ButtonVariant,
  state: ButtonState,
  accent: string,
): ButtonResolved {
  const base: ButtonResolved = {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    textColor: accent,
    opacity: 1,
    showSpinner: false,
  };

  switch (variant) {
    case 'primary':
      base.backgroundColor = accent;
      base.textColor = onColor(accent);
      break;
    case 'secondary':
      base.borderColor = accent;
      base.borderWidth = 1;
      base.textColor = accent;
      break;
    case 'ghost':
      base.textColor = accent;
      break;
    case 'danger':
      base.backgroundColor = colors.danger;
      base.textColor = onColor(colors.danger);
      break;
  }

  if (state === 'disabled') base.opacity = 0.4;
  else if (state === 'pressed') base.opacity = 0.85;
  else if (state === 'loading') base.showSpinner = true;

  return base;
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/buttonStyle.test.ts` → PASS. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** orquestrador: `git add src/components/kit/buttonStyle.ts __tests__/components/buttonStyle.test.ts && git commit -m "feat(d3): resolver puro de variantes/estados do Button"`.

---

## Task 2: `Button.tsx` (componente, smoke render)

**Files:** Create `src/components/kit/Button.tsx`, `__tests__/components/Button.test.tsx`.
**Interfaces:** Consumes: `resolveButtonStyle` (Task 1), `colors/spacing/fontSize/radius` de `@/theme`. Produces: `Button`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/components/Button.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Button } from '@/components/kit/Button';

it('renderiza com label e dispara onPress', () => {
  const onPress = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<Button label="Contratar" onPress={onPress} testID="btn" />); });
  const node = tree.root.findByProps({ testID: 'btn' });
  act(() => { node.props.onPress(); });
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('disabled não dispara onPress', () => {
  const onPress = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<Button label="X" onPress={onPress} disabled testID="btn" />); });
  const node = tree.root.findByProps({ testID: 'btn' });
  act(() => { node.props.onPress?.(); });
  expect(onPress).not.toHaveBeenCalled();
});

it('snapshot estável por variante', () => {
  (['primary','secondary','ghost','danger'] as const).forEach((v) => {
    const tree = TestRenderer.create(<Button label="A" variant={v} onPress={() => {}} />).toJSON();
    expect(tree).toMatchSnapshot(v);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/Button.test.tsx` → `Cannot find module '@/components/kit/Button'`.
- [ ] **Step 3 — implementar** `src/components/kit/Button.tsx`:
```tsx
import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';
import { resolveButtonStyle, ButtonVariant } from './buttonStyle';

interface Props {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accent?: string;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  label, variant = 'primary', loading = false, disabled = false,
  onPress, accent = colors.primary, testID, accessibilityLabel,
}: Props) {
  const state = disabled ? 'disabled' : loading ? 'loading' : 'default';
  const r = resolveButtonStyle(variant, state, accent);
  const blocked = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={blocked ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: r.backgroundColor,
          borderColor: r.borderColor,
          borderWidth: r.borderWidth,
          opacity: pressed && !blocked ? 0.85 : r.opacity,
        },
      ]}
    >
      {r.showSpinner
        ? <ActivityIndicator color={r.textColor} />
        : <Text style={[styles.label, { color: r.textColor }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm + spacing.xxs,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  label: { fontSize: fontSize.lg, fontWeight: '600' },
});
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/Button.test.tsx` → PASS (snapshots criados). `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** orquestrador: `git add src/components/kit/Button.tsx __tests__/components/Button.test.tsx __tests__/components/__snapshots__ && git commit -m "feat(d3): Button do kit (variantes/estados + accent + a11y)"`.

---

## Task 3: `resolveCardStyle` + `Card.tsx` (TDD + render)

**Files:** Create `src/components/kit/cardStyle.ts`, `src/components/kit/Card.tsx`, `__tests__/components/cardStyle.test.ts`.
**Interfaces:** Consumes: `colors/spacing/radius/elevation` de `@/theme`. Produces: `resolveCardStyle`, `CardVariant`, `CardResolved`, `Card`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/components/cardStyle.test.ts`:
```ts
import { resolveCardStyle } from '@/components/kit/cardStyle';
import { colors } from '@/theme';

const ACCENT = '#22aa55';

describe('resolveCardStyle', () => {
  it('hero tem maior elevação que summary e detail', () => {
    const hero = resolveCardStyle('hero', ACCENT);
    const summary = resolveCardStyle('summary', ACCENT);
    const detail = resolveCardStyle('detail', ACCENT);
    expect(hero.elevation.elevation).toBeGreaterThanOrEqual(summary.elevation.elevation);
    expect(summary.elevation.elevation).toBeGreaterThanOrEqual(detail.elevation.elevation);
  });

  it('hero destaca borda com accent', () => {
    expect(resolveCardStyle('hero', ACCENT).borderColor).toBe(ACCENT);
  });

  it('detail usa surface + borda neutra', () => {
    const r = resolveCardStyle('detail', ACCENT);
    expect(r.backgroundColor).toBe(colors.surface);
    expect(r.borderColor).toBe(colors.border);
  });

  it('todas as variantes têm radius e padding > 0', () => {
    (['hero','summary','detail'] as const).forEach((v) => {
      const r = resolveCardStyle(v, ACCENT);
      expect(r.radius).toBeGreaterThan(0);
      expect(r.padding).toBeGreaterThan(0);
    });
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/cardStyle.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar** `src/components/kit/cardStyle.ts`:
```ts
import { colors, spacing, radius } from '@/theme';

export type CardVariant = 'hero' | 'summary' | 'detail';

export interface CardResolved {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  radius: number;
  padding: number;
  elevation: {
    shadowColor: string; shadowOpacity: number; shadowRadius: number;
    shadowOffset: { width: number; height: number }; elevation: number;
  };
}

// Fallback de elevação caso D1 ainda não exporte `elevation` de @/theme.
// Se @/theme exportar `elevation`, trocar estes literais por elevation.eN (ver Task 0).
const ELEV = {
  e0: { shadowColor: '#000000', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  e1: { shadowColor: '#000000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  e2: { shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  e3: { shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
} as const;

export function resolveCardStyle(variant: CardVariant, accent: string): CardResolved {
  switch (variant) {
    case 'hero':
      return { backgroundColor: colors.surfaceLight, borderColor: accent, borderWidth: 1, radius: radius.lg, padding: spacing.lg, elevation: ELEV.e3 };
    case 'summary':
      return { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, radius: radius.lg, padding: spacing.md, elevation: ELEV.e2 };
    case 'detail':
    default:
      return { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, radius: radius.md, padding: spacing.md, elevation: ELEV.e1 };
  }
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/cardStyle.test.ts` → PASS.
- [ ] **Step 5 — implementar componente** `src/components/kit/Card.tsx`:
```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { resolveCardStyle, CardVariant } from './cardStyle';

interface Props {
  variant?: CardVariant;
  accent?: string;
  selected?: boolean;
  style?: object;
  children?: React.ReactNode;
  testID?: string;
}

export function Card({ variant = 'detail', accent = colors.primary, selected = false, style, children, testID }: Props) {
  const r = resolveCardStyle(variant, accent);
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          backgroundColor: r.backgroundColor,
          borderColor: selected ? accent : r.borderColor,
          borderWidth: selected ? 2 : r.borderWidth,
          borderRadius: r.radius,
          padding: r.padding,
          ...r.elevation,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ base: {} });
```
- [ ] **Step 6 — render smoke (acrescentar ao mesmo arquivo de teste? não — criar `Card.test.tsx`):**
```tsx
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Card } from '@/components/kit/Card';
import { Text } from 'react-native';

it('Card renderiza filhos e aceita variante hero', () => {
  const tree = TestRenderer.create(<Card variant="hero" testID="c"><Text>oi</Text></Card>);
  expect(tree.root.findByProps({ testID: 'c' })).toBeTruthy();
  expect(tree.toJSON()).toMatchSnapshot();
});
```
  (criar como `__tests__/components/Card.test.tsx`.) Rodar `npx jest __tests__/components/Card.test.tsx` → PASS.
- [ ] **Step 7 — `npx tsc --noEmit`** → exit 0.
- [ ] **Step 8 — commit:** orquestrador: `git add src/components/kit/cardStyle.ts src/components/kit/Card.tsx __tests__/components/cardStyle.test.ts __tests__/components/Card.test.tsx __tests__/components/__snapshots__ && git commit -m "feat(d3): Card do kit (hero/summary/detail + elevação)"`.

---

## Task 4: `resolveBadgeStyle` + `Badge.tsx` + compat `ValueBadge`

**Files:** Create `src/components/kit/badgeStyle.ts`, `src/components/kit/Badge.tsx`, `__tests__/components/badgeStyle.test.ts`, `__tests__/components/Badge.test.tsx`; Modify `src/components/ValueBadge.tsx`.
**Interfaces:** Consumes: `colors` de `@/theme`, `luminance`. Produces: `resolveBadgeStyle`, `BadgeTone`, `BadgeResolved`, `Badge`. `ValueBadge` mantém a API `{value,tone,size}`.

- [ ] **Step 1 — teste falhando:** `__tests__/components/badgeStyle.test.ts`:
```ts
import { resolveBadgeStyle } from '@/components/kit/badgeStyle';
import { colors } from '@/theme';

describe('resolveBadgeStyle', () => {
  it('success preenche com colors.success e texto legível', () => {
    const r = resolveBadgeStyle('success', '#22aa55');
    expect(r.backgroundColor).toBe(colors.success);
    expect(['#ffffff','#000000']).toContain(r.textColor);
  });
  it('accent usa o accent do clube como fundo', () => {
    expect(resolveBadgeStyle('accent', '#22aa55').backgroundColor).toBe('#22aa55');
  });
  it('neutral, danger, warning, primary mapeiam para tokens', () => {
    expect(resolveBadgeStyle('danger', '#000').backgroundColor).toBe(colors.danger);
    expect(resolveBadgeStyle('warning', '#000').backgroundColor).toBe(colors.warning);
    expect(resolveBadgeStyle('primary', '#000').backgroundColor).toBe(colors.primary);
    expect(resolveBadgeStyle('neutral', '#000').backgroundColor).toBe(colors.surfaceLight);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/badgeStyle.test.ts`.
- [ ] **Step 3 — implementar** `src/components/kit/badgeStyle.ts`:
```ts
import { colors } from '@/theme';
import { luminance } from '@/theme/club-accent';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'primary' | 'accent';
export interface BadgeResolved { backgroundColor: string; textColor: string; }

const TEXT_FLIP_LUM = 140;
const on = (bg: string) => (luminance(bg) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff');

export function resolveBadgeStyle(tone: BadgeTone, accent: string): BadgeResolved {
  const bg: Record<BadgeTone, string> = {
    neutral: colors.surfaceLight,
    success: colors.success,
    danger: colors.danger,
    warning: colors.warning,
    primary: colors.primary,
    accent,
  };
  return { backgroundColor: bg[tone], textColor: on(bg[tone]) };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/badgeStyle.test.ts` → PASS.
- [ ] **Step 5 — implementar componente** `src/components/kit/Badge.tsx`:
```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing, radius } from '@/theme';
import { resolveBadgeStyle, BadgeTone } from './badgeStyle';

interface Props {
  value: string | number;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  accent?: string;
}

export function Badge({ value, tone = 'neutral', size = 'md', accent = colors.primary }: Props) {
  const r = resolveBadgeStyle(tone, accent);
  const sm = size === 'sm';
  return (
    <View style={[styles.badge, sm ? styles.sm : styles.md, { backgroundColor: r.backgroundColor }]}>
      <Text style={[styles.text, { color: r.textColor, fontSize: sm ? fontSize.xs : fontSize.sm }]}>
        {String(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  sm: { paddingHorizontal: spacing.xs, paddingVertical: 1, minWidth: 36 },
  md: { paddingHorizontal: spacing.sm, paddingVertical: 3, minWidth: 44 },
  text: { fontWeight: '700' },
});
```
- [ ] **Step 6 — render smoke** `__tests__/components/Badge.test.tsx`:
```tsx
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Badge } from '@/components/kit/Badge';

it('Badge renderiza valor e snapshot por tone', () => {
  (['neutral','success','danger','accent'] as const).forEach((tone) => {
    expect(TestRenderer.create(<Badge value={42} tone={tone} accent="#22aa55" />).toJSON()).toMatchSnapshot(tone);
  });
});
```
  Rodar `npx jest __tests__/components/Badge.test.tsx` → PASS.
- [ ] **Step 7 — compat `ValueBadge`:** substituir o conteúdo de `src/components/ValueBadge.tsx` para delegar ao `Badge` (mantendo a assinatura `{value,tone,size}` usada hoje; o tone `'neutral'|'success'|'danger'|'warning'|'primary'` é subconjunto de `BadgeTone`):
```tsx
import React from 'react';
import { Badge } from './kit/Badge';

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'primary';
interface ValueBadgeProps { value: string | number; tone?: Tone; size?: 'sm' | 'md'; }

export function ValueBadge({ value, tone = 'neutral', size = 'md' }: ValueBadgeProps) {
  return <Badge value={value} tone={tone} size={size} />;
}
```
  → Mudança visual: outline vira fill (intencional, spec §D3). `npx tsc --noEmit` → exit 0 (verificar que todos os consumidores de `ValueBadge` ainda compilam).
- [ ] **Step 8 — rodar suíte de regressão** dos consumidores: `npx jest` (deve continuar verde; `ValueBadge` não tem teste dedicado hoje, mas qualquer teste de tela que o renderize deve passar).
- [ ] **Step 9 — commit:** orquestrador: `git add src/components/kit/badgeStyle.ts src/components/kit/Badge.tsx src/components/ValueBadge.tsx __tests__/components/badgeStyle.test.ts __tests__/components/Badge.test.tsx __tests__/components/__snapshots__ && git commit -m "feat(d3): Badge preenchido (tone+accent) e ValueBadge delega ao kit"`.

---

## Task 5: `resolveStatBar` + `StatBar` com gradiente (API preservada)

**Files:** Create `src/components/kit/statBarStyle.ts`, `__tests__/components/statBarStyle.test.ts`, `__tests__/components/StatBar.test.tsx`; Modify `src/components/StatBar.tsx`.
**Interfaces:** Consumes: `getBarColor` (`@/utils/player-colors`), `mixWithWhite`, `react-native-svg`. Produces: `resolveStatBar`, `StatBarResolved`. `StatBar` mantém `{label,value,maxValue?}`.

- [ ] **Step 1 — teste falhando:** `__tests__/components/statBarStyle.test.ts`:
```ts
import { resolveStatBar } from '@/components/kit/statBarStyle';
import { getBarColor } from '@/utils/player-colors';

describe('resolveStatBar', () => {
  it('fillPercent clampa entre 0 e 100', () => {
    expect(resolveStatBar(0, 99).fillPercent).toBe(0);
    expect(resolveStatBar(99, 99).fillPercent).toBe(100);
    expect(resolveStatBar(200, 99).fillPercent).toBe(100);
    expect(resolveStatBar(-5, 99).fillPercent).toBe(0);
  });
  it('valueColor e colorEnd batem com getBarColor(value)', () => {
    const r = resolveStatBar(80, 99);
    expect(r.valueColor).toBe(getBarColor(80));
    expect(r.colorEnd).toBe(getBarColor(80));
  });
  it('colorStart é um tint mais claro que colorEnd (gradiente)', () => {
    const r = resolveStatBar(80, 99);
    expect(r.colorStart).not.toBe(r.colorEnd);
  });
  it('maxValue customizado afeta fillPercent', () => {
    expect(resolveStatBar(5, 10).fillPercent).toBe(50);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/statBarStyle.test.ts`.
- [ ] **Step 3 — implementar** `src/components/kit/statBarStyle.ts`:
```ts
import { getBarColor } from '@/utils/player-colors';
import { mixWithWhite } from '@/theme/club-accent';

export interface StatBarResolved {
  fillPercent: number;
  colorStart: string;
  colorEnd: string;
  valueColor: string;
}

export function resolveStatBar(value: number, maxValue: number): StatBarResolved {
  const clamped = Math.max(0, Math.min(value, maxValue));
  const fillPercent = (clamped / maxValue) * 100;
  const end = getBarColor(value);
  return { fillPercent, colorStart: mixWithWhite(end, 0.35), colorEnd: end, valueColor: end };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/statBarStyle.test.ts` → PASS.
- [ ] **Step 5 — reescrever** `src/components/StatBar.tsx` mantendo a API e usando gradiente SVG (`react-native-svg` já instalado; `Defs/LinearGradient/Stop/Rect`). O componente deixa de usar `width:'${n}%'` e passa a desenhar a barra em SVG com largura medida por `onLayout`:
```tsx
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { colors, fontSize, radius, spacing } from '@/theme';
import { resolveStatBar } from './kit/statBarStyle';

interface StatBarProps { label: string; value: number; maxValue?: number; }

const BAR_HEIGHT = 6;

export default function StatBar({ label, value, maxValue = 99 }: StatBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const { fillPercent, colorStart, colorEnd, valueColor } = resolveStatBar(value, maxValue);
  const gradId = `sb-${Math.round(value)}-${Math.round(maxValue)}`;
  const fillWidth = (trackWidth * fillPercent) / 100;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.barContainer}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {trackWidth > 0 && (
          <Svg width={trackWidth} height={BAR_HEIGHT}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colorStart} />
                <Stop offset="1" stopColor={colorEnd} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={fillWidth} height={BAR_HEIGHT} rx={radius.sm} fill={`url(#${gradId})`} />
          </Svg>
        )}
      </View>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xs },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, width: 90 },
  barContainer: {
    flex: 1, height: BAR_HEIGHT, backgroundColor: colors.border,
    borderRadius: radius.sm, overflow: 'hidden', marginHorizontal: spacing.sm, justifyContent: 'center',
  },
  value: { fontSize: fontSize.sm, fontWeight: '600', width: 26, textAlign: 'right' },
});
```
  Nota: `gradId` usa `value/maxValue` (não `Math.random`) — IDs estáveis e determinísticos, sem violar a regra anti-random.
- [ ] **Step 6 — render smoke** `__tests__/components/StatBar.test.tsx`:
```tsx
import React from 'react';
import TestRenderer from 'react-test-renderer';
import StatBar from '@/components/StatBar';

it('StatBar renderiza label e valor', () => {
  const tree = TestRenderer.create(<StatBar label="Velocidade" value={80} />);
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('Velocidade');
  expect(json).toContain('80');
  expect(tree.toJSON()).toMatchSnapshot();
});
```
  Rodar `npx jest __tests__/components/StatBar.test.tsx` → PASS. `npx tsc --noEmit` → exit 0.
- [ ] **Step 7 — commit:** orquestrador: `git add src/components/kit/statBarStyle.ts src/components/StatBar.tsx __tests__/components/statBarStyle.test.ts __tests__/components/StatBar.test.tsx __tests__/components/__snapshots__ && git commit -m "feat(d3): StatBar com gradiente SVG (API {label,value,maxValue} preservada)"`.

---

## Task 6: `Chip` / Filter (selecionável)

**Files:** Create `src/components/kit/Chip.tsx`, `__tests__/components/Chip.test.tsx`.
**Interfaces:** Consumes: `colors/spacing/fontSize/radius` de `@/theme`. Produces: `Chip`.

- [ ] **Step 1 — teste falhando:** `__tests__/components/Chip.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Chip } from '@/components/kit/Chip';

it('Chip dispara onPress e reflete selected no accessibilityState', () => {
  const onPress = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<Chip label="2024" selected onPress={onPress} accent="#22aa55" testID="chip" />); });
  const node = tree.root.findByProps({ testID: 'chip' });
  expect(node.props.accessibilityState.selected).toBe(true);
  act(() => { node.props.onPress(); });
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('snapshot estável selecionado vs não', () => {
  expect(TestRenderer.create(<Chip label="A" onPress={() => {}} />).toJSON()).toMatchSnapshot('idle');
  expect(TestRenderer.create(<Chip label="A" selected onPress={() => {}} accent="#22aa55" />).toJSON()).toMatchSnapshot('selected');
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/Chip.test.tsx`.
- [ ] **Step 3 — implementar** `src/components/kit/Chip.tsx`:
```tsx
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';

interface Props {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accent?: string;
  testID?: string;
  accessibilityLabel?: string;
}

export function Chip({ label, selected = false, onPress, accent = colors.primary, testID, accessibilityLabel }: Props) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? accent : 'transparent', borderColor: selected ? accent : colors.border },
      ]}
    >
      <Text style={[styles.label, { color: selected ? colors.text : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: fontSize.sm, fontWeight: '600' },
});
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/Chip.test.tsx` → PASS. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** orquestrador: `git add src/components/kit/Chip.tsx __tests__/components/Chip.test.tsx __tests__/components/__snapshots__ && git commit -m "feat(d3): Chip/Filter selecionável com accent"`.

---

## Task 7: `Icon` SVG + mapa `icons.ts`

**Files:** Create `src/components/kit/icons.ts`, `src/components/kit/Icon.tsx`, `__tests__/components/icons.test.ts`, `__tests__/components/Icon.test.tsx`.
**Interfaces:** Consumes: `react-native-svg`. Produces: `ICONS`, `IconName`, `IconDef`, `Icon`. Set inicial cobre os emoji de TabNavigator / MatchEventItem / EmptyState / Onboarding (a substituição nas telas é D5).

- [ ] **Step 1 — teste falhando (mapa puro):** `__tests__/components/icons.test.ts`:
```ts
import { ICONS, IconName } from '@/components/kit/icons';

const NAMES: IconName[] = [
  'play','squad','news','tactics','money','chart',
  'goal','assist','yellow','red','sub','injury',
  'whistle','shield','target','glove',
  'arrowRight','check','close',
];

describe('ICONS', () => {
  it('cobre todos os nomes do set inicial', () => {
    NAMES.forEach((n) => expect(ICONS[n]).toBeDefined());
  });
  it('cada ícone tem viewBox e ao menos 1 path com d não vazio', () => {
    Object.values(ICONS).forEach((def) => {
      expect(def.viewBox).toMatch(/^\d+ \d+ \d+ \d+$/);
      expect(def.paths.length).toBeGreaterThanOrEqual(1);
      def.paths.forEach((p) => expect(p.d.length).toBeGreaterThan(0));
    });
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/icons.test.ts`.
- [ ] **Step 3 — implementar** `src/components/kit/icons.ts` (paths simples 24×24; geométricos, sem dependência externa — qualquer `d` válido satisfaz o contrato; usar formas reconhecíveis):
```ts
export type IconName =
  | 'play' | 'squad' | 'news' | 'tactics' | 'money' | 'chart'
  | 'goal' | 'assist' | 'yellow' | 'red' | 'sub' | 'injury'
  | 'whistle' | 'shield' | 'target' | 'glove'
  | 'arrowRight' | 'check' | 'close';

export interface IconDef { viewBox: string; paths: { d: string; fillRule?: 'evenodd' }[]; }

const VB = '0 0 24 24';

export const ICONS: Record<IconName, IconDef> = {
  play:     { viewBox: VB, paths: [{ d: 'M8 5v14l11-7z' }] },
  squad:    { viewBox: VB, paths: [{ d: 'M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z' }] },
  news:     { viewBox: VB, paths: [{ d: 'M4 4h16v16H4zM6 8h12M6 12h12M6 16h8', fillRule: 'evenodd' }] },
  tactics:  { viewBox: VB, paths: [{ d: 'M4 4h16v16H4zM12 4v16M4 12h16' }] },
  money:    { viewBox: VB, paths: [{ d: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-1H9v-2h4v-1H9V9h2V8h2v1h2v2h-4v1h4v3h-2z' }] },
  chart:    { viewBox: VB, paths: [{ d: 'M4 20V4M4 20h16M8 18v-6M12 18V8M16 18v-9M20 18v-4' }] },
  goal:     { viewBox: VB, paths: [{ d: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 3l2.5 1.8-1 3H10.5l-1-3z' }] },
  assist:   { viewBox: VB, paths: [{ d: 'M5 12h11l-4-4m4 4l-4 4M3 5v14' }] },
  yellow:   { viewBox: VB, paths: [{ d: 'M7 3h7l3 3v15H7z' }] },
  red:      { viewBox: VB, paths: [{ d: 'M7 3h7l3 3v15H7z' }] },
  sub:      { viewBox: VB, paths: [{ d: 'M7 7h9l-3-3m3 3l-3 3M17 17H8l3 3m-3-3l3-3' }] },
  injury:   { viewBox: VB, paths: [{ d: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z' }] },
  whistle:  { viewBox: VB, paths: [{ d: 'M3 10a5 5 0 005 5h6l4 3v-8H8a5 5 0 00-5 0z' }] },
  shield:   { viewBox: VB, paths: [{ d: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z' }] },
  target:   { viewBox: VB, paths: [{ d: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12zm0 4a2 2 0 100 4 2 2 0 000-4z', fillRule: 'evenodd' }] },
  glove:    { viewBox: VB, paths: [{ d: 'M6 10V6a2 2 0 014 0v4V4a2 2 0 014 0v6a4 4 0 01-4 4H8a4 4 0 01-4-4z' }] },
  arrowRight:{ viewBox: VB, paths: [{ d: 'M5 12h14m-6-6l6 6-6 6' }] },
  check:    { viewBox: VB, paths: [{ d: 'M5 13l4 4L19 7' }] },
  close:    { viewBox: VB, paths: [{ d: 'M6 6l12 12M18 6L6 18' }] },
};
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/icons.test.ts` → PASS.
- [ ] **Step 5 — implementar** `src/components/kit/Icon.tsx`:
```tsx
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';
import { ICONS, IconName } from './icons';

interface Props { name: IconName; size?: number; color?: string; }

export function Icon({ name, size = 24, color = colors.text }: Props) {
  const def = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox={def.viewBox}>
      {def.paths.map((p, i) => (
        <Path key={i} d={p.d} fill={color} fillRule={p.fillRule} />
      ))}
    </Svg>
  );
}
```
- [ ] **Step 6 — render smoke** `__tests__/components/Icon.test.tsx`:
```tsx
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Icon } from '@/components/kit/Icon';

it('Icon renderiza com cor custom e snapshot', () => {
  const tree = TestRenderer.create(<Icon name="goal" size={32} color="#22aa55" />);
  expect(tree.toJSON()).toMatchSnapshot();
});
```
  Rodar `npx jest __tests__/components/Icon.test.tsx` → PASS. `npx tsc --noEmit` → exit 0.
- [ ] **Step 7 — commit:** orquestrador: `git add src/components/kit/icons.ts src/components/kit/Icon.tsx __tests__/components/icons.test.ts __tests__/components/Icon.test.tsx __tests__/components/__snapshots__ && git commit -m "feat(d3): Icon SVG + set inicial (substitui emoji em D5)"`.

---

## Task 8: `EmptyState` v2 (ilustração SVG + CTA) + `emptyStateArt.ts`

**Files:** Create `src/components/kit/emptyStateArt.ts`, `src/components/kit/EmptyState.tsx`, `__tests__/components/emptyStateArt.test.ts`, `__tests__/components/EmptyState.test.tsx`.
**Interfaces:** Consumes: `IconDef` (de `icons.ts`), `Button` (Task 2), `react-native-svg`. Produces: `EMPTY_ART`, `EmptyArt`, `EmptyState` (v2). Mantém o `EmptyState` antigo (`src/components/EmptyState.tsx`) intocado — a substituição nas telas é D5; o novo vive em `kit/`.

- [ ] **Step 1 — teste falhando (arte pura):** `__tests__/components/emptyStateArt.test.ts`:
```ts
import { EMPTY_ART, EmptyArt } from '@/components/kit/emptyStateArt';

const ARTS: EmptyArt[] = ['inbox','search','squad','generic'];

it('cada ilustração tem viewBox e ao menos 1 path', () => {
  ARTS.forEach((a) => {
    expect(EMPTY_ART[a]).toBeDefined();
    expect(EMPTY_ART[a].paths.length).toBeGreaterThanOrEqual(1);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/emptyStateArt.test.ts`.
- [ ] **Step 3 — implementar** `src/components/kit/emptyStateArt.ts`:
```ts
import { IconDef } from './icons';

export type EmptyArt = 'inbox' | 'search' | 'squad' | 'generic';

const VB = '0 0 64 64';

export const EMPTY_ART: Record<EmptyArt, IconDef> = {
  inbox:   { viewBox: VB, paths: [{ d: 'M8 20h48v28a4 4 0 01-4 4H12a4 4 0 01-4-4zM8 20l8-12h32l8 12M24 20a8 8 0 0016 0' }] },
  search:  { viewBox: VB, paths: [{ d: 'M28 12a16 16 0 100 32 16 16 0 000-32zm14 30l12 12' }] },
  squad:   { viewBox: VB, paths: [{ d: 'M32 14a8 8 0 100 16 8 8 0 000-16zM16 52v-2c0-7 7-12 16-12s16 5 16 12v2z' }] },
  generic: { viewBox: VB, paths: [{ d: 'M12 12h40v40H12zM12 24h40M24 12v40' }] },
};
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/emptyStateArt.test.ts` → PASS.
- [ ] **Step 5 — implementar** `src/components/kit/EmptyState.tsx`:
```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fontSize, spacing } from '@/theme';
import { EMPTY_ART, EmptyArt } from './emptyStateArt';
import { Button } from './Button';

interface Props {
  art?: EmptyArt;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  accent?: string;
}

export function EmptyState({ art = 'generic', title, description, ctaLabel, onCtaPress, accent = colors.primary }: Props) {
  const def = EMPTY_ART[art];
  return (
    <View style={styles.container}>
      <Svg width={72} height={72} viewBox={def.viewBox} style={styles.art}>
        {def.paths.map((p, i) => (
          <Path key={i} d={p.d} fill="none" stroke={colors.textMuted} strokeWidth={2} />
        ))}
      </Svg>
      <Text style={styles.title}>{title}</Text>
      {description != null && <Text style={styles.description}>{description}</Text>}
      {ctaLabel != null && onCtaPress != null && (
        <View style={styles.cta}>
          <Button label={ctaLabel} variant="primary" accent={accent} onPress={onCtaPress} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  art: { marginBottom: spacing.md },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', textAlign: 'center' },
  description: { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 },
  cta: { marginTop: spacing.md, alignSelf: 'stretch' },
});
```
- [ ] **Step 6 — render smoke** `__tests__/components/EmptyState.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { EmptyState } from '@/components/kit/EmptyState';

it('renderiza título/descrição e dispara CTA', () => {
  const onCta = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <EmptyState art="search" title="Sem resultados" description="Ajuste os filtros" ctaLabel="Limpar" onCtaPress={onCta} />,
    );
  });
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('Sem resultados');
  expect(json).toContain('Limpar');
  expect(tree.toJSON()).toMatchSnapshot();
});

it('sem ctaLabel não renderiza botão', () => {
  const tree = TestRenderer.create(<EmptyState title="Vazio" />);
  expect(JSON.stringify(tree.toJSON())).not.toContain('accessibilityRole');
});
```
  Rodar `npx jest __tests__/components/EmptyState.test.tsx` → PASS. `npx tsc --noEmit` → exit 0.
- [ ] **Step 7 — commit:** orquestrador: `git add src/components/kit/emptyStateArt.ts src/components/kit/EmptyState.tsx __tests__/components/emptyStateArt.test.ts __tests__/components/EmptyState.test.tsx __tests__/components/__snapshots__ && git commit -m "feat(d3): EmptyState v2 (ilustração SVG + CTA)"`.

---

## Task 9: `Sheet` (Modal/Sheet padronizado)

**Files:** Create `src/components/kit/Sheet.tsx`, `__tests__/components/Sheet.test.tsx`.
**Interfaces:** Consumes: `colors/spacing/radius` de `@/theme`, RN `Modal/Pressable`. Produces: `Sheet`. Consolida o backdrop+folha de `FreeAgentsScreen`/`OnboardingModal`/`ContextualHint`.

- [ ] **Step 1 — teste falhando:** `__tests__/components/Sheet.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { Sheet } from '@/components/kit/Sheet';

it('renderiza filhos quando visível e fecha pelo backdrop', () => {
  const onClose = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <Sheet visible onClose={onClose} testID="sheet"><Text>conteudo</Text></Sheet>,
    );
  });
  expect(JSON.stringify(tree.toJSON())).toContain('conteudo');
  const backdrop = tree.root.findByProps({ testID: 'sheet-backdrop' });
  act(() => { backdrop.props.onPress(); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('clique no corpo da folha não fecha (stopPropagation)', () => {
  const onClose = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<Sheet visible onClose={onClose} testID="sheet"><Text>x</Text></Sheet>); });
  const body = tree.root.findByProps({ testID: 'sheet-body' });
  act(() => { body.props.onPress?.({ stopPropagation: () => {} }); });
  expect(onClose).not.toHaveBeenCalled();
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/Sheet.test.tsx`.
- [ ] **Step 3 — implementar** `src/components/kit/Sheet.tsx`:
```tsx
import React from 'react';
import { Modal, Pressable, View, StyleSheet } from 'react-native';
import { colors, spacing, radius, alpha } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  testID?: string;
}

export function Sheet({ visible, onClose, children, testID }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable testID={testID ? `${testID}-backdrop` : undefined} style={styles.backdrop} onPress={onClose}>
        <Pressable testID={testID ? `${testID}-body` : undefined} style={styles.body} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: alpha('#000000', 0.7),
    justifyContent: 'center', paddingHorizontal: spacing.md,
  },
  body: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, maxHeight: '85%',
  },
});
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/Sheet.test.tsx` → PASS. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** orquestrador: `git add src/components/kit/Sheet.tsx __tests__/components/Sheet.test.tsx && git commit -m "feat(d3): Sheet/Modal padronizado (backdrop + folha)"`.

---

## Task 10: `Skeleton` + `TabIndicator`

**Files:** Create `src/components/kit/Skeleton.tsx`, `src/components/kit/TabIndicator.tsx`, `__tests__/components/Skeleton.test.tsx`, `__tests__/components/TabIndicator.test.tsx`.
**Interfaces:** Consumes: `colors/radius/spacing` de `@/theme`. Produces: `Skeleton`, `TabIndicator`. Shimmer animado fica para D6 — aqui é placeholder estático.

- [ ] **Step 1 — teste falhando:** `__tests__/components/Skeleton.test.tsx`:
```tsx
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Skeleton } from '@/components/kit/Skeleton';

it('Skeleton renderiza com dimensões custom', () => {
  const tree = TestRenderer.create(<Skeleton width={120} height={16} />);
  expect(tree.toJSON()).toMatchSnapshot();
});
```
  e `__tests__/components/TabIndicator.test.tsx`:
```tsx
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { TabIndicator } from '@/components/kit/TabIndicator';

it('TabIndicator ativo usa accent; inativo é transparente', () => {
  expect(TestRenderer.create(<TabIndicator active accent="#22aa55" />).toJSON()).toMatchSnapshot('active');
  expect(TestRenderer.create(<TabIndicator active={false} accent="#22aa55" />).toJSON()).toMatchSnapshot('inactive');
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/Skeleton.test.tsx __tests__/components/TabIndicator.test.tsx`.
- [ ] **Step 3 — implementar** `src/components/kit/Skeleton.tsx`:
```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

interface Props { width?: number | string; height?: number; radius?: number; style?: object; }

export function Skeleton({ width = '100%', height = 12, radius: r = radius.sm, style }: Props) {
  return <View style={[styles.base, { width: width as any, height, borderRadius: r }, style]} />;
}

const styles = StyleSheet.create({ base: { backgroundColor: colors.surfaceLight, opacity: 0.6 } });
```
  e `src/components/kit/TabIndicator.tsx`:
```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

interface Props { active: boolean; shape?: 'underline' | 'pill'; accent?: string; width?: number; }

export function TabIndicator({ active, shape = 'underline', accent = colors.primary, width }: Props) {
  const color = active ? accent : 'transparent';
  if (shape === 'pill') {
    return <View style={[styles.pill, { backgroundColor: active ? accent : 'transparent', borderColor: color, width }]} />;
  }
  return <View style={[styles.underline, { backgroundColor: color, width }]} />;
}

const styles = StyleSheet.create({
  underline: { height: 3, borderRadius: radius.sm, alignSelf: 'center' },
  pill: { height: 28, borderRadius: radius.pill, borderWidth: 1 },
});
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/Skeleton.test.tsx __tests__/components/TabIndicator.test.tsx` → PASS. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** orquestrador: `git add src/components/kit/Skeleton.tsx src/components/kit/TabIndicator.tsx __tests__/components/Skeleton.test.tsx __tests__/components/TabIndicator.test.tsx __tests__/components/__snapshots__ && git commit -m "feat(d3): Skeleton (placeholder) + TabIndicator (underline/pill com accent)"`.

---

## Task 11: `Toast` genérico

**Files:** Create `src/components/kit/Toast.tsx`, `__tests__/components/Toast.test.tsx`.
**Interfaces:** Consumes: `colors/spacing/fontSize/radius/alpha` de `@/theme`. Produces: `Toast`, `ToastTone`. Generaliza `AchievementToast` (que continua existindo; migração é D5).

- [ ] **Step 1 — teste falhando:** `__tests__/components/Toast.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Toast } from '@/components/kit/Toast';

it('renderiza título/mensagem e dispara onDismiss ao tocar', () => {
  const onDismiss = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Toast title="Salvo" message="Tudo certo" tone="success" onDismiss={onDismiss} testID="toast" />);
  });
  expect(JSON.stringify(tree.toJSON())).toContain('Salvo');
  const node = tree.root.findByProps({ testID: 'toast' });
  act(() => { node.props.onPress(); });
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it('snapshot por tone', () => {
  (['info','success','danger','gold'] as const).forEach((tone) => {
    expect(TestRenderer.create(<Toast title="T" tone={tone} onDismiss={() => {}} />).toJSON()).toMatchSnapshot(tone);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/components/Toast.test.tsx`.
- [ ] **Step 3 — implementar** `src/components/kit/Toast.tsx`:
```tsx
import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius, alpha } from '@/theme';

export type ToastTone = 'info' | 'success' | 'danger' | 'gold';

interface Props {
  title: string;
  message?: string;
  tone?: ToastTone;
  onDismiss: () => void;
  testID?: string;
}

const TONE_COLOR: Record<ToastTone, string> = {
  info: colors.primary,
  success: colors.success,
  danger: colors.danger,
  gold: colors.gold,
};

export function Toast({ title, message, tone = 'info', onDismiss, testID }: Props) {
  const accent = TONE_COLOR[tone];
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.toast, { borderColor: alpha(accent, 0.6), borderLeftColor: accent }]}
      activeOpacity={0.9}
      onPress={onDismiss}
      accessibilityRole="button"
    >
      <Text style={[styles.title, { color: accent }]}>{title}</Text>
      {message != null && <Text style={styles.message}>{message}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderLeftWidth: 4,
  },
  title: { fontSize: fontSize.sm, fontWeight: '700', letterSpacing: 0.5 },
  message: { color: colors.text, fontSize: fontSize.md, marginTop: spacing.xxs },
});
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/Toast.test.tsx` → PASS. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** orquestrador: `git add src/components/kit/Toast.tsx __tests__/components/Toast.test.tsx __tests__/components/__snapshots__ && git commit -m "feat(d3): Toast genérico (tone) generalizando AchievementToast"`.

---

## Task 12: `useConfirm` + `ConfirmProvider` (substitui `Alert.alert`)

**Files:** Create `src/components/kit/useConfirm.tsx`, `__tests__/components/useConfirm.test.tsx`. Modify `src/i18n/pt.ts`, `src/i18n/en.ts`.
**Interfaces:** Consumes: `Sheet` (Task 9), `Button` (Task 2), `colors/spacing/fontSize`, `useTranslation`. Produces: `useConfirm`, `ConfirmProvider`, `ConfirmOptions`. Resolve `Promise<boolean>` (true=confirma, false=cancela/dismiss). **Não** monta em `App.tsx` aqui — isso é D5 (kit é aditivo); o teste usa o provider local.

- [ ] **Step 1 — i18n (paridade):** adicionar em `src/i18n/pt.ts` e `src/i18n/en.ts` (mesma posição, mesmas chaves):
```ts
// pt.ts
'kit.confirm_default': 'Confirmar',
'kit.cancel': 'Cancelar',
// en.ts
'kit.confirm_default': 'Confirm',
'kit.cancel': 'Cancel',
```
- [ ] **Step 2 — teste falhando:** `__tests__/components/useConfirm.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ConfirmProvider, useConfirm } from '@/components/kit/useConfirm';

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <>
      {/* expõe o disparador via prop de teste */}
      {React.createElement('Trigger' as any, {
        testID: 'go',
        onPress: async () => onResult(await confirm({ title: 'Vender?', message: 'Tem certeza?' })),
      })}
    </>
  );
}

function renderHarness(onResult: (v: boolean) => void) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <ConfirmProvider><Harness onResult={onResult} /></ConfirmProvider>,
    );
  });
  return tree;
}

it('resolve true ao confirmar', async () => {
  const onResult = jest.fn();
  const tree = renderHarness(onResult);
  await act(async () => { tree.root.findByProps({ testID: 'go' }).props.onPress(); });
  // botão confirmar do provider
  const confirmBtn = tree.root.findByProps({ testID: 'confirm-yes' });
  await act(async () => { confirmBtn.props.onPress(); });
  expect(onResult).toHaveBeenCalledWith(true);
});

it('resolve false ao cancelar', async () => {
  const onResult = jest.fn();
  const tree = renderHarness(onResult);
  await act(async () => { tree.root.findByProps({ testID: 'go' }).props.onPress(); });
  const cancelBtn = tree.root.findByProps({ testID: 'confirm-no' });
  await act(async () => { cancelBtn.props.onPress(); });
  expect(onResult).toHaveBeenCalledWith(false);
});

it('lança erro claro se usado sem provider', () => {
  function Bare() { useConfirm(); return null; }
  expect(() => TestRenderer.create(<Bare />)).toThrow(/ConfirmProvider/);
});
```
  Nota: se `'Trigger'` (host element fictício) não renderizar sob o renderer, trocar por um `Pressable` real de `react-native` com `testID="go"` e `onPress`. A asserção-chave é os `testID` `confirm-yes`/`confirm-no` expostos pelo provider.
- [ ] **Step 3 — rodar (falha):** `npx jest __tests__/components/useConfirm.test.tsx`.
- [ ] **Step 4 — implementar** `src/components/kit/useConfirm.tsx`:
```tsx
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '@/theme';
import { useTranslation } from '@/i18n';
import { Sheet } from './Sheet';
import { Button } from './Button';

export interface ConfirmOptions {
  title: string; message?: string;
  confirmLabel?: string; cancelLabel?: string;
  tone?: 'default' | 'danger';
}

type Resolver = (v: boolean) => void;
const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm precisa de <ConfirmProvider> no topo da árvore.');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet visible={opts != null} onClose={() => settle(false)} testID="confirm-sheet">
        {opts && (
          <View>
            <Text style={styles.title}>{opts.title}</Text>
            {opts.message != null && <Text style={styles.message}>{opts.message}</Text>}
            <View style={styles.actions}>
              <Button
                label={opts.cancelLabel ?? t('kit.cancel')}
                variant="ghost"
                onPress={() => settle(false)}
                testID="confirm-no"
              />
              <Button
                label={opts.confirmLabel ?? t('kit.confirm_default')}
                variant={opts.tone === 'danger' ? 'danger' : 'primary'}
                onPress={() => settle(true)}
                testID="confirm-yes"
              />
            </View>
          </View>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.xs },
  message: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
});
```
- [ ] **Step 5 — rodar (passa):** `npx jest __tests__/components/useConfirm.test.tsx` → PASS. Se o `'Trigger'` host falhar, aplicar o fallback `Pressable` descrito no Step 2 e re-rodar. `npx tsc --noEmit` → exit 0.
- [ ] **Step 6 — paridade i18n:** `npx jest __tests__/i18n/parity.test.ts` → PASS (chaves `kit.*` presentes em pt e en).
- [ ] **Step 7 — commit:** orquestrador: `git add src/components/kit/useConfirm.tsx src/i18n/pt.ts src/i18n/en.ts __tests__/components/useConfirm.test.tsx && git commit -m "feat(d3): useConfirm + ConfirmProvider (substitui Alert.alert no-op no web)"`.

---

## Task 13: Barrel `index.ts` do kit + verificação final (DoD)

**Files:** Create `src/components/kit/index.ts`.
**Interfaces:** Produces: superfície de import única `@/components/kit`.

- [ ] **Step 1 — criar barrel** `src/components/kit/index.ts`:
```ts
export { Button } from './Button';
export { resolveButtonStyle } from './buttonStyle';
export type { ButtonVariant, ButtonState, ButtonResolved } from './buttonStyle';
export { Card } from './Card';
export { resolveCardStyle } from './cardStyle';
export type { CardVariant, CardResolved } from './cardStyle';
export { Chip } from './Chip';
export { Badge } from './Badge';
export { resolveBadgeStyle } from './badgeStyle';
export type { BadgeTone, BadgeResolved } from './badgeStyle';
export { resolveStatBar } from './statBarStyle';
export type { StatBarResolved } from './statBarStyle';
export { TabIndicator } from './TabIndicator';
export { Sheet } from './Sheet';
export { Skeleton } from './Skeleton';
export { Toast } from './Toast';
export type { ToastTone } from './Toast';
export { Icon } from './Icon';
export { ICONS } from './icons';
export type { IconName, IconDef } from './icons';
export { EmptyState } from './EmptyState';
export { EMPTY_ART } from './emptyStateArt';
export type { EmptyArt } from './emptyStateArt';
export { useConfirm, ConfirmProvider } from './useConfirm';
export type { ConfirmOptions } from './useConfirm';
```
- [ ] **Step 2 — verificação completa:** `npx tsc --noEmit` (exit 0) e `npx jest` (suíte inteira verde, incluindo `__tests__/components/*` e paridade i18n).
- [ ] **Step 3 — verificar "zero literal":** rodar:
```bash
grep -rnE "#[0-9a-fA-F]{3,6}|borderRadius: [0-9]|fontSize: [0-9]|padding(Vertical|Horizontal)?: [0-9]" src/components/kit/ | grep -vE "viewBox|d: '|stopColor|alpha\('#000000'|VB =|sb-"
```
  → Esperado: vazio (cores/spacing/radius vêm de tokens). Exceções aceitas: `viewBox`/`d`/`stopColor` de SVG, `alpha('#000000', …)` do backdrop, e os literais de elevação em `cardStyle.ts` (fallback de D1 — Task 0). Se aparecer literal indevido, corrigir para token e re-rodar.
- [ ] **Step 4 — browser (Playwright MCP):** subir o web server (background do harness) e validar que o app **ainda** renderiza sem regressão (kit é aditivo; nenhuma tela migrou, mas `StatBar`/`ValueBadge` mudaram). Abrir uma tela com `StatBar` (PlayerDetail) e uma com `ValueBadge`; confirmar StatBar com gradiente e badge preenchido, 0 erros de console.
- [ ] **Step 5 — commit:** orquestrador: `git add src/components/kit/index.ts && git commit -m "feat(d3): barrel @/components/kit e fechamento do DoD do kit"`.

---

## Self-Review

1. **Cobertura do spec §D3.** Card hero/summary/detail+elevação (Task 3) ✓; Button variantes/estados+accent (Tasks 1–2) ✓; Chip/Filter (Task 6) ✓; Badge preenchido com tone (Task 4) ✓; StatBar gradiente com API `{label,value,maxValue}` preservada (Task 5) ✓; TabIndicator (Task 10) ✓; Modal/Sheet (Task 9) ✓; Skeleton (Task 10) ✓; Toast (Task 11) ✓; Icon SVG set inicial substituindo emoji de TabNavigator/MatchEventItem/EmptyState/Onboarding (Task 7 — set cobre os glifos; substituição nas telas é D5, kit é aditivo) ✓; EmptyState v2 ilustração SVG+CTA (Task 8) ✓; useConfirm hook+ConfirmProvider resolvendo true/false, API do Contract §3 (Task 12) ✓. Kit consome só tokens; nenhuma tela migra (aditivo) ✓.
2. **Placeholder scan.** Sem "TBD"/"adicionar tratamento"/"escrever testes para o acima". Todo step que muda código mostra o código. Únicos pontos de decisão-na-execução são explícitos e instrumentados: Task 0 (sondagem D1/D4 e infra de render `.tsx`) com critério de parada e fallbacks concretos; Task 12 (host `'Trigger'` → fallback `Pressable`) com a alternativa escrita. Nenhum é placeholder de comportamento.
3. **Consistência de tipos.** Assinaturas batem com o Contract do spec §3: `Button`, `StatBar`, `useConfirm`/`ConfirmProvider`/`ConfirmOptions` idênticos; `ClubAccentRamp` não é importado quando ausente (resolvers recebem `accent: string`, alinhado à mitigação). `BadgeTone` é superconjunto do `Tone` de `ValueBadge` (compat preservada). `IconDef` reusado por `EMPTY_ART`. Barrel reexporta todos os símbolos sem colisão.
4. **Determinismo / regras da casa.** Zero `Math.random`/`Date.now` no código de componente — `StatBar` deriva `gradId` de `value/maxValue` (estável). Engine intocado. better-sqlite3 não é necessário (kit não toca DB); testes de resolver puro rodam em ts-jest node, render via `react-test-renderer` (sem mock de RN nativo além do que o ambiente exigir, decidido em Task 0).
