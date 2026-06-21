# Design: Design System "Premium Imersivo"

**Epic:** `design-system` · **Data:** 2026-06-20 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict

**Goal:** Transformar a UI chapada e baseada em literais num design system imersivo onde a **cor do clube** guia o chrome (CTAs, abas, progresso, foco, destaques), com rampas de neutros profundos, elevação, tipografia dual (Manrope + Saira Condensed), ícones SVG (fim do emoji) e um kit de componentes reutilizáveis — tudo entregue sobre uma rede de testes de UI que serve de gate para o redesign.

---

## 1. Problema / estado atual

O tema existe mas é raso, e o redesign está bloqueado por falta de testes nas telas que ele vai reescrever.

**Tokens chapados, sem profundidade.** `src/theme/tokens.ts:5-46` define `colors` como hexes soltos (`background:'#0f0f1a'`, `surface:'#1a1a2e'`, `surfaceLight:'#252540'`, `primary:'#4361ee'`, `accent:'#f72585'`). Não há **rampa** (50→900) de neutros nem de accent — só 3 degraus de surface escolhidos a olho. `spacing` (`tokens.ts:48`) é uma escala mecânica `{xxs:2,xs:4,sm:8,md:16,lg:24,xl:32}` sem ritmo documentado nem `xxl`. `fontSize` (`tokens.ts:49`) é número cru sem família, lineHeight ou weight associados. `radius` (`tokens.ts:50`) existe mas sem token de **elevação/sombra** e sem tokens de **motion** (duração/easing). Não há famílias de fonte: tudo herda a fonte de sistema.

**Accent do clube quase não chega na UI.** `deriveClubAccent` (`src/theme/club-accent.ts:29-39`) e `useClubAccent` (`src/theme/useClubAccent.ts:5-14`) derivam um accent legível a partir de `playerClub.primaryColor/secondaryColor`, mas só 3 consumidores existem: `TabNavigator.tsx:18,26` (`tabBarActiveTintColor`), `RootNavigator.tsx:53,58` (`headerTintColor`) e `ClubBanner.tsx:9,12`. CTAs, progresso, foco, chips ativos e destaques de card usam `colors.primary` estático (regra atual "ação = azul", documentada em `src/theme/index.ts:15-17`).

**`commonStyles` subutilizado; literais por toda parte.** `src/theme/index.ts:8-20` expõe só `screen/card/row/title/subtitle/label/button/buttonText/divider`. As telas reimplementam tudo em StyleSheet local com números mágicos: `TransferMarketScreen.tsx:255-358` e `FreeAgentsScreen.tsx:305-577` repetem o mesmo `playerRow`/`positionBadge`/`overallBadge`/`dropdown`/`btnPrimary` com `borderRadius: 6/18`, `paddingVertical: 6`, `top: 52` hardcoded. `OnboardingModal.tsx:59,114` usa `borderRadius: 16/10` cru. `ContextualHint.tsx:68` usa `width:24,height:24,borderRadius:12` cru.

**Emoji-como-ícone.** Ícones são glifos emoji em `<Text>`: `TabNavigator.tsx:32,37,45,51,56,61` (⚽👥📰📋💰📈), `MatchEventItem.tsx:13-28` (⚽👟🟨🟥…), `OnboardingModal.tsx:12-17` (⏭️👥🎯▶️), `EmptyState.tsx:14,28` (`icon: string` renderizado com `fontSize:32`), `AchievementToast.tsx:26,60`. Emoji renderiza inconsistente entre plataformas e não recebe a cor do accent.

**`Alert.alert` no-op no web.** 13 arquivos e 29 chamadas de `Alert.alert` (ex.: `TransferMarketScreen.tsx:110,129,135`; `FreeAgentsScreen.tsx:126,130`). No React Native Web `Alert.alert` é no-op (ver MEMORY `reference_rn_web_alert`), então confirmações/avisos somem silenciosamente no alvo web — `localhost:8082`.

**StatBar/EmptyState rasos.** `StatBar.tsx:39-50` é uma barra de cor sólida (`backgroundColor: barColor`), sem gradiente. `EmptyState.tsx:11-19` mostra emoji + título + descrição, **sem ilustração nem CTA**. Não há `Skeleton`, `Toast` reutilizável (só `AchievementToast` específico), nem `Chip`/`Filter`/`Badge` preenchido/`Modal`/`Sheet` padronizados.

