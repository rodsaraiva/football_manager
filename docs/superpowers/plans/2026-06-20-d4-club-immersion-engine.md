# D4 — Motor de Imersão de Clube (fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2–5 min): teste falhando (com código) → rodar e ver falhar (comando + saída) → implementação mínima (com código) → rodar e ver passar → commit (git add + msg). Sem placeholders. Subagents NÃO commitam — o passo "commit" descreve o que o orquestrador commita.

**Goal:** Levar a cor do clube (accent) de 3 pontos (TabNavigator/RootNavigator/ClubBanner) para todo o chrome de ação/imersão — Button `primary`, indicador de aba ativa, barras de progresso, anel de foco e destaque de card "hero" — via um `ClubAccentProvider` que memoiza a rampa de accent e um `useClubAccent` estendido que retorna `ClubAccentRamp`.

**Architecture:** `deriveClubAccent` continua produzindo a cor base legível; uma nova função pura `deriveAccentRamp(accent)` expande essa base numa mini-rampa `{accent, accentDim, accentBright, onAccent}` (shade para press/disabled, tint para hover/destaque). `useClubAccent` passa a retornar a rampa completa (retrocompatível: `accent`/`onAccent` continuam existindo). Um `ClubAccentProvider` (React Context) memoiza a rampa a partir do `playerClub` e a expõe à árvore sem recomputar a cada render; ele é montado em `App.tsx` acima do `RootNavigator`. Os consumidores de chrome de ação passam a ler a rampa via `useClubAccent`/context.

**Tech Stack:** TS 5.9 strict, React 19.1, React Native 0.81, Jest + ts-jest, Zustand (store já existente), React Navigation v7. Theme puro em `src/theme` (sem React no `tokens.ts`/`club-accent.ts`).

**Convenções:** TDD obrigatório em theme puro (`club-accent.ts`); zero `Math.random`/`Date.now`; tokens/cores sempre de `@/theme`; i18n não é tocado (D4 não adiciona strings); branch `feat/d4-club-immersion-engine`; commits terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Subagents NÃO commitam (o orquestrador commita).

**Precedente a espelhar:**
- `src/theme/club-accent.ts` — funções puras `luminance`/`mixWithWhite`/`deriveClubAccent` (D4 adiciona `deriveAccentRamp` ao lado, reusando `mixWithWhite`/`luminance`).
- `src/theme/useClubAccent.ts` — hook `useMemo` lendo `playerClub` do `game-store` (D4 estende o retorno).
- `__tests__/theme/club-accent.test.ts` — estilo dos testes puros do theme (tabela de clubes claros/escuros, asserção de legibilidade via `luminance`).
- `src/components/ClubBanner.tsx` — consumidor que já lê `{accent,onAccent}` (continua válido sem mudança).
- `src/navigation/TabNavigator.tsx:18` / `src/navigation/RootNavigator.tsx` — consumidores via destructuring `const { accent } = useClubAccent()` (continuam válidos).

**Dependência (pré-requisito de D1):** D4 precisa de `deriveAccentRamp`. O design (§D1) prevê essa função em `club-accent.ts`. Se D1 já a entregou, a Task 1 vira no-op verificada (o teste já passa) e segue para a Task 2. Se não, a Task 1 a cria — ela é pura e auto-contida, sem bloquear o restante de D1.

---

## File Structure

- **Modify** `src/theme/club-accent.ts` — adicionar `ClubAccentRamp` + `deriveAccentRamp(accent)` (puro, reusa `mixWithWhite`/`luminance`).
- **Modify** `src/theme/useClubAccent.ts` — retorno passa de `ClubAccent` para `ClubAccentRamp`.
- **Create** `src/theme/ClubAccentProvider.tsx` — Context que memoiza a rampa a partir de `playerClub`; `useClubAccentContext()` consome.
- **Modify** `App.tsx:38-56` — montar `<ClubAccentProvider>` acima de `<RootNavigator>`.
- **Create** `src/components/Button.tsx` — Button com variantes; `primary` usa a rampa de accent.
- **Create** `src/components/ProgressBar.tsx` — barra de progresso tingida pelo accent (XP/board trust/contrato).
- **Modify** `src/navigation/TabNavigator.tsx:18,26-28` — indicador de aba ativa via rampa (`accent` ativo, `accentDim` em estados).
- **Modify** `src/components/StatBar.tsx` — aceitar `tone?: 'rating' | 'accent'` (default `'rating'` = comportamento atual); `'accent'` usa a rampa.
- **Test** `__tests__/theme/club-accent-ramp.test.ts` — `deriveAccentRamp` (clubes claros/escuros, ordenação dim<base<bright em luminância, legibilidade `onAccent`).
- **Test** `__tests__/theme/useClubAccent.test.tsx` — hook retorna rampa completa para clube claro e escuro (legibilidade `onAccent`), e default quando `playerClub` é null.
- **Test** `__tests__/components/Button.test.tsx` — render das variantes; `primary` aplica `accent` da rampa do provider.
- **Test** `__tests__/components/ProgressBar.test.tsx` — clamp 0..1 e cor do fill = accent do provider.

