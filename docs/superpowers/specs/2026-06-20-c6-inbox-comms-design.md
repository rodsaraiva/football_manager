# Design: Inbox / Comunicação

**Epic:** c6-inbox · **Data:** 2026-06-20 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict
**Goal:** Entregar uma Inbox FM-style que organiza comunicações em threads/categorias e expõe itens **acionáveis** com deadline (responder/aceitar/recusar), distinta do feed editorial de Notícias.

## 1. Problema / estado atual

Hoje a única superfície de "comunicação" persistente é o feed de **Notícias**, construído no W3:

- `news_items` (`src/database/schema.ts:514-530`): tabela save-isolada com `category/title_key/title_vars/body_key/body_vars/icon/priority/read`. Não tem `thread`, `actionable`, `deadline`, nem `payload` para vincular a uma decisão.
- `src/database/queries/news.ts:31-93`: `insertNewsItem`, `getNewsItems(db,saveId,season)` (ordena `priority DESC, week DESC, id DESC`), `markNewsRead(db,saveId)` (marca **tudo** como lido), `countUnread(db,saveId)`, `toNewsItem(row)`.
- `src/screens/news/NewsScreen.tsx:42-425`: regenera histórias efêmeras da liga no mount, **mescla** as persistidas (`NewsScreen.tsx:343-349`) e **zera o badge marcando tudo como lido ao abrir** (`NewsScreen.tsx:366-367`). É um mural editorial cronológico — você lê e o badge some.
- Badge único na `NewsTab` (`src/navigation/TabNavigator.tsx:20,44`) via `unreadNewsCount` do `game-store` (`src/store/game-store.ts:63,138,237`).

O que falta — e por que é raso/ausente:

1. **Nada é acionável.** Manchetes são só leitura. As únicas decisões com prazo hoje vivem em telas soltas, fora de qualquer "inbox": `OffersReceivedScreen` (`src/screens/club/transfers/OffersReceivedScreen.tsx:58`, acessível só via Stack `OffersReceived` em `src/navigation/RootNavigator.tsx:88`) e `JobOffersScreen` (`RootNavigator.tsx:110`). O jogador precisa *lembrar* de visitar essas telas — não há um lugar central que diga "você tem 3 decisões pendentes".
2. **Sem threads/agrupamento.** `getNewsItems` devolve uma lista plana por `priority`. Não há noção de "conversa" (ex.: oferta recebida → contraproposta → resposta da IA) nem de categorias de comunicação (diretoria, contrato, empréstimo, patrocínio, scout, lesão).
3. **Sem deadline tracking.** `transfer_offers` tem `created_week/created_season/response_week` (`schema.ts:253,256-257`) mas nenhuma noção de "expira na semana X" exposta ao jogador; `job_offers` (`schema.ts:325-332`) tem só `status pending|accepted|expired` sem prazo visível.
4. **Lido/não-lido é binário e global.** `markNewsRead` zera tudo de uma vez. Uma Inbox precisa de leitura por-item (abrir uma thread marca aquela thread, não o mundo).

Conclusão: a comunicação está fragmentada entre um mural read-only (Notícias) e telas de decisão órfãs. O épico cria a camada que faltava — uma **Inbox de tarefas/decisões** que reaproveita a infra de `news_items` para o conteúdo textual, mas adiciona o eixo *acionável + thread + deadline*.

## 2. Approach

**Tabela irmã `inbox_messages` + tabela `inbox_threads`, reusando o vocabulário i18n (`*_key`/`*_vars`) do `news_items`.** A Inbox é uma superfície nova com schema próprio porque suas necessidades (thread, ação, deadline, payload, leitura por-item) não cabem em `news_items` sem poluí-lo. Reusamos:

- O **padrão de descritor i18n** (`title_key`/`title_vars`/`body_key`/`body_vars`) idêntico ao de `news.ts:31-51`, então `toInboxMessage` reconstrói um `TextDescriptor` exatamente como `toNewsItem` (`news.ts:84-93`).
- O **mapeamento camelCase↔snake_case dentro da query** (só dentro de `inbox.ts`), como em `news.ts`.
- O **kit de UI** do épico de Design System (`2026-06-20-design-system-premium-design.md`): `Card`, `Button`, `Text` semântico, `Icon`, `EmptyState`, `Toast`, `useConfirm` — em vez dos estilos inline crus que a `NewsScreen` ainda usa.

