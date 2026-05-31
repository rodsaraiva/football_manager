# Design: UI Imersiva — Tema por Clube (navegação + banner)

**Data:** 2026-05-31
**Status:** Aprovado
**Escopo:** football-manager v0.1 — sub-projeto 2 de 2 (UI imersiva; i18n foi o sub-projeto 1, já entregue)

---

## Contexto

O app usa um dark-mode genérico com accent azul fixo (`colors.primary = #4361ee`). Cada clube já tem `primaryColor`/`secondaryColor` no banco e no tipo `Club`, mas **a UI não usa nenhuma dessas cores hoje**. O `PRODUCT.md` (v0.1) pede UI imersiva ("sair do dark-mode padrão").

Esta entrega dá identidade visual ao save **com a cor do clube escolhido**, sem reescrever o theme inteiro.

## Decisões de produto confirmadas

- **Identidade = cor do clube; ação = azul.** A cor do clube tinge a **navegação** e um **banner**; os botões de ação e os ~156 usos de `colors.primary` permanecem azuis.
- **Alcance**: navegação (tab bar ativa + headers) + `ClubBanner` no topo de Home e ClubOverview.
- **Derivação segura**: cores hex arbitrárias precisam de tratamento de contraste sobre o fundo dark.

## Dados de referência (seed)

Luminância da `primaryColor`: min 0 (preto), mediana 61, max 255 (branco). **31/330** clubes têm primária quase preta (lum < 50, ex.: Newcastle `#241F20`) — invisível sobre o surface dark; **44/330** são claras/brancas (texto sobre elas precisa ser escuro).

## Não-escopo

- Os 156 usos de `colors.primary` (botões/barras/accents de ação) — permanecem azuis.
- Banner em telas além de Home e ClubOverview, tipografia global, light mode.
- Cores da engine/relatórios (`reportTechnical` etc.) — inalteradas.

---

## Design

### 1. Derivação segura — `src/theme/club-accent.ts` (função pura)

```ts
export interface ClubAccent {
  accent: string;   // cor de identidade, legível sobre o fundo dark
  onAccent: string; // cor de texto sobre o accent ('#000000' | '#ffffff')
}

const MIN_LUM = 60;        // luminância mínima p/ contraste sobre o surface dark
const TEXT_FLIP_LUM = 140; // acima disso, texto preto; abaixo, branco
const DEFAULT_ACCENT = '#4361ee';

// luminância perceptual 0..255
function luminance(hex: string): number; // 0.299r + 0.587g + 0.114b
function mixWithWhite(hex: string, t: number): string; // blend linear com #ffffff

export function deriveClubAccent(
  club: { primaryColor: string; secondaryColor: string } | null,
): ClubAccent {
  if (!club) return { accent: DEFAULT_ACCENT, onAccent: '#ffffff' };
  let accent: string;
  if (luminance(club.primaryColor) >= MIN_LUM) accent = club.primaryColor;
  else if (luminance(club.secondaryColor) >= MIN_LUM) accent = club.secondaryColor;
  else accent = mixWithWhite(club.primaryColor, 0.65); // ambas escuras → clareia
  const onAccent = luminance(accent) >= TEXT_FLIP_LUM ? '#000000' : '#ffffff';
  return { accent, onAccent };
}
```

`luminance` aceita `#RGB` e `#RRGGBB`; entrada inválida → trata como 0 (cai no fallback). Determinística e pura.

### 2. Hook reativo — `src/theme/useClubAccent.ts`

```ts
export function useClubAccent(): ClubAccent {
  const club = useGameStore((s) => s.playerClub);
  return useMemo(() => deriveClubAccent(club), [club?.primaryColor, club?.secondaryColor]);
}
```
Reage à troca de save automaticamente (o `game-store` atualiza `playerClub` em `loadSave`/`startNewGame`).

### 3. Navegação tingida

- **`TabNavigator`**: chama `useClubAccent()` e usa `accent` em `tabBarActiveTintColor`. Sem clube (não deveria ocorrer dentro do jogo) → azul default.
- **`RootNavigator`**: chama `useClubAccent()` e usa `accent` em `headerTintColor` (e `headerStyle` mantém `surface`). No MainMenu/NewGame, `playerClub` é `null` → azul default; ao entrar no jogo, vira a cor do clube. Re-renderiza ao mudar o store.

### 4. `ClubBanner` — `src/components/ClubBanner.tsx`

Faixa fina no topo: fundo `accent`, texto em `onAccent`. Mostra o nome do clube e "Temporada {season} — Semana {week}" (reusa `t('mainmenu.save_meta', ...)` do i18n já existente; o título usa `t`). Lê `playerClub`, `season`, `week` do `game-store`. Se `playerClub` for `null`, não renderiza nada.

Aplicado no topo de **`HomeScreen`** (Matches) e **`ClubOverviewScreen`**.

---

## Testes

**TDD — função pura** (`__tests__/theme/club-accent.test.ts`, sem SQLite/React):
1. `null` → `{ accent: '#4361ee', onAccent: '#ffffff' }`.
2. Primária clara o suficiente → `accent` = primária; `onAccent` = '#000000' se lum ≥ 140 (ex.: Fulham `#FFFFFF` → onAccent preto).
3. Primária escura + secundária clara → `accent` = secundária (ex.: Newcastle `#241F20`/`#FFFFFF` → accent branco, onAccent preto).
4. Ambas escuras → `accent` clareado (luminância resultante ≥ MIN_LUM).
5. Caso médio escuro com texto branco: Man Red `#DA291C` → accent vermelho, `onAccent` = '#ffffff'.
6. `luminance`/`mixWithWhite` corretas em valores conhecidos (preto=0, branco=255; mix(preto, 0.65)≈166).

**UI no browser** (Playwright): carregar dois saves de clubes com cores distintas (ex.: Real Madrid e um clube de cor escura) → tab bar ativa, headers e banner mudam de cor; o texto do banner permanece legível em ambos; botões de ação seguem azuis.

---

## Sequência de build

1. `club-accent.ts` (luminance, mixWithWhite, deriveClubAccent) + testes → verde.
2. `useClubAccent.ts` (hook).
3. `ClubBanner.tsx` + aplicar em Home e ClubOverview.
4. Navegação tingida (TabNavigator + RootNavigator).
5. `tsc` + suíte completa + validação no browser (dois clubes).