**Contract (assinaturas exatas):**

```ts
// src/theme/club-accent.ts (adiciona; ClubAccent atual {accent,onAccent} permanece)
export interface ClubAccentRamp {
  accent: string;       // base derivado (= ClubAccent.accent)
  accentDim: string;    // shade p/ press/disabled
  accentBright: string; // tint p/ hover/destaque
  onAccent: string;     // texto legível sobre accent (= ClubAccent.onAccent)
}
export function deriveAccentRamp(accent: string): ClubAccentRamp;

// src/theme/useClubAccent.ts (retorno passa de ClubAccent p/ ClubAccentRamp)
export function useClubAccent(): ClubAccentRamp;

// src/theme/ClubAccentProvider.tsx
export function ClubAccentProvider(props: { children: React.ReactNode }): JSX.Element;
export function useClubAccentContext(): ClubAccentRamp;

// src/components/Button.tsx
export function Button(props: {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
}): JSX.Element;

// src/components/ProgressBar.tsx
export default function ProgressBar(props: {
  progress: number;          // 0..1 (clampado)
  height?: number;
  trackColor?: string;
  testID?: string;
}): JSX.Element;

// src/components/StatBar.tsx (API preservada + tone opcional)
export default function StatBar(props: {
  label: string; value: number; maxValue?: number;
  tone?: 'rating' | 'accent';
}): JSX.Element;
```

**Nota de shade:** `club-accent.ts` só tem `mixWithWhite` (tint). Para `accentDim` (shade/escurecer) a Task 1 adiciona `mixWithBlack(hex, t)` simétrica, mantendo o módulo puro. Reuso DRY de `parseHex` interno.

---

## Task 1: `deriveAccentRamp` + `mixWithBlack` (theme puro, TDD)

**Files:** Modify `src/theme/club-accent.ts`; Create `__tests__/theme/club-accent-ramp.test.ts`.
**Interfaces:** Consumes: `luminance`, `mixWithWhite` (existentes em `club-accent.ts`). Produces: `ClubAccentRamp`, `deriveAccentRamp(accent: string): ClubAccentRamp`, `mixWithBlack(hex: string, t: number): string`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/theme/club-accent-ramp.test.ts`:
```ts
import { deriveAccentRamp, mixWithBlack, luminance } from '@/theme/club-accent';

describe('mixWithBlack', () => {
  it('blends white toward black by t', () => {
    expect(mixWithBlack('#ffffff', 0.5)).toBe('#808080');
  });
  it('leaves black unchanged', () => {
    expect(mixWithBlack('#000000', 0.4)).toBe('#000000');
  });
});

describe('deriveAccentRamp', () => {
  it('keeps the base accent and derives a dim shade + bright tint', () => {
    const r = deriveAccentRamp('#4361ee');
    expect(r.accent).toBe('#4361ee');
    // dim é mais escuro que base; bright é mais claro que base
    expect(luminance(r.accentDim)).toBeLessThan(luminance(r.accent));
    expect(luminance(r.accentBright)).toBeGreaterThan(luminance(r.accent));
  });

  it('onAccent é legível: texto branco sobre accent escuro, preto sobre claro', () => {
    expect(deriveAccentRamp('#101010').onAccent).toBe('#ffffff'); // accent escuro → texto branco
    expect(deriveAccentRamp('#f5f5f5').onAccent).toBe('#000000'); // accent claro → texto preto
  });

  it('mantém ordenação dim < base < bright em luminância para accents médios', () => {
    const r = deriveAccentRamp('#DA291C');
    expect(luminance(r.accentDim)).toBeLessThan(luminance(r.accent));
    expect(luminance(r.accent)).toBeLessThan(luminance(r.accentBright));
  });
});
```
- [ ] **Step 2 — rodar (falha: `deriveAccentRamp`/`mixWithBlack` não existem):** `npx jest __tests__/theme/club-accent-ramp.test.ts` → erro de import/`is not a function`.
- [ ] **Step 3 — implementar:** em `src/theme/club-accent.ts`, após `mixWithWhite` (linha 27) adicionar:
```ts
export function mixWithBlack(hex: string, t: number): string {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const mix = rgb.map((c) => Math.round(c * (1 - t)));
  return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('');
}