**Cobertura de teste insuficiente para um redesign seguro.** `find src/screens -name '*.tsx'` = **51 telas**; testes de tela (`*.test.tsx`) = **0**. Stores: só `__tests__/store/training-store.test.ts` e `assistant-store.test.ts` (2). Report-generators em `src/engine/reports/`: **13 arquivos**, mas só 4 com teste (`youth`, `technical`, `financial`, `analytics`) — faltam os 6 citados no brief: `contract-alerts.ts`, `free-agent-scout.ts`, `line-efficiency.ts`, `morale-report.ts`, `opponent-report.ts`, `transfer-roi-report.ts` (todos confirmados em `src/engine/reports/`, sem `.test.ts` correspondente). Theme já tem alguns testes (`__tests__/theme/{club-accent,alpha,tokens,player-colors}.test.ts`) e i18n tem `parity.test.ts` — bom ponto de partida, mas tokens v2 e tipografia precisam de cobertura nova. Reescrever 44 telas sem snapshot/integração = regressão visual cega — daí **D0 ser o gate**.

> Contexto: a epic `2026-05-31-theme-consistency-design.md` já consolidou cores de rating/posição em tokens (`tokens.ts:35-45`), extraiu `alpha()` (`src/theme/alpha.ts`) e fixou a regra "identidade=clube / ação=azul". Este épico **evolui** essa regra (ação passa a usar accent — ver §8) e constrói o kit de componentes que aquela epic deixou explicitamente fora de escopo.

---

## 2. Approach

**Premium Imersivo (clube no centro).** Camada visual em três fundações tokenizadas — **cor** (neutros profundos em rampa + accent do clube derivado em rampa tint/shade), **tipografia** (par Manrope para UI + Saira Condensed para números/stats via `expo-font`), **profundidade** (elevação/sombra, ritmo de espaçamento, motion) — sobre as quais se assenta um **kit de componentes** (Card/Button/StatBar/Text semânticos/Icon/Chip/Badge/Skeleton/Toast/EmptyState/Modal/useConfirm). Um **motor de imersão** (`ClubAccentProvider` + `useClubAccent` estendido) leva o accent do clube a CTAs, abas, progresso, foco e destaques em todo o app. O rollout é incremental por tela (beachhead Transfer Market → Free Agents → telas core), protegido por uma rede de testes de UI escrita **antes** (D0).

O épico cobre 9 workstreams sequenciados **D0 → D8**. Cada um vira uma seção (§D0–§D8) com Por quê / Entrega / DoD / Risco / Tamanho. As seções 6–10 dão o overview transversal (erros, testes, deps, out-of-scope, self-review).

**Princípio de cor.** Neutros profundos = chrome estrutural (fundo, surfaces, bordas) e permanecem estáticos entre clubes (previsibilidade). O **accent do clube** = camada de identidade+ação, derivada por `deriveClubAccent` e expandida numa mini-rampa (`accentDim`/`accent`/`accentBright` + `onAccent`) para estados (hover/press/disabled). Rating/posição (`tokens.ts:35-45`) permanecem semânticos e independentes do clube (informação, não identidade).

**Alternativa descartada:** adotar uma biblioteca de design system pronta (ex.: `react-native-paper`, `tamagui` ou `nativewind`/Tailwind). Rejeitada porque (a) o engine puro e a regra "tokens sempre de `@/theme`" exigem controle total sobre os tokens e zero acoplamento de runtime extra; (b) o app já tem `react-native-svg` instalado (`package.json:28`) e padrões próprios (`commonStyles`, `useClubAccent`) que uma lib externa duplicaria/conflitaria; (c) imersão por cor-do-clube em rampa derivada é um requisito específico que libs genéricas não atendem sem theming customizado pesado. Construímos um kit enxuto sobre os tokens existentes — extensão, não substituição.

**Alternativa de escopo descartada:** fazer o redesign tela-a-tela sem rede de testes (mais rápido no curto prazo). Rejeitada: com 0 testes de tela e 6 report-generators sem cobertura, qualquer sweep de tokens regrediria silenciosamente. D0 paga-se na primeira regressão evitada.

---

## D0 — Rede de testes de UI (GATE do redesign)

**Por quê.** 0 testes de tela, 2 testes de store, 6/13 report-generators sem teste. Sem baseline, o sweep das 44 telas (D5) é uma regressão cega.

**Entrega.**
- **Snapshot + smoke render** das telas que D5 vai redesenhar (beachhead primeiro): `TransferMarketScreen`, `FreeAgentsScreen`, depois Home/Squad/PlayerDetail/Tactics/Reports/Club. Render via `react-test-renderer` (ou `@testing-library/react-native` se adicionado como devDep) com store/db reais em memória — **nunca** mock de DB (`better-sqlite3`, regra do CLAUDE.md). Snapshot serve de detector de drift; a asserção real é "renderiza sem throw + contém os textos i18n esperados".
- **Testes de `game-store` e `database-store`**: ciclos de init/save/load, `playerClub`/`playerClubId`/`currentSave` derivados, isolamento por `saveId`.
- **6 report-generators faltantes** (`__tests__/engine/reports/{contract-alerts,free-agent-scout,line-efficiency,morale-report,opponent-report,transfer-roi-report}.test.ts`): golden path + edge (sem jogadores, sem fixtures, save vazio), seguindo o padrão dos 4 existentes (`youth-report.test.ts` etc.). Determinismo: mesma seed/save = mesmo relatório.
- **Tokens v2 + tipografia**: testes puros (ver §D1/§D2/§7).

