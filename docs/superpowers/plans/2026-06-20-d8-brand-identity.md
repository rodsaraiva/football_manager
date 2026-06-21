# D8 — Marca & Identidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2-5 min). Mostre sempre o código real — sem placeholders.

**Goal:** Dar identidade visual coesa ao app (logotipo/ícone/splash alinhados ao "Premium Imersivo", config em `app.json`, guidelines curtas em `docs/`) e entregar um **gerador de escudo fictício determinístico** (`src/engine/identity/crest-generator.ts`) que produz SVG (paths + viewBox) a partir de um `SeededRng` — mesma seed ⇒ mesmo escudo, variedade entre seeds, zero `Math.random`/`Date.now`.

**Architecture:** O gerador vive em `src/engine/identity/` como **engine puro** — não importa React/Expo/`react-native-svg`; só retorna dados (`Crest = { viewBox, paths: {d,fill}[] }`) que uma camada de UI futura (D3/D5) renderiza com `<Path>` do `react-native-svg` (mesmo precedente do `RadarChart.tsx`, que monta strings de path e passa a `<Polygon>`/`<Path>`). Toda aleatoriedade flui por `SeededRng` (mulberry32, `src/engine/rng.ts`), espelhando o padrão de `generateStaffCandidates` (`src/engine/staff/staff-market.ts`). Os assets de marca (logo/ícone/splash) e a config de `app.json` são aditivos e não tocam engine. O nome do produto permanece o placeholder **"football-manager"** (decisão de produto — não inventar marca final).

**Tech Stack:** TS 5.9 strict, Jest 29 + ts-jest (node env, `roots: __tests__`, alias `@/` → `src/`), `SeededRng`. `react-native-svg ^15.12.1` já instalado (consumido só na futura UI, não no engine nem nos testes deste plano).

**Convenções:**
- Engine puro: `src/engine/identity/crest-generator.ts` **não** importa React/Expo/`react-native-svg`. ZERO `Math.random`/`Date.now`.
- TDD: teste falhando → ver falhar → implementação mínima → ver passar → commit. SQLite não se aplica (gerador é puro, sem DB).
- Tokens de cor vêm de `@/theme` quando a UI renderizar; **no gerador** as cores são parâmetro/paleta interna determinística (o engine não importa `@/theme` para manter pureza — `@/theme` é seguro de importar pois é puro, mas para o crest mantemos uma paleta local pequena e explícita, evitando acoplar identidade do clube a tokens de chrome).
- Branch: `feat/d8-brand-identity`.
- **Subagents NÃO commitam** — o passo "Commit" descreve os paths do `git add` e a mensagem; o orquestrador executa.
- Mensagens de commit terminam com: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Precedente a espelhar:**
- `src/engine/rng.ts` — `SeededRng` (`next`, `nextInt`, `pick`, `weightedPick`).
- `src/engine/staff/staff-market.ts` + `__tests__/engine/staff/staff-market.test.ts` — padrão de motor puro determinístico + teste (determinismo via mesma seed, variedade entre seeds).
- `src/components/RadarChart.tsx:30-71` — como construir strings de path SVG a partir de geometria (helper `toXY`, `.toFixed(2)`), molde da camada que **futuramente** renderiza o `Crest`.
- `app.json` — config atual: `splash.backgroundColor:"#1a1a2e"`, `android.adaptiveIcon.backgroundColor:"#1a1a2e"`, sem `icon`/`splash.image`/`web.favicon`.

---

## File Structure

- **Create** `src/engine/identity/crest-generator.ts` — `generateCrest(rng): Crest`, tipos `Crest`/`CrestPath`, paleta + formas determinísticas (puro).
- **Create** `__tests__/engine/identity/crest-generator.test.ts` — determinismo (mesma seed = mesmo Crest), variedade entre seeds, ≥1 path, viewBox válido, fills da paleta, pureza (sem `Math.random`).
- **Modify** `app.json` — `expo.icon`, `expo.splash.image`/`resizeMode`, `android.adaptiveIcon.foregroundImage`, `web.favicon` apontando aos assets de marca; cor de splash alinhada ao token de fundo do Premium Imersivo.
- **Create** `assets/brand/README.md` — descreve os assets esperados (logo/ícone/splash), dimensões e a referência ao crest-generator (placeholder de pipeline até os PNGs finais existirem).
- **Create** `docs/brand-guidelines.md` — guidelines curtas: uso de logo, cor (fundo escuro + accent do clube), tipografia (Manrope UI / Saira Condensed números — vindas do D2), nome=placeholder.