export interface ClubAccentRamp {
  accent: string;
  accentDim: string;
  accentBright: string;
  onAccent: string;
}

export function deriveAccentRamp(accent: string): ClubAccentRamp {
  const onAccent = luminance(accent) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff';
  return {
    accent,
    accentDim: mixWithBlack(accent, 0.25),
    accentBright: mixWithWhite(accent, 0.3),
    onAccent,
  };
}
```
  (`parseHex` e `TEXT_FLIP_LUM` já existem no módulo — `club-accent.ts:7,10`. `mixWithBlack` reusa `parseHex`.)
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/club-accent-ramp.test.ts` → verde. Depois `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/theme/club-accent.ts __tests__/theme/club-accent-ramp.test.ts` → msg: `feat(theme): deriveAccentRamp deriva rampa dim/base/bright a partir do accent do clube`.

---

## Task 2: `useClubAccent` retorna a rampa completa (TDD)

**Files:** Modify `src/theme/useClubAccent.ts`; Create `__tests__/theme/useClubAccent.test.tsx`.
**Interfaces:** Consumes: `deriveClubAccent` (existente), `deriveAccentRamp` (Task 1), `useGameStore` (`s.playerClub`). Produces: `useClubAccent(): ClubAccentRamp`.

Como o hook lê o `game-store`, o teste usa `react-test-renderer` + manipulação direta do store (padrão de teste de hook que toca Zustand). O `game-store` expõe `setState` do Zustand; setamos `playerClub` antes de renderizar.

- [ ] **Step 1 — teste falhando:** criar `__tests__/theme/useClubAccent.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useClubAccent } from '@/theme/useClubAccent';
import { useGameStore } from '@/store/game-store';
import { luminance } from '@/theme/club-accent';

function capture(): { ramp: ReturnType<typeof useClubAccent> | null } {
  const out: { ramp: ReturnType<typeof useClubAccent> | null } = { ramp: null };
  function Probe() {
    out.ramp = useClubAccent();
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  return out;
}

const setClub = (club: any) =>
  act(() => {
    useGameStore.setState({ playerClub: club } as any);
  });

describe('useClubAccent', () => {
  afterEach(() => setClub(null));

  it('sem clube → default azul, rampa completa, texto branco', () => {
    setClub(null);
    const { ramp } = capture();
    expect(ramp).not.toBeNull();
    expect(ramp!.accent).toBe('#4361ee');
    expect(ramp!.onAccent).toBe('#ffffff');
    expect(luminance(ramp!.accentDim)).toBeLessThan(luminance(ramp!.accent));
    expect(luminance(ramp!.accentBright)).toBeGreaterThan(luminance(ramp!.accent));
  });

  it('clube de cor escura → accent legível (texto branco)', () => {
    setClub({ primaryColor: '#101010', secondaryColor: '#080808' });
    const { ramp } = capture();
    expect(luminance(ramp!.accent)).toBeGreaterThanOrEqual(60); // floor de deriveClubAccent
    expect(ramp!.onAccent).toBe('#ffffff');
  });

  it('clube de cor clara → texto preto sobre accent', () => {
    setClub({ primaryColor: '#FFFFFF', secondaryColor: '#000000' });
    const { ramp } = capture();
    expect(ramp!.accent).toBe('#FFFFFF');
    expect(ramp!.onAccent).toBe('#000000');
  });
});
```
- [ ] **Step 2 — rodar (falha: `accentDim`/`accentBright` indefinidos no retorno atual):** `npx jest __tests__/theme/useClubAccent.test.tsx` → asserções de `accentDim`/`accentBright` falham (hoje o hook retorna só `{accent,onAccent}`).
- [ ] **Step 3 — implementar:** substituir `src/theme/useClubAccent.ts` inteiro por:
```ts
import { useMemo } from 'react';
import { useGameStore } from '@/store/game-store';
import { deriveClubAccent, deriveAccentRamp, ClubAccentRamp } from './club-accent';

export function useClubAccent(): ClubAccentRamp {
  const club = useGameStore((s) => s.playerClub);
  return useMemo(() => {
    const base = deriveClubAccent(
      club ? { primaryColor: club.primaryColor, secondaryColor: club.secondaryColor } : null,
    );
    return deriveAccentRamp(base.accent);
  }, [club?.primaryColor, club?.secondaryColor]);
}
```
  (`deriveAccentRamp` recomputa `onAccent` a partir do accent já-legível — consistente com `deriveClubAccent`. Reusamos `base.accent` para herdar o floor de luminância de clubes escuros.)
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/useClubAccent.test.tsx` → verde. `npx tsc --noEmit` → exit 0. Conferir que os consumidores existentes (`TabNavigator.tsx:18`, `RootNavigator.tsx`, `ClubBanner.tsx:9`) ainda compilam: `git grep -n "useClubAccent()" src` deve mostrar destructurings de `accent`/`onAccent`, que continuam válidos.
- [ ] **Step 5 — commit:** `git add src/theme/useClubAccent.ts __tests__/theme/useClubAccent.test.tsx` → msg: `feat(theme): useClubAccent retorna ClubAccentRamp completa (retrocompat accent/onAccent)`.

---

## Task 3: `ClubAccentProvider` (Context memoizado)

**Files:** Create `src/theme/ClubAccentProvider.tsx`; Create `__tests__/theme/ClubAccentProvider.test.tsx`.
**Interfaces:** Consumes: `useClubAccent` (Task 2). Produces: `ClubAccentProvider`, `useClubAccentContext(): ClubAccentRamp`.

O provider lê a rampa via `useClubAccent` (já memoizado por `useMemo`) e a coloca num Context — assim consumidores profundos não chamam o hook do store individualmente e o valor só muda quando o clube muda.

- [ ] **Step 1 — teste falhando:** criar `__tests__/theme/ClubAccentProvider.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ClubAccentProvider, useClubAccentContext } from '@/theme/ClubAccentProvider';
import { useGameStore } from '@/store/game-store';