**DoD.** Suite verde antes de qualquer edição de D1+. Todas as telas-alvo de D5 têm ao menos smoke test. 13/13 report-generators com teste. `npm test` e `npx tsc --noEmit` verdes.

**Risco.** Snapshots flaky se o render depender de `Date.now`/random — mitigado usando `SeededRng` no setup e congelando inputs. Telas que dependem de navegação exigem wrapper `NavigationContainer` no teste.

**Tamanho.** G (maior workstream depois de D5). ~10–14 arquivos de teste novos.

---

## D1 — Tokens v2 (rampas, elevação, espaçamento, raio, motion)

**Por quê.** `tokens.ts` é chapado: sem rampa de neutros/accent, sem elevação, escala de espaçamento sem ritmo, sem motion.

**Entrega.** Estender `src/theme/tokens.ts` (puro, sem RN — `tokens.ts:1-3`) e re-exportar de `src/theme/index.ts`:
- **Rampa de neutros** `neutral` 50→900 derivada dos surfaces atuais (`#0f0f1a`…`#252540` como âncoras), mantendo `background/surface/surfaceLight` como aliases retrocompatíveis para não quebrar consumidores existentes.
- **Rampa de accent** (helper, não estático): `deriveAccentRamp(accent)` → `{ dim, base, bright, on }` via `mixWithWhite`/shade (reusa `club-accent.ts:23-27`).
- **Elevação**: `elevation` token map `{ e0, e1, e2, e3 }` com `{ shadowColor, shadowOpacity, shadowRadius, shadowOffset, elevation }` (Android `elevation` + iOS/web shadow).
- **Espaçamento com ritmo**: manter chaves atuais (`xxs..xl`), adicionar `xxl: 48`, documentar base-4/8 ratio.
- **Raio**: manter `radius` (`tokens.ts:50`), garantir cobertura dos valores em uso (4/8/12/20/999).
- **Motion**: `motion = { duration: { fast: 120, base: 200, slow: 320 }, easing: { standard, decelerate, accelerate } }` (curvas como tuplas bezier; sem dependência de Reanimated nos tokens puros).

**DoD.** Tokens novos exportados de `@/theme`; aliases antigos preservados; teste `__tests__/theme/tokens.test.ts` estendido (rampa monotônica de luminância, elevação crescente, motion durações ordenadas). Zero `Math.random`/`Date.now` (tokens são constantes).

**Risco.** Quebrar consumidores de `colors.background/surface` — mitigado por aliases. Sombra no RN Web difere de native — validar no browser.

**Tamanho.** M.

---

## D2 — Tipografia (expo-font + componentes semânticos de texto)

**Por quê.** `fontSize` é número cru sem família; UI usa fonte de sistema; números/stats não têm tratamento tabular.

**Entrega.**
- **Adicionar dependência** `expo-font` (NÃO instalada — confirmado ausente em `package.json:14-31`). `react-native-svg` já está (`package.json:28`). Carregar **Manrope** (UI) e **Saira Condensed** (números/stats) via `useFonts`/`Font.loadAsync`; gate de render em `App.tsx` (ao lado do `isReady` de `database-store`, `App.tsx:11-36`) com `LoadingScreen` enquanto fontes carregam.
- **Componentes semânticos** em `src/components/typography/` (ou `src/components/Text.tsx`): `<Display/>`, `<Headline/>`, `<Title/>`, `<Subheading/>`, `<Body/>`, `<Label/>`, `<Caption/>` (Manrope) e `<Stat/>` (Saira Condensed, `fontVariant: ['tabular-nums']`). Cada um lê size/lineHeight/weight/family dos tokens v2.

**DoD.** Fontes carregam no web (`localhost:8082`) e fallback de sistema não quebra se falhar. Componentes de texto cobertos por teste de render + snapshot. `App.tsx` não pisca FOUT visível (gate de fonte). i18n inalterado.

**Risco.** `expo-font` + bundle web: garantir assets em `assets/fonts/` e config no `app.json`. FOUT/flash — gate de render mitiga.

**Tamanho.** M.

---

## D3 — Kit de componentes

**Por quê.** Sem kit, cada tela reimplementa card/botão/badge com literais (`FreeAgentsScreen.tsx:305-577`).