**Threads ligam mensagens a uma entidade de domínio.** Cada thread tem `category` (diretoria/contrato/empréstimo/patrocínio/scout/lesão/transferência) e um `ref_kind`+`ref_id` opcional apontando para a entidade que origina a ação (ex.: `ref_kind='transfer_offer'`, `ref_id=transfer_offers.id`). Itens acionáveis carregam `action_kind` + `deadline_season`/`deadline_week`. A ação é resolvida por um **resolver headless puro em `src/engine/inbox/`** que despacha para os executores já existentes (`acceptIncomingOffer`/`rejectIncomingOffer`/`counterIncomingOffer` em `src/engine/transfer/offer-processor.ts:335,380,395`, `setJobOfferStatus` em `src/database/queries/job-offers.ts:66`).

**Produtores headless** emitem mensagens nos pontos onde os eventos acionáveis já nascem — espelhando a "decisão de fiação" do W3 (`docs/superpowers/plans/2026-06-14-w3-news-persistence.md:39`): ofertas recebidas em `processPendingOffers` (`offer-processor.ts:150`), retorno de empréstimo em `returnExpiredLoans` (`loan-returns.ts:16`), diretoria no season-end, contrato a expirar / scout / lesão nos checkpoints semanais do `game-loop.ts`.

**Expiração determinística no avanço de semana.** Um varredor `expireInboxDeadlines(db, saveId, season, week)` roda dentro de `advanceGameWeek` (`game-loop.ts`, junto de `processPendingOffers` em `:575`), aplicando a **ação default** de itens vencidos (oferta → recusa; job offer → expira) e marcando a mensagem `expired`. Zero `Date.now()`/`new Date()` — prazo é sempre em (season, week) do relógio do jogo.

**Alternativa descartada: estender `news_items` com colunas `thread_id/actionable/deadline/action_kind`.** Rejeitada porque (a) inflaria a tabela editorial com colunas nulas em 95% das linhas; (b) `markNewsRead` e a `NewsScreen` assumem leitura global e merge efêmero — misturar itens acionáveis quebraria o "abrir zera tudo"; (c) a Inbox precisa de leitura por-thread e de um índice por deadline, semânticas conflitantes com o feed. Manter `news_items` como mural editorial e `inbox_messages` como caixa de tarefas mantém cada superfície coesa (mesma razão do W3 separar persistido×efêmero por prefixo de id, `news.ts:85`).

**Alternativa descartada: navegar direto às telas `OffersReceived`/`JobOffers` sem Inbox.** É o estado atual — telas órfãs sem ponto de entrada central. A Inbox vira o hub; as telas existentes podem ser linkadas a partir da thread (deep-link), mas a decisão básica (aceitar/recusar) é executável inline pela Inbox.

## 3. Architecture & components

### Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/database/schema.ts` | Alterar | `CREATE TABLE inbox_threads` + `inbox_messages` + índices; registrar nomes na lista de tabelas (junto de `news_items`, `schema.ts:36`) |
| `src/store/database-store.ts` | Alterar | DDL idêntico em runtime (junto do bloco `news_items`, `database-store.ts:202-217`) |
| `src/database/queries/inbox.ts` | Criar | Queries tipadas save-isoladas (insert/get/markRead/count/resolve/expire); `toInboxMessage` |
| `src/engine/inbox/inbox-types.ts` | Criar | Tipos puros: `InboxCategory`, `InboxActionKind`, `InboxMessage`, `InboxThread`, `InboxThreadView` |
| `src/engine/inbox/action-resolver.ts` | Criar | Resolver puro+orquestrador: aplica uma ação a uma mensagem, despacha p/ executores de domínio |
| `src/engine/inbox/deadline-sweeper.ts` | Criar | `expireInboxDeadlines` determinístico (default action em itens vencidos) |
| `src/engine/inbox/producers.ts` | Criar | Helpers `emitOfferReceived`/`emitLoanReturn`/`emitBoardMessage`/`emitContractExpiring`/`emitScoutReport`/`emitInjuryAlert` |
| `src/engine/transfer/offer-processor.ts` | Alterar | Em `processPendingOffers`, emitir thread/mensagem acionável quando o **clube do jogador é o vendedor** (hoje só faz `continue`, `:223`) |
| `src/engine/transfer/loan-returns.ts` | Alterar | Emitir mensagem informativa de retorno de empréstimo |
| `src/engine/game-loop.ts` | Alterar | Chamar `expireInboxDeadlines` antes de `processPendingOffers` (`:575`); emitir contrato-a-expirar / scout / lesão nos checkpoints |
| `src/store/game-store.ts` | Alterar | `unreadInboxCount` + `actionableInboxCount` + actions `refreshInboxCounts`/`setInboxCounts`; reset (`game-store.ts:170,195`) |
| `src/navigation/TabNavigator.tsx` | Alterar | Aba `InboxTab` com `tabBarBadge` = `actionableInboxCount || unreadInboxCount` |
| `src/navigation/RootNavigator.tsx` | Alterar | Stack `InboxThread` (detalhe da thread) |
| `src/navigation/types.ts` | Alterar | Rotas `InboxTab` / `InboxThread: { threadId: number }` |
| `src/screens/inbox/InboxScreen.tsx` | Criar | Lista de threads agrupadas por categoria, badge de não-lido/pendente, filtro |
| `src/screens/inbox/InboxThreadScreen.tsx` | Criar | Detalhe da thread: mensagens + barra de ação (aceitar/recusar/contrapor) com deadline |
| `src/i18n/pt.ts` / `src/i18n/en.ts` | Alterar | Bloco `inbox.*` (paridade; pt é fonte) |

### Contract (assinaturas TS exatas)

```typescript
// src/engine/inbox/inbox-types.ts
import type { TextDescriptor } from '@/i18n/translate';

export type InboxCategory =
  | 'board' | 'contract' | 'loan' | 'sponsor'
  | 'scout' | 'injury' | 'transfer';

export type InboxActionKind =
  | 'none'
  | 'offer_response'      // aceitar / recusar / contrapor oferta recebida
  | 'job_offer_response'  // aceitar / recusar proposta de emprego
  | 'contract_renew'      // abrir negociação de renovação
  | 'acknowledge';        // só confirmar leitura (informativo c/ CTA)

export type InboxActionChoice = 'accept' | 'reject' | 'counter' | 'open' | 'ack';

export type InboxRefKind = 'transfer_offer' | 'job_offer' | 'player' | 'none';

export interface InboxMessage {
  id: number;
  threadId: number;
  season: number;
  week: number;
  title: TextDescriptor;
  body: TextDescriptor;
  icon: string;
  fromSelf: boolean;        // 0 = remetente externo, 1 = resposta do jogador
}

export interface InboxThread {
  id: number;
  category: InboxCategory;
  refKind: InboxRefKind;
  refId: number | null;
  actionKind: InboxActionKind;
  status: 'open' | 'resolved' | 'expired';
  deadlineSeason: number | null;
  deadlineWeek: number | null;
  read: boolean;
  lastSeason: number;       // p/ ordenação (denormalizado da última msg)
  lastWeek: number;
}

export interface InboxThreadView extends InboxThread {
  messages: InboxMessage[];
}
```