function capture() {
  const out: { accent: string | null } = { accent: null };
  function Probe() {
    out.accent = useClubAccentContext().accent;
    return null;
  }
  act(() => {
    TestRenderer.create(
      <ClubAccentProvider>
        <Probe />
      </ClubAccentProvider>,
    );
  });
  return out;
}

describe('ClubAccentProvider', () => {
  afterEach(() => act(() => useGameStore.setState({ playerClub: null } as any)));

  it('expõe o accent default sem clube', () => {
    act(() => useGameStore.setState({ playerClub: null } as any));
    expect(capture().accent).toBe('#4361ee');
  });

  it('expõe o accent do clube selecionado', () => {
    act(() => useGameStore.setState({ playerClub: { primaryColor: '#FFFFFF', secondaryColor: '#000000' } } as any));
    expect(capture().accent).toBe('#FFFFFF');
  });

  it('useClubAccentContext fora do provider lança erro claro', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    function Bare() {
      useClubAccentContext();
      return null;
    }
    expect(() => act(() => { TestRenderer.create(<Bare />); })).toThrow(/ClubAccentProvider/);
    spy.mockRestore();
  });
});
```
- [ ] **Step 2 — rodar (falha: módulo inexistente):** `npx jest __tests__/theme/ClubAccentProvider.test.tsx` → `Cannot find module '@/theme/ClubAccentProvider'`.
- [ ] **Step 3 — implementar:** criar `src/theme/ClubAccentProvider.tsx`:
```tsx
import React, { createContext, useContext } from 'react';
import { ClubAccentRamp } from './club-accent';
import { useClubAccent } from './useClubAccent';

const ClubAccentContext = createContext<ClubAccentRamp | null>(null);

export function ClubAccentProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const ramp = useClubAccent();
  return <ClubAccentContext.Provider value={ramp}>{children}</ClubAccentContext.Provider>;
}