**Entrega.** Em `src/components/`:
- **Card** com variantes `hero` / `summary` / `detail` + elevação (substitui `SectionCard.tsx` e os `playerRow`/`playerCard` inline).
- **Button** com variantes (`primary`/`secondary`/`ghost`/`danger`) e estados (default/press/disabled/loading), recebendo accent do clube (D4).
- **Chip / Filter** (substitui os dropdown/`yearChip` de `FreeAgentsScreen.tsx:521-541` e o filtro de posição de `TransferMarketScreen.tsx:283-299`).
- **Badge** preenchido (evolui `ValueBadge.tsx` de outline para fill com `tone`).
- **StatBar** com **gradiente** (evolui `StatBar.tsx:47-50` de cor sólida para `LinearGradient`/SVG gradient, mantendo a API `{label,value,maxValue}`).
- **TabIndicator** (sublinhado/pill ativo com accent).
- **Modal / Sheet** padronizados (consolida o backdrop/sheet de `FreeAgentsScreen.tsx:436-451` e o overlay de `OnboardingModal.tsx:51-64`/`ContextualHint.tsx:73-85`).
- **Skeleton** (placeholder shimmer para loaders, substitui `ActivityIndicator` solto).
- **Toast** reutilizável (generaliza `AchievementToast.tsx`).
- **Icon SVG** — set de ícones via `react-native-svg` que aceita `color`/`size` (substitui emoji em TabNavigator, MatchEventItem, EmptyState, Onboarding).
- **EmptyState v2** — ilustração SVG + título + descrição + **CTA** (evolui `EmptyState.tsx:11-19`).
- **useConfirm** — hook + provider que renderiza um Modal de confirmação (substitui os 29 `Alert.alert` no-op-no-web). API: `const confirm = useConfirm(); await confirm({ title, message, confirmLabel, tone })` → `boolean`.

**DoD.** Cada componente tem teste de render + variantes + snapshot. `useConfirm` testado (resolve true/false). Kit consome só tokens de `@/theme` (zero literal). API documentada inline. Nenhuma tela ainda obrigada a migrar (isso é D5) — kit é aditivo.

**Risco.** `useConfirm` precisa de provider no topo (`App.tsx`) — ordem com `NavigationContainer`/`ErrorBoundary`. Gradiente no web vs native.

**Tamanho.** G.

---

## D4 — Motor de imersão de clube (fase 1)

**Por quê.** Accent só chega a 3 lugares (`TabNavigator`/`RootNavigator`/`ClubBanner`). Imersão exige accent em CTAs, abas, progresso, foco, destaques.

**Entrega.**
- **`ClubAccentProvider`** (React Context) memoizando a rampa de accent (D1 `deriveAccentRamp`) a partir de `useClubAccent()` (`useClubAccent.ts:5-14`), montado em `App.tsx` acima de `RootNavigator`.
- **`useClubAccent` estendido** para retornar a rampa completa `{ accent, accentDim, accentBright, onAccent }` (hoje só `{accent,onAccent}` — `club-accent.ts:1-4`), mantendo retrocompatibilidade.
- **Cabeamento**: Button `primary` (D3), TabIndicator/aba ativa, barras de progresso (XP/board trust/contrato), anel de foco de inputs/cards selecionados, e destaque de card "hero" passam a usar a rampa de accent.

**DoD.** Trocar de clube (cor diferente) re-tinge CTAs/abas/progresso/foco em todo o app sem reload. `useClubAccent` testado com clubes de cores claras/escuras (legibilidade `onAccent` via `luminance`, `club-accent.ts:17-21`). Engine intocado.

**Risco.** Accent ilegível em alguns clubes — `deriveClubAccent` já trata floor de luminância (`club-accent.ts:33-37`); estender o teste para a rampa. Re-render excessivo — memoizar no provider.

**Tamanho.** M.

---

## D5 — Sweep de aplicação nas 44 telas

**Por quê.** O kit (D3) e a imersão (D4) só entregam valor quando as telas migram.

**Entrega.** Migrar telas para o kit, em ordem de impacto, **uma tela por commit**, cada uma protegida pelos testes de D0:
1. **Beachhead `TransferMarketScreen`** — ritmo de card (Card `detail`, Chip de filtro, Button accent, Stat para OVR/valor).
2. **`FreeAgentsScreen`** — EmptyState v2 ilustrado + CTA; Sheet padronizado; `useConfirm` no lugar dos `Alert.alert` (`FreeAgentsScreen.tsx:126,130`).
3. **Core**: Home, Squad (`SquadListScreen` + `PlayerCard`), PlayerDetail, Tactics, Reports (hub + 10 telas, mantendo a paleta `report*` de `tokens.ts:23-33`), Club (overview + sub-telas).
4. Restante das telas + remoção de todos os emoji-como-ícone e dos 29 `Alert.alert`.

**DoD.** Snapshots de D0 atualizados conscientemente (diff revisado). Zero `Alert.alert` restante (`grep` = 0). Zero emoji-como-ícone em código de UI. Zero literal de padding/margin/radius/fontSize novo nas telas migradas (tudo via tokens). Browser validado por tela (Playwright MCP).

