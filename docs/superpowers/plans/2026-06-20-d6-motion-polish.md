# D6 — Motion & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2-5 min): escrever teste que falha → rodar e ver falhar → implementar mínimo → rodar e ver passar → commit. SEM placeholders: todo código aparece no passo. Subagents NÃO commitam — o passo "Commit" descreve o que o orquestrador commita.

**Goal:** Dar a sensação "premium" ao kit (D3) e às telas (D5) com press-scale, transições por motion tokens, skeletons nos loaders, micro-celebrações (overall↑/troféu/transferência) e haptics — **tudo respeitando reduce-motion**: quando ligado, animações viram no-op/fade curto.

**Architecture:** O coração de D6 é uma **camada de hooks de motion pura e testável** (`src/motion/`) que separa a *decisão* (animar ou não, com que duração/curva) da *renderização* (Reanimated). A decisão lê os tokens `motion` (D1) e o flag `reduceMotion` do `settings-store` (D7), e é unit-testável em ambiente `node` (sem render). Os componentes do kit (Button/Card/Chip de D3) e os loaders (Skeleton) consomem esses hooks. Haptics ficam atrás de um wrapper `triggerHaptic()` que é no-op no web e respeita o toggle `haptics`. Micro-celebrações são disparadas por eventos já existentes no store (overall sobe, troféu, transferência fechada) via um componente `CelebrationOverlay` montado no topo, que também checa `reduceMotion`. O engine é **intocado** (motion é puramente UI; zero `Math.random`/`Date.now` em caminho de engine).

**Tech Stack:** TS 5.9 strict · Jest + ts-jest (env `node`) · `react-native-reanimated@~4.1.1` (já instalado) · `react-native-svg` (já instalado) · `expo-haptics` (adicionar) · Zustand · React 19.1 / RN 0.81.

**Convenções:**
- Engine puro em `src/engine` permanece sem React/Expo. D6 NÃO toca engine (só lê eventos do store).
- TDD; os testes de D6 são **puros de lógica** (hooks de decisão de motion), pois `jest.config.js` usa `testEnvironment: 'node'` sem testing-library — NÃO escrever testes que montem componentes Reanimated.
- Tokens **sempre** de `@/theme` (motion tokens de D1). Zero literal de duração/curva nos componentes.
- i18n pt/en com paridade para qualquer string nova de celebração (`parity.test.ts` deve passar).
- Haptics guard por `Platform.OS` (no-op no web). Reduce-motion guard em **toda** animação.
- Branch `feat/d6-motion-polish`. Commits terminam com:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Precedente a espelhar:**
- `src/components/AchievementToast.tsx` (banner não-bloqueante disparado por evento, tokens de `@/theme`) — molde do `CelebrationOverlay`.
- `src/components/StatBar.tsx` (componente de kit puro consumindo tokens) — molde de assinatura/estilo.
- `src/store/ui-store.ts` (Zustand simples com fila de notificações) — molde do `celebration-store`.
- `__tests__/store/training-store.test.ts` e `__tests__/store/assistant-store.test.ts` (testes de store puros) — molde dos testes de `celebration-store`/`useMotionConfig`.
- `jest.config.js` (env `node`, `moduleNameMapper` `^@/(.*)$`) — todos os testes resolvem `@/...`.

**Dependências upstream (devem existir antes de D6):**
- **D1** exporta `motion` de `@/theme` (`{ duration: {fast:120,base:200,slow:320}, easing: {standard,decelerate,accelerate} }`).
- **D3** entrega o kit: `src/components/Button.tsx`, `Card.tsx`, `Chip.tsx`, `Skeleton.tsx`.
- **D7** entrega `src/store/settings-store.ts` com `reduceMotion: boolean` e `haptics: boolean`.

Se, ao executar D6, alguma dependência ainda não existir, **pare e sinalize** — D6 não inventa essas APIs. As Tasks 1–3 (camada de motion pura + haptics) só dependem de D1/D7 e podem prosseguir; Tasks 4–7 dependem de D3.

---

## File Structure

