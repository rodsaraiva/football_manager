# D1 — Tokens v2 (rampas, elevação, espaçamento, raio, motion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`).

**Goal:** Evoluir `src/theme/tokens.ts` de hexes chapados para um sistema com rampa de neutros 50→900 (preservando aliases `background/surface/surfaceLight`), `elevation` (e0..e3), `spacing.xxl:48`, `motion` (duration/easing), mais `deriveAccentRamp(accent)` em `club-accent.ts` reusando `mixWithWhite`/`luminance` — tudo puro (sem RN) e re-exportado por `@/theme`.

**Architecture:** Os tokens permanecem em `src/theme/tokens.ts` (puro, sem `react-native` — só constantes), re-exportados por `src/theme/index.ts` (a única superfície de import `@/theme`). A rampa de accent é um **helper derivado** (não estático) que vive em `club-accent.ts` ao lado de `deriveClubAccent`, reusando `mixWithWhite` (tint) e um novo `mixWithBlack` (shade) + `luminance` para o floor de legibilidade. Nada de store, nada de runtime — é tudo import-time. Este plano entrega **só os tokens v2 e a rampa** (fundação de D2–D8); não cabeia consumidores (isso é D4/D5).

**Tech Stack:** TypeScript 5.9 strict, Jest 29 + ts-jest. Tokens são constantes puras — zero React/Expo/RN, zero `Math.random`/`Date.now`. Alias de import `@/*` → `src/*` (`jest.config.js:7`, `tsconfig.json:7`).

**Convenções:** TDD bite-sized; engine/theme puro; tokens **sempre** de `@/theme`; aliases retrocompatíveis obrigatórios; branch `feat/d1-design-tokens-v2`; **subagents NÃO commitam** (o orquestrador commita); mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Precedente a espelhar:**
- `src/theme/tokens.ts` — formato das constantes (`colors`/`spacing`/`fontSize`/`radius`), comentários explicando *porquê* de cada cor promovida.
- `src/theme/club-accent.ts` — `parseHex`/`luminance`/`mixWithWhite`/`deriveClubAccent`, constantes `MIN_LUM`/`TEXT_FLIP_LUM`/`DEFAULT_ACCENT`.
- `src/theme/index.ts` — re-export central (`export { ... } from './tokens'`).
- `__tests__/theme/tokens.test.ts` e `club-accent.test.ts` — padrão de asserção por token, com comentário do *porquê* do valor.

Contracts vêm do spec §3 (`docs/superpowers/specs/2026-06-20-design-system-premium-design.md:241-296`).

---

## File Structure

- **Modify** `src/theme/tokens.ts` — adicionar `neutral` (rampa 50→900), reapontar `background/surface/surfaceLight` para entradas da rampa (aliases), `spacing.xxl: 48`, `elevation`, `motion`.
- **Modify** `src/theme/club-accent.ts` — adicionar `mixWithBlack`, `ClubAccentRamp`, `deriveAccentRamp(accent)`.
- **Modify** `src/theme/index.ts` — re-exportar `neutral`, `elevation`, `motion` de `./tokens`; re-exportar `deriveAccentRamp`/`ClubAccentRamp` de `./club-accent`.
- **Modify** `__tests__/theme/tokens.test.ts` — testes de rampa neutra monotônica, aliases preservados, `spacing.xxl`, `elevation` crescente, `motion` ordenado.
- **Modify** `__tests__/theme/club-accent.test.ts` — testes de `mixWithBlack` e `deriveAccentRamp` (rampa legível claro/escuro, ordenação de luminância dim<base<bright, `onAccent` correto).

**Contract (assinaturas exatas — do spec §3):**

