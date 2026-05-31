# Theme Consistency — tokens everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Centralizar toda cor/spacing/radius/font/alpha da UI em tokens de `src/theme`: extrair os helpers de cor de jogador/rating duplicados (4 cópias) em um único módulo themed `src/theme/rating-colors.ts`, adicionar tokens semânticos faltantes (posição, rampa de rating, `radius`, `spacing.xxs`) + helper `alpha()`, aplicar a paleta `report*` por tela de relatório, e documentar a regra identidade=accent-do-clube / ação=azul.

**Architecture:** Tema é estático (sem store, import-time). `src/theme/index.ts` é a fonte única de tokens (`colors`, `spacing`, `radius`, `fontSize`, `alpha`, `commonStyles`). Novo `src/theme/rating-colors.ts` importa `colors` e expõe 3 helpers puros (`getPositionColor`, `getOverallColor`, `getBarColor`). Componentes/telas importam de `@/theme` e `@/theme/rating-colors` — zero duplicação. Engine/database/store **intocados**. Nenhuma mudança de schema.

**Tech Stack:** TypeScript 5.9 strict, React Native (Expo 54), Jest 29 + ts-jest. **Sem dependências novas.** SQLite/better-sqlite3 **não se aplica** (tema é pura função, sem DB). Validação UI via Playwright MCP nas telas tocadas.

**Spec:** `docs/superpowers/specs/2026-05-31-theme-consistency-design.md`

---

## File Structure