- **Create** `src/motion/useMotionConfig.ts` — hook puro: lê `motion` (D1) + `reduceMotion` (D7) → config de duração/curva ou no-op.
- **Create** `src/motion/usePressScale.ts` — hook de press-scale via Reanimated, no-op quando reduce-motion.
- **Create** `src/motion/motion-config.ts` — função pura `resolveMotion(opts, reduceMotion)` (lógica testável separada do hook).
- **Create** `src/motion/haptics.ts` — wrapper `triggerHaptic(kind, enabled)` (no-op web/desligado).
- **Create** `src/store/celebration-store.ts` — Zustand: fila de celebrações (overall↑/troféu/transferência).
- **Create** `src/components/CelebrationOverlay.tsx` — overlay não-bloqueante das celebrações (checa reduce-motion).
- **Modify** `src/components/Button.tsx` (kit D3) — aplicar `usePressScale` + haptic no press.
- **Modify** `src/components/Card.tsx` (kit D3) — aplicar `usePressScale` quando pressável.
- **Modify** `src/components/Chip.tsx` (kit D3) — aplicar `usePressScale`.
- **Modify** `src/components/Skeleton.tsx` (kit D3) — shimmer respeitando reduce-motion (estático quando ligado).
- **Modify** `App.tsx` — montar `<CelebrationOverlay />` no topo (acima do `RootNavigator`, dentro dos providers).
- **Modify** `src/i18n/pt.ts` + `src/i18n/en.ts` — chaves `celebration.*` (paridade).
- **Modify** `package.json` — adicionar `expo-haptics`.
- **Test** `__tests__/motion/motion-config.test.ts`
- **Test** `__tests__/motion/haptics.test.ts`
- **Test** `__tests__/store/celebration-store.test.ts`

**Contract (assinaturas exatas):**

```ts
// src/motion/motion-config.ts (PURO — sem React/Reanimated; o coração testável)
export interface MotionRequest {
  speed?: 'fast' | 'base' | 'slow';          // default 'base'
  curve?: 'standard' | 'decelerate' | 'accelerate'; // default 'standard'
}
export interface ResolvedMotion {
  enabled: boolean;                          // false quando reduceMotion
  duration: number;                          // ms; quando reduceMotion → 0 (no-op) salvo fade
  easing: readonly [number, number, number, number];
}
export function resolveMotion(req: MotionRequest, reduceMotion: boolean): ResolvedMotion;
// Regra: reduceMotion=true → { enabled:false, duration:0, easing:<standard> }.
//        reduceMotion=false → { enabled:true, duration:motion.duration[speed], easing:motion.easing[curve] }.

// src/motion/useMotionConfig.ts (hook fino: lê settings-store + resolveMotion)
export function useMotionConfig(req?: MotionRequest): ResolvedMotion;

// src/motion/usePressScale.ts (Reanimated; no-op quando reduceMotion)
import type { AnimatedStyle } from 'react-native-reanimated';
export interface PressScale {
  animatedStyle: AnimatedStyle<any>;
  onPressIn: () => void;
  onPressOut: () => void;
}
export function usePressScale(opts?: { to?: number }): PressScale; // to default 0.96

// src/motion/haptics.ts
export type HapticKind = 'light' | 'medium' | 'success' | 'warning';
export function triggerHaptic(kind: HapticKind, enabled: boolean): void;
// Regra: enabled=false OU Platform.OS==='web' → no-op. Caso contrário, mapeia p/ expo-haptics.

// src/store/celebration-store.ts
export type CelebrationKind = 'overall_up' | 'trophy' | 'transfer';
export interface Celebration { id: string; kind: CelebrationKind; titleKey: string; detail?: string; }
interface CelebrationStore {
  queue: Celebration[];
  push(c: Omit<Celebration, 'id'>): void;   // id = counter monotônico (NÃO Date.now)
  dismiss(id: string): void;
  clear(): void;
}
export const useCelebrationStore: import('zustand').UseBoundStore<import('zustand').StoreApi<CelebrationStore>>;

// src/components/CelebrationOverlay.tsx
export function CelebrationOverlay(): JSX.Element | null;
```

---

## Task 1: `resolveMotion` puro + tokens de motion (TDD)

**Files:** Create `src/motion/motion-config.ts`, Create `__tests__/motion/motion-config.test.ts`.
**Interfaces:** Consumes: `motion` de `@/theme` (D1). · Produces: `resolveMotion`, `MotionRequest`, `ResolvedMotion`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/motion/motion-config.test.ts`:
```ts
import { resolveMotion } from '@/motion/motion-config';
import { motion } from '@/theme';