export function useClubAccentContext(): ClubAccentRamp {
  const ramp = useContext(ClubAccentContext);
  if (!ramp) {
    throw new Error('useClubAccentContext deve ser usado dentro de <ClubAccentProvider>.');
  }
  return ramp;
}
```
  (`useClubAccent` já é memoizado, então `ramp` só muda de identidade quando o clube muda — Context não re-renderiza a árvore à toa.)
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/ClubAccentProvider.test.tsx` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/theme/ClubAccentProvider.tsx __tests__/theme/ClubAccentProvider.test.tsx` → msg: `feat(theme): ClubAccentProvider memoiza rampa do clube via Context`.

---

## Task 4: Montar o provider em `App.tsx`

**Files:** Modify `App.tsx`.
**Interfaces:** Consumes: `ClubAccentProvider` (Task 3). Produces: árvore com `RootNavigator` envolvido pelo provider.

Sem teste novo (mudança de wiring de árvore; coberto indiretamente pelos smoke tests de D0 e pela validação browser). O provider vai **acima** de `RootNavigator` e dentro do `NavigationContainer` (precisa do `game-store`, que já está disponível em qualquer ponto da árvore — Zustand é global). Colocá-lo logo dentro do `ErrorBoundary` mantém o fallback de erro intacto.

- [ ] **Step 1 — implementar:** em `App.tsx`, adicionar o import (após linha 7):
```tsx
import { ClubAccentProvider } from '@/theme/ClubAccentProvider';
```
- [ ] **Step 2 — implementar:** envolver `RootNavigator` (`App.tsx:51-53`). Trocar:
```tsx
      <ErrorBoundary>
        <RootNavigator />
      </ErrorBoundary>
```
  por:
```tsx
      <ErrorBoundary>
        <ClubAccentProvider>
          <RootNavigator />
        </ClubAccentProvider>
      </ErrorBoundary>
```
- [ ] **Step 3 — rodar:** `npx tsc --noEmit` → exit 0. `npx jest` → suíte verde (nada quebra; provider é aditivo).
- [ ] **Step 4 — commit:** `git add App.tsx` → msg: `feat(theme): montar ClubAccentProvider acima do RootNavigator`.

---

## Task 5: `Button` com `primary` cabeado ao accent (TDD)

**Files:** Create `src/components/Button.tsx`; Create `__tests__/components/Button.test.tsx`.
**Interfaces:** Consumes: `useClubAccentContext` (Task 3), tokens de `@/theme` (`colors`, `spacing`, `radius`, `fontSize`). Produces: `Button` (contrato acima).

`primary` usa `accent` (fundo) + `onAccent` (texto); estado `disabled` usa `accentDim`; `secondary`/`ghost`/`danger` usam tokens neutros/`colors.danger`. Renderizado dentro de `<ClubAccentProvider>` no teste.

- [ ] **Step 1 — teste falhando:** criar `__tests__/components/Button.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable, Text, ActivityIndicator } from 'react-native';
import { Button } from '@/components/Button';
import { ClubAccentProvider } from '@/theme/ClubAccentProvider';
import { useGameStore } from '@/store/game-store';

function flatten(style: any): Record<string, any> {
  return Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : (style ?? {});
}
function render(ui: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<ClubAccentProvider>{ui}</ClubAccentProvider>);
  });
  return tree;
}