**Contract (assinaturas exatas — espelham o spec §D8 / §3):**

```ts
// src/engine/identity/crest-generator.ts
export interface CrestPath {
  d: string;     // path data SVG ("M..L..Z"), coordenadas em viewBox-space
  fill: string;  // cor hex "#rrggbb" da paleta determinística
}
export interface Crest {
  viewBox: string;      // ex.: "0 0 100 120"
  paths: CrestPath[];   // >= 1 path; ordem = pintura de trás p/ frente
}
export function generateCrest(rng: SeededRng): Crest;
```

`generateCrest` **consome** apenas `SeededRng` (de `@/engine/rng`) e **produz** um `Crest` plano (serializável, sem funções/refs React). Nenhum outro símbolo novo é exposto publicamente.

---

## Task 1: Tipos + esqueleto puro do gerador (compila, ainda sem lógica)

**Files:** Create `src/engine/identity/crest-generator.ts`.
**Interfaces:** Consumes: `SeededRng` (`@/engine/rng`). Produces: `Crest`, `CrestPath`, `generateCrest`.

- [ ] **Step 1 — escrever esqueleto que compila** (`src/engine/identity/crest-generator.ts`):
```ts
import { SeededRng } from '@/engine/rng';

export interface CrestPath {
  d: string;
  fill: string;
}

export interface Crest {
  viewBox: string;
  paths: CrestPath[];
}

export function generateCrest(_rng: SeededRng): Crest {
  return { viewBox: '0 0 100 120', paths: [] };
}
```
- [ ] **Step 2 — rodar tsc (passa):** `npx tsc --noEmit` → exit 0 (arquivo isolado, sem consumidores ainda).
- [ ] **Step 3 — commit:** `git add src/engine/identity/crest-generator.ts` · msg: `feat(d8): esqueleto do crest-generator (tipos Crest/CrestPath)` + linha `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 2: Determinismo + estrutura mínima do Crest (TDD)

**Files:** Create `__tests__/engine/identity/crest-generator.test.ts`; Modify `src/engine/identity/crest-generator.ts`.
**Interfaces:** Consumes: `generateCrest`, `SeededRng`. Produces: garantia "mesma seed = mesmo Crest", "≥1 path", "viewBox válido".

- [ ] **Step 1 — teste falhando** (`__tests__/engine/identity/crest-generator.test.ts`):
```ts
import { generateCrest, Crest } from '@/engine/identity/crest-generator';
import { SeededRng } from '@/engine/rng';