describe('resolveMotion', () => {
  it('reduceMotion=false usa duração e curva dos tokens (default base/standard)', () => {
    const r = resolveMotion({}, false);
    expect(r.enabled).toBe(true);
    expect(r.duration).toBe(motion.duration.base);
    expect(r.easing).toEqual(motion.easing.standard);
  });

  it('respeita speed e curve explícitos', () => {
    const r = resolveMotion({ speed: 'slow', curve: 'decelerate' }, false);
    expect(r.duration).toBe(motion.duration.slow);
    expect(r.easing).toEqual(motion.easing.decelerate);
  });

  it('reduceMotion=true desliga: enabled=false e duration=0', () => {
    const r = resolveMotion({ speed: 'slow' }, true);
    expect(r.enabled).toBe(false);
    expect(r.duration).toBe(0);
    // easing ainda é uma tupla válida (fade curto pode reusar standard)
    expect(r.easing).toEqual(motion.easing.standard);
  });
});
```
- [ ] **Step 2 — rodar (falha: módulo inexistente):** `npx jest __tests__/motion/motion-config.test.ts`
  → saída esperada: `Cannot find module '@/motion/motion-config'`.
- [ ] **Step 3 — implementar:** criar `src/motion/motion-config.ts`:
```ts
import { motion } from '@/theme';

export interface MotionRequest {
  speed?: 'fast' | 'base' | 'slow';
  curve?: 'standard' | 'decelerate' | 'accelerate';
}

export interface ResolvedMotion {
  enabled: boolean;
  duration: number;
  easing: readonly [number, number, number, number];
}