describe('Button', () => {
  beforeEach(() => act(() => useGameStore.setState({ playerClub: { primaryColor: '#FFFFFF', secondaryColor: '#000' } } as any)));
  afterEach(() => act(() => useGameStore.setState({ playerClub: null } as any)));

  it('primary usa o accent do clube como fundo', () => {
    const tree = render(<Button label="Salvar" variant="primary" onPress={() => {}} />);
    const bg = flatten(tree.root.findByType(Pressable).props.style);
    expect(bg.backgroundColor).toBe('#FFFFFF'); // accent do clube branco
    expect(tree.root.findByType(Text).props.children).toBe('Salvar');
  });

  it('dispara onPress quando habilitado e não quando disabled', () => {
    const onPress = jest.fn();
    const tree = render(<Button label="Ir" onPress={onPress} />);
    act(() => tree.root.findByType(Pressable).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);

    onPress.mockClear();
    const tree2 = render(<Button label="Ir" onPress={onPress} disabled />);
    const p = tree2.root.findByType(Pressable);
    expect(p.props.disabled).toBe(true);
  });

  it('loading mostra ActivityIndicator e some o label', () => {
    const tree = render(<Button label="Carregando" onPress={() => {}} loading />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
    expect(tree.root.findAllByType(Text).length).toBe(0);
  });

  it('danger usa colors.danger e ghost é transparente', () => {
    const d = flatten(render(<Button label="x" variant="danger" onPress={() => {}} />).root.findByType(Pressable).props.style);
    expect(d.backgroundColor).toBe('#ef476f');
    const g = flatten(render(<Button label="x" variant="ghost" onPress={() => {}} />).root.findByType(Pressable).props.style);
    expect(g.backgroundColor).toBe('transparent');
  });
});
```
- [ ] **Step 2 — rodar (falha: módulo inexistente):** `npx jest __tests__/components/Button.test.tsx` → `Cannot find module '@/components/Button'`.
- [ ] **Step 3 — implementar:** criar `src/components/Button.tsx`:
```tsx
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme';
import { useClubAccentContext } from '@/theme/ClubAccentProvider';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
  testID,
  accessibilityLabel,
}: ButtonProps): JSX.Element {
  const ramp = useClubAccentContext();
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary' ? (isDisabled ? ramp.accentDim : ramp.accent)
    : variant === 'danger' ? colors.danger
    : variant === 'secondary' ? colors.surfaceLight
    : 'transparent';

  const fg =
    variant === 'primary' ? ramp.onAccent
    : variant === 'danger' ? colors.text
    : colors.text;

  const borderColor = variant === 'ghost' ? colors.border : 'transparent';

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={[styles.base, { backgroundColor: bg, borderColor }, isDisabled && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      )}
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
    borderWidth: 1,
    minHeight: 44,
  },
  disabled: { opacity: 0.6 },
  label: { fontSize: fontSize.lg, fontWeight: '600' },
});
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/Button.test.tsx` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/components/Button.tsx __tests__/components/Button.test.tsx` → msg: `feat(components): Button com variante primary cabeada ao accent do clube`.

---

## Task 6: `ProgressBar` tingida pelo accent (TDD)

**Files:** Create `src/components/ProgressBar.tsx`; Create `__tests__/components/ProgressBar.test.tsx`.
**Interfaces:** Consumes: `useClubAccentContext` (Task 3), tokens de `@/theme`. Produces: `ProgressBar` (contrato acima).

Barra genérica para XP/board trust/contrato — fill na cor do accent, track neutro. `progress` é clampado em `[0,1]`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/components/ProgressBar.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import ProgressBar from '@/components/ProgressBar';
import { ClubAccentProvider } from '@/theme/ClubAccentProvider';
import { useGameStore } from '@/store/game-store';

function flatten(style: any): Record<string, any> {
  return Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : (style ?? {});
}
function render(ui: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<ClubAccentProvider>{ui}</ClubAccentProvider>); });
  return tree;
}
const fillOf = (tree: TestRenderer.ReactTestRenderer) =>
  flatten(tree.root.findAllByType(View).find((v) => flatten(v.props.style).width !== undefined)!.props.style);

describe('ProgressBar', () => {
  beforeEach(() => act(() => useGameStore.setState({ playerClub: { primaryColor: '#FFFFFF', secondaryColor: '#000' } } as any)));
  afterEach(() => act(() => useGameStore.setState({ playerClub: null } as any)));

  it('fill usa o accent do clube e largura proporcional ao progress', () => {
    const f = fillOf(render(<ProgressBar progress={0.5} />));
    expect(f.backgroundColor).toBe('#FFFFFF');
    expect(f.width).toBe('50%');
  });

  it('clampa progress acima de 1 e abaixo de 0', () => {
    expect(fillOf(render(<ProgressBar progress={2} />)).width).toBe('100%');
    expect(fillOf(render(<ProgressBar progress={-1} />)).width).toBe('0%');
  });
});
```
- [ ] **Step 2 — rodar (falha: módulo inexistente):** `npx jest __tests__/components/ProgressBar.test.tsx` → `Cannot find module '@/components/ProgressBar'`.
- [ ] **Step 3 — implementar:** criar `src/components/ProgressBar.tsx`:
```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme';
import { useClubAccentContext } from '@/theme/ClubAccentProvider';

interface ProgressBarProps {
  progress: number;
  height?: number;
  trackColor?: string;
  testID?: string;
}

export default function ProgressBar({
  progress,
  height = 6,
  trackColor = colors.border,
  testID,
}: ProgressBarProps): JSX.Element {
  const { accent } = useClubAccentContext();
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View testID={testID} style={[styles.track, { height, backgroundColor: trackColor }]}>
      <View style={[styles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm },
});
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/ProgressBar.test.tsx` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/components/ProgressBar.tsx __tests__/components/ProgressBar.test.tsx` → msg: `feat(components): ProgressBar tingida pelo accent do clube`.

