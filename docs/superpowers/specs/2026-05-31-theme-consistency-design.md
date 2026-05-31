# Design: Theme Consistency — tokens everywhere

**Epic:** `theme-consistency` · **Data:** 2026-05-31 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict

**Goal:** Toda cor, espaçamento, raio, fonte e alpha da UI passa a vir de tokens em `src/theme`; helpers de cor de jogador/rating viram um único módulo temático; a paleta de relatórios e o accent do clube passam a ser realmente usados, com regra explícita identidade=clube / ação=azul.

---

## 1. Problema / estado atual

Seis achados confirmados no gap-audit (`docs/audit/2026-05-31-gap-audit.md`), todos da dimensão `theme-consistency`:

- **#36 (HIGH) — Off-palette hex hardcoded e duplicado nos helpers de jogador/rating.** Os hexes `#f4a261` (GK), `#00e676` (≥85), `#ff9800` (40–59) **não existem** em `src/theme/index.ts` (confirmado contra linhas 3–32). As funções `getPositionColor`/`getOverallColor`/`getBarColor` estão copiadas em 4 arquivos: `src/components/PlayerCard.tsx:16-36`, `src/components/StatBar.tsx:11-17`, `src/screens/club/transfers/FreeAgentsScreen.tsx:47-59`, `src/screens/club/transfers/TransferMarketScreen.tsx:37-50`. Já driftaram: `FreeAgentsScreen.overallColor` (linha 54-58) **não tem** o tier `>= 40`, então um OVR 45–59 mostra `colors.danger` ali e `#ff9800` em `PlayerCard`/`TransferMarketScreen` — mesmo conceito, cor diferente por tela. Além disso `MatchResultScreen.tsx:122` retorna `'#06d6a0aa'` (= `colors.success` + alpha `aa` colado como string).

- **#63 (medium) — Paleta de relatórios definida mas ignorada por cada tela.** `src/theme/index.ts:21-31` define 10 tokens `report*` (`reportTechnical`, `reportRadar`, etc.). **Só** `ReportsHubScreen.tsx` os usa (passa `accent={colors.reportX}` para os cards, linhas 111–177). Dentro de cada tela de relatório o accent some: `ReportsTechnicalScreen.tsx:123,141` usa `colors.primary` em `ActivityIndicator`/`RefreshControl`, idem nas demais. A identidade visual de cada relatório existe no hub e evapora ao entrar.

- **#64 (medium, large) — Números mágicos de spacing/radius/font pervasivos.** Contagem real no `src` (`.tsx`): **169** literais `padding*/margin*: <n>`, **187** `borderRadius: <n>`, **35** `fontSize: <n>`. Exemplos: `PlayerCard.tsx:97` (`marginTop: 2`), `PlayerCard.tsx:102` (`borderRadius: 20`), `RadarChart.tsx:137` (`fontSize={8}`), `BoardScreen.tsx:95` (`fontSize: 56`), `BoardScreen.tsx:101` (`borderRadius: 4`). Escalas `spacing`/`fontSize` existem (`index.ts:34-35`) mas são contornadas.

- **#65 (medium) — CTAs e accents de gráfico ficam azul fixo; accent do clube só alcança a chrome.** `deriveClubAccent` (`src/theme/club-accent.ts`) só é consumido em `TabNavigator.tsx:15` (`tabBarActiveTintColor`), `RootNavigator.tsx:35` (`headerTintColor`) e `ClubBanner.tsx:9`. CTAs (`commonStyles.button`, `index.ts:44`) e accents de gráfico (`RadarChart` default, ratings) usam `colors.primary` estático. Não há regra documentada de onde o accent deve chegar.

- **#75 (low) — Alpha ad-hoc por concatenação de string.** 8 ocorrências de `colors.X + 'NN'`: `ReportsOpponentScreen.tsx:208-210,254`, `ReportsRadarScreen.tsx:311`, `ReportsProjectionScreen.tsx:386`, `AssistantsScreen.tsx:206`, `HomeScreen.tsx:880`. Frágil (depende de hex 6-dígitos, quebra com nomes de cor) e não testável.