```typescript
// src/database/queries/inbox.ts
import type { DbHandle } from './players';
import type { InboxCategory, InboxActionKind, InboxRefKind,
  InboxThread, InboxMessage, InboxThreadView } from '@/engine/inbox/inbox-types';
import type { TKey } from '@/i18n/translate';

export interface NewThreadInput {
  category: InboxCategory;
  refKind?: InboxRefKind;          // default 'none'
  refId?: number | null;
  actionKind?: InboxActionKind;    // default 'none'
  deadlineSeason?: number | null;
  deadlineWeek?: number | null;
}
export interface NewMessageInput {
  season: number;
  week: number;
  titleKey: TKey;
  titleVars?: Record<string, string | number>;
  bodyKey: TKey;
  bodyVars?: Record<string, string | number>;
  icon: string;
  fromSelf?: boolean;              // default false
}

// Cria thread + 1ª mensagem atomicamente. Retorna threadId.
export async function openThread(
  db: DbHandle, saveId: number, thread: NewThreadInput, first: NewMessageInput,
): Promise<number>;

// Anexa uma mensagem a uma thread existente e atualiza last_season/last_week + read=0.
export async function appendMessage(
  db: DbHandle, saveId: number, threadId: number, msg: NewMessageInput,
): Promise<number>;

// Threads abertas/resolvidas ordenadas por status(open first), deadline asc, last desc.
export async function getThreads(
  db: DbHandle, saveId: number, opts?: { category?: InboxCategory },
): Promise<InboxThread[]>;

export async function getThreadView(
  db: DbHandle, saveId: number, threadId: number,
): Promise<InboxThreadView | null>;

export async function markThreadRead(db: DbHandle, saveId: number, threadId: number): Promise<void>;
export async function setThreadStatus(
  db: DbHandle, saveId: number, threadId: number, status: 'open' | 'resolved' | 'expired',
): Promise<void>;

// Para badges. unread = threads read=0; actionable = status='open' AND action_kind != 'none'.
export async function countUnreadThreads(db: DbHandle, saveId: number): Promise<number>;
export async function countActionableThreads(db: DbHandle, saveId: number): Promise<number>;

// Threads acionáveis cujo deadline já passou (season<cur OR season=cur AND week<=cur week).
export async function getExpiredActionableThreads(
  db: DbHandle, saveId: number, season: number, week: number,
): Promise<InboxThread[]>;
```

```typescript
// src/engine/inbox/action-resolver.ts
import type { DbHandle } from '@/database/queries/players';
import type { InboxActionChoice } from './inbox-types';

export interface ResolveActionParams {
  threadId: number;
  choice: InboxActionChoice;
  season: number;
  week: number;
  playerClubId: number | null;
  counterFee?: number;            // só p/ choice='counter'
}
export interface ResolveActionResult {
  ok: boolean;
  reason?: string;                // TKey de erro (i18n) quando ok=false
  newStatus: 'open' | 'resolved' | 'expired';
}

// Lê a thread, valida deadline/status, despacha p/ o executor de domínio conforme
// action_kind+ref_kind, anexa a mensagem de resposta (fromSelf=true) e fecha a thread.
export async function resolveInboxAction(
  db: DbHandle, saveId: number, params: ResolveActionParams,
): Promise<ResolveActionResult>;
```

```typescript
// src/engine/inbox/deadline-sweeper.ts
import type { DbHandle } from '@/database/queries/players';

// Para cada thread acionável vencida, aplica a ação DEFAULT (offer_response→reject,
// job_offer_response→reject, contract_renew→ack) via resolveInboxAction e marca
// expired. Determinístico: prazo comparado contra (season, week) do jogo.
export async function expireInboxDeadlines(
  db: DbHandle, saveId: number, season: number, week: number,
): Promise<number>;             // nº de threads expiradas
```

## 4. Data flow

**Emissão (oferta recebida).** Em `processPendingOffers` (`offer-processor.ts:221-225`), quando `offer.sellingClubId === playerClubId` (o ramo que hoje só faz `continue`), o produtor chama `openThread(db, saveId, {category:'transfer', refKind:'transfer_offer', refId:offer.id, actionKind:'offer_response', deadlineSeason, deadlineWeek}, {... titleKey:'inbox.offer_received_title', ...})`. `deadlineWeek = week + OFFER_TTL_WEEKS` (constante de engine, ex. 3), com rollover de temporada calculado puro.

**Leitura.** `InboxScreen` monta → `getThreads(db, saveId)` → agrupa por `category` → renderiza com `Card`/`Icon`/`Text` do kit; badge de pendência por thread acionável aberta. Abrir uma thread navega para `InboxThread`, que chama `getThreadView` + `markThreadRead` (marca **só aquela** thread; badge global decrementa via `refreshInboxCounts`).