**Risco.** Maior workstream; risco de regressão visual — snapshots + validação browser por tela. Fatiar para evitar PR gigante.

**Tamanho.** XG (fatiado em ~44 commits pequenos).

---

## D6 — Motion & polish

**Por quê.** Tokens de motion (D1) sem aplicação não geram a sensação "premium".

**Entrega.**
- **Press-scale** nos pressables do kit (Button/Card/Chip) via Reanimated (`react-native-reanimated` já em `package.json:25`).
- **Transições** de tela/sheet usando `motion.duration`/`easing`.
- **Skeletons** nos loaders (substituem `ActivityIndicator` em listas — Transfer/FreeAgents/Squad).
- **Micro-celebrações**: animação ao subir overall (overall↑), troféu conquistado, transferência fechada.
- **Haptics** como substituto de áudio (adicionar `expo-haptics`) — feedback em CTAs/celebrações; respeita toggle de Settings (D7).

**DoD.** Todas as animações respeitam `reduce-motion` (D7) — quando ligado, viram no-op/fade curto. Haptics só em native (no-op no web). Determinismo do engine intocado (motion é puramente de UI). Testado que `reduce-motion` desliga animações.

**Risco.** Reanimated no web; haptics indisponível no web (degradar graciosamente). Celebrações não podem bloquear input.

**Tamanho.** M.

---

## D7 — Acessibilidade + tela de Settings global

**Por quê.** Snapshots/integração de D0 dependem de `testID`/`accessibilityLabel` estáveis; e motion/haptics/idioma precisam de um lar de configuração.

**Entrega.**
- **`accessibilityLabel` + `testID`** nos componentes do kit (D3) e nas telas migradas (D5) — habilita queries estáveis em D0.
- **Tela de Settings** (`src/screens/SettingsScreen.tsx`, registrada em `RootNavigator`): idioma (reusa `changeLanguage`, `persistence.ts:14-17`), reduce-motion, haptics on/off, tamanho de fonte (escala tipográfica D2), dificuldade. Persistência via `app_settings` (`schema.ts:448-451`) usando `getSetting/setSetting` (`queries/settings.ts:3-13`) — **sem nova tabela** (key-value já existe). Um `settings-store` (Zustand) expõe os toggles para os componentes (motion/haptics/fontScale).

**DoD.** Settings persiste e reidrata no boot (ao lado de `loadPersistedLanguage`, `App.tsx:18-22`). reduce-motion desliga D6. fontScale re-renderiza tipografia. `testID`/labels presentes nas telas-alvo de D0. i18n pt/en das novas strings com paridade (`parity.test.ts`).

**Risco.** `app_settings` é global (sem `save_id`) — correto para preferências de app (idioma já é assim). Dificuldade pode ter overlap com save — manter só a preferência default aqui, não mexer em save existente.

**Tamanho.** M.

---

## D8 — Marca & identidade

**Por quê.** Nome ainda é o placeholder "football-manager" (`package.json:2`); sem logo/ícone/splash coesos a imersão fica incompleta.

**Entrega.**
- **Logotipo, ícone de app, splash screen** alinhados ao Premium Imersivo (assets em `assets/`, config em `app.json`).
- **Guidelines** curtas (uso de logo, cor, tipografia) em `docs/`.
- **Gerador de escudo fictício** (SVG determinístico via `SeededRng`, `src/engine/rng`) — semente da imersão fase 3 (clube com identidade visual própria). Determinístico: mesma seed = mesmo escudo.
- Nome do produto: documentar como placeholder a ser definido (não inventar marca final aqui).

**DoD.** Splash/ícone aparecem no boot. Gerador de escudo testado (determinismo + variedade por seed). Zero `Math.random`/`Date.now` no gerador.

**Risco.** Nome/marca é decisão de produto — manter placeholder e não bloquear o resto do épico. Escudo SVG complexo pode pesar — limitar a formas simples na fase 1.

**Tamanho.** M.

---

## 3. Architecture & components

Engine permanece **puro** (sem React/Expo) — o épico só toca `src/theme/`, `src/components/`, `src/screens/`, `src/navigation/`, `App.tsx`, e adiciona o gerador de escudo em `src/engine/` (puro, via `SeededRng`).

