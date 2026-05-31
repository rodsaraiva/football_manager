# Design: i18n Completion — all remaining screens + engine-generated text

**Data:** 2026-05-31
**Status:** Proposto
**Epic:** `i18n-completion`
**Goal:** Levar a cobertura de i18n de 7 telas para 100% das ~40 telas/modais, mais toda a navegação e todo o texto gerado pela engine (notícias, comentários de assistente, objetivos da diretoria), mantendo a engine pura (sem React) via um contrato chave+params traduzido no render.

---

## 1. Problema / estado atual

A infra de i18n (`src/i18n/translate.ts` puro + `useTranslation` hook + store `i18n-store` + persistência em `app_settings`) já existe e funciona, mas só 7 das 40 telas a usam (`MainMenuScreen`, `NewGameScreen`, `ClubOverviewScreen`, `HomeScreen`, `NewsScreen`, `ReportsHubScreen`, `TacticsScreen` — confirmado por `grep -rl useTranslation src/screens`). O resto é hardcoded — parte em inglês, parte em português — então o toggle PT/EN "quase não muda nada" (audit, veredito geral, linha 25). Achados do audit cobertos por este epic:

- **[HIGH] Entire transfer economy UI bypasses i18n** (`OffersReceivedScreen.tsx:181,225,294`, `OfferModal.tsx:126,167,199`, `FreeAgentsScreen.tsx:260`). Verifiquei `OfferModal.tsx:126` (`Make an Offer`), `:134/:142` (abas `Transfer`/`Loan`), `:167` (`Loan Fee`/`Transfer Fee`), `:177` (placeholder `Fee`), e 3 Alerts em `:98-106` (`Insufficient budget`, `Invalid fee`, `Invalid wage`) — todos literais inglês, nenhum import de `useTranslation` em qualquer dos 6 arquivos de `transfers/`.
- **[HIGH] News generator emits ~58 English-only strings** (`news-generator.ts`). Verifiquei: arquivo de 784 linhas, zero import de i18n; títulos/corpos hardcoded em `:96` (`holds top spot`), `:145` (`climbs to`/`drops to`), `:178` (`Thrashing`/`Goal fest`), `:294` (`Title race heats up`), `:316` (`Relegation battle`), `:484` (`Hat-trick hero`), `:528` (`wins in a row!`), `:643` (`Champions of the`). `ordinal()` em `:34-39` é só-inglês (`1st/2nd/3rd`). `NewsScreen.tsx:393-394` renderiza `item.title`/`item.body` direto.
- **[HIGH] Assistant comment generator: 41 hardcoded English templates** (`comment-generator.ts:17-114`). Verifiquei `SQUAD_TEMPLATES`/`FINANCIAL_TEMPLATES`/`YOUTH_TEMPLATES` = 3 roles × 6 archetypes × ~2-3 templates = 41 funções `(ctx) => "..."` inglês. `maybeGenerateComment()` (`:122`) não recebe idioma; é chamado de `game-loop.ts:690` (engine, sem React); o `text` resultante vai para `assistant-store` e é renderizado cru em `HomeScreen.tsx:321`.
- **[HIGH] Board objective descriptions generated/persisted in English** (`objective-generator.ts:33,55,61`). Verifiquei: `generateObjective()` embute strings inglês no campo `description` da `GeneratedObjective` (`Avoid relegation this season`, `Win the league championship`, etc.), persistido cru em `board_objectives.description` via `board.ts:55`, e renderizado direto em `BoardScreen.tsx:64`, `HomeScreen.tsx:347`, `EndOfSeasonScreen.tsx:669` — inglês mesmo onde o chrome ao redor já é traduzido (`HomeScreen.tsx:346` usa `t('home.objective_label')`).
- **Telas sem i18n nenhum:** Finances, Upgrades, Staff, Board, History, Calendar, EndOfSeason, MatchResult, StandingsScreen, CupBracket, TopScorers, YouthAcademy, TrainingScreen, TacticsSettings, Assistants, AssistantHiring (audit i18n veneer, linha 52). Confirmado: 33 telas sem `useTranslation`.
- **Reports detail screens hardcoded em português** — `ReportsTechnical/Financial/Analytics/Youth/Radar/Opponent/TransferROI/Projection/FreeAgentScout` (toggle pra EN não muda nada).
- **Navigation tab labels e stack header titles hardcoded e misturados.** Verifiquei `RootNavigator.tsx:43-76` (24 `title:` literais; `New Game`, `Finances` em inglês mas `Assistente Técnico`, `ROI de Transferências` em português) e `TabNavigator.tsx:27-47` (`Matches`, `News`, `Tactics`, `Club`, `Reports` inglês).
- **PlayerDetailScreen duplica attr keys hardcoded** (`PlayerDetailScreen.tsx:42-67`: `TECHNICAL_ATTRS`/`MENTAL_ATTRS`/`PHYSICAL_ATTRS` com labels inglês `Finishing`, `Passing`...). As 18 chaves `tactics.attr_*` já existem em `pt.ts:124-141` e cobrem exatamente os 18 campos de `PlayerAttributes` (`src/types/player.ts:3-25`) — então a tela deve reusar, não duplicar.
- **Season-summary / EndOfSeason mix hardcoded English com i18n** — `EndOfSeasonScreen.tsx` (874 linhas, sem `useTranslation`); inclui `FIRED — you have been dismissed.` e o texto de objetivo da próxima temporada.