export function resolveMotion(req: MotionRequest, reduceMotion: boolean): ResolvedMotion {
  const speed = req.speed ?? 'base';
  const curve = req.curve ?? 'standard';
  if (reduceMotion) {
    return { enabled: false, duration: 0, easing: motion.easing.standard };
  }
  return { enabled: true, duration: motion.duration[speed], easing: motion.easing[curve] };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/motion/motion-config.test.ts` → 3 passing. Depois `npx tsc --noEmit` (exit 0).
- [ ] **Step 5 — commit:** orquestrador roda
  `git add src/motion/motion-config.ts __tests__/motion/motion-config.test.ts`
  msg: `feat(d6): resolveMotion puro — decisão de motion derivada de tokens + reduce-motion`.

---

## Task 2: `triggerHaptic` wrapper (TDD)

**Files:** Create `src/motion/haptics.ts`, Create `__tests__/motion/haptics.test.ts`, Modify `package.json`.
**Interfaces:** Consumes: `expo-haptics`, `Platform`. · Produces: `triggerHaptic`, `HapticKind`.

- [ ] **Step 1 — adicionar dependência:** orquestrador roda dentro do projeto
  `npm install expo-haptics` (Expo 54 alinha a versão; NÃO usar `-g`). Confirmar entrada em `package.json` dependencies.
- [ ] **Step 2 — teste falhando:** criar `__tests__/motion/haptics.test.ts`. O teste mocka `expo-haptics` e `Platform` para asserir o guard sem tocar nativo:
```ts
const impactMock = jest.fn();
const notifyMock = jest.fn();
jest.mock('expo-haptics', () => ({
  impactAsync: (...a: unknown[]) => impactMock(...a),
  notificationAsync: (...a: unknown[]) => notifyMock(...a),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

let osValue = 'ios';
jest.mock('react-native', () => ({ Platform: { get OS() { return osValue; } } }));

import { triggerHaptic } from '@/motion/haptics';

beforeEach(() => { impactMock.mockClear(); notifyMock.mockClear(); osValue = 'ios'; });

it('enabled=false → no-op', () => {
  triggerHaptic('light', false);
  expect(impactMock).not.toHaveBeenCalled();
  expect(notifyMock).not.toHaveBeenCalled();
});

it('web → no-op mesmo com enabled', () => {
  osValue = 'web';
  triggerHaptic('success', true);
  expect(impactMock).not.toHaveBeenCalled();
  expect(notifyMock).not.toHaveBeenCalled();
});

it('native + enabled → chama o haptic correspondente', () => {
  triggerHaptic('light', true);
  expect(impactMock).toHaveBeenCalledTimes(1);
  triggerHaptic('success', true);
  expect(notifyMock).toHaveBeenCalledTimes(1);
});
```
- [ ] **Step 3 — rodar (falha: módulo inexistente):** `npx jest __tests__/motion/haptics.test.ts`
  → `Cannot find module '@/motion/haptics'`.
- [ ] **Step 4 — implementar:** criar `src/motion/haptics.ts`:
```ts
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type HapticKind = 'light' | 'medium' | 'success' | 'warning';

export function triggerHaptic(kind: HapticKind, enabled: boolean): void {
  if (!enabled || Platform.OS === 'web') return;
  switch (kind) {
    case 'light':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    case 'medium':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    case 'success':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    case 'warning':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
  }
}
```
- [ ] **Step 5 — rodar (passa):** `npx jest __tests__/motion/haptics.test.ts` → 3 passing. `npx tsc --noEmit` (exit 0).
- [ ] **Step 6 — commit:** orquestrador roda
  `git add src/motion/haptics.ts __tests__/motion/haptics.test.ts package.json package-lock.json`
  msg: `feat(d6): wrapper triggerHaptic — guard web/desligado, expo-haptics`.

---

## Task 3: `useMotionConfig` (hook fino sobre settings-store)

**Files:** Create `src/motion/useMotionConfig.ts`.
**Interfaces:** Consumes: `useSettingsStore` (D7, `reduceMotion`), `resolveMotion` (Task 1). · Produces: `useMotionConfig`.

> Hook fino: NÃO tem teste de render próprio (env `node`, sem testing-library). A lógica já está coberta por `resolveMotion` (Task 1). O hook só pluga o flag do store. Validação = `tsc`.

- [ ] **Step 1 — implementar:** criar `src/motion/useMotionConfig.ts`:
```ts
import { useSettingsStore } from '@/store/settings-store';
import { resolveMotion, type MotionRequest, type ResolvedMotion } from '@/motion/motion-config';

export function useMotionConfig(req: MotionRequest = {}): ResolvedMotion {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  return resolveMotion(req, reduceMotion);
}
```
- [ ] **Step 2 — verificar:** `npx tsc --noEmit` (exit 0). Se `useSettingsStore`/`reduceMotion` não existir → D7 incompleto, **parar e sinalizar**.
- [ ] **Step 3 — commit:** orquestrador roda
  `git add src/motion/useMotionConfig.ts`
  msg: `feat(d6): useMotionConfig liga decisão de motion ao toggle reduce-motion`.

---

## Task 4: `usePressScale` (Reanimated; no-op quando reduce-motion)

**Files:** Create `src/motion/usePressScale.ts`.
**Interfaces:** Consumes: `react-native-reanimated`, `useSettingsStore` (`reduceMotion`), `useMotionConfig`. · Produces: `usePressScale`, `PressScale`.

> Igual ao Task 3: hook que toca Reanimated não é montável no env `node` → sem teste de render. A *decisão* "anima ou não" já é coberta por `resolveMotion`. Aqui validamos apenas `tsc` e, no fim do épico, browser (Playwright MCP). O contrato garante que quando `reduceMotion` o `onPressIn/Out` não muta o `scale` (no-op).

- [ ] **Step 1 — implementar:** criar `src/motion/usePressScale.ts`:
```ts
import { useCallback } from 'react';
import { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useMotionConfig } from '@/motion/useMotionConfig';

export interface PressScale {
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  onPressIn: () => void;
  onPressOut: () => void;
}

export function usePressScale(opts: { to?: number } = {}): PressScale {
  const to = opts.to ?? 0.96;
  const m = useMotionConfig({ speed: 'fast', curve: 'standard' });
  const scale = useSharedValue(1);
  const easing = Easing.bezier(m.easing[0], m.easing[1], m.easing[2], m.easing[3]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = useCallback(() => {
    if (!m.enabled) return;            // reduce-motion → no press feedback
    scale.value = withTiming(to, { duration: m.duration, easing });
  }, [m.enabled, m.duration, to, scale, easing]);

  const onPressOut = useCallback(() => {
    if (!m.enabled) return;
    scale.value = withTiming(1, { duration: m.duration, easing });
  }, [m.enabled, m.duration, scale, easing]);

  return { animatedStyle, onPressIn, onPressOut };
}
```
- [ ] **Step 2 — verificar:** `npx tsc --noEmit` (exit 0).
- [ ] **Step 3 — commit:** orquestrador roda
  `git add src/motion/usePressScale.ts`
  msg: `feat(d6): usePressScale — feedback de toque via Reanimated, no-op em reduce-motion`.

---

## Task 5: Cabear press-scale + haptic no kit (Button/Card/Chip)

**Files:** Modify `src/components/Button.tsx`, `src/components/Card.tsx`, `src/components/Chip.tsx` (todos de D3).
**Interfaces:** Consumes: `usePressScale`, `triggerHaptic`, `useSettingsStore` (`haptics`). · Produces: kit animado.

> Sem teste novo de render (env `node`). Regressão coberta pelos snapshots/smoke de D0 (devem continuar verdes — animação não muda o markup estático) e por validação browser na Task 8. **Antes de editar, ler o componente real de D3** para casar a assinatura/JSX exatos (o snippet abaixo assume o padrão `Pressable` do kit; ajustar nomes se diferirem).

- [ ] **Step 1 — Button:** envolver o `Pressable` num `Animated.View` com o `animatedStyle` e ligar `onPressIn/Out`; disparar haptic no `onPress`. Diff conceitual a aplicar em `src/components/Button.tsx`:
```tsx
// imports a adicionar
import Animated from 'react-native-reanimated';
import { usePressScale } from '@/motion/usePressScale';
import { triggerHaptic } from '@/motion/haptics';
import { useSettingsStore } from '@/store/settings-store';

// dentro do componente Button(...)
const { animatedStyle, onPressIn, onPressOut } = usePressScale();
const haptics = useSettingsStore((s) => s.haptics);

// no render: envolver o Pressable existente
<Animated.View style={animatedStyle}>
  <Pressable
    onPressIn={onPressIn}
    onPressOut={onPressOut}
    onPress={() => { triggerHaptic('light', haptics); onPress(); }}
    disabled={disabled || loading}
    /* ...resto das props/estilos já existentes de D3... */
  >
    {/* ...conteúdo existente... */}
  </Pressable>
</Animated.View>
```
- [ ] **Step 2 — Card:** em `src/components/Card.tsx`, se o Card aceita `onPress` (variantes pressáveis), aplicar o mesmo padrão de `usePressScale` + `Animated.View`. Cards não-pressáveis (sem `onPress`) ficam estáticos — NÃO animar. Haptic só se `onPress` definido (`triggerHaptic('light', haptics)`).
- [ ] **Step 3 — Chip:** em `src/components/Chip.tsx`, aplicar `usePressScale` no toque do filtro; haptic `'light'` ao selecionar.
- [ ] **Step 4 — verificar:** `npx tsc --noEmit` (exit 0) e `npx jest` (suíte verde — snapshots de D0 inalterados, pois markup estático não muda; se algum snapshot mudar, revisar o diff e atualizar conscientemente com `-u`).
- [ ] **Step 5 — commit:** orquestrador roda
  `git add src/components/Button.tsx src/components/Card.tsx src/components/Chip.tsx`
  msg: `feat(d6): press-scale + haptic no kit (Button/Card/Chip), respeitando reduce-motion`.

---

## Task 6: Skeleton com shimmer respeitando reduce-motion

**Files:** Modify `src/components/Skeleton.tsx` (de D3).
**Interfaces:** Consumes: `react-native-reanimated`, `useMotionConfig`. · Produces: `Skeleton` com shimmer condicional.

> O `Skeleton` de D3 já existe como placeholder. D6 adiciona o **shimmer animado** — e quando `reduceMotion` está ligado, o skeleton fica **estático** (opacidade fixa, sem loop). Sem teste de render; cobertura via `useMotionConfig` (Task 1) + browser (Task 8).

- [ ] **Step 1 — ler** `src/components/Skeleton.tsx` para casar a assinatura/estilos atuais de D3.
- [ ] **Step 2 — implementar shimmer:** dentro do `Skeleton`, usar `useMotionConfig({ speed: 'slow' })` para decidir. Padrão conceitual:
```tsx
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useMotionConfig } from '@/motion/useMotionConfig';

const m = useMotionConfig({ speed: 'slow' });
const opacity = useSharedValue(m.enabled ? 0.4 : 0.6);

useEffect(() => {
  if (!m.enabled) { opacity.value = 0.6; return; }   // reduce-motion → estático
  opacity.value = withRepeat(
    withTiming(0.8, { duration: m.duration, easing: Easing.inOut(Easing.ease) }),
    -1, true,
  );
}, [m.enabled, m.duration, opacity]);

const shimmerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
// aplicar shimmerStyle ao Animated.View do bloco já existente em D3
```
- [ ] **Step 3 — verificar:** `npx tsc --noEmit` (exit 0) e `npx jest` (verde).
- [ ] **Step 4 — commit:** orquestrador roda
  `git add src/components/Skeleton.tsx`
  msg: `feat(d6): shimmer no Skeleton; estático quando reduce-motion ligado`.

---

## Task 7: `celebration-store` + `CelebrationOverlay` (micro-celebrações) — TDD no store

**Files:** Create `src/store/celebration-store.ts`, Create `__tests__/store/celebration-store.test.ts`, Create `src/components/CelebrationOverlay.tsx`, Modify `src/i18n/pt.ts`, `src/i18n/en.ts`, Modify `App.tsx`.
**Interfaces:** Consumes: `useSettingsStore` (`reduceMotion`,`haptics`), `triggerHaptic`, `useMotionConfig`. · Produces: `useCelebrationStore`, `CelebrationOverlay`.

- [ ] **Step 1 — teste falhando (store puro):** criar `__tests__/store/celebration-store.test.ts` (espelha `assistant-store.test.ts`):
```ts
import { useCelebrationStore } from '@/store/celebration-store';

beforeEach(() => { useCelebrationStore.getState().clear(); });

it('push adiciona com id estável (não Date.now) e dismiss remove', () => {
  const s = useCelebrationStore.getState();
  s.push({ kind: 'overall_up', titleKey: 'celebration.overall_up', detail: '+1' });
  s.push({ kind: 'trophy', titleKey: 'celebration.trophy' });
  const q = useCelebrationStore.getState().queue;
  expect(q).toHaveLength(2);
  expect(q[0].id).not.toBe(q[1].id);          // ids únicos
  expect(q[0].id).toBe('c1');                 // counter monotônico, determinístico
  expect(q[1].id).toBe('c2');
  useCelebrationStore.getState().dismiss('c1');
  expect(useCelebrationStore.getState().queue.map(c => c.id)).toEqual(['c2']);
});

it('clear esvazia a fila', () => {
  const s = useCelebrationStore.getState();
  s.push({ kind: 'transfer', titleKey: 'celebration.transfer' });
  s.clear();
  expect(useCelebrationStore.getState().queue).toHaveLength(0);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/store/celebration-store.test.ts` → `Cannot find module '@/store/celebration-store'`.
- [ ] **Step 3 — implementar store:** criar `src/store/celebration-store.ts` (id por counter monotônico — **não** `Date.now`, p/ determinismo de teste):
```ts
import { create } from 'zustand';

export type CelebrationKind = 'overall_up' | 'trophy' | 'transfer';

export interface Celebration {
  id: string;
  kind: CelebrationKind;
  titleKey: string;
  detail?: string;
}

interface CelebrationStore {
  queue: Celebration[];
  push: (c: Omit<Celebration, 'id'>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useCelebrationStore = create<CelebrationStore>((set) => ({
  queue: [],
  push: (c) =>
    set((s) => ({ queue: [...s.queue, { ...c, id: `c${++counter}` }] })),
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((x) => x.id !== id) })),
  clear: () => set({ queue: [] }),
}));
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/store/celebration-store.test.ts` → 2 passing.
- [ ] **Step 5 — i18n (paridade):** adicionar em `src/i18n/pt.ts`:
```ts
celebration: {
  overall_up: 'Evolução!',
  trophy: 'Troféu conquistado!',
  transfer: 'Transferência fechada!',
  dismiss: 'Toque para fechar',
},
```
e em `src/i18n/en.ts`:
```ts
celebration: {
  overall_up: 'Level up!',
  trophy: 'Trophy won!',
  transfer: 'Transfer done!',
  dismiss: 'Tap to dismiss',
},
```
- [ ] **Step 6 — rodar paridade:** `npx jest __tests__/i18n/parity.test.ts` → passa (pt/en com as mesmas chaves).
- [ ] **Step 7 — implementar overlay:** criar `src/components/CelebrationOverlay.tsx` (espelha `AchievementToast.tsx`; entrada animada via `useMotionConfig`, no-op/fade curto quando reduce-motion; haptic `'success'` ao surgir, respeitando toggle):
```tsx
import React, { useEffect } from 'react';
import { StyleSheet, Pressable, Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { colors, spacing, fontSize, radius, alpha } from '@/theme';
import { useTranslation } from '@/i18n';
import { useCelebrationStore } from '@/store/celebration-store';
import { useMotionConfig } from '@/motion/useMotionConfig';
import { useSettingsStore } from '@/store/settings-store';
import { triggerHaptic } from '@/motion/haptics';

export function CelebrationOverlay(): JSX.Element | null {
  const { t } = useTranslation();
  const queue = useCelebrationStore((s) => s.queue);
  const dismiss = useCelebrationStore((s) => s.dismiss);
  const haptics = useSettingsStore((s) => s.haptics);
  const m = useMotionConfig({ speed: 'base', curve: 'decelerate' });
  const current = queue[0];

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(m.enabled ? 24 : 0);

  useEffect(() => {
    if (!current) return;
    triggerHaptic('success', haptics);
    if (!m.enabled) { opacity.value = 1; translateY.value = 0; return; } // no-op de motion → mostra direto
    const easing = Easing.bezier(m.easing[0], m.easing[1], m.easing[2], m.easing[3]);
    opacity.value = withTiming(1, { duration: m.duration, easing });
    translateY.value = withTiming(0, { duration: m.duration, easing });
  }, [current?.id, m.enabled, m.duration, haptics]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!current) return null;

  return (
    <Animated.View style={[styles.wrap, style]} pointerEvents="box-none">
      <Pressable style={styles.card} onPress={() => { opacity.value = 0; translateY.value = 24; dismiss(current.id); }}>
        <Text style={styles.title}>{t(current.titleKey)}</Text>
        {current.detail ? <Text style={styles.detail}>{current.detail}</Text> : null}
        <Text style={styles.dismiss}>{t('celebration.dismiss')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, top: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: alpha(colors.gold, 0.6),
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
  },
  title: { color: colors.gold, fontSize: fontSize.md, fontWeight: '700' },
  detail: { color: colors.text, fontSize: fontSize.sm, marginTop: spacing.xxs },
  dismiss: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'right', marginTop: spacing.xs },
});
```
- [ ] **Step 8 — montar no App:** em `App.tsx`, renderizar `<CelebrationOverlay />` no topo da árvore, **dentro** dos providers (abaixo de `ConfirmProvider`/`ClubAccentProvider` de D3/D4 e do `NavigationContainer`, irmão de `RootNavigator`), p/ ficar sobre as telas:
```tsx
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
// ...no JSX, ao lado de <RootNavigator />:
<>
  <RootNavigator />
  <CelebrationOverlay />
</>
```
- [ ] **Step 9 — verificar:** `npx tsc --noEmit` (exit 0) e `npx jest` (verde).
- [ ] **Step 10 — commit:** orquestrador roda (separar store/overlay/i18n por contexto):
  `git add src/store/celebration-store.ts __tests__/store/celebration-store.test.ts`
  msg: `feat(d6): celebration-store — fila determinística de micro-celebrações`
  então `git add src/components/CelebrationOverlay.tsx App.tsx src/i18n/pt.ts src/i18n/en.ts`
  msg: `feat(d6): CelebrationOverlay (overall↑/troféu/transferência), reduce-motion + haptic`.

---

## Task 8: Disparar celebrações dos eventos reais + verificação (DoD)

**Files:** Modify (call sites onde os eventos já ocorrem). **Antes de editar, localizar com `grep` os pontos de:** subida de overall, troféu conquistado e transferência fechada — provavelmente em `src/store/game-store.ts` e/ou nas telas de fim de temporada/mercado. Disparar `useCelebrationStore.getState().push({ kind, titleKey, detail })` nesses pontos (chamada de store, não de engine — engine continua puro).
**Interfaces:** Consumes: `useCelebrationStore.push`. · Produces: celebrações ligadas a gameplay.

- [ ] **Step 1 — localizar eventos:** orquestrador roda
  `grep -rn "overall" src/store src/screens | grep -i "up\|increase\|gain"` ,
  `grep -rni "trophy\|champion\|winner" src/store src/screens`,
  `grep -rni "transfer.*complet\|sign\|signed\|buy\|sold" src/store src/screens`.
  Escolher os call-sites canônicos (preferir o store ao componente, p/ disparar uma vez por evento, não por render).
- [ ] **Step 2 — cabear (overall↑):** no ponto onde o overall do jogador sobe (ex.: pós-treino em `training-store`/`game-store`), após persistir, chamar:
```ts
import { useCelebrationStore } from '@/store/celebration-store';
// ...quando newOverall > oldOverall:
useCelebrationStore.getState().push({ kind: 'overall_up', titleKey: 'celebration.overall_up', detail: `+${newOverall - oldOverall}` });
```
- [ ] **Step 3 — cabear (troféu):** no ponto de fim de temporada/conquista, `push({ kind: 'trophy', titleKey: 'celebration.trophy', detail: <nome do troféu> })`.
- [ ] **Step 4 — cabear (transferência):** no fechamento de transferência (mercado), `push({ kind: 'transfer', titleKey: 'celebration.transfer', detail: <nome do jogador> })`.
- [ ] **Step 5 — verificar suíte:** `npx jest && npx tsc --noEmit` — tudo verde (incl. `celebration-store`, `motion-config`, `haptics`, `parity`, e os snapshots/smoke de D0 inalterados).
- [ ] **Step 6 — verificar reduce-motion (DoD chave):** confirmar via teste que reduce-motion desliga: `npx jest __tests__/motion/motion-config.test.ts` cobre `enabled:false`/`duration:0`. Isso é a asserção formal de "reduce-motion desliga animações" exigida pelo spec §D6.
- [ ] **Step 7 — browser (Playwright MCP) em `localhost:8082`:**
  - subir web (background do harness): `npm run web`;
  - **reduce-motion OFF**: clicar num Button do kit → ver press-scale; abrir Transfer/FreeAgents/Squad → ver skeletons com shimmer; disparar um evento de celebração → ver overlay deslizar; **0 erros de console**;
  - **reduce-motion ON** (Settings, D7): repetir → press-scale vira no-op, skeleton estático, overlay aparece direto (sem slide). Haptics: no-op no web (sem erro).
- [ ] **Step 8 — commit:** orquestrador roda
  `git add <call-sites tocados>`
  msg: `feat(d6): disparar micro-celebrações de overall↑/troféu/transferência via store`.

---

## Self-Review

1. **Cobertura do spec §D6:**
   - Press-scale no kit (Button/Card/Chip) via Reanimated → Tasks 4–5.
   - Transições por motion tokens → Task 1 (`resolveMotion` lê `motion.duration/easing`) consumido por todos os hooks.
   - Skeletons nos loaders (Transfer/FreeAgents/Squad) → Task 6 (shimmer) + uso nas telas (D5 já migrou os loaders ao `Skeleton`).
   - Micro-celebrações (overall↑/troféu/transferência) → Tasks 7–8.
   - Haptics + guard `Platform.OS` → Task 2.
   - **reduce-motion desliga tudo (assertável via flag)** → Task 1 (teste formal `enabled:false`/`duration:0`) + checagem em cada hook/componente (Tasks 4/6/7) + browser (Task 8 Step 7).
   - Engine intocado / determinismo → store usa counter monotônico, não `Date.now`; engine não é tocado.

2. **Placeholder scan:** sem "TBD". Os únicos pontos "a localizar" (Task 8 call-sites; assinatura exata do kit D3 em Task 5/6) são *descoberta de código existente upstream*, com o comando `grep` e o padrão de edição dados — não comportamento indefinido. Se a dependência upstream faltar, o plano manda **parar e sinalizar** (não inventar API).

3. **Consistência de tipos:** `MotionRequest`/`ResolvedMotion`/`resolveMotion` (Task 1) consumidos por `useMotionConfig` (Task 3), `usePressScale` (Task 4) e Skeleton/Overlay (Tasks 6/7). `HapticKind`/`triggerHaptic` (Task 2) usados em Tasks 5/7. `Celebration`/`CelebrationKind`/`useCelebrationStore` (Task 7) usados em Task 8. Todas as assinaturas batem com o Contract. Dependências em `motion` (D1), kit (D3), `settings-store` (D7) declaradas explicitamente no header.

4. **Ambiente de teste:** todos os testes novos (`motion-config`, `haptics`, `celebration-store`) rodam em `testEnvironment: 'node'` sem testing-library — coerente com `jest.config.js`. Hooks que tocam Reanimated/render NÃO têm teste de montagem (validados por `tsc` + browser), com a lógica de decisão extraída para funções puras testáveis (`resolveMotion`).