- **#76 (low, trivial) — Fallback morto `colors.border ?? '#333'` com valores divergentes.** `BoardScreen.tsx:102` (`colors.border ?? '#333'`) e `:107` (`colors.border ?? '#222'`). `colors.border` é sempre `'#2a2a45'` (`index.ts:16`), então o `??` é inalcançável e os fallbacks (`#333`/`#222`) são cores-fantasma divergentes.

---

## 2. Approach

Centralizar tudo em `src/theme`: adicionar os tokens semânticos faltantes (cores de posição, rampa de rating, paleta já existente reaproveitada) e um helper `alpha()` puro, extrair os helpers duplicados para **um** módulo temático `src/theme/rating-colors.ts`, e fazer um sweep mecânico trocando literais por tokens nas telas tocadas. **Alternativa descartada:** colocar os helpers em `src/utils/ratingColors.ts` (sugestão do audit) — preferimos `src/theme/` porque as funções dependem direto de `colors`/`alpha` e o resto do tema já mora lá (`club-accent.ts`, `useClubAccent.ts`), mantendo um único ponto de verdade visual. Para o accent do clube, adotamos a regra **identidade = accent do clube; ação = azul (`colors.primary`)**: o accent fica na chrome/identidade (headers, tab ativa, banner) e a cor de cada relatório vem do seu token `report*`; CTAs de ação destrutiva/confirmação seguem azul para previsibilidade.

---

## 3. Architecture & components

Engine permanece **intocado e puro** — esta epic só mexe em `src/theme/` e camada de UI (`components/`, `screens/`, `navigation/`).

### Novos / alterados em `src/theme/`

| Arquivo | Responsabilidade | Interface |
|---|---|---|
| `src/theme/index.ts` (alterar) | Fonte única de tokens. Adiciona cores de posição + rampa de rating + helper `alpha`. | ver §3.1 |
| `src/theme/rating-colors.ts` (criar) | Único módulo com `getPositionColor`, `getOverallColor`, `getBarColor`. Puro, sem React. | `getPositionColor(p: Position): string`, `getOverallColor(overall: number): string`, `getBarColor(value: number): string` |
| `src/theme/club-accent.ts` (sem mudança lógica) | Já deriva accent; permanece. Opcional: reaproveitar `parseHex` interno via `alpha` (ver §7). | inalterado |

#### 3.1 Tokens novos em `index.ts`

Adicionar à `colors` (semânticos, substituindo os off-palette por valores **on-palette** existentes ou novos tokens nomeados):

```ts
// Position badge colors (semantic; were hardcoded per-helper)
positionGK: '#f4a261',        // promovido de literal para token nomeado
positionDef: '#4361ee',       // = primary
positionMid: '#06d6a0',       // = success
positionAtk: '#f72585',       // = accent
// Overall/stat rating ramp (semantic; were #00e676 / #ff9800 literals)
ratingElite: '#00e676',       // ≥85  (promovido a token)
ratingGood: '#06d6a0',        // ≥75  (= success)
ratingAverage: '#ffd166',     // ≥60  (= warning)
ratingPoor: '#ff9800',        // ≥40  (promovido a token)
ratingBad: '#ef476f',         // <40  (= danger)
```

> Nota: `positionDef/Mid/Atk` e `ratingGood/Average/Bad` reusam o **valor** de `primary/success/warning/danger` mas ganham nome semântico — assim um re-skin de paleta de acessibilidade só edita esses tokens. `positionGK`, `ratingElite`, `ratingPoor` eram off-palette e passam a ser tokens de primeira classe (decisão: mantê-los como cores distintas, não colapsar em `accent`/`success`, para preservar a distinção visual atual).

Adicionar helper `alpha` (exportado de `index.ts`):

```ts
// Aplica opacidade a um hex 6-díg, retornando #RRGGBBAA. t ∈ [0,1].
export function alpha(hex: string, t: number): string;
```