| Arquivo | Criar/Alterar | Responsabilidade |
|---|---|---|
| `src/theme/tokens.ts` | Alterar | Rampa neutros/accent, `elevation`, `motion`, `spacing.xxl`, tipografia (size/lineHeight/weight/family) |
| `src/theme/index.ts` | Alterar | Re-exportar tokens v2; `commonStyles` migra p/ tokens novos |
| `src/theme/club-accent.ts` | Alterar | `deriveAccentRamp(accent)` reusando `mixWithWhite`/`luminance` |
| `src/theme/useClubAccent.ts` | Alterar | Retornar rampa `{accent,accentDim,accentBright,onAccent}` |
| `src/theme/ClubAccentProvider.tsx` | Criar | Context memoizando a rampa (D4) |
| `src/components/typography/*` | Criar | `Display/Headline/Title/Subheading/Body/Label/Caption/Stat` (D2) |
| `src/components/Card.tsx` | Criar | Variantes hero/summary/detail + elevação |
| `src/components/Button.tsx` | Criar | Variantes/estados + accent |
| `src/components/Chip.tsx`, `Badge.tsx`, `Skeleton.tsx`, `Toast.tsx`, `Sheet.tsx`, `TabIndicator.tsx` | Criar | Kit |
| `src/components/Icon/*` | Criar | Ícones SVG (`react-native-svg`) |
| `src/components/EmptyState.tsx` | Alterar | v2 ilustrado + CTA |
| `src/components/StatBar.tsx` | Alterar | Gradiente |
| `src/components/ValueBadge.tsx` | Alterar | Migra p/ `Badge` preenchido |
| `src/components/useConfirm.tsx` | Criar | Hook + provider de confirmação (substitui Alert) |
| `src/screens/SettingsScreen.tsx` | Criar | Idioma/reduce-motion/haptics/fontScale/dificuldade (D7) |
| `src/store/settings-store.ts` | Criar | Zustand: toggles de motion/haptics/fontScale |
| `src/engine/identity/crest-generator.ts` | Criar | Escudo SVG determinístico (`SeededRng`) (D8) |
| `App.tsx` | Alterar | Gate de fonte (D2), `ClubAccentProvider`+`ConfirmProvider` (D3/D4), reidratar settings (D7) |
| `package.json` / `app.json` | Alterar | `expo-font`, `expo-haptics`; assets de fonte/ícone/splash |

**Contract (assinaturas TS exatas):**

```ts
// src/theme/club-accent.ts (estende o existente; ClubAccent atual: {accent,onAccent})
export interface ClubAccentRamp {
  accent: string;       // base derivado (= ClubAccent.accent atual)
  accentDim: string;    // shade p/ press/disabled
  accentBright: string; // tint p/ hover/destaque
  onAccent: string;     // texto legível sobre accent (= ClubAccent.onAccent atual)
}
export function deriveAccentRamp(accent: string): ClubAccentRamp;

// src/theme/useClubAccent.ts (retorno passa de ClubAccent p/ ClubAccentRamp)
export function useClubAccent(): ClubAccentRamp;

// src/theme/tokens.ts (novos)
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

// src/components/useConfirm.tsx
export interface ConfirmOptions {
  title: string; message?: string;
  confirmLabel?: string; cancelLabel?: string;
  tone?: 'default' | 'danger';
}
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean>;
export function ConfirmProvider(props: { children: React.ReactNode }): JSX.Element;

// src/components/StatBar.tsx (API preservada)
export default function StatBar(props: { label: string; value: number; maxValue?: number }): JSX.Element;

// src/components/Button.tsx
export function Button(props: {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean; disabled?: boolean;
  onPress: () => void; testID?: string; accessibilityLabel?: string;
}): JSX.Element;

// src/store/settings-store.ts
interface SettingsState {
  reduceMotion: boolean; haptics: boolean; fontScale: number;
  setReduceMotion(v: boolean): void; setHaptics(v: boolean): void; setFontScale(v: number): void;
  hydrate(db: DbHandle): Promise<void>;
}

// src/engine/identity/crest-generator.ts (puro, determinístico)
export interface Crest { paths: { d: string; fill: string }[]; viewBox: string; }
export function generateCrest(rng: SeededRng): Crest;
```

---

## 4. Data flow

- **Tokens** (D1/D2): import-time, estáticos. `tokens.ts` → `index.ts` → componentes/telas. Sem store.
- **Accent do clube** (D4): `game-store.playerClub` (`useClubAccent.ts:6`) → `deriveAccentRamp` (memo no `ClubAccentProvider`) → consumido por kit/telas. Troca de clube = novo `playerClub` → nova rampa → re-tinge a árvore.
- **Confirmação** (D3): tela chama `useConfirm()` → enfileira no `ConfirmProvider` → Modal renderiza → promessa resolve `true/false` no clique. Substitui o fluxo `Alert.alert` (que era no-op no web).
- **Settings** (D7): boot → `settings-store.hydrate(db)` lê `app_settings` (`getSetting`, `queries/settings.ts:3`) → toggles em memória. Toggle na tela → `setX` + `setSetting` persiste. `reduceMotion`/`haptics`/`fontScale` consumidos por D6/D2.
- **Escudo** (D8): `SeededRng` (seed do save) → `generateCrest` → SVG. Mesma seed = mesmo escudo (determinístico, sem `Math.random`).

---

## 5. Schema changes