describe('generateCrest — determinismo e estrutura', () => {
  it('mesma seed produz exatamente o mesmo Crest', () => {
    const a = generateCrest(new SeededRng(42));
    const b = generateCrest(new SeededRng(42));
    expect(a).toEqual(b);
    // serializável: deep-equal via JSON sobrevive (sem funções/refs)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('produz ao menos um path e um viewBox no formato "minX minY w h"', () => {
    const c: Crest = generateCrest(new SeededRng(1));
    expect(c.paths.length).toBeGreaterThanOrEqual(1);
    expect(c.viewBox).toMatch(/^0 0 \d+ \d+$/);
    for (const p of c.paths) {
      expect(typeof p.d).toBe('string');
      expect(p.d.length).toBeGreaterThan(0);
      expect(p.d[0]).toBe('M'); // todo path começa com move-to
      expect(p.fill).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/identity/crest-generator.test.ts` → falha em "≥1 path" (esqueleto retorna `paths: []`).
- [ ] **Step 3 — implementar a base (shield outline determinístico)** — substituir o corpo de `generateCrest` em `crest-generator.ts`:
```ts
import { SeededRng } from '@/engine/rng';

export interface CrestPath {
  d: string;
  fill: string;
}

export interface Crest {
  viewBox: string;
  paths: CrestPath[];
}

const VIEW_W = 100;
const VIEW_H = 120;

// Paleta determinística do escudo (independente do chrome). Tons profundos
// alinhados ao "Premium Imersivo" + metais para contraste.
const PALETTE = [
  '#1b2a4a', '#27486f', '#3a6ea5', '#b03a2e', '#7d3c98',
  '#1e7a46', '#c9a227', '#d7dadd', '#0f1626', '#8a8d91',
] as const;

function fmt(n: number): string {
  return n.toFixed(1);
}

// Contorno de escudo "heater": ombros no topo, ponta na base.
function shieldPath(): string {
  const x0 = 6, x1 = VIEW_W - 6, top = 8, mid = 70, tip = VIEW_H - 6;
  const cx = VIEW_W / 2;
  return [
    `M${fmt(x0)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(mid)}`,
    `Q${fmt(x1)} ${fmt(mid + 28)} ${fmt(cx)} ${fmt(tip)}`,
    `Q${fmt(x0)} ${fmt(mid + 28)} ${fmt(x0)} ${fmt(mid)}`,
    'Z',
  ].join(' ');
}

export function generateCrest(rng: SeededRng): Crest {
  const base = rng.pick(PALETTE);
  const paths: CrestPath[] = [{ d: shieldPath(), fill: base }];
  return { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, paths };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/identity/crest-generator.test.ts` → 2 testes verdes.
- [ ] **Step 5 — commit:** `git add src/engine/identity/crest-generator.ts __tests__/engine/identity/crest-generator.test.ts` · msg: `feat(d8): crest-generator determinístico com contorno de escudo (TDD)` + `Co-Authored-By:` line.

---

## Task 3: Variedade entre seeds + paleta determinística (TDD)

**Files:** Modify `src/engine/identity/crest-generator.ts`; Modify `__tests__/engine/identity/crest-generator.test.ts`.
**Interfaces:** Consumes: `generateCrest`. Produces: garantia "seeds diferentes ⇒ variedade observável" + "fills sempre da paleta".

- [ ] **Step 1 — teste falhando** (append no arquivo de teste):
```ts
describe('generateCrest — variedade', () => {
  it('seeds diferentes geram conjuntos de cores variados (não tudo igual)', () => {
    const fills = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const c = generateCrest(new SeededRng(seed));
      for (const p of c.paths) fills.add(p.fill);
    }
    // com paleta de 10 cores e 40 seeds, esperamos diversidade real
    expect(fills.size).toBeGreaterThanOrEqual(4);
  });

  it('todo fill pertence à paleta declarada', () => {
    const palette = new Set([
      '#1b2a4a', '#27486f', '#3a6ea5', '#b03a2e', '#7d3c98',
      '#1e7a46', '#c9a227', '#d7dadd', '#0f1626', '#8a8d91',
    ]);
    for (let seed = 0; seed < 30; seed++) {
      const c = generateCrest(new SeededRng(seed));
      for (const p of c.paths) expect(palette.has(p.fill)).toBe(true);
    }
  });

  it('o número de paths varia entre seeds (camadas opcionais)', () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      counts.add(generateCrest(new SeededRng(seed)).paths.length);
    }
    expect(counts.size).toBeGreaterThanOrEqual(2);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/identity/crest-generator.test.ts` → falha em "número de paths varia" (hoje sempre 1 path).
- [ ] **Step 3 — implementar camadas determinísticas** — substituir o corpo de `generateCrest` (mantendo `PALETTE`/`shieldPath`/`fmt`):
```ts
// Divisória vertical do escudo (heráldica "per pale"): metade direita em 2ª cor.
function dexterHalfPath(): string {
  const cx = VIEW_W / 2, x1 = VIEW_W - 6, top = 8, mid = 70, tip = VIEW_H - 6;
  return [
    `M${fmt(cx)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(mid)}`,
    `Q${fmt(x1)} ${fmt(mid + 28)} ${fmt(cx)} ${fmt(tip)}`,
    'Z',
  ].join(' ');
}

// Chefe (faixa horizontal no topo do escudo).
function chiefPath(): string {
  const x0 = 6, x1 = VIEW_W - 6, top = 8, band = 30;
  return [
    `M${fmt(x0)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(top)}`,
    `L${fmt(x1)} ${fmt(band)}`,
    `L${fmt(x0)} ${fmt(band)}`,
    'Z',
  ].join(' ');
}

// Estrela central de 5 pontas (charge).
function starPath(cx: number, cy: number, rOuter: number): string {
  const rInner = rOuter * 0.42;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const ang = -Math.PI / 2 + (Math.PI * i) / 5;
    pts.push(`${fmt(cx + r * Math.cos(ang))} ${fmt(cy + r * Math.sin(ang))}`);
  }
  return `M${pts.join(' L')} Z`;
}

export function generateCrest(rng: SeededRng): Crest {
  const base = rng.pick(PALETTE);
  const second = rng.pick(PALETTE);
  const metal = rng.pick(PALETTE);

  const paths: CrestPath[] = [{ d: shieldPath(), fill: base }];

  // Divisão heráldica: 'plain' | 'per-pale' | 'chief'.
  const division = rng.weightedPick(['plain', 'per-pale', 'chief'] as const, [3, 4, 3]);
  if (division === 'per-pale') {
    paths.push({ d: dexterHalfPath(), fill: second });
  } else if (division === 'chief') {
    paths.push({ d: chiefPath(), fill: second });
  }

  // Charge central (estrela) presente em ~60% dos escudos.
  if (rng.next() < 0.6) {
    paths.push({ d: starPath(VIEW_W / 2, 42, 14), fill: metal });
  }

  return { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, paths };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/identity/crest-generator.test.ts` → todos os blocos verdes (determinismo, estrutura, variedade). `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/engine/identity/crest-generator.ts __tests__/engine/identity/crest-generator.test.ts` · msg: `feat(d8): divisões heráldicas e charge na geração de escudo (variedade por seed)` + `Co-Authored-By:` line.

---

## Task 4: Guard de pureza (zero Math.random / Date.now) (TDD)

**Files:** Modify `__tests__/engine/identity/crest-generator.test.ts`.
**Interfaces:** Consumes: `generateCrest`. Produces: regressão que falha se o gerador passar a usar `Math.random`/`Date.now`.

- [ ] **Step 1 — teste falhando/guarda** (append no arquivo de teste):
```ts
import * as fs from 'fs';
import * as path from 'path';

describe('generateCrest — pureza determinística', () => {
  it('não usa Math.random nem Date.now no fonte', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../src/engine/identity/crest-generator.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/Date\.now/);
  });

  it('é estável mesmo se Math.random for monkeypatched (não depende dele)', () => {
    const orig = Math.random;
    Math.random = () => 0.123456;
    try {
      const a = generateCrest(new SeededRng(7));
      const b = generateCrest(new SeededRng(7));
      expect(a).toEqual(b);
    } finally {
      Math.random = orig;
    }
  });
});
```
- [ ] **Step 2 — rodar (passa direto):** `npx jest __tests__/engine/identity/crest-generator.test.ts` → verde. (O guard documenta a invariante; a implementação da Task 3 já a satisfaz — `Math.cos/sin` em `starPath` são determinísticos e permitidos; só `Math.random`/`Date.now` são proibidos.)
- [ ] **Step 3 — commit:** `git add __tests__/engine/identity/crest-generator.test.ts` · msg: `test(d8): guard de pureza do crest-generator (sem Math.random/Date.now)` + `Co-Authored-By:` line.

---

## Task 5: Assets de marca + config no app.json

**Files:** Modify `app.json`; Create `assets/brand/README.md`.
**Interfaces:** Consumes: assets em `assets/brand/`. Produces: `app.json` apontando ícone/splash; manifesto dos assets esperados.

- [ ] **Step 1 — criar manifesto de assets** (`assets/brand/README.md`):
```md
# assets/brand

Assets de marca do "football-manager" (placeholder — nome final é decisão de produto).

| Arquivo | Uso | Dimensão |
|---|---|---|
| `icon.png` | `expo.icon` (app icon iOS/Android) | 1024×1024 |
| `adaptive-foreground.png` | `android.adaptiveIcon.foregroundImage` | 1024×1024, área segura central |
| `splash.png` | `expo.splash.image` | 1242×2436, fundo transparente sobre `backgroundColor` |
| `favicon.png` | `web.favicon` | 48×48 |

Direção visual: fundo escuro profundo (alinhado ao token de fundo do Premium Imersivo,
`#0f0f1a`/`#1a1a2e`), monograma/escudo centralizado. A forma do escudo segue o contorno
"heater" do gerador determinístico (`src/engine/identity/crest-generator.ts`), para que
marca e escudos de clube compartilhem a mesma linguagem.

> Os PNGs finais entram via design (fora do escopo de código). Até lá, `app.json` referencia
> estes paths; se um asset faltar, o Expo cai no default — não quebra o boot.
```
- [ ] **Step 2 — atualizar `app.json`** (apontar ícone/splash e alinhar cor de fundo ao Premium Imersivo). Substituir o objeto `expo` por:
```json
{
  "expo": {
    "name": "Football Manager",
    "slug": "football-manager",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "newArchEnabled": true,
    "icon": "./assets/brand/icon.png",
    "splash": {
      "image": "./assets/brand/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0f0f1a"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.footballmanager.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/brand/adaptive-foreground.png",
        "backgroundColor": "#0f0f1a"
      },
      "package": "com.footballmanager.app"
    },
    "web": {
      "favicon": "./assets/brand/favicon.png"
    }
  }
}
```
- [ ] **Step 3 — validar JSON:** `node -e "JSON.parse(require('fs').readFileSync('app.json','utf8')); console.log('ok')"` → imprime `ok`.
- [ ] **Step 4 — commit:** `git add app.json assets/brand/README.md` · msg: `feat(d8): apontar ícone/splash/favicon de marca no app.json + manifesto de assets` + `Co-Authored-By:` line.

---

## Task 6: Brand guidelines em docs/

**Files:** Create `docs/brand-guidelines.md`.
**Interfaces:** Consumes: tokens do Premium Imersivo (D1) e tipografia (D2). Produces: guideline curta de uso de logo/cor/tipografia/nome.

- [ ] **Step 1 — escrever guidelines** (`docs/brand-guidelines.md`):
```md
# Brand Guidelines — football-manager (placeholder)

> Nome do produto é **placeholder** ("football-manager"). A marca final é decisão de
> produto e não está fixada aqui (ver spec §D8 / §9 out-of-scope).

## Logo
- Sempre sobre fundo escuro profundo (`#0f0f1a`–`#1a1a2e`). Não usar sobre fundos claros sem variante invertida.
- Área de proteção mínima ao redor do logo = altura do "escudo" do próprio logo.
- Tamanho mínimo: 24dp de altura (favicon 48×48px).

## Cor
- **Chrome estrutural** (fundo, surfaces, bordas): neutros profundos da rampa de tokens (D1) — estáticos entre clubes.
- **Accent do clube**: camada de identidade+ação (CTAs, abas, progresso, foco). Derivado por `deriveAccentRamp` (D4). A marca do app usa neutro + 1 accent de produto; escudos de clube usam o accent do clube.
- Escudos fictícios: paleta determinística própria (ver `src/engine/identity/crest-generator.ts`), independente do chrome.

## Tipografia
- **UI:** Manrope (D2).
- **Números/stats:** Saira Condensed, tabular (D2).
- Wordmark da marca usa Manrope SemiBold; não usar fontes de sistema no wordmark.

## Escudos de clube (identidade fase 1)
- Gerados por `generateCrest(rng)` — determinístico por seed do save.
- Linguagem visual: contorno "heater" + divisões heráldicas (per-pale / chief) + charge (estrela).
- Mesma seed ⇒ mesmo escudo (reprodutível em qualquer dispositivo).
```
- [ ] **Step 2 — commit:** `git add docs/brand-guidelines.md` · msg: `docs(d8): guidelines de marca (logo/cor/tipografia/escudo) com nome placeholder` + `Co-Authored-By:` line.

---

## Task 7: Verificação final (DoD)

**Files:** nenhum (verificação).
**Interfaces:** consome a suíte completa.

- [ ] **Step 1 — suíte completa + tsc:** `npx jest __tests__/engine/identity && npx tsc --noEmit` → ambos exit 0.
- [ ] **Step 2 — suíte global (não regrediu):** `npm test` → verde (nenhum teste existente quebrou; gerador é aditivo e puro).
- [ ] **Step 3 — checklist DoD do §D8:**
  - Gerador testado: determinismo (mesma seed = mesmo Crest) ✓, variedade entre seeds ✓, ≥1 path ✓.
  - Zero `Math.random`/`Date.now` no gerador (guard da Task 4) ✓.
  - `app.json` referencia ícone/splash/favicon de marca; cor de splash alinhada ao fundo Premium Imersivo ✓.
  - Guidelines em `docs/brand-guidelines.md`; nome mantido como placeholder ✓.
  - Render real do escudo (UI `<Path>`) fica para D3/D5 — fora do escopo deste plano (engine entrega só os dados).

---

## Self-Review
1. **Cobertura do spec §D8:** logo/ícone/splash + `app.json` (Task 5); guidelines em docs/ (Task 6); gerador SVG determinístico via `SeededRng` com ≥1 path/viewBox (Tasks 1-3); determinismo + variedade + zero `Math.random`/`Date.now` (Tasks 2-4); nome=placeholder (Tasks 5-6). DoD reconciliado na Task 7.
2. **Placeholder scan:** "placeholder" aparece só como fato de produto (nome). Nenhum "TBD"/"adicionar X depois" em código. Os PNGs finais de marca são entrega de design (não-código), explicitado no manifesto — o `app.json` aponta paths estáveis e o Expo degrada para default se faltarem (não quebra boot).
3. **Consistência de tipos:** `Crest`/`CrestPath`/`generateCrest(rng: SeededRng): Crest` batem exatamente com o Contract do spec §3. Gerador importa só `@/engine/rng` (puro); não importa React/Expo/`react-native-svg`/`@/theme`. Testes em node-env (ts-jest) sem DB — coerente com gerador puro. `weightedPick`/`pick`/`next` usados existem em `src/engine/rng.ts`.