Implementação: clampa `t`, converte para 2-díg hex, anexa. Reusa `parseHex`/validação de `club-accent.ts` (extrair `parseHex` para um helper interno compartilhado, ou duplicar a normalização mínima — decisão em §7).

### Alterações de UI

| Arquivo | Mudança |
|---|---|
| `src/components/PlayerCard.tsx` | Remover `getPositionColor`/`getOverallColor` locais (16-36); importar de `@/theme/rating-colors`. Trocar `marginTop: 2`→`spacing.xs/2`? **não** (xs=4); manter via novo token `spacing.xxs`? Ver §3.2. `borderRadius: 20`→token de raio. |
| `src/components/StatBar.tsx` | Remover `getBarColor` local (11-17); importar. `borderRadius: 3`, `height: 6`, `width: 90/26`→raios/dimensões via token onde aplicável. |
| `src/components/RadarChart.tsx` | `fontSize={8}`→`fontSize.xs` (=10) ou novo `fontSize.micro`; `borderRadius: 5`→token; default profile color via param do chamador (accent de relatório). |
| `src/screens/club/transfers/FreeAgentsScreen.tsx` | Remover `positionColor`/`overallColor` locais (47-59) — **corrige o drift do tier ≥40**; importar de `@/theme/rating-colors`. |
| `src/screens/club/transfers/TransferMarketScreen.tsx` | Remover `getPositionColor`/`getOverallColor` locais (37-50); importar. |
| `src/screens/home/MatchResultScreen.tsx` | `getRatingColor` (120-125): trocar `'#06d6a0aa'`→`alpha(colors.success, 0.67)` (aa≈0.667). |
| `src/screens/reports/*` (10 telas) | Cada tela recebe sua cor de categoria: trocar `colors.primary` em `ActivityIndicator`/`RefreshControl tintColor`/links pelo token `report*` correspondente (mapa em §4). Trocar concatenação de alpha por `alpha()`. |
| `src/screens/club/BoardScreen.tsx` | Remover `?? '#333'`/`?? '#222'` (102,107) — usar `colors.border` direto. `borderRadius: 4`, `fontSize: 56`→tokens. |
| Demais telas com alpha-concat | `HomeScreen.tsx:880`, `AssistantsScreen.tsx:206`, `ReportsProjectionScreen.tsx:386` → `alpha()`. |

#### 3.2 Escalas de spacing/radius/font

Não inventar framework. Estender as escalas existentes com os degraus que faltam para cobrir os literais reais, e fazer sweep:

- `spacing`: adicionar `xxs: 2` (cobre `marginTop: 2`) — `xs` já é 4, `sm` 8, `md` 16, `lg` 24, `xl` 32.
- `radius` (novo objeto, hoje raios são literais soltos): `export const radius = { sm: 4, md: 8, lg: 12, pill: 20, round: 999 };` — cobre os 4/8/12/20 mais comuns (`commonStyles.card`=12, `.button`=8, `PlayerCard.overallBadge`=20).
- `fontSize`: adicionar `micro: 8` (RadarChart) e `display: 56` (BoardScreen bigNumber) **se** aparecerem ≥2×; caso 1×, decidir caso a caso (não criar token de uso único — regra anti-over-engineering do CLAUDE.md).

O sweep dos ~169 padding/margin + ~187 borderRadius + 35 fontSize é **mecânico e amplo**; será fatiado por diretório (components → navigation → screens/reports → screens/club → screens/home → screens raiz) em commits pequenos, cada um type-checado.

---

## 4. Data flow

Tema é estático (sem store), então o "fluxo" é import-time:

1. `src/theme/index.ts` exporta `colors` (com tokens novos), `spacing`, `radius`, `fontSize`, `alpha`, `commonStyles`.
2. `src/theme/rating-colors.ts` importa `colors` e expõe os 3 helpers puros.
3. Componentes/telas importam de `@/theme` e `@/theme/rating-colors` — sem duplicação.
4. Accent do clube continua via `useClubAccent()` (store-derived, `playerClub.primaryColor/secondaryColor`) — **nenhuma** mudança de fluxo aqui; só documentamos onde ele se aplica.