Não-coberto por este epic (escopo de siblings): registrar telas órfãs no navegador (`navigation-screens`), o efeito de jogo do objetivo/board, a lógica de promoção. Aqui só localizamos o **texto**.

---

## 2. Abordagem

Estender o dicionário flat type-safe existente (`pt.ts`/`en.ts`, paridade garantida pelo tipo `Record<keyof typeof pt, string>` + `parity.test.ts`) para cobrir todas as telas, Alerts, placeholders e títulos de navegação — extração mecânica seguindo o padrão já estabelecido nas 7 telas core. Para texto gerado pela **engine pura** (notícias, comentários, objetivos), a engine emite um **descritor estruturado `{ key, vars }`** em vez de string traduzida; o componente React resolve via `translate(lang, key, vars)` no render. Alternativa rejeitada: injetar uma função `t` na engine (game-loop chama com locale resolvido) — funciona para o comentário de assistente (já vive na store), mas quebraria o determinismo do snapshot de notícias e acoplaria a engine ao idioma vigente no momento da simulação (errado se o jogador troca de idioma depois); o descritor estruturado mantém a engine pura, determinística e re-traduzível.

---

## 3. Arquitetura & componentes

Princípio invariável: **`src/engine/**` não importa React nem `useTranslation`** (confirmado: hoje zero imports de React na engine). A engine produz dados; a tela traduz.

### 3.1 Dicionário (estende infra existente — sem mudança estrutural)

| Arquivo | Responsabilidade | Mudança |
|---|---|---|
| `src/i18n/pt.ts` | Fonte de verdade das chaves + textos PT | Adiciona ~14 namespaces novos (ver §3.6). Mantém ordenação por namespace. |
| `src/i18n/en.ts` | Espelho EN, tipo `Record<keyof typeof pt, string>` força paridade em compile-time | Mesmas chaves, texto EN correto. |
| `src/i18n/translate.ts` | `translate(lang, key, vars)` puro (já existe) | **Sem mudança** — `TKey` cresce automaticamente de `keyof typeof pt`. |
| `__tests__/i18n/parity.test.ts` | Garante chaves idênticas em runtime (já existe) | **Sem mudança** — passa a cobrir as novas chaves automaticamente. |

### 3.2 Helper de ordinal localizado (novo, puro)

**Arquivo novo:** `src/i18n/ordinal.ts` (puro, sem React).

```ts
import { Language } from './types';
/** Ordinal localizado. EN: 1st/2nd/3rd/Nth. PT: 1º/2º/3º (masculino, "lugar"/"posição"). */
export function ordinal(lang: Language, n: number): string {
  if (lang === 'pt') return `${n}º`;
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}
```

Substitui o `ordinal()` privado de `news-generator.ts:34-39`. A engine **não chama** este helper diretamente (manteria pureza mas exigiria passar `lang` para a engine); em vez disso a engine emite a **posição numérica crua** como `var`, e o helper roda no render (ver §3.3).

### 3.3 Contrato estruturado para texto de engine

Tipo compartilhado novo em `src/i18n/translate.ts` (re-exportado por `src/i18n/index.ts`):