```ts
// src/theme/tokens.ts (novos)
export const neutral: Record<50|100|200|300|400|500|600|700|800|900, string>;

export const elevation: Record<'e0'|'e1'|'e2'|'e3', {
  shadowColor: string; shadowOpacity: number; shadowRadius: number;
  shadowOffset: { width: number; height: number }; elevation: number;
}>;

export const motion: {
  duration: { fast: number; base: number; slow: number };
  easing: { standard: readonly [number, number, number, number];
            decelerate: readonly [number, number, number, number];
            accelerate: readonly [number, number, number, number] };
};

// spacing ganha xxl: 48 (chaves existentes preservadas)
export const spacing: { xxs: number; xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };

// src/theme/club-accent.ts (estende o existente)
export function mixWithBlack(hex: string, t: number): string;

export interface ClubAccentRamp {
  accent: string;       // base derivado (= ClubAccent.accent atual)
  accentDim: string;    // shade p/ press/disabled
  accentBright: string; // tint p/ hover/destaque
  onAccent: string;     // texto legível sobre accent (= ClubAccent.onAccent atual)
}
export function deriveAccentRamp(accent: string): ClubAccentRamp;
```

**Decisões de design ancoradas no código real:**
- A rampa `neutral` é derivada das **âncoras atuais** (`tokens.ts:6-8`): `background:'#0f0f1a'` (mais escuro), `surface:'#1a1a2e'`, `surfaceLight:'#252540'`. Convenção de design system: **índice baixo = mais claro, índice alto = mais escuro** (tema dark profundo). Logo `neutral[900]` é o mais escuro (= background) e `neutral[50]` o mais claro. Aliases: `background = neutral[900]`, `surface = neutral[800]`, `surfaceLight = neutral[700]` — valores **idênticos** aos atuais para não quebrar consumidores (`__tests__/theme/tokens.test.ts` não testa esses três hoje, mas `commonStyles` em `index.ts:9-10` usa `colors.background`/`colors.surface`).
- Asserção "monotônica em luminância": `luminance(neutral[50]) > luminance(neutral[100]) > ... > luminance(neutral[900])` (clareia conforme o índice cai). Reusa `luminance` de `club-accent.ts:17`.
- `deriveAccentRamp`: `accentBright = mixWithWhite(accent, 0.22)` (tint, reusa `club-accent.ts:23`), `accentDim = mixWithBlack(accent, 0.28)` (shade, novo helper espelhado em `mixWithWhite`), `onAccent` pela mesma regra de `deriveClubAccent` (`luminance(accent) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff'`, `club-accent.ts:37`). `accent` = entrada inalterada.

---

## Task 1: Rampa de neutros + aliases retrocompatíveis

**Files:** Modify `src/theme/tokens.ts`, Modify `__tests__/theme/tokens.test.ts`.
**Interfaces:** Consumes: `luminance` (de `@/theme/club-accent`). Produces: `export const neutral: Record<50..900, string>`; `colors.background/surface/surfaceLight` reapontados para `neutral[900/800/700]`.

- [ ] **Step 1 — teste falhando:** adicionar ao fim de `__tests__/theme/tokens.test.ts`:
```ts
import { neutral } from '@/theme/tokens';
import { luminance } from '@/theme/club-accent';

describe('neutral ramp', () => {
  it('exposes 10 steps 50→900', () => {
    const keys = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
    for (const k of keys) {
      expect(typeof neutral[k]).toBe('string');
      expect(neutral[k]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('is monotonically decreasing in luminance (50 lightest → 900 darkest)', () => {
    const keys = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
    for (let i = 1; i < keys.length; i++) {
      expect(luminance(neutral[keys[i]])).toBeLessThan(luminance(neutral[keys[i - 1]]));
    }
  });

  it('keeps background/surface/surfaceLight as backward-compatible aliases', () => {
    expect(colors.background).toBe('#0f0f1a');   // = neutral[900], unchanged value
    expect(colors.surface).toBe('#1a1a2e');      // = neutral[800], unchanged value
    expect(colors.surfaceLight).toBe('#252540'); // = neutral[700], unchanged value
    expect(colors.background).toBe(neutral[900]);
    expect(colors.surface).toBe(neutral[800]);
    expect(colors.surfaceLight).toBe(neutral[700]);
  });
});
```
- [ ] **Step 2 — rodar (falha: `neutral` não exportado):** `npx jest __tests__/theme/tokens.test.ts`
  → saída esperada: `Cannot find module ... neutral` / `neutral is undefined`, suíte vermelha.