| Arquivo | Ação | Porquê |
|---|---|---|
| `src/theme/index.ts` | **Modificar** | Adicionar tokens de posição + rampa de rating (linhas ~3-32), `spacing.xxs` (linha 34), objeto `radius` (novo, após linha 35), helper `alpha()` exportado, e comentário da regra accent/azul em `commonStyles.button` (linha 44). |
| `src/theme/rating-colors.ts` | **Criar** | Único módulo com `getPositionColor`/`getOverallColor`/`getBarColor`, puro, importa `colors`. Tiers canônicos de `PlayerCard.tsx:30-35`. |
| `src/theme/club-accent.ts` | **Sem mudança** | Já deriva accent; `parseHex` interno permanece (decisão: não exportar; `alpha` faz validação própria mínima — ver Task 2). |
| `__tests__/theme/rating-colors.test.ts` | **Criar** | TDD dos 3 helpers + anti-regressão de drift (#36). |
| `__tests__/theme/alpha.test.ts` | **Criar** | TDD do `alpha()`. |
| `src/components/PlayerCard.tsx` | **Modificar** | Remover helpers locais (16-36); importar de `@/theme/rating-colors`. `marginTop: 2`→`spacing.xxs`; `borderRadius: 20`→`radius.pill`. |
| `src/components/StatBar.tsx` | **Modificar** | Remover `getBarColor` local (11-17); importar. `borderRadius: 3`→`radius.sm` (validar no browser). |
| `src/components/RadarChart.tsx` | **Modificar** | `fontSize={8}`→`fontSize.micro`; `borderRadius: 5`→`radius.round`. |
| `src/screens/club/transfers/FreeAgentsScreen.tsx` | **Modificar** | Remover `positionColor`/`overallColor` locais (47-59) — **corrige drift do tier ≥40** — importar de `@/theme/rating-colors`. |
| `src/screens/club/transfers/TransferMarketScreen.tsx` | **Modificar** | Remover helpers locais (37-50); importar. |
| `src/screens/home/MatchResultScreen.tsx` | **Modificar** | `getRatingColor` (122): `'#06d6a0aa'`→`alpha(colors.success, 0.67)`. |
| `src/screens/club/BoardScreen.tsx` | **Modificar** | Remover `?? '#333'`/`?? '#222'` (102,107); `borderRadius: 8`→`radius.md` (90,101 `borderRadius: 4`→`radius.sm`); `fontSize: 56`→`fontSize.display`. |
| `src/screens/club/AssistantsScreen.tsx` | **Modificar** | `colors.danger + '22'` (206)→`alpha(colors.danger, 0.13)`. |
| `src/screens/home/HomeScreen.tsx` | **Modificar** | `colors.warning + '66'` (880)→`alpha(colors.warning, 0.4)`. |
| `src/screens/reports/*` (9 telas) | **Modificar** | Trocar `colors.primary` em `ActivityIndicator`/`RefreshControl tintColor` pelo token `report*` da tela; alpha-concat→`alpha()`. |

---

## Task 1: Tokens semânticos + escalas (`index.ts`)

Adiciona os tokens nomeados que substituem os off-palette, estende `spacing`, cria `radius` e prepara o terreno para os helpers. Sem helper `alpha` ainda (Task 2).

**Files:**
- Modify: `src/theme/index.ts` (colors 3-32, spacing 34, fontSize 35, +radius novo após 35)
- Test: `__tests__/theme/tokens.test.ts` (Create)

Steps:
- [ ] Escrever teste falhando `__tests__/theme/tokens.test.ts`:
```ts
import { colors, spacing, radius, fontSize } from '@/theme';

describe('semantic position tokens', () => {
  it('exposes named position colors (GK off-palette promoted)', () => {
    expect(colors.positionGK).toBe('#f4a261');
    expect(colors.positionDef).toBe('#4361ee'); // = primary
    expect(colors.positionMid).toBe('#06d6a0'); // = success
    expect(colors.positionAtk).toBe('#f72585'); // = accent
  });
});

describe('semantic rating ramp tokens', () => {
  it('exposes the five rating tiers (elite/poor off-palette promoted)', () => {
    expect(colors.ratingElite).toBe('#00e676');
    expect(colors.ratingGood).toBe('#06d6a0');    // = success
    expect(colors.ratingAverage).toBe('#ffd166'); // = warning
    expect(colors.ratingPoor).toBe('#ff9800');
    expect(colors.ratingBad).toBe('#ef476f');     // = danger
  });
});

describe('spacing scale', () => {
  it('adds xxs degree for the marginTop:2 literals', () => {
    expect(spacing.xxs).toBe(2);
    expect(spacing.xs).toBe(4); // unchanged baseline
  });
});

describe('radius scale', () => {
  it('covers the common borderRadius literals (4/8/12/20/round)', () => {
    expect(radius.sm).toBe(4);
    expect(radius.md).toBe(8);
    expect(radius.lg).toBe(12);
    expect(radius.pill).toBe(20);
    expect(radius.round).toBe(999);
  });
});

describe('fontSize scale', () => {
  it('adds micro (RadarChart) and display (BoardScreen bigNumber)', () => {
    expect(fontSize.micro).toBe(8);
    expect(fontSize.display).toBe(56);
    expect(fontSize.xs).toBe(10); // unchanged
  });
});
```
- [ ] Rodar `npx jest __tests__/theme/tokens.test.ts` → **FAIL** (`colors.positionGK` undefined, `radius` undefined, `spacing.xxs`/`fontSize.micro` undefined).
- [ ] Implementar em `src/theme/index.ts`. Adicionar ao objeto `colors` (após linha 31, antes do `}` da linha 32):
```ts
  // Position badge colors (semantic; were hardcoded per-helper)
  positionGK: '#f4a261',   // off-palette promoted to named token
  positionDef: '#4361ee',  // = primary
  positionMid: '#06d6a0',  // = success
  positionAtk: '#f72585',  // = accent
  // Overall/stat rating ramp (semantic; were #00e676 / #ff9800 literals)
  ratingElite: '#00e676',  // >=85 — off-palette promoted
  ratingGood: '#06d6a0',   // >=75 — = success
  ratingAverage: '#ffd166',// >=60 — = warning
  ratingPoor: '#ff9800',   // >=40 — off-palette promoted
  ratingBad: '#ef476f',    // <40  — = danger
```
- [ ] Trocar linha 34 por: `export const spacing = { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };`
- [ ] Trocar linha 35 por: `export const fontSize = { micro: 8, xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 28, title: 34, display: 56 };`
- [ ] Adicionar após o `fontSize` (nova linha): `export const radius = { sm: 4, md: 8, lg: 12, pill: 20, round: 999 };`
- [ ] Rodar `npx jest __tests__/theme/tokens.test.ts` → **PASS**.
- [ ] Rodar `npx tsc --noEmit` → limpo.
- [ ] Commit: `git add src/theme/index.ts __tests__/theme/tokens.test.ts && git commit -m "feat(theme): add semantic position/rating tokens + radius scale (#36,#64)"`

---

## Task 2: Helper `alpha()` puro

`alpha(hex, t)` aplica opacidade a um hex de 6 dígitos retornando `#RRGGBBAA`. Degrada graciosamente (entrada inválida → hex original sem sufixo). Faz a normalização própria mínima (expande 3-díg) — **não** importa `parseHex` de `club-accent.ts` (é interno lá; duplicar a normalização mínima evita acoplar/exportar, decisão da spec §7).

**Files:**
- Modify: `src/theme/index.ts` (adicionar `export function alpha` após `radius`)
- Test: `__tests__/theme/alpha.test.ts` (Create)

Steps:
- [ ] Escrever teste falhando `__tests__/theme/alpha.test.ts`:
```ts
import { alpha, colors } from '@/theme';

describe('alpha', () => {
  it('matches the legacy #06d6a0aa string at t=0.67', () => {
    expect(alpha(colors.success, 0.67)).toBe('#06d6a0aa'); // aa = 170/255 ≈ 0.667
  });
  it('t=0 → fully transparent suffix; t=1 → opaque suffix', () => {
    expect(alpha('#ffffff', 0)).toBe('#ffffff00');
    expect(alpha('#ffffff', 1)).toBe('#ffffffff');
  });
  it('clamps t outside [0,1]', () => {
    expect(alpha('#000000', -1)).toBe('#00000000');
    expect(alpha('#000000', 2)).toBe('#000000ff');
  });
  it('expands a 3-digit hex before appending alpha', () => {
    expect(alpha('#fff', 1)).toBe('#ffffffff');
  });
  it('returns input unchanged for invalid hex (never throws)', () => {
    expect(alpha('nope', 0.5)).toBe('nope');
    expect(alpha('#12', 0.5)).toBe('#12');
  });
  it('reproduces the report-screen concat values', () => {
    expect(alpha('#06d6a0', 0.8)).toBe('#06d6a0cc'); // success + 'cc'
    expect(alpha('#ffd166', 0.2)).toBe('#ffd16633'); // warning + '33'
    expect(alpha('#4361ee', 0.2)).toBe('#4361ee33'); // primary + '33'
  });
});
```
- [ ] Rodar `npx jest __tests__/theme/alpha.test.ts` → **FAIL** (`alpha` não exportado).
- [ ] Implementar em `src/theme/index.ts` (após `export const radius = ...`):
```ts
/** Apply opacity t∈[0,1] to a 6-digit hex, returning #RRGGBBAA. Invalid hex → input unchanged. */
export function alpha(hex: string, t: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, t)) * 255)
    .toString(16)
    .padStart(2, '0');
  return '#' + h + a;
}
```
- [ ] Rodar `npx jest __tests__/theme/alpha.test.ts` → **PASS**.
- [ ] Rodar `npx tsc --noEmit` → limpo.
- [ ] Commit: `git add src/theme/index.ts __tests__/theme/alpha.test.ts && git commit -m "feat(theme): add pure alpha() helper for opacity tokens (#75)"`

---

## Task 3: Módulo único `rating-colors.ts` (consolidação dos helpers)

Cria o único lar dos 3 helpers, usando os tokens semânticos da Task 1. Tiers canônicos vêm de `PlayerCard.tsx:30-35` (`getBarColor` deve ser **idêntico** a `getOverallColor` — o teste trava o drift). `getPositionColor` mapeia todas as 11 `Position`.

**Files:**
- Create: `src/theme/rating-colors.ts`
- Test: `__tests__/theme/rating-colors.test.ts` (Create)

Steps:
- [ ] Escrever teste falhando `__tests__/theme/rating-colors.test.ts`:
```ts
import { getPositionColor, getOverallColor, getBarColor } from '@/theme/rating-colors';
import { colors } from '@/theme';
import { Position } from '@/types/player';

describe('getPositionColor', () => {
  it('GK → positionGK', () => {
    expect(getPositionColor('GK')).toBe(colors.positionGK);
  });
  it('defenders → positionDef', () => {
    (['CB', 'LB', 'RB'] as Position[]).forEach((p) =>
      expect(getPositionColor(p)).toBe(colors.positionDef));
  });
  it('midfielders → positionMid', () => {
    (['CDM', 'CM', 'CAM', 'LM', 'RM'] as Position[]).forEach((p) =>
      expect(getPositionColor(p)).toBe(colors.positionMid));
  });
  it('attackers → positionAtk', () => {
    (['LW', 'RW', 'ST'] as Position[]).forEach((p) =>
      expect(getPositionColor(p)).toBe(colors.positionAtk));
  });
});

describe('getOverallColor — canonical tiers (PlayerCard.tsx:30-35)', () => {
  it('maps every tier boundary', () => {
    expect(getOverallColor(85)).toBe(colors.ratingElite);
    expect(getOverallColor(84)).toBe(colors.ratingGood);
    expect(getOverallColor(75)).toBe(colors.ratingGood);
    expect(getOverallColor(74)).toBe(colors.ratingAverage);
    expect(getOverallColor(60)).toBe(colors.ratingAverage);
    expect(getOverallColor(59)).toBe(colors.ratingPoor);
    expect(getOverallColor(40)).toBe(colors.ratingPoor);
    expect(getOverallColor(39)).toBe(colors.ratingBad);
  });
  it('handles out-of-range extremes', () => {
    expect(getOverallColor(99)).toBe(colors.ratingElite);
    expect(getOverallColor(0)).toBe(colors.ratingBad);
    expect(getOverallColor(-5)).toBe(colors.ratingBad);
  });
  // Anti-regression for drift #36: FreeAgents dropped the >=40 tier, so OVR 50
  // showed danger there but #ff9800 in PlayerCard. After consolidation it is ratingPoor everywhere.
  it('OVR 50 is ratingPoor (not ratingBad) — unifies the FreeAgents drift', () => {
    expect(getOverallColor(50)).toBe(colors.ratingPoor);
  });
});

describe('getBarColor — must equal getOverallColor (no future drift)', () => {
  it('is identical to getOverallColor across the full range', () => {
    for (let v = 0; v <= 99; v++) {
      expect(getBarColor(v)).toBe(getOverallColor(v));
    }
  });
});
```
- [ ] Rodar `npx jest __tests__/theme/rating-colors.test.ts` → **FAIL** (módulo não existe).
- [ ] Implementar `src/theme/rating-colors.ts`:
```ts
import { colors } from './index';
import { Position } from '@/types/player';

export function getPositionColor(position: Position): string {
  if (position === 'GK') return colors.positionGK;
  if (position === 'CB' || position === 'LB' || position === 'RB') return colors.positionDef;
  if (
    position === 'CDM' ||
    position === 'CM' ||
    position === 'CAM' ||
    position === 'LM' ||
    position === 'RM'
  )
    return colors.positionMid;
  return colors.positionAtk; // LW, RW, ST
}

// Canonical rating ramp (was duplicated in 4 files with a drifted FreeAgents copy).
export function getOverallColor(value: number): string {
  if (value >= 85) return colors.ratingElite;
  if (value >= 75) return colors.ratingGood;
  if (value >= 60) return colors.ratingAverage;
  if (value >= 40) return colors.ratingPoor;
  return colors.ratingBad;
}

export const getBarColor = getOverallColor;
```
- [ ] Rodar `npx jest __tests__/theme/rating-colors.test.ts` → **PASS**.
- [ ] Rodar `npx tsc --noEmit` → limpo.
- [ ] Commit: `git add src/theme/rating-colors.ts __tests__/theme/rating-colors.test.ts && git commit -m "feat(theme): consolidate position/rating helpers into one themed module (#36)"`

---

## Task 4: Migrar os 4 consumidores duplicados (fecha #36)

Remove as cópias locais e importa do módulo único. **Corrige o drift do tier ≥40 em FreeAgents.** Mudança de comportamento real: OVR 45–59 em FreeAgents passa de `danger` para `ratingPoor` (`#ff9800`), igual às outras telas.

**Files:**
- Modify: `src/components/PlayerCard.tsx` (remover 16-36, ajustar import 3, usar 45-46)
- Modify: `src/components/StatBar.tsx` (remover 11-17, ajustar import 3, usar 22)
- Modify: `src/screens/club/transfers/FreeAgentsScreen.tsx` (remover 47-59, ajustar import 15, usar call-sites)
- Modify: `src/screens/club/transfers/TransferMarketScreen.tsx` (remover 37-50, ajustar import 11, usar call-sites)
- Test: nenhum novo (Task 3 já cobre a lógica; este task é refactor de import).

Steps:
- [ ] `PlayerCard.tsx`: trocar import linha 3 para `import { colors, commonStyles, fontSize, radius, spacing } from '@/theme';` e adicionar `import { getPositionColor, getOverallColor } from '@/theme/rating-colors';`. Deletar funções locais (16-36). Em `marginTop: 2` (97)→`marginTop: spacing.xxs`; `borderRadius: 20` (102)→`borderRadius: radius.pill`.
- [ ] `StatBar.tsx`: trocar import linha 3 para `import { colors, fontSize, radius, spacing } from '@/theme';` e adicionar `import { getBarColor } from '@/theme/rating-colors';`. Deletar `getBarColor` local (11-17). `borderRadius: 3` (51,56)→`borderRadius: radius.sm` (barra de 6px; **validar no browser** — 4 vs 3 é diferença fina).
- [ ] `FreeAgentsScreen.tsx`: deletar `positionColor`/`overallColor` locais (47-59); adicionar `import { getPositionColor, getOverallColor } from '@/theme/rating-colors';` após linha 15. Trocar call-sites `positionColor(...)`→`getPositionColor(...)` e `overallColor(...)`→`getOverallColor(...)` (grep no arquivo pelos usos).
- [ ] `TransferMarketScreen.tsx`: deletar helpers locais (37-50); adicionar `import { getPositionColor, getOverallColor } from '@/theme/rating-colors';` após linha 11.
- [ ] Rodar `npx tsc --noEmit` → limpo (confirma nenhum call-site órfão).
- [ ] Rodar `npx jest __tests__/theme` → todos os theme tests **PASS** (regressão).
- [ ] **Validação browser (Playwright MCP):** subir web server, abrir **Squad** (PlayerCard), **Transfer Market** e **Free Agents**; confirmar cores de posição/OVR idênticas entre telas e que um OVR 50 em Free Agents agora aparece laranja (`ratingPoor`), não vermelho.
- [ ] Commit: `git add src/components/PlayerCard.tsx src/components/StatBar.tsx src/screens/club/transfers/FreeAgentsScreen.tsx src/screens/club/transfers/TransferMarketScreen.tsx && git commit -m "refactor(theme): use single rating-colors module; fix FreeAgents tier drift (#36)"`

---

## Task 5: MatchResult + alpha-concat sweep (#75)

Troca todas as concatenações de alpha por `alpha()` e o `#06d6a0aa` colado em string. Comportamento visual idêntico (os testes da Task 2 provam a equivalência exata dos valores).

**Files:**
- Modify: `src/screens/home/MatchResultScreen.tsx` (linha 122)
- Modify: `src/screens/club/AssistantsScreen.tsx` (linha 206)
- Modify: `src/screens/home/HomeScreen.tsx` (linha 880)
- Modify: `src/screens/reports/ReportsRadarScreen.tsx` (linha 311)
- Modify: `src/screens/reports/ReportsProjectionScreen.tsx` (linha 386)
- Modify: `src/screens/reports/ReportsOpponentScreen.tsx` (linhas 208-210, 254)
- Test: nenhum novo (equivalência provada na Task 2).

Steps:
- [ ] `MatchResultScreen.tsx`: garantir `alpha` no import linha 12 (`import { alpha, colors, spacing, fontSize, commonStyles } from '@/theme';`). Linha 122: `if (rating >= 7) return '#06d6a0aa';` → `if (rating >= 7) return alpha(colors.success, 0.67);`
- [ ] `AssistantsScreen.tsx` linha 206: `colors.danger + '22'` → `alpha(colors.danger, 0.13)` (0x22 = 34/255 ≈ 0.133). Adicionar `alpha` ao import de `@/theme`.
- [ ] `HomeScreen.tsx` linha 880: `colors.warning + '66'` → `alpha(colors.warning, 0.4)` (0x66 = 102/255 = 0.4). Adicionar `alpha` ao import.
- [ ] `ReportsRadarScreen.tsx` linha 311: `colors.primary + '33'` → `alpha(colors.primary, 0.2)` (0x33 = 51/255 = 0.2). Adicionar `alpha` ao import.
- [ ] `ReportsProjectionScreen.tsx` linha 386: `colors.border + '44'` → `alpha(colors.border, 0.27)` (0x44 = 68/255 ≈ 0.267). Adicionar `alpha` ao import.
- [ ] `ReportsOpponentScreen.tsx`: linhas 208-210 (`colors.success/danger/warning + 'cc'`) → `alpha(colors.success, 0.8)` / `alpha(colors.danger, 0.8)` / `alpha(colors.warning, 0.8)` (0xcc = 204/255 = 0.8); linha 254 (`colors.warning + '33'`) → `alpha(colors.warning, 0.2)`. Adicionar `alpha` ao import.
- [ ] Rodar `grep -rn "colors\.[a-zA-Z]* + '" src/` → **zero** ocorrências (sweep completo).
- [ ] Rodar `npx tsc --noEmit` → limpo.
- [ ] **Validação browser (Playwright MCP):** abrir **Match Result** (rating 7.x deve manter o verde translúcido), **Reports → Opponent** (badges W/L/D) e **Reports → Radar**; confirmar transparências idênticas.
- [ ] Commit: `git add src/screens/home/MatchResultScreen.tsx src/screens/club/AssistantsScreen.tsx src/screens/home/HomeScreen.tsx src/screens/reports/ReportsRadarScreen.tsx src/screens/reports/ReportsProjectionScreen.tsx src/screens/reports/ReportsOpponentScreen.tsx && git commit -m "refactor(theme): replace ad-hoc hex+alpha concat with alpha() (#75)"`

---

## Task 6: Remover fallback morto `colors.border ??` no BoardScreen (#76)

`colors.border` é sempre `'#2a2a45'`, então `?? '#333'`/`?? '#222'` é inalcançável e os fallbacks são cores-fantasma divergentes. Também migra os raios/font literais do StyleSheet.

**Files:**
- Modify: `src/screens/club/BoardScreen.tsx` (linhas 90, 95, 101-102, 107)
- Test: nenhum (mudança de 1 linha por símbolo; UI-only).

Steps:
- [ ] `BoardScreen.tsx`: garantir `radius` no import de `@/theme`. Linha 102: `backgroundColor: colors.border ?? '#333',` → `backgroundColor: colors.border,`. Linha 107: `borderBottomColor: colors.border ?? '#222',` → `borderBottomColor: colors.border,`.
- [ ] Linha 90: `borderRadius: 8,` → `borderRadius: radius.md,`. Linha 101: `borderRadius: 4,` → `borderRadius: radius.sm,`. Linha 95: `fontSize: 56,` → `fontSize: fontSize.display,` (já existe `fontSize` no import).
- [ ] Rodar `npx tsc --noEmit` → limpo.
- [ ] **Validação browser (Playwright MCP):** abrir **Board** (Diretoria); confirmar barras de confiança e bigNumber inalterados visualmente.
- [ ] Commit: `git add src/screens/club/BoardScreen.tsx && git commit -m "fix(theme): drop dead colors.border fallbacks + tokenize Board radius/font (#76)"`

---

## Task 7: Paleta de relatório por tela (#63)

Cada tela de relatório passa a usar seu token `report*` (mapa confirmado em `ReportsHubScreen.tsx`) em `ActivityIndicator` e `RefreshControl tintColor` — a identidade da categoria deixa de evaporar ao entrar na tela. **Escopo limitado a loaders/refresh** (indicadores neutros). Acentos de domínio (ex.: `getRatingColor`, league borders, attr bars que carregam significado de dados) ficam fora deste task para não quebrar semântica de cor — ver Out of scope.

Mapa tela → token (de `ReportsHubScreen.tsx`):

| Tela | Token |
|---|---|
| `ReportsTechnicalScreen` (123,141) | `colors.reportTechnical` |
| `ReportsFinancialScreen` (94,119) | `colors.reportFinancial` |
| `ReportsAnalyticsScreen` (124,142) | `colors.reportAnalytics` |
| `ReportsYouthScreen` (108,136) | `colors.reportYouth` |
| `ReportsRadarScreen` (113) | `colors.reportRadar` |
| `ReportsOpponentScreen` (108,126) | `colors.reportOpponent` |
| `ReportsTransferROIScreen` (124,173) | `colors.reportROI` |
| `ReportsProjectionScreen` (145,165) | `colors.reportProjection` |
| `ReportsFreeAgentScoutScreen` (307) | `colors.reportScout` |

**Files:**
- Modify: as 9 telas acima (só os `ActivityIndicator color=` e `RefreshControl tintColor=`).
- Test: nenhum (UI puro, sem lógica nova).

Steps:
- [ ] Para cada tela, trocar `color={colors.primary}` no `<ActivityIndicator ... size="large" />` pelo token da tabela, e `tintColor={colors.primary}` no `<RefreshControl ... />` pelo mesmo token. (Telas sem RefreshControl: só o ActivityIndicator — Radar 113, Scout 307.) Os tokens já existem em `colors` (`index.ts:21-31`); nenhum import novo necessário.
- [ ] Rodar `grep -n "ActivityIndicator color={colors.primary}" src/screens/reports/*.tsx` → **zero**.
- [ ] Rodar `npx tsc --noEmit` → limpo.
- [ ] **Validação browser (Playwright MCP):** abrir cada relatório a partir do Hub e disparar pull-to-refresh / estado de loading; confirmar que o spinner/refresh agora vem na cor da categoria (igual ao card do Hub) e não azul.
- [ ] Commit: `git add src/screens/reports/ReportsTechnicalScreen.tsx src/screens/reports/ReportsFinancialScreen.tsx src/screens/reports/ReportsAnalyticsScreen.tsx src/screens/reports/ReportsYouthScreen.tsx src/screens/reports/ReportsRadarScreen.tsx src/screens/reports/ReportsOpponentScreen.tsx src/screens/reports/ReportsTransferROIScreen.tsx src/screens/reports/ReportsProjectionScreen.tsx src/screens/reports/ReportsFreeAgentScoutScreen.tsx && git commit -m "feat(theme): apply per-category report palette to loaders/refresh (#63)"`

---

## Task 8: RadarChart token sweep + documentar regra accent/azul (#64, #65)

Tokeniza os literais do `RadarChart` e fixa a regra **identidade=accent-do-clube / ação=azul** como comentário em `commonStyles.button`. **Não** move accent para CTAs (decisão de produto, Out of scope) — apenas documenta onde ele se aplica para impedir drift futuro.

**Files:**
- Modify: `src/components/RadarChart.tsx` (linhas 12, 137, 176)
- Modify: `src/theme/index.ts` (comentário em `commonStyles.button`, linha 44)
- Test: nenhum (UI/doc).

Steps:
- [ ] `RadarChart.tsx`: trocar import linha 12 para `import { colors, fontSize, radius, spacing } from '@/theme';`. Linha 137: `fontSize={8}` → `fontSize={fontSize.micro}`. Linha 176 (`legendDot` `borderRadius: 5`) → `borderRadius: radius.round` (dot 10×10 vira círculo perfeito — diferença visual mínima, validar no browser).
- [ ] `index.ts`: adicionar comentário acima da linha 44 (`button:`):
```ts
  // Rule: identity = club accent (chrome: header tint, active tab, ClubBanner);
  // action = blue (colors.primary) for predictable CTAs across clubs. See theme-consistency spec §4.
```
- [ ] Rodar `npx tsc --noEmit` → limpo.
- [ ] Rodar `npx jest __tests__/theme/tokens.test.ts` → **PASS** (garante que o comentário não quebrou tokens).
- [ ] **Validação browser (Playwright MCP):** abrir **Reports → Radar**; confirmar labels de eixo (fontSize.micro=8) e legenda inalterados.
- [ ] Commit: `git add src/components/RadarChart.tsx src/theme/index.ts && git commit -m "refactor(theme): tokenize RadarChart + document accent/blue rule (#64,#65)"`

---

## Task 9: Sweep mecânico de spacing/radius/font restante (#64)

Sweep amplo dos ~169 padding/margin, ~187 borderRadius e ~35 fontSize literais **não cobertos** pelos tasks anteriores, trocando por `spacing`/`radius`/`fontSize`. **Fatiar por diretório, um commit por fatia**, cada um type-checado e browser-validado. Regra anti-over-engineering: trocar literal por token de **valor idêntico** (no-op visual); onde o token mais próximo difere (ex.: `borderRadius: 3` numa barra de 6px), só trocar se validar no browser que o layout fino não regride — caso contrário, **deixar o literal** e anotar no diff.

**Files (fatias, cada uma seu commit):**
- Fatia A: `src/components/*` (RadarChart já feito na Task 8; demais componentes restantes).
- Fatia B: `src/navigation/*`.
- Fatia C: `src/screens/reports/*` (raios/fonts além dos loaders da Task 7).
- Fatia D: `src/screens/club/*` (BoardScreen já feito; demais).
- Fatia E: `src/screens/home/*`.
- Fatia F: `src/screens/*` raiz + restantes.
- Test: nenhum (UI puro; coberto por tsc + browser).

Steps (repetir por fatia A–F):
- [ ] `grep -nE "(padding|margin)[A-Za-z]*: [0-9]+|borderRadius: [0-9]+|fontSize: [0-9]+" <fatia>` para listar literais.
- [ ] Para cada literal, mapear: `2→spacing.xxs`, `4→spacing.xs` **(spacing)** ou `radius.sm` **(radius)** conforme o campo; `8→spacing.sm`/`radius.md`; `12→radius.lg`; `16→spacing.md`; `20→radius.pill`; `24→spacing.lg`; `32→spacing.xl`; `999→radius.round`; fonts `8→fontSize.micro`,`10→xs`,`12→sm`,`14→md`,`16→lg`,`20→xl`,`28→xxl`,`34→title`,`56→display`. Garantir o import correto da fatia (`radius` é o que costuma faltar).
- [ ] Valores **sem token equivalente** (ex.: `padding: 10`, `borderRadius: 6`, `width: 90`): **não** inventar token de uso único (regra CLAUDE.md). Deixar como literal e seguir; só promover a token se aparecer ≥2× e fizer sentido semântico.
- [ ] Rodar `npx tsc --noEmit` → limpo.
- [ ] **Validação browser (Playwright MCP):** abrir 1–2 telas representativas da fatia; comparar com screenshot anterior — sem regressão de layout.
- [ ] Commit por fatia: `git add <fatia> && git commit -m "refactor(theme): tokenize spacing/radius/font in <fatia> (#64)"`

> Nota: este task é o maior em superfície mas o de menor risco lógico (no-ops visuais). Pode ser feito por último ou em paralelo após os tasks 1–8, pois não toca lógica.

---

## Sequencing & dependencies

**Ordem interna:** Task 1 (tokens) → Task 2 (`alpha`) → Task 3 (`rating-colors.ts`) são a fundação e devem vir primeiro nessa ordem (3 depende dos tokens de 1; 5 depende do `alpha` de 2). Task 4 depende de 3. Tasks 5, 6, 7, 8 dependem de 1–2 mas são independentes entre si (podem paralelizar). Task 9 (sweep mecânico) depende só de 1 e pode rodar por último/em paralelo.

**Dependências entre epics:**
- **Sem schema.** Independente de `save-isolation`, `db-hardening`, `match-consequences`, `progression-wired`, `competitions-real` — esta epic não toca `database/`, queries nem migrations (spec §5).
- **Conflito de merge com `i18n-completion`:** toca as **mesmas telas** (transfers, reports, MatchResult, Board, Home, Assistants). i18n mexe em JSX de **texto** (`t()`), esta epic mexe em `style={}`/cores/StyleSheet — colisão de região rara mas possível. **Sugestão:** coordenar por arquivo; se theme rodar primeiro, rebase de i18n por cima é trivial. Documentar no PR quais telas já passaram por i18n. Nenhuma dependência **funcional** — só de merge.

**Risco:** a única mudança de **comportamento** real é a correção do drift em `FreeAgentsScreen` (Task 4): OVR 45–59 muda de vermelho para laranja. Intencional (era o bug #36). Todo o resto é no-op visual (tokens de valor idêntico) ou troca de string-concat por função equivalente (Task 2 prova a equivalência byte-a-byte).

## Definition of done

- `npx tsc --noEmit` limpo.
- `npm test` verde: baseline 62 suites / 536 testes + 3 novas suites (`tokens`, `alpha`, `rating-colors`).
- `grep -rn "colors\.[a-zA-Z]* + '" src/` → zero (alpha-concat erradicado).
- `grep -rn "#f4a261\|#00e676\|#ff9800\|#06d6a0aa\|?? '#333'\|?? '#222'" src/` → só em `src/theme/index.ts` (onde viraram tokens nomeados).
- UI validada no browser (Playwright MCP) nas telas tocadas: Squad/PlayerCard, Transfer Market, Free Agents (drift corrigido), Match Result, Board, e cada Report (palette de categoria nos loaders).
- `git diff` revisado por fatia antes de cada commit.