```ts
export interface TextDescriptor {
  key: TKey;
  vars?: Record<string, string | number>;
}
```

Os geradores da engine passam a retornar `TextDescriptor` (ou structs que o embutem) em vez de `string`. Três consumidores:

**(a) News — `src/engine/news/news-generator.ts`** (puro). `NewsItem` muda de `{ title: string; body: string }` para `{ title: TextDescriptor; body: TextDescriptor }`. Cada gerador (`generateHeadlines`, `generateHighScoringMatches`, `generateComeback`, `generateLeagueStories`, `generateRelevantTransfers`, `generateMatchStar`, `generateStreaks`, `generateSeasonRecap`, `generateRetirementNews`) emite chave + vars. Nomes de clube/jogador (próprios nomes — fora de escopo de tradução) continuam interpolados como `vars` (ex.: `{ club: 'Arsenal', streak: 3 }`). Ordinais entram como número cru (`{ pos: 2 }`); a chave PT/EN usa o número e, onde o sufixo importa, há chaves separadas ou o render aplica `ordinal()` antes de interpolar (ver §5).

`NewsScreen.tsx` (já tem `t` e `lang` via `useTranslation`) resolve no map de render: `t(item.title.key, item.title.vars)`. Os helpers locais `buildResultsHeader`/`buildMatchResult` já retornam `NewsItem` traduzido via `t` — serão ajustados para emitir o mesmo `TextDescriptor`.

**(b) Assistant comment — `src/engine/assistant/comment-generator.ts`** (puro). Os 41 templates `(ctx) => string` viram `(ctx) => TextDescriptor` retornando `{ key: 'assistant.<role>.<archetype>.<n>', vars }`. `AssistantComment.text: string` (`src/types/assistant.ts:44`) vira `AssistantComment.comment: TextDescriptor`. `maybeGenerateComment` continua sem parâmetro de idioma. `game-loop.ts:690` segue chamando igual; o descritor flui pela `assistant-store` (`pendingComment`) até `HomeScreen.tsx:321`, onde `t(pendingComment.comment.key, pendingComment.comment.vars)` resolve no render.

**(c) Board objective — `src/engine/board/objective-generator.ts`** (puro). `GeneratedObjective.description: string` é **removido**; o struct já carrega `type: BoardObjectiveType` e `target: number | null`, que são suficientes para derivar o texto. Um mapeador novo puro em `src/i18n/board-objective.ts`:

```ts
import { BoardObjectiveType } from '@/types/board';
import { TextDescriptor } from '@/i18n/translate';
export function objectiveDescriptor(type: BoardObjectiveType, target: number | null): TextDescriptor {
  switch (type) {
    case 'no_relegation':  return { key: 'objective.no_relegation' };
    case 'top_half':       return { key: 'objective.top_half', vars: { target: target ?? 0 } };
    case 'league_position':
      return target === 1
        ? { key: 'objective.win_league' }
        : { key: 'objective.league_position', vars: { target: target ?? 0 } };
    case 'cup_win':        return { key: 'objective.cup_win' };
    case 'budget_balance': return { key: 'objective.budget_balance' };
    case 'promotion':      return { key: 'objective.promotion' };
  }
}
```

`BoardObjectiveType` (`src/types/board.ts:1-7`) tem 6 membros (`league_position`, `cup_win`, `no_relegation`, `top_half`, `promotion`, `budget_balance`); o `switch` cobre todos para o exaustividade do `tsc` passar, mesmo que `generateObjective` hoje não emita `promotion` (`promotion` virá quando `competitions-real` ligar a subida — então a chave já existe e não precisa de retrabalho).

`BoardScreen.tsx`, `HomeScreen.tsx`, `EndOfSeasonScreen.tsx` chamam `t(...objectiveDescriptor(obj.type, obj.target))` no render em vez de ler `obj.description`.

### 3.4 Persistência de objetivo (coluna `description`)

`board_objectives.description` é hoje persistida (`board.ts:55`). Como o texto passa a ser derivado de `type`+`target` no render, a coluna `description` fica **obsoleta para exibição**. Não removemos a coluna (escopo de schema é do `save-isolation`/`db-hardening`); deixamos de **ler** `description` e podemos gravar string vazia ou o type-id como placeholder. Saves antigos com `description` inglês passam a ser ignorados na exibição — a tela deriva do `type`/`target` persistidos (que já existem). Isso é a "migration/fallback" pedida no audit, sem mudar schema.