**Ação.** `InboxThreadScreen` mostra `Button`s (Aceitar/Recusar/Contrapor) só se `actionKind!=='none'` e `status==='open'` e deadline não vencido. Tap → `useConfirm` → `resolveInboxAction(db, saveId, {threadId, choice, season, week, playerClubId, counterFee})`. O resolver despacha: `offer_response` + `accept` → `acceptIncomingOffer` (`offer-processor.ts:335`); `reject` → `rejectIncomingOffer` (`:380`); `counter` → `counterIncomingOffer` (`:395`); `job_offer_response` → `setJobOfferStatus` (`job-offers.ts:66`). Anexa mensagem `fromSelf=true`, fecha thread (`resolved`), `Toast` de confirmação, `refreshInboxCounts`.

**Expiração.** No `advanceGameWeek` (`game-loop.ts`, antes de `processPendingOffers` em `:575`): `expireInboxDeadlines(db, saveId, season, week)` → `getExpiredActionableThreads` → para cada, `resolveInboxAction(choice=default)` → `setThreadStatus 'expired'`. Depois `refreshInboxCounts` é chamado na UI que consome `advanceGameWeek` (HomeScreen), igual ao padrão do badge de notícias.

## 5. Schema changes

Em `src/database/schema.ts` (após `news_items`, `:530`) **e** idêntico em `src/store/database-store.ts` (após o bloco `news_items`, `:217`). Registrar `'inbox_threads'` e `'inbox_messages'` na lista de nomes de tabela (`schema.ts:36`).

```sql
CREATE TABLE IF NOT EXISTS inbox_threads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         INTEGER NOT NULL REFERENCES save_games(id),
  category        TEXT    NOT NULL,
  ref_kind        TEXT    NOT NULL DEFAULT 'none',
  ref_id          INTEGER,
  action_kind     TEXT    NOT NULL DEFAULT 'none',
  status          TEXT    NOT NULL DEFAULT 'open',     -- open | resolved | expired
  deadline_season INTEGER,
  deadline_week   INTEGER,
  read            INTEGER NOT NULL DEFAULT 0,
  last_season     INTEGER NOT NULL,
  last_week       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id     INTEGER NOT NULL REFERENCES save_games(id),
  thread_id   INTEGER NOT NULL REFERENCES inbox_threads(id),
  season      INTEGER NOT NULL,
  week        INTEGER NOT NULL,
  title_key   TEXT    NOT NULL,
  title_vars  TEXT    NOT NULL DEFAULT '{}',
  body_key    TEXT    NOT NULL,
  body_vars   TEXT    NOT NULL DEFAULT '{}',
  icon        TEXT    NOT NULL DEFAULT '📨',
  from_self   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_inbox_threads_save_status ON inbox_threads(save_id, status, deadline_season, deadline_week);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_save_read   ON inbox_threads(save_id, read);
CREATE INDEX IF NOT EXISTS idx_inbox_msgs_save_thread    ON inbox_messages(save_id, thread_id);
```

Notas:
- **save_id em toda query**, primeiro no WHERE (padrão `news.ts`/`transfers.ts`). Isolamento já validado pela suíte de save-isolation; `SAVE_ID_STRIDE` (`src/database/constants.ts:7`) continua sendo a fronteira de ids entre saves.
- `title_vars`/`body_vars` persistem como JSON string e voltam parseados por `toInboxMessage` (clone do `parseVars` de `news.ts:74-82`).
- Sem coluna de data real — `season/week` são o relógio. `last_season/last_week` denormalizam a última mensagem para ordenação barata sem subquery.

## 6. Error handling & edge cases