- [ ] **Step 3 — implementar:** em `src/theme/tokens.ts`, **antes** de `export const colors` adicionar a rampa, e reapontar os 3 aliases. Substituir o bloco `colors` (`tokens.ts:5-8`):
```ts
// Neutral ramp (dark theme): index baixo = mais claro, index alto = mais escuro.
// 700/800/900 são as 3 âncoras atuais (#252540/#1a1a2e/#0f0f1a) — preservadas como
// aliases em `colors`. 50→600 estendem para cima (surfaces/borders/divisores mais claros).
export const neutral = {
  50: '#f4f4f8',
  100: '#d9d9e4',
  200: '#b5b5c8',
  300: '#8e8ea6',
  400: '#5e5e78',
  500: '#41415c',
  600: '#33334e',
  700: '#252540', // = surfaceLight (alias)
  800: '#1a1a2e', // = surface (alias)
  900: '#0f0f1a', // = background (alias)
} as const;

export const colors = {
  background: neutral[900],
  surface: neutral[800],
  surfaceLight: neutral[700],
  primary: '#4361ee',
```
  (o restante de `colors` — `primaryLight` em diante — fica inalterado).
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/tokens.test.ts` → verde. Se algum step de luminância falhar, ajustar os hexes 50→600 mantendo o gradiente decrescente (validar com `luminance` no teste).
- [ ] **Step 5 — commit (orquestrador):** `git add src/theme/tokens.ts __tests__/theme/tokens.test.ts` · msg: `feat(theme): rampa neutral 50→900 com aliases retrocompatíveis (D1)`.

---

## Task 2: spacing.xxl + token de elevação

**Files:** Modify `src/theme/tokens.ts`, Modify `__tests__/theme/tokens.test.ts`.
**Interfaces:** Produces: `spacing.xxl: 48`; `export const elevation: Record<'e0'|'e1'|'e2'|'e3', {...}>`.

- [ ] **Step 1 — teste falhando:** adicionar ao fim de `__tests__/theme/tokens.test.ts`:
```ts
import { elevation } from '@/theme/tokens';

describe('spacing.xxl', () => {
  it('adds the 48 step on the base-4/8 rhythm, keeping existing keys', () => {
    expect(spacing.xxl).toBe(48);
    expect(spacing.xl).toBe(32); // unchanged
    expect(spacing.md).toBe(16); // unchanged
  });
});