---

## Task 7: `StatBar` com `tone='accent'` (TDD, API preservada)

**Files:** Modify `src/components/StatBar.tsx`; Create `__tests__/components/StatBar.test.tsx`.
**Interfaces:** Consumes: `useClubAccentContext` (Task 3), `getBarColor` (existente). Produces: `StatBar` com `tone?: 'rating' | 'accent'` (default `'rating'`, comportamento atual intacto).

`getBarColor` continua o default (`tone='rating'`); `tone='accent'` força a cor do accent. Hook é sempre chamado (regra dos hooks), mas só usado quando `tone==='accent'`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/components/StatBar.test.tsx`:
```tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import StatBar from '@/components/StatBar';
import { ClubAccentProvider } from '@/theme/ClubAccentProvider';
import { useGameStore } from '@/store/game-store';
import { getBarColor } from '@/utils/player-colors';

function flatten(style: any): Record<string, any> {
  return Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : (style ?? {});
}
function render(ui: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<ClubAccentProvider>{ui}</ClubAccentProvider>); });
  return tree;
}
const fillOf = (tree: TestRenderer.ReactTestRenderer) =>
  flatten(tree.root.findAllByType(View).find((v) => flatten(v.props.style).width !== undefined)!.props.style);

describe('StatBar', () => {
  beforeEach(() => act(() => useGameStore.setState({ playerClub: { primaryColor: '#FFFFFF', secondaryColor: '#000' } } as any)));
  afterEach(() => act(() => useGameStore.setState({ playerClub: null } as any)));

  it('default (rating) preserva getBarColor', () => {
    const f = fillOf(render(<StatBar label="Velocidade" value={80} />));
    expect(f.backgroundColor).toBe(getBarColor(80));
  });

  it('tone=accent usa a cor do clube', () => {
    const f = fillOf(render(<StatBar label="Velocidade" value={80} tone="accent" />));
    expect(f.backgroundColor).toBe('#FFFFFF');
  });
});
```
- [ ] **Step 2 — rodar (falha: `tone` não existe / fill ainda usa getBarColor):** `npx jest __tests__/components/StatBar.test.tsx` → o caso `tone=accent` falha (cor = `getBarColor(80)`, não `#FFFFFF`).
- [ ] **Step 3 — implementar:** em `src/components/StatBar.tsx`:
  - adicionar import: `import { useClubAccentContext } from '@/theme/ClubAccentProvider';`
  - estender props:
```ts
interface StatBarProps {
  label: string;
  value: number;
  maxValue?: number;
  tone?: 'rating' | 'accent';
}
```
  - no corpo, trocar a assinatura e a cor:
```tsx
export default function StatBar({ label, value, maxValue = 99, tone = 'rating' }: StatBarProps) {
  const clampedValue = Math.max(0, Math.min(value, maxValue));
  const fillPercent = (clampedValue / maxValue) * 100;
  const { accent } = useClubAccentContext();
  const barColor = tone === 'accent' ? accent : getBarColor(value);
```
  (o resto do componente permanece igual; `barColor` já é usado no fill e no texto.)
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/components/StatBar.test.tsx` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/components/StatBar.tsx __tests__/components/StatBar.test.tsx` → msg: `feat(components): StatBar aceita tone=accent para tingir pela cor do clube`.

---

## Task 8: Indicador de aba ativa via rampa no `TabNavigator`

**Files:** Modify `src/navigation/TabNavigator.tsx`.
**Interfaces:** Consumes: `useClubAccent` (Task 2 — já retorna a rampa). Produces: tab bar com tinta ativa `accent` e barra superior tingida pela rampa.

Hoje só `tabBarActiveTintColor: accent` usa o accent. D4 adiciona o realce do indicador: a aba ativa usa `accent`; mantemos inativos em `textMuted`. Adicionamos uma borda/indicador na `tabBarStyle` derivado da rampa para reforçar a identidade. Mudança pequena e visual — coberta por browser; sem teste novo (navegação exige `NavigationContainer`, fora do escopo D4; D0 cobre smoke).