**Nenhuma tabela nova.** Settings (D7) reusam `app_settings` (key-value já existente, `schema.ts:31,448-451`) via `getSetting/setSetting` (`queries/settings.ts:3-13`), com chaves novas: `reduce_motion`, `haptics`, `font_scale`, `difficulty_default` (todas globais, não por `save_id` — como `language` já é, `persistence.ts:8`). Por serem aditivas key-value, **não** exigem alteração de DDL em `schema.ts` nem em `database-store.ts`.

Se, na implementação de D7, decidir-se materializar colunas tipadas em vez de key-value (não previsto aqui), aí sim a coluna iria em **ambos** `src/database/schema.ts` e `src/database/database-store.ts`, com query recebendo `(db, saveId, ...)` e respeitando `SAVE_ID_STRIDE` — mas o design escolhido evita isso. Sem índices novos. Sem `ORDER BY RANDOM`.

---

## 6. Error handling & edge cases

- **Fonte falha ao carregar** (D2): gate de render cai para fonte de sistema; não white-screen. `App.tsx` mantém o fallback do `ErrorBoundary` (`App.tsx:51-53`).
- **Accent ilegível** (D4): `deriveClubAccent` já garante floor de luminância (`club-accent.ts:33-37`); a rampa estende com clamps. Clube nulo → `DEFAULT_ACCENT` (`club-accent.ts:32`).
- **`useConfirm` sem provider** (D3): lançar erro claro em dev (provider obrigatório no topo).
- **Haptics no web** (D6): `expo-haptics` no-op no web — guard por `Platform.OS`.
- **reduce-motion** (D6/D7): toda animação checa o flag; quando ligado, transições viram fade curto/no-op.
- **Settings ausente no boot** (D7): chaves faltando → defaults (reduceMotion=false, haptics=true, fontScale=1) — espelha `loadPersistedLanguage` que mantém default 'pt' (`persistence.ts:8-10`).
- **Snapshot drift** (D0): inputs determinísticos (`SeededRng`), sem `Date.now`; navegação envolvida em wrapper de teste.
- **Escudo degenerado** (D8): seeds extremas não podem gerar SVG vazio — garantir ao menos 1 path.

---

## 7. Testing strategy

TDD obrigatório em código de lógica (theme puro, report-generators, store, crest-generator) — escrever teste antes. UI valida render + browser.

- **D0 report-generators** (`better-sqlite3` real em memória, nunca mock): para cada um dos 6, golden (save populado → relatório esperado) + edge (save vazio, sem fixtures, sem jogadores) + determinismo (mesma seed/save = saída idêntica). Padrão dos 4 existentes (`__tests__/engine/reports/youth-report.test.ts`).
- **D0 stores**: `game-store`/`database-store` com DB real — init/save/load, derivados (`playerClub`, `currentSave`), isolamento por `saveId`.
- **D0 telas**: smoke render + snapshot das telas-alvo de D5; asserção "renderiza sem throw + contém textos i18n".
- **D1 tokens**: rampa de neutros monotônica em luminância; `deriveAccentRamp` legível para accents claros/escuros; `elevation` crescente; `motion.duration` ordenado.
- **D2 tipografia**: render de cada componente de texto + snapshot; fontScale altera tamanho.
- **D3 kit**: cada componente — variantes/estados/snapshot. `useConfirm` resolve `true` (confirma) e `false` (cancela/dismiss).
- **D4 imersão**: `useClubAccent` com clubes de cores diversas (legibilidade `onAccent`).
- **D6 motion**: reduce-motion ligado → animações no-op (assertável via flag).
- **D8 escudo**: determinismo (mesma seed = mesmo `Crest`) + variedade entre seeds + ao menos 1 path.

Casos golden + edge em todos. Browser (Playwright MCP) por tela migrada em D5. `npm test` + `npx tsc --noEmit` verdes a cada workstream.

---

## 8. Dependencies & sequencing

**Ordem dura:** D0 (gate) → D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8. D3 depende de D1/D2 (tokens+tipografia). D4 depende de D1 (rampa). D5 depende de D3/D4 (kit+imersão). D6 depende de D1 (motion) e D7 (reduce-motion) — D7 pode preceder o cabeamento final de D6 (ou expor o flag cedo). D8 é independente do resto e pode correr em paralelo após D0.

**Relação com outros épicos:** este é o épico keystone (`2026-06-20-design-system-premium-design.md`). Specs de carreira (pós-MVP) devem referenciar o **kit** (Card/Button/StatBar/Text/Icon/EmptyState/Toast/useConfirm) e os tokens v2, **não** estilos inline crus. D3/D4 são pré-requisito visual dessas specs.

**Dependências de pacote a adicionar:** `expo-font` (D2, ausente em `package.json:14-31`) e `expo-haptics` (D6). `react-native-svg` (`package.json:28`) e `react-native-reanimated` (`package.json:25`) já presentes.