### 3.5 Navegação (títulos de header + tab labels)

`RootNavigator.tsx` e `TabNavigator.tsx` são componentes funcionais (já usam o hook `useClubAccent`), então podem usar `useTranslation`. Cada `options={{ title: '...' }}` literal vira `options={{ title: t('nav.<screen>') }}`. O `t` reage à troca de idioma (store Zustand), re-renderizando os navigators. Namespace `nav.*`. Cobre os 24 titles do stack + 5 tabs.

### 3.6 Namespaces novos (um por área)

`transfer.*` (6 telas + OfferModal), `finances.*`, `upgrades.*`, `staff.*`, `assistants.*` (Assistants + AssistantHiring), `board.*` (BoardScreen UI), `objective.*` (descritores de objetivo §3.3c), `history.*`, `calendar.*`, `matchresult.*`, `standings.*`, `cup.*`, `topscorers.*`, `youth.*` (YouthAcademy), `training.*`, `tacticssettings.*`, `endofseason.*`, `squad.*` (SquadList + PlayerDetail UI labels), `report.*` (detalhe dos 9 reports — distinto do `reports.*` do hub já existente), `news.*` (estende o existente com as ~50 chaves dos geradores), `assistant.*` (41 chaves de comentário), `nav.*` (títulos). Strings compartilhadas reusam `common.*` e as 18 `tactics.attr_*`.

---

## 4. Data flow

```
ENGINE (puro)                         STORE / SNAPSHOT            TELA (React)
─────────────                         ───────────────            ────────────
news-generator → NewsItem{TextDescriptor}  (montado no useEffect do NewsScreen) → t(key,vars) no map de render
comment-generator → AssistantComment{TextDescriptor} → assistant-store.pendingComment → HomeScreen: t(comment.key, vars)
objective-generator → {type,target} → board_objectives(DB) → Board/Home/EndOfSeason: t(objectiveDescriptor(type,target))
(navegação não passa pela engine)                                → RootNavigator/TabNavigator: useTranslation → options.title
(telas estáticas)                                               → useTranslation + t('namespace.key')
```

Pontos-chave do thread:
- **News:** já é montado on-demand no `NewsScreen.useEffect` (não persistido em DB) — a engine só muda o tipo de retorno; o snapshot é re-traduzido a cada render/idioma. Determinismo preservado (mesmo seed → mesmas chaves).
- **Assistant:** gerado uma vez por semana na engine (`game-loop`), descritor guardado na store, exibido até ser dispensado. Trocar idioma re-traduz o descritor guardado (vantagem sobre string fixa).
- **Objetivo:** `type`/`target` já persistidos; só o render muda. Independe de migration.

---

## 5. Edge cases & error handling

- **Ordinais PT vs EN:** EN precisa de sufixo posicional (`1st`); PT usa `1º`. Implementação: para as poucas chaves de notícia que embutem posição na frase, a `var` é pré-formatada com `ordinal(lang, n)` **no render** (NewsScreen tem `lang`), passada como string já-ordinalizada (ex.: `t('news.mover_up', { club, pos: ordinal(lang, to) })`). A engine emite `to` cru; o NewsScreen aplica `ordinal` antes de chamar `t`. Mantém engine pura e gramática correta nos dois idiomas.
- **Pluralização:** o dicionário não tem motor de plural; o padrão já estabelecido usa chaves `_one`/`_other` (ex.: `news.injury_report_body_one/_other` em `pt.ts:77-78`). Geradores que hoje fazem `${n > 1 ? 's' : ''}` inline (ex.: `news-generator.ts:97` `week${streak>1?'s':''}`) passam a emitir a chave `_one`/`_other` escolhida pelo gerador a partir do número, mantendo a contagem na engine e a forma no dicionário.
- **Nomes próprios:** nomes de clube/jogador/competição **não** são traduzidos — entram como `vars`. `clubName`/`clubShort`/`formatMoney` continuam puros na engine e produzem `vars`, não texto de UI.
- **Chave ausente:** `translate` já faz fallback para a própria chave (`translate.ts` retorna `key` se faltar) — `parity.test.ts` + o tipo `Record<keyof typeof pt>` impedem ausência em compile-time, então o fallback só apareceria por bug de digitação, visível em teste.
- **Saves antigos:** objetivos persistidos antes deste epic têm `description` inglês mas também `type`/`target` corretos; a derivação ignora `description`, então saves antigos exibem objetivo localizado sem migration.
- **`window.confirm` no MainMenu** (audit [HIGH]) é de outro epic (screens-ux); aqui só garantimos que as strings dos Alerts que **tocamos** usem `t`.