- [ ] **Step 1 — implementar:** em `TabNavigator.tsx:18`, trocar o destructuring para pegar a rampa:
```tsx
  const { accent, accentDim } = useClubAccent();
```
- [ ] **Step 2 — implementar:** em `TabNavigator.tsx:25-26`, reforçar a borda da tab bar com a rampa:
```tsx
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: accentDim, borderTopWidth: 2 },
      tabBarActiveTintColor: accent,
```
  (borda superior na cor `accentDim` dá um "trilho" de identidade sem competir com o texto ativo `accent`.)
- [ ] **Step 3 — rodar:** `npx tsc --noEmit` → exit 0. `npx jest` → suíte verde.
- [ ] **Step 4 — validar no browser:** subir o dev server (background do harness, `npm run web`, porta 8082, `--clear`), entrar num save, abrir as abas: a aba ativa e o trilho superior aparecem na cor do clube; trocar de clube (novo save com cor diferente) re-tinge sem reload manual. 0 erros de console.
- [ ] **Step 5 — commit:** `git add src/navigation/TabNavigator.tsx` → msg: `feat(nav): trilho da tab bar usa accentDim da rampa do clube`.

---

## Task 9: Verificação de imersão ponta-a-ponta (DoD)

**Files:** nenhum (validação).
**Interfaces:** consome tudo de D4.

- [ ] **Step 1 — suíte completa:** `npx tsc --noEmit && npx jest` — tudo verde (theme, novos componentes, e nada regrediu em `club-accent.test.ts`, `tokens.test.ts`, smoke de D0).
- [ ] **Step 2 — grep de retrocompat:** `git grep -n "useClubAccent()" src` — confirmar que todos os consumidores (`TabNavigator`, `RootNavigator`, `ClubBanner`) usam destructuring de campos que continuam existindo (`accent`/`onAccent`). Nenhum quebrou.
- [ ] **Step 3 — browser (Playwright MCP):** com dois saves de cores bem distintas (ex.: clube claro vs. escuro), verificar que Button `primary`, `ProgressBar`, `StatBar tone=accent` e o trilho da tab bar re-tingem ao alternar de save **sem reload**. Confirmar legibilidade do texto sobre o accent em ambos (`onAccent`). 0 erros de console.
- [ ] **Step 4 — DoD:** trocar de clube re-tinge CTAs/abas/progresso em todo o app sem reload; `useClubAccent` testado com clubes claros/escuros (legibilidade `onAccent`); engine intocado (nenhum arquivo em `src/engine/` alterado — `git diff --name-only` não lista `src/engine/`); `npm test` + `npx tsc --noEmit` verdes.

---

## Self-Review

1. **Cobertura do spec (§D4):** `ClubAccentProvider` criado memoizando `deriveAccentRamp` a partir de `useClubAccent` (Task 3); `useClubAccent` estendido para `ClubAccentRamp {accent,accentDim,accentBright,onAccent}` retrocompatível (Task 2); provider montado em `App.tsx` acima do `RootNavigator` (Task 4); Button `primary` (Task 5), TabIndicator/aba ativa (Task 8), barra de progresso (Task 6) e StatBar destaque (Task 7) cabeados ao accent. TDD de `useClubAccent`/`deriveAccentRamp` com clubes claros/escuros e legibilidade `onAccent` (Tasks 1–2). DoD de "trocar clube re-tinge sem reload" coberto em Task 8/9. "Engine intocado" verificado em Task 9 Step 4. "Re-render excessivo" mitigado por `useMemo` no hook + Context (Task 3).
2. **Placeholder scan:** sem TBD/`???`. `mixWithBlack` é a única adição não citada literalmente no contract do spec, justificada (o spec só fornece `mixWithWhite`/tint; shade é necessário para `accentDim`) e implementada com código completo. "Anel de foco de inputs" do §D4 não tem componente de input dedicado em D4 (inputs são parte do kit D3); D4 entrega os primitivos de cor (rampa via context) que o foco consumirá quando os inputs migrarem em D5 — registrado aqui para não ser confundido com omissão.
3. **Consistência de tipos:** `ClubAccentRamp`, `deriveAccentRamp`, `useClubAccent(): ClubAccentRamp`, `ClubAccentProvider`/`useClubAccentContext`, `Button`, `ProgressBar`, `StatBar` (tone) batem com o Contract e com o §3/§D4 do spec. `useClubAccent` retornando a rampa não quebra consumidores porque `accent`/`onAccent` permanecem no objeto (verificado em Task 9 Step 2). `StatBar` mantém a API original (`tone` é opcional com default).