**Alternativas de fonte (decidir na implementação de D2):**
- **UI:** Inter (neutra, ampla), **Manrope (escolhida — geométrica, "premium", boa em números inline)**, Sora (display-ish, mais marcante).
- **Números/stats condensados:** Archivo (Narrow), **Saira Condensed (escolhida — esportiva, tabular)**, Barlow (Semi/Condensed), Oswald (mais agressiva). Escolha: **Manrope + Saira Condensed**; fallbacks listados caso peso de bundle/licença bloqueie.

**Regra identidade=clube / ação=accent (revisada).** A epic `2026-05-31-theme-consistency-design.md` fixou "identidade = accent do clube; **ação = azul** (`colors.primary`)" para previsibilidade entre clubes (`index.ts:15-17`). Com o Premium Imersivo, **a regra muda**: CTAs/ações passam a usar a **rampa de accent do clube** (Button `primary`, abas, progresso, foco, destaque). Justificativa: imersão "clube no centro" exige que a ação principal carregue a identidade; previsibilidade é preservada por **forma+posição+label** consistentes (não pela cor) e por estados derivados da rampa (dim/bright). `colors.primary` deixa de ser a cor de ação default e vira só um neutro de informação/legado. **Documentar a virada** no comentário de `commonStyles.button` (`index.ts:15-17`) e nesta seção; rating/posição (`tokens.ts:35-45`) permanecem semânticos e independentes do clube.

---

## 9. Out of scope

- **Tema claro / light mode** e tema colorblind real — tokens v2 deixam pronto (rampas semânticas), mas o toggle não é implementado.
- **Imersão fase 2/3** (estádio, atmosfera, identidade visual completa do clube além do escudo SVG fase-1).
- **Áudio/música** — substituído por haptics nesta fase.
- **Reescrita do engine/regras de jogo** — épico é apresentação + settings key-value; engine só ganha o gerador de escudo puro.
- **Marca/nome final do produto** — placeholder "football-manager" mantido (decisão de produto).
- **Migração de `app_settings` para colunas tipadas** — mantém-se key-value.
- **i18n de domínio novo** além das strings de Settings/kit — épicos próprios.

---

## 10. Spec self-review

- **Placeholder scan:** sem "TBD"/"???"/placeholder não resolvido. "Placeholder" só aparece como fato de produto (nome = "football-manager", `package.json:2`).
- **Refs de código verificadas (file:line real):** `tokens.ts:5-46,48,49,50`; `index.ts:8-20,15-17,23-33`; `club-accent.ts:1-4,17-21,23-27,29-39,32-37`; `useClubAccent.ts:5-14`; `alpha.ts`; `TabNavigator.tsx:18,26,32-61`; `RootNavigator.tsx:53,58`; `ClubBanner.tsx:9,12`; `StatBar.tsx:39-50,47-50`; `EmptyState.tsx:11-19,14,28`; `ValueBadge.tsx`; `SectionCard.tsx`; `AchievementToast.tsx`; `OnboardingModal.tsx:12-17,51-64`; `ContextualHint.tsx:68,73-85`; `MatchEventItem.tsx:13-28`; `TransferMarketScreen.tsx:110,129,135,255-358,283-299`; `FreeAgentsScreen.tsx:126,130,305-577,436-451,521-541`; `SquadListScreen.tsx` (head); `App.tsx:11-36,18-22,51-53`; `package.json:2,14-31,25,28`; `schema.ts:31,448-451`; `queries/settings.ts:3-13`; `persistence.ts:8-10,14-17`.
- **Contagens verificadas:** 51 telas (`find src/screens -name '*.tsx'`); 0 `*.test.tsx`; 2 testes de store; 13 report-generators, 4 com teste → 6 faltantes confirmados por arquivo; 13 arquivos / 29 chamadas `Alert.alert`.
- **Consistência interna:** D0 é gate de D1+; D3 depende D1/D2; D5 depende D3/D4; a virada "ação=accent" é coerente entre §2, §D4 e §8 e marcada como mudança explícita vs. a epic 2026-05-31. Schema §5 confirma "sem tabela nova" e reconcilia com a regra "coluna nova vai em schema.ts + database-store.ts" (não aplicável pois usamos key-value). `useConfirm`/`StatBar`/`Button` assinaturas em §3 batem com §D3.
- **Determinismo:** crest-generator (D8) e snapshots (D0) usam `SeededRng`; zero `Math.random`/`Date.now`/`ORDER BY RANDOM` introduzido.
- **Aberto:** (a) escolha final Manrope vs Inter/Sora e Saira vs Archivo/Barlow/Oswald — listada, decidida como Manrope+Saira com fallbacks; (b) se `Sheet`/`Modal` viram um componente unificado ou dois — decidir em D3 conforme uso; (c) se `fontScale` (D7) altera tokens globalmente ou via context de tipografia — preferência por context para evitar mutar tokens puros.