---

## 6. Schema changes

**Nenhuma mudança de schema neste epic.** O texto de objetivo passa a ser derivado de colunas já existentes (`board_objectives.type`, `.target`). A coluna `board_objectives.description` torna-se obsoleta para exibição mas **não é dropada** (drop/migration de schema é escopo de `db-hardening`/`save-isolation`). Não há colunas ou tabelas novas.

---

## 7. Testing strategy

TDD onde toca engine. SQLite real (better-sqlite3) onde toca DB — nunca mock (regra do projeto).

- **`__tests__/i18n/parity.test.ts`** (já existe): cobre automaticamente todas as novas chaves; falha se PT/EN divergirem. É a rede de segurança principal da extração mecânica.
- **`__tests__/i18n/ordinal.test.ts`** (novo, unit puro): `ordinal('en', 1/2/3/4/11/21/22/23)` → `1st/2nd/3rd/4th/11th/21st/22nd/23rd`; `ordinal('pt', 1/2/3)` → `1º/2º/3º`. Edge: 11/12/13 não viram st/nd/rd.
- **`__tests__/i18n/board-objective.test.ts`** (novo, unit puro): `objectiveDescriptor` mapeia cada `BoardObjectiveType` para a `key` certa; `league_position` com `target=1` → `objective.win_league`, com `target>1` → `objective.league_position` com `vars.target`. Cobre o branch que o audit aponta como sutil.
- **`__tests__/engine/news/news-generator.test.ts`** (estende o existente): asserta que cada gerador retorna `TextDescriptor` com `key` válida (membro de `keyof typeof pt`) e `vars` esperadas — ex.: leader-streak ≥2 → `key: 'news.leader_streak'`, `vars.streak` correto; comeback → `key: 'news.comeback_away'` com `vars.deficit`. Golden path + edge (streak=2 vs >2 escolhe chave `_one`/`_other`). Sem render: valida só o descritor.
- **`__tests__/engine/assistant/comment-generator.test.ts`** (estende): `maybeGenerateComment` com seed fixo retorna `comment.key` dentro do namespace `assistant.<role>.<archetype>.*` e `vars` derivadas de `ctx` (ex.: `vars.position`, `vars.week`). Determinismo: mesmo seed → mesma key.
- **Render (browser/Playwright MCP, não unit):** validação visual de cada tela em PT e EN — checklist no §9. Type-check (`npx tsc --noEmit`) garante que toda `key` usada existe (porque `TKey = keyof typeof pt`).
- **Não-quebrar:** rodar suíte completa após cada batch; baseline 62 suites/536 testes deve continuar verde (mais os novos). Os testes existentes de `news-generator`/`comment-generator`/`objective-generator` que hoje asseram `string` serão atualizados para asserir `TextDescriptor` no mesmo PR do batch correspondente (mudança de contrato, não regressão).

---

## 8. Batches (incrementalmente shippável)

Cada batch = chaves PT/EN + telas + `tsc` verde + `parity.test` verde + commit. Ordem por independência:

1. **Batch 0 — Helpers base:** `ordinal.ts`, `TextDescriptor` em `translate.ts`, `board-objective.ts` + testes unit. (Sem mudança de UI; desbloqueia engine.)
2. **Batch 1 — Engine: board objective.** `objective-generator.ts` (remove `description`), atualiza `BoardScreen`/`HomeScreen`/`EndOfSeasonScreen` para derivar via `objectiveDescriptor`, chaves `objective.*`. Menor e mais isolado dos três de engine.
3. **Batch 2 — Engine: assistant comments.** `comment-generator.ts` → `TextDescriptor`, `AssistantComment` type, `assistant-store`, `HomeScreen` render, 41 chaves `assistant.*`.
4. **Batch 3 — Engine: news.** `news-generator.ts` → `TextDescriptor`, `NewsScreen` render, ~50 chaves `news.*`, integra `ordinal` no render.
5. **Batch 4 — Navegação.** `nav.*` em `RootNavigator`/`TabNavigator`.
6. **Batch 5 — Transfer economy.** 6 telas de `transfers/` + `OfferModal` (`transfer.*`, Alerts).
7. **Batch 6 — Club management.** Finances, Upgrades, Staff, Assistants, AssistantHiring, Board UI.
8. **Batch 7 — Squad/Player.** SquadListScreen, PlayerDetailScreen (reusa `tactics.attr_*`; remove os 3 arrays hardcoded).
9. **Batch 8 — Reports detail (9 telas).** `report.*` (PT→localizado de verdade).
10. **Batch 9 — Liga/Histórico/Temporada.** Standings, CupBracket, TopScorers, Calendar, MatchResult, History, YouthAcademy, Training, TacticsSettings, EndOfSeason.