- **Oferta já não existe / status mudou** quando o jogador clica Aceitar: `resolveInboxAction` relê `transfer_offers` via os executores existentes — `acceptIncomingOffer` já retorna `{success:false, reason}` se não `pending` (`offer-processor.ts:358-359`). O resolver propaga `ok:false` + `reason` (TKey) e **não** fecha a thread; UI mostra `Toast` de erro.
- **Deadline vencido entre render e tap:** resolver revalida `deadline_season/week` contra (season,week) atuais; se vencido, retorna `ok:false, reason:'inbox.err_expired'` e marca a thread `expired` (mantém consistência com o sweeper).
- **Sweeper idempotente:** só age sobre `status='open' AND action_kind!='none'`. Re-rodar o sweeper na mesma semana não re-expira (já estão `expired`).
- **Counter sem fee / fee inválido:** `choice='counter'` exige `counterFee>0`; senão `ok:false, reason:'inbox.err_counter_fee'`. UI desabilita o botão até preencher.
- **`playerClubId === null`** (entre clubes, manager livre): produtores de transferência/contrato não emitem; resolver de `offer_response` rejeita com `reason` se chamado sem clube.
- **Empréstimo de retorno** é informativo (`actionKind:'none'`): nunca aparece no badge de pendência, só no de não-lido.
- **`Alert.alert` é no-op no RN Web** (memória `reference_rn_web_alert.md`): confirmações usam `useConfirm` do kit do Design System, nunca `Alert`.
- **Determinismo:** rollover de temporada no cálculo de deadline (`week+TTL` cruzando o fim da temporada) é aritmético puro; sem `Date`/`Math.random`. Mesma seed + mesmas semanas ⇒ mesmas threads/expirações.

## 7. Testing strategy

TDD com **better-sqlite3 real** em memória (helper de `__tests__/database/`, nunca mock). Escrever teste antes de cada query/resolver.

**`__tests__/database/inbox.test.ts` (queries):**
- `openThread` cria thread+1ª msg; `getThreadView` devolve thread com `messages.length===1`. (golden)
- `appendMessage` zera `read`, atualiza `last_season/last_week`; ordenação de `getThreads` põe `open` antes de `resolved`, depois deadline asc. (golden)
- `markThreadRead` marca só a thread alvo; `countUnreadThreads` reflete; outra thread continua não-lida. (edge: leitura por-item, não global)
- `countActionableThreads` conta só `status='open' AND action_kind!='none'`. (edge: informativo não conta)
- `title_vars/body_vars` round-trip JSON (clone do teste de `news.test.ts`). (edge)
- **save-isolation:** thread em `TEST_SAVE_ID` invisível para `saveId=999999` em todas as contagens. (edge)
- `getExpiredActionableThreads` retorna só vencidas (season<cur OR season=cur&&week<=cur). (edge: limite exato week==deadline)

**`__tests__/engine/inbox/action-resolver.test.ts`:**
- Seed: clube do jogador + jogador + `transfer_offers` pending. `openThread(offer_response, refId=offerId)`. `resolveInboxAction(accept)` → player muda de clube (assert via `players.club_id`), thread `resolved`, msg `fromSelf=true` anexada. (golden)
- `reject` → offer `rejected`, thread `resolved`, jogador permanece. (golden)
- `counter` com `counterFee` → `transfer_offers.status='countered'`, fee atualizado. (golden)
- accept de oferta já não-pending → `ok:false`, thread continua `open`. (edge)
- accept após deadline → `ok:false, reason:'inbox.err_expired'`, thread `expired`. (edge)

**`__tests__/engine/inbox/deadline-sweeper.test.ts`:**
- 1 thread acionável vencida + 1 não-vencida + 1 informativa → sweeper expira só a 1ª; aplica default reject (offer fica `rejected`); idempotente em 2ª chamada. (golden+edge)

**`__tests__/engine/transfer/offer-processor-inbox.test.ts`:**
- `processPendingOffers` com `sellingClubId===playerClubId` cria 1 thread `transfer`/`offer_response`; com clubes alheios **não** cria thread. (golden+edge — espelha o teste de `offer-processor-news`)

**Não-engine:** `__tests__/i18n/parity.test.ts` cobre paridade pt/en do bloco `inbox.*`. `career-loop.e2e` deve continuar verde (sweeper roda no loop) — rodar 5× p/ zero flake, igual ao W3 (`plan W3:727-728`). Sem teste de UI automatizado: validar `InboxScreen`/`InboxThreadScreen` no browser (Playwright MCP) por ser visual.

## 8. Dependencies & sequencing