**Mapa report-screen → token de categoria** (alinhar com `ReportsHubScreen.tsx:111-177`):

| Tela | Token |
|---|---|
| `ReportsTechnicalScreen` | `colors.reportTechnical` |
| `ReportsFinancialScreen` | `colors.reportFinancial` |
| `ReportsAnalyticsScreen` | `colors.reportAnalytics` |
| `ReportsYouthScreen` | `colors.reportYouth` |
| `ReportsRadarScreen` | `colors.reportRadar` |
| `ReportsOpponentScreen` | `colors.reportOpponent` |
| `ReportsTransferROIScreen` | `colors.reportROI` |
| `ReportsProjectionScreen` | `colors.reportProjection` |
| `ReportsFreeAgentScoutScreen` | `colors.reportScout` |
| (history) | `colors.reportHistory` |

A regra accent/azul:
- **Identidade (accent do clube):** header tint, tab ativa, `ClubBanner` — já é assim, mantém.
- **Identidade (categoria do relatório):** dentro de cada tela de relatório, indicadores/loaders/links usam o token `report*` da tabela acima (não `colors.primary`).
- **Ação (azul `colors.primary`):** botões de confirmação/CTA genéricos permanecem azul para previsibilidade entre clubes. Documentado como comentário em `commonStyles.button`.

---

## 5. Schema changes

**Nenhuma.** Esta epic é puramente de camada de apresentação (`src/theme` + UI). Não toca `src/database/schema.ts`, queries, nem migrations. Não depende de `save_id`, suspensões, `training_focus`, nem progressão de competições.

---

## 6. Error handling & edge cases

- `alpha(hex, t)`: clampar `t` a `[0,1]`; entrada inválida (não-hex) → retornar o hex original sem sufixo (degrada graciosamente, nunca lança). Hex de 3-díg → expandir antes (reusar `parseHex`).
- `getOverallColor`/`getBarColor`: cobrir limites de tier (84/85, 74/75, 59/60, 39/40) e fora de faixa (negativo, >99) — retorna `ratingBad`/`ratingElite` nos extremos.
- `getPositionColor`: toda `Position` mapeada; nenhum default silencioso errado (ST/LW/RW → `positionAtk`).
- Sweep de tokens: trocar literal por token de **valor idêntico** é no-op visual; onde o token mais próximo difere (ex.: `borderRadius: 3` em `StatBar` vs `radius.sm: 4`), documentar a escolha no diff e validar no browser — não forçar token se quebra layout fino (barras de 6px).

---

## 7. Testing strategy

TDD obrigatório em `src/theme/` (regra do CLAUDE.md: theme não é engine/db/store, mas é lógica pura testável e o audit pede consolidação correta). Jest + ts-jest, SQLite não se aplica (sem DB). Novo arquivo `__tests__/theme/rating-colors.test.ts` e estender `__tests__/theme/club-accent.test.ts` (já existe) ou criar `__tests__/theme/alpha.test.ts`.