describe('elevation tokens', () => {
  const tiers = ['e0', 'e1', 'e2', 'e3'] as const;

  it('exposes e0..e3 with the full shadow shape', () => {
    for (const t of tiers) {
      const e = elevation[t];
      expect(typeof e.shadowColor).toBe('string');
      expect(typeof e.shadowOpacity).toBe('number');
      expect(typeof e.shadowRadius).toBe('number');
      expect(typeof e.shadowOffset.width).toBe('number');
      expect(typeof e.shadowOffset.height).toBe('number');
      expect(typeof e.elevation).toBe('number');
    }
  });

  it('e0 is flat (no shadow)', () => {
    expect(elevation.e0.shadowOpacity).toBe(0);
    expect(elevation.e0.shadowRadius).toBe(0);
    expect(elevation.e0.elevation).toBe(0);
  });

  it('is strictly increasing across tiers (radius, android elevation, offset)', () => {
    for (let i = 1; i < tiers.length; i++) {
      const prev = elevation[tiers[i - 1]];
      const cur = elevation[tiers[i]];
      expect(cur.shadowRadius).toBeGreaterThan(prev.shadowRadius);
      expect(cur.elevation).toBeGreaterThan(prev.elevation);
      expect(cur.shadowOffset.height).toBeGreaterThanOrEqual(prev.shadowOffset.height);
    }
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/theme/tokens.test.ts`
  → `spacing.xxl` é `undefined` e `elevation` não existe; suíte vermelha.
- [ ] **Step 3 — implementar:** em `src/theme/tokens.ts`, substituir a linha de `spacing` (`tokens.ts:48`) e adicionar `elevation` após `radius`:
```ts
// base-4/8 rhythm: xxs..xl em passos de 2/4/8/16/24/32; xxl=48 fecha a escala p/ heros/seções.
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
```
```ts
// Elevação: e0 flat → e3 hero. shadowColor escuro p/ tema dark; iOS/web usam shadow*,
// Android usa `elevation`. Pareados p/ leitura consistente entre plataformas.
export const elevation = {
  e0: { shadowColor: '#000000', shadowOpacity: 0,    shadowRadius: 0,  shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  e1: { shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 4,  shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  e2: { shadowColor: '#000000', shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  e3: { shadowColor: '#000000', shadowOpacity: 0.32, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
} as const;
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/tokens.test.ts` → verde.
- [ ] **Step 5 — commit (orquestrador):** `git add src/theme/tokens.ts __tests__/theme/tokens.test.ts` · msg: `feat(theme): spacing.xxl e token de elevação e0..e3 (D1)`.

---

## Task 3: Token de motion (duração + easing bezier)

**Files:** Modify `src/theme/tokens.ts`, Modify `__tests__/theme/tokens.test.ts`.
**Interfaces:** Produces: `export const motion: { duration: {fast,base,slow}; easing: {standard,decelerate,accelerate} }` (easing como tuplas bezier readonly).

- [ ] **Step 1 — teste falhando:** adicionar ao fim de `__tests__/theme/tokens.test.ts`:
```ts
import { motion } from '@/theme/tokens';

describe('motion tokens', () => {
  it('durations are ordered fast < base < slow', () => {
    expect(motion.duration.fast).toBeLessThan(motion.duration.base);
    expect(motion.duration.base).toBeLessThan(motion.duration.slow);
    expect(motion.duration.fast).toBe(120);
    expect(motion.duration.base).toBe(200);
    expect(motion.duration.slow).toBe(320);
  });

  it('easings are 4-number bezier tuples with control points in [0,1] on x', () => {
    for (const curve of [motion.easing.standard, motion.easing.decelerate, motion.easing.accelerate]) {
      expect(curve).toHaveLength(4);
      curve.forEach((n) => expect(typeof n).toBe('number'));
      // x control points (índices 0 e 2) válidos p/ cubic-bezier
      expect(curve[0]).toBeGreaterThanOrEqual(0);
      expect(curve[0]).toBeLessThanOrEqual(1);
      expect(curve[2]).toBeGreaterThanOrEqual(0);
      expect(curve[2]).toBeLessThanOrEqual(1);
    }
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/theme/tokens.test.ts` → `motion` indefinido, suíte vermelha.
- [ ] **Step 3 — implementar:** em `src/theme/tokens.ts`, adicionar após `elevation`:
```ts
// Motion: durações em ms + curvas cubic-bezier (tuplas puras, sem Reanimated nos tokens).
// standard = Material standard; decelerate = entrada (ease-out); accelerate = saída (ease-in).
export const motion = {
  duration: { fast: 120, base: 200, slow: 320 },
  easing: {
    standard:   [0.2, 0.0, 0.0, 1.0] as const,
    decelerate: [0.0, 0.0, 0.2, 1.0] as const,
    accelerate: [0.4, 0.0, 1.0, 1.0] as const,
  },
} as const;
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/tokens.test.ts` → verde.
- [ ] **Step 5 — commit (orquestrador):** `git add src/theme/tokens.ts __tests__/theme/tokens.test.ts` · msg: `feat(theme): token de motion (durações + easing bezier) (D1)`.

---

## Task 4: mixWithBlack + deriveAccentRamp

**Files:** Modify `src/theme/club-accent.ts`, Modify `__tests__/theme/club-accent.test.ts`.
**Interfaces:** Consumes: `parseHex`/`luminance`/`mixWithWhite` (internos de `club-accent.ts`), `TEXT_FLIP_LUM` (`club-accent.ts:7`). Produces: `mixWithBlack(hex,t)`, `ClubAccentRamp`, `deriveAccentRamp(accent)`.

- [ ] **Step 1 — teste falhando:** adicionar ao fim de `__tests__/theme/club-accent.test.ts`:
```ts
import { mixWithBlack, deriveAccentRamp } from '@/theme/club-accent';

describe('mixWithBlack', () => {
  it('blends white toward black by t (mirror of mixWithWhite)', () => {
    expect(mixWithBlack('#ffffff', 0.65)).toBe('#595959'); // round(255*(1-0.65))=89=0x59
  });
  it('black stays black', () => {
    expect(mixWithBlack('#000000', 0.5)).toBe('#000000');
  });
});

describe('deriveAccentRamp', () => {
  it('keeps base accent unchanged and derives dim/bright + readable onAccent', () => {
    const r = deriveAccentRamp('#4361ee');
    expect(r.accent).toBe('#4361ee');
    expect(r.onAccent).toBe('#ffffff'); // dark accent → white text
  });

  it('orders the ramp by luminance: dim < base < bright', () => {
    const r = deriveAccentRamp('#4361ee');
    expect(luminance(r.accentDim)).toBeLessThan(luminance(r.accent));
    expect(luminance(r.accent)).toBeLessThan(luminance(r.accentBright));
  });

  it('flips onAccent to black for a very light accent', () => {
    const r = deriveAccentRamp('#FFE500'); // bright yellow
    expect(r.onAccent).toBe('#000000');
    expect(luminance(r.accentDim)).toBeLessThan(luminance(r.accentBright));
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/theme/club-accent.test.ts` → `mixWithBlack`/`deriveAccentRamp` inexistentes, suíte vermelha.
- [ ] **Step 3 — implementar:** em `src/theme/club-accent.ts`, adicionar `mixWithBlack` logo após `mixWithWhite` (`club-accent.ts:27`) e, ao fim do arquivo, `ClubAccentRamp` + `deriveAccentRamp`:
```ts
export function mixWithBlack(hex: string, t: number): string {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const mix = rgb.map((c) => Math.round(c * (1 - t)));
  return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('');
}
```
```ts
export interface ClubAccentRamp {
  accent: string;       // base derivado (entrada inalterada)
  accentDim: string;    // shade p/ press/disabled
  accentBright: string; // tint p/ hover/destaque
  onAccent: string;     // texto legível sobre accent
}

// Expande um accent já legível (saída de deriveClubAccent) numa mini-rampa de estados.
// dim = shade 28%, bright = tint 22%, onAccent pela mesma regra de flip de deriveClubAccent.
export function deriveAccentRamp(accent: string): ClubAccentRamp {
  return {
    accent,
    accentDim: mixWithBlack(accent, 0.28),
    accentBright: mixWithWhite(accent, 0.22),
    onAccent: luminance(accent) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff',
  };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/club-accent.test.ts` → verde.
- [ ] **Step 5 — commit (orquestrador):** `git add src/theme/club-accent.ts __tests__/theme/club-accent.test.ts` · msg: `feat(theme): mixWithBlack + deriveAccentRamp (rampa de accent do clube) (D1)`.

---

## Task 5: Re-export central em @/theme + verificação

**Files:** Modify `src/theme/index.ts`.
**Interfaces:** Consumes: `neutral`/`elevation`/`motion` (de `./tokens`), `deriveAccentRamp`/`ClubAccentRamp` (de `./club-accent`). Produces: superfície `@/theme` com os tokens v2.

- [ ] **Step 1 — teste falhando:** adicionar ao fim de `__tests__/theme/tokens.test.ts` um teste que importa **pela superfície pública** `@/theme`:
```ts
import * as theme from '@/theme';

describe('@/theme public surface (v2 tokens re-exported)', () => {
  it('re-exports neutral, elevation, motion and deriveAccentRamp', () => {
    expect(theme.neutral[900]).toBe('#0f0f1a');
    expect(theme.elevation.e3.elevation).toBe(12);
    expect(theme.motion.duration.base).toBe(200);
    expect(typeof theme.deriveAccentRamp).toBe('function');
    expect(theme.deriveAccentRamp('#4361ee').accent).toBe('#4361ee');
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/theme/tokens.test.ts`
  → `theme.neutral`/`theme.elevation`/`theme.motion`/`theme.deriveAccentRamp` indefinidos (ainda não re-exportados por `index.ts`).
- [ ] **Step 3 — implementar:** em `src/theme/index.ts`, estender os re-exports. Substituir as linhas 2 e 5-6:
```ts
import { colors, spacing, fontSize } from './tokens';

// Re-export pure tokens + helpers so `@/theme` stays the single import surface.
export { colors, spacing, fontSize, radius, neutral, elevation, motion } from './tokens';
export { alpha } from './alpha';
export { deriveClubAccent, deriveAccentRamp, mixWithWhite, mixWithBlack, luminance } from './club-accent';
export type { ClubAccent, ClubAccentRamp } from './club-accent';
```
  (manter `import { colors, spacing, fontSize } from './tokens'` no topo — `commonStyles` usa `colors`/`spacing`/`fontSize` em `index.ts:8-20`.)
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/theme/tokens.test.ts __tests__/theme/club-accent.test.ts` → verde.
- [ ] **Step 5 — verificação global + commit (orquestrador):** `npx tsc --noEmit` (exit 0) e `npx jest __tests__/theme` (toda a pasta de theme verde, incl. `alpha`/`player-colors`). Depois `git add src/theme/index.ts __tests__/theme/tokens.test.ts` · msg: `feat(theme): re-exporta tokens v2 e deriveAccentRamp por @/theme (D1)`.

---

## Self-Review

1. **Cobertura do spec (§D1, linhas 63-79 + Contract §3 linhas 241-296):** rampa `neutral` 50→900 com aliases (Task 1); `spacing.xxl:48` + `elevation` e0..e3 (Task 2); `motion` duration/easing (Task 3); `deriveAccentRamp` reusando `mixWithWhite`/`luminance` + `mixWithBlack` para shade (Task 4); re-export por `@/theme` (Task 5). DoD do spec coberto: tokens novos exportados de `@/theme`, aliases preservados (Task 1 testa `colors.background===neutral[900]` com valor idêntico), rampa monotônica de luminância (Task 1), elevação crescente (Task 2), durações ordenadas (Task 3), rampa de accent legível claro/escuro (Task 4). Zero `Math.random`/`Date.now` — só constantes.
2. **Placeholder scan:** nenhum "TBD". Todo código (hexes da rampa, valores de elevation/motion, fórmulas de mix) está escrito por extenso. Único ajuste condicional explícito: se a luminância da rampa neutra não for estritamente decrescente, Task 1 Step 4 manda ajustar os hexes 50→600 — com o critério de validação (o próprio teste de `luminance`), não é placeholder de comportamento.
3. **Consistência de tipos:** `ClubAccentRamp` bate com o Contract do spec (§3 linhas 243-249). `deriveAccentRamp(accent: string): ClubAccentRamp`, `mixWithBlack(hex,t)` espelha `mixWithWhite` (mesma assinatura). `elevation`/`motion`/`neutral` batem com o Contract (§3 linhas 254-264). `spacing` mantém chaves existentes + `xxl`. `index.ts` re-exporta tudo sem colidir com o `import` de `commonStyles`. Nenhum tipo/função referenciado fora do que estas tasks definem ou já existe no código real (`parseHex`/`luminance`/`mixWithWhite`/`TEXT_FLIP_LUM` confirmados em `club-accent.ts`).