Cada batch é independentemente commitável; os de engine (1-3) atualizam os testes de contrato no mesmo commit.

---

## 9. Dependencies & sequencing

- **Depende de `i18n-infra-core` (sibling, plano `2026-05-31-i18n-infra-core-screens.md`) ter aterrissado primeiro** — fornece `translate`, `useTranslation`, store, `app_settings`, `parity.test`, e o padrão de extração. Confirmado presente: `src/i18n/{translate,types,index}.ts`, `__tests__/i18n/{parity,translate,persistence}.test.ts`.
- **`navigation-screens` (sibling):** telas órfãs (SquadList, YouthAcademy, Training, TacticsSettings, CupBracket, TopScorers, Calendar, MatchResult) só ficam **alcançáveis** quando registradas no navegador por aquele epic. A **extração de chaves pode prosseguir por arquivo** sem esperar — o texto fica localizado mesmo antes da tela ser navegável; a validação em browser dessas telas específicas espera o `navigation-screens`. Batches 7-10 que tocam telas órfãs declaram esta dependência de *validação* (não de código).
- **Independente de `save-isolation` e `db-hardening`:** este epic não muda schema (§6). Não bloqueia nem é bloqueado por eles.
- **Coordenação leve com `competitions-real`/`match-consequences`:** se esses epics adicionarem **novo** texto de UI (ex.: rounds de mata-mata, suspensões), devem adicionar as próprias chaves seguindo o mesmo padrão; este epic localiza apenas o texto que existe hoje.

---

## 10. Out of scope

- Registrar telas órfãs na navegação (escopo `navigation-screens`).
- Trocar `window.confirm` por `Alert.alert` no MainMenu (escopo `screens-ux`); aqui só localizamos strings que tocamos.
- Qualquer mudança de schema, índice, transação ou `save_id` (escopos `db-hardening`/`save-isolation`).
- Tradução de nomes próprios (clubes, jogadores, competições, nacionalidades) — permanecem `vars` não-traduzidas.
- Motor de pluralização/gênero genérico — mantemos o padrão `_one`/`_other` já existente; não introduzimos ICU MessageFormat.
- O nome do jogo "FOOTBALL MANAGER" permanece literal.
- Novos idiomas além de PT/EN.

---

## Spec self-review

- **Placeholder scan:** sem TBD/`...`/`???`. Toda chave, função e `file:line` citados foram verificados via Read/grep (engine pureza confirmada zero imports React; `tactics.attr_*` = 18 = `PlayerAttributes`; `ordinal` em `news-generator.ts:34`; `AssistantComment.text` em `assistant.ts:44`; titles em `RootNavigator.tsx:43-76`).
- **Consistência interna:** engine permanece pura em todos os três fluxos (descritor estruturado, não `t`); o único helper que conhece `lang` (`ordinal`) roda no render, não na engine — consistente com §5. `objective.*` (descritores) vs `reports.*` (hub, já existe) vs `report.*` (detalhes, novo) — namespaces distintos, sem colisão.
- **Ambiguidade resolvida:** o tipo de `NewsItem.title`/`body` muda de `string` para `TextDescriptor` — declarado explicitamente em §3.3a e os testes de contrato (§7) cobrem a quebra; `description` do objetivo é removida do struct mas a coluna DB fica (§3.4/§6), sem migration.
- **Escopo honesto:** dependência de *código* só em `i18n-infra-core`; dependência de *validação* (não de código) em `navigation-screens` para telas órfãs — declarado em §9.