**`rating-colors.test.ts`** (unit, puro):
- `getPositionColor`: GK→`positionGK`; CB/LB/RB→`positionDef`; CDM/CM/CAM/LM/RM→`positionMid`; ST/LW/RW→`positionAtk`. Cobre todas as 11 `Position`.
- `getOverallColor`: tabela de bordas — `84→ratingAverage`(? confirmar tiers), `85→ratingElite`, `75→ratingGood`, `74→ratingAverage`, `60→ratingAverage`, `59→ratingPoor`, `40→ratingPoor`, `39→ratingBad`, `0`/negativo→`ratingBad`, `99`→`ratingElite`.
- `getBarColor`: mesma tabela de tiers (deve ser idêntico a `getOverallColor` — teste garante que não driftam de novo).
- **Anti-regressão de drift (#36):** asserção explícita de que `getOverallColor(50)` é `ratingPoor` (e não `ratingBad`), provando que o tier ≥40 some-only-in-FreeAgents foi unificado.

**`alpha.test.ts`** (unit, puro):
- `alpha('#06d6a0', 0.67)` → `'#06d6a0aa'` (casa com o valor que `MatchResultScreen` produzia).
- `alpha('#ffffff', 0)` → `'#ffffff00'`; `t=1` → `'#ffffffff'`.
- `t` fora de faixa (−1, 2) → clampa.
- Hex inválido → retorna entrada sem sufixo, sem lançar.
- 3-díg (`'#fff'`) → expande para 6 antes de anexar alpha.

**Validação de UI (browser via Playwright MCP):** abrir telas tocadas que renderizam cor/rating (Squad/PlayerCard, Transfer Market, Free Agents, Match Result, cada Report, Board) e confirmar visualmente que cores e espaçamentos não regrediram. Type-check (`npx tsc --noEmit`) e `npm test` (62 suites baseline) devem ficar verdes; os novos testes somam suites.

---

## 8. Dependencies & sequencing

- **Independente de schema-siblings.** Não depende de `save-isolation`, `db-hardening`, `match-consequences`, `progression-wired`, `competitions-real` (sem mudança de DB).
- **Coordenação com `i18n-completion`:** toca as **mesmas telas** (transfers, reports, MatchResult, Board). Conflito de merge provável em StyleSheets/JSX. **Sequenciamento sugerido:** i18n primeiro (extrai strings, mexe em JSX de texto) e theme depois (mexe em `style={}`/cores), ou coordenar por arquivo. Se theme rodar antes, rebase i18n por cima é trivial pois as regiões editadas (texto vs estilo) raramente colidem. Documentar no PR qual telas já passaram por i18n.
- **Ordem interna:** (1) tokens + `alpha` + `rating-colors.ts` + testes; (2) trocar os 4 consumidores duplicados de helper (fecha #36); (3) MatchResult/alpha-concats (#75); (4) BoardScreen border morto (#76); (5) report palette por tela (#63); (6) accent rule + CTA doc (#65); (7) sweep spacing/radius/font fatiado (#64).

---

## 9. Out of scope

- Modo claro/dark switch, tema de acessibilidade/colorblind real — só **deixamos pronto** (tokens semânticos), não implementamos o toggle.
- Mover o accent do clube para CTAs/botões de ação (decisão de produto: ação permanece azul). Se o produto quiser accent em CTAs depois, é uma epic separada.
- Refatorar `commonStyles` em um design-system completo (variantes de botão, etc.) — fora do escopo; só adicionamos `radius` e degraus de escala.
- Qualquer mudança em `engine/`, `database/`, `store/` — esta epic não toca lógica de jogo.
- i18n das strings nas telas tocadas — é da epic `i18n-completion`.

---

## 10. Spec self-review

- **Placeholder scan:** sem "TBD"/"???"/placeholder. Contagens (169/187/35/8) e linhas (`PlayerCard.tsx:16-36`, `MatchResultScreen.tsx:122`, `BoardScreen.tsx:102,107`, `index.ts:21-31`) verificadas via grep/Read no código real.
- **Consistência interna:** `#06d6a0aa` ↔ `alpha(colors.success, 0.67)` confere (`aa` = 170/255 ≈ 0.667). Mapa report-screen→token alinha com `ReportsHubScreen.tsx:111-177`.
- **Ambiguidade resolvida inline:** (a) helpers vão para `src/theme/rating-colors.ts` (não `utils/`) — justificado em §2; (b) tiers de `getOverallColor` marcados "confirmar" em §7 porque os tiers exatos (≥85/75/60/40) vêm de `PlayerCard.tsx:30-35` e devem ser tomados como canônicos na implementação (o de `FreeAgentsScreen` é o bugado); (c) tokens de uso único (`fontSize.display`) só viram token se ≥2 usos — segue regra anti-over-engineering.
- **Aberto:** se `parseHex` deve ser exportado de `club-accent.ts` e reusado em `alpha`, ou duplicar a normalização mínima — preferência por extrair para evitar duplicação, decidir na implementação conforme acoplamento.