**Precede a Inbox:**
- **W3 (`news_items`)** — já mergeado; reusamos o vocabulário i18n e o padrão de query. Sem dependência de schema, mas o conceito de "feed editorial vs. caixa de tarefas" só fecha com ambos coexistindo.
- **Design System (`2026-06-20-design-system-premium-design.md`), em especial D3 (componentes de layout: `Card`/`EmptyState`) e D4 (interação: `Button`/`Toast`/`useConfirm`).** A Inbox **consome** o kit; se o Design System ainda não tiver mergeado, as telas caem em estilos inline de `@/theme` como stop-gap e migram depois (a `NewsScreen` atual é o exemplo do "antes"). Preferir sequenciar **depois** do D4 para já nascer no kit novo.

**Faseamento sugerido (cada fase mergeável):**
1. C6a — schema (`inbox_threads`/`inbox_messages`) + `queries/inbox.ts` + tipos, com TDD.
2. C6b — `action-resolver` + `deadline-sweeper`, fiados no `game-loop`/`offer-processor`, com TDD.
3. C6c — `InboxScreen` + `InboxThreadScreen` + aba/badge + i18n; produtores restantes (board/contrato/scout/lesão/empréstimo); validação no browser.

**Relação com outros épicos de carreira:** `c4-manager-job-market` produz `job_offers` — a Inbox é o canal natural para `job_offer_response` (deep-link ou ação inline). `c5-squad-psychology` e `c3-scouting-depth` podem emitir mensagens (`injury`/`scout`) reusando `producers.ts` sem novo schema.

## 9. Out of scope

- Composição de mensagem **livre** pelo jogador (a Inbox é reativa; o jogador só responde via ações tipadas).
- Notificações push / fora do app.
- Reescrever a `NewsScreen` — Notícias permanece o mural editorial; a Inbox é superfície separada.
- Anexos ricos (gráficos/relatórios embutidos) — thread é texto + ação. Deep-link para telas existentes (`OffersReceived`, `PlayerDetail`) é o máximo de "anexo".
- Migração das telas órfãs `OffersReceivedScreen`/`JobOffersScreen` para dentro da Inbox — continuam acessíveis; a Inbox adiciona um caminho, não remove os existentes (decisão de escopo para não regredir fluxos testados).
- Som/haptics. Configuração de TTL por categoria além de uma constante de engine.

## 10. Spec self-review

**Placeholder scan:** sem "TBD"/"FIXME"/"???". Todos os exemplos de chave i18n usam o prefixo `inbox.*` consistente.

**Consistência interna:**
- `InboxActionKind` ↔ despacho do resolver: `offer_response`→`accept/reject/counter`, `job_offer_response`→`accept/reject`, `contract_renew`→`open`, `acknowledge`→`ack`. `none` nunca renderiza botões.
- Badge: `actionableInboxCount` (status open + action!=none) tem prioridade sobre `unreadInboxCount` na `tabBarBadge`, ambos no `game-store` (espelha `unreadNewsCount`, `game-store.ts:63,237`).
- Leitura é **por-thread** (`markThreadRead`), distinta do `markNewsRead` global de `news.ts:63-65` — diferença deliberada (§1.4, §2).
- Schema declarado em `schema.ts` **e** `database-store.ts` (regra da casa, §5); nomes registrados na lista de tabelas.

**Refs de código verificadas (file:line):** `news_items` DDL `schema.ts:514-530`; runtime `database-store.ts:202-217`; `news.ts:31-93`; `NewsScreen.tsx:343-349,366-367`; `TabNavigator.tsx:20,44`; `game-store.ts:63,138,170,195,237`; `transfer_offers` `schema.ts:244-259`; `job_offers` `schema.ts:325-332`; executores `offer-processor.ts:223,335,358-359,380,395`; `processPendingOffers` `:150,575`(loop); `loan-returns.ts:16`; `job-offers.ts:66`; `SAVE_ID_STRIDE` `constants.ts:7`; `OffersReceivedScreen.tsx:58`, Stack `RootNavigator.tsx:88,110`. Decisão de fiação dos produtores espelha `plan W3:39`. RN Web `Alert` no-op confirmado pela memória do projeto.
