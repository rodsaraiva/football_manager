# C6 — Inbox / Comunicação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação de 2-5 min (escrever teste → ver falhar → implementar → ver passar → commit). Sem placeholders: todo código aparece inline. **Subagents NÃO commitam** — o passo "commit" descreve `git add` + mensagem para o orquestrador executar.

**Goal:** Entregar uma Inbox FM-style que organiza comunicações em threads/categorias e expõe itens **acionáveis** com deadline (aceitar/recusar/contrapor), distinta do feed editorial de Notícias (W3), reaproveitando o vocabulário i18n de `news_items`.

**Architecture:** Tabelas irmãs `inbox_threads` + `inbox_messages` (save-isoladas), com queries tipadas em `queries/inbox.ts` que espelham o padrão de `queries/news.ts` (mapeamento camelCase↔snake_case + round-trip JSON de `*_vars`). Engine puro novo em `src/engine/inbox/` com tipos, `resolveInboxAction` (despacha p/ os executores já existentes de `offer-processor.ts`/`job-offers.ts`), `expireInboxDeadlines` (varredor determinístico no `advanceGameWeek`) e `producers.ts` (emite threads onde os eventos nascem). UI: aba `InboxTab` + `InboxThreadScreen`, badge no `game-store`.

**Tech Stack:** TS 5.9 strict, Jest + ts-jest, better-sqlite3 REAL (nunca mock), Zustand, React Navigation v7, RN 0.81/Expo 54.

**Convenções:** TDD; engine puro (zero React/Expo em `src/engine/inbox/`); DDL em **schema.ts E database-store.ts** (idêntico); `save_id` primeiro em todo WHERE; ZERO `Math.random`/`Date.now`/`new Date()` em engine (prazo é sempre `(season, week)` do relógio do jogo); i18n pt/en paridade (pt é fonte); kit/tokens de `@/theme`; `Alert.alert` é no-op no RN Web → usar `useConfirm`/`Toast` do kit; branch `feat/c6-inbox`; commits terminando com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Precedente a espelhar:**
- `src/database/queries/news.ts` (insert/get/markRead/count, `parseVars`, `toNewsItem`) — molde exato das queries e do round-trip JSON.
- `src/database/schema.ts:511-530` + `src/store/database-store.ts:200-218` — bloco DDL de `news_items` (declarar a Inbox logo após, idêntico nos dois lugares).
- `__tests__/database/news.test.ts` (setup `createTestDb`/`seedTestDb`/`TEST_SAVE_ID`) — molde dos testes de query.
- `__tests__/engine/transfer/offer-processor-news.test.ts` (`seedClubsAndPlayer`) — molde do teste de produtor + seed de clubes/jogadores/ofertas.
- `src/engine/transfer/offer-processor.ts:335,380,395` (`acceptIncomingOffer`/`rejectIncomingOffer`/`counterIncomingOffer`) — executores que o resolver despacha.
- `src/store/game-store.ts:62-63,237-243` (`unreadNewsCount`/`refreshUnreadNewsCount`) + `src/navigation/TabNavigator.tsx:20,40-47` (badge da NewsTab) — molde do badge da Inbox.

---

## File Structure

- **Create** `src/engine/inbox/inbox-types.ts` — tipos puros (`InboxCategory`, `InboxActionKind`, `InboxActionChoice`, `InboxRefKind`, `InboxMessage`, `InboxThread`, `InboxThreadView`).
- **Create** `src/database/queries/inbox.ts` — queries save-isoladas + `toInboxMessage`/`toInboxThread`.
- **Create** `src/engine/inbox/action-resolver.ts` — `resolveInboxAction` (valida deadline/status, despacha, anexa resposta, fecha thread).
- **Create** `src/engine/inbox/deadline-sweeper.ts` — `expireInboxDeadlines` (default action em itens vencidos).
- **Create** `src/engine/inbox/producers.ts` — `emitOfferReceived` (+ helper `addDeadlineWeeks` de rollover puro) e os informativos `emitLoanReturn`.
- **Modify** `src/database/schema.ts:511-530` — adicionar DDL `inbox_threads`/`inbox_messages` + índices após `news_items`; registrar nomes em `TABLE_NAMES` (`schema.ts:36`).
- **Modify** `src/store/database-store.ts:200-218` — DDL idêntico em runtime após o bloco `news_items`.
- **Modify** `src/engine/transfer/offer-processor.ts:221-225` — no `continue` do ramo "clube do jogador é vendedor", emitir thread acionável via `emitOfferReceived`.
- **Modify** `src/engine/transfer/loan-returns.ts:16` — emitir mensagem informativa de retorno de empréstimo.
- **Modify** `src/engine/game-loop.ts:574-575` — chamar `expireInboxDeadlines` antes de `processPendingOffers`.
- **Modify** `src/store/game-store.ts:62-63,195,237` — `unreadInboxCount`/`actionableInboxCount` + actions `refreshInboxCounts`/`setInboxCounts` + reset.
- **Modify** `src/navigation/types.ts:53-65` — rota `InboxThread: { threadId: number }` (RootStack) + `InboxTab` (TabParamList).
- **Modify** `src/navigation/TabNavigator.tsx` — aba `InboxTab` com badge.
- **Modify** `src/navigation/RootNavigator.tsx` — Stack `InboxThread`.
- **Create** `src/screens/inbox/InboxScreen.tsx` — lista de threads por categoria.
- **Create** `src/screens/inbox/InboxThreadScreen.tsx` — detalhe + barra de ação.
- **Modify** `src/i18n/pt.ts` + `src/i18n/en.ts` — bloco `inbox.*` (paridade).
- **Test** `__tests__/database/inbox.test.ts`, `__tests__/engine/inbox/action-resolver.test.ts`, `__tests__/engine/inbox/deadline-sweeper.test.ts`, `__tests__/engine/transfer/offer-processor-inbox.test.ts`.

**Contract (assinaturas exatas):**

```ts
// src/engine/inbox/inbox-types.ts
import type { TextDescriptor } from '@/i18n/translate';

export type InboxCategory =
  | 'board' | 'contract' | 'loan' | 'sponsor' | 'scout' | 'injury' | 'transfer';
export type InboxActionKind =
  | 'none' | 'offer_response' | 'job_offer_response' | 'contract_renew' | 'acknowledge';
export type InboxActionChoice = 'accept' | 'reject' | 'counter' | 'open' | 'ack';
export type InboxRefKind = 'transfer_offer' | 'job_offer' | 'player' | 'none';

export interface InboxMessage {
  id: number; threadId: number; season: number; week: number;
  title: TextDescriptor; body: TextDescriptor; icon: string; fromSelf: boolean;
}
export interface InboxThread {
  id: number; category: InboxCategory; refKind: InboxRefKind; refId: number | null;
  actionKind: InboxActionKind; status: 'open' | 'resolved' | 'expired';
  deadlineSeason: number | null; deadlineWeek: number | null; read: boolean;
  lastSeason: number; lastWeek: number;
}
export interface InboxThreadView extends InboxThread { messages: InboxMessage[]; }

// src/database/queries/inbox.ts
export interface NewThreadInput {
  category: InboxCategory; refKind?: InboxRefKind; refId?: number | null;
  actionKind?: InboxActionKind; deadlineSeason?: number | null; deadlineWeek?: number | null;
}
export interface NewMessageInput {
  season: number; week: number; titleKey: TKey;
  titleVars?: Record<string, string | number>; bodyKey: TKey;
  bodyVars?: Record<string, string | number>; icon: string; fromSelf?: boolean;
}
export async function openThread(db: DbHandle, saveId: number, thread: NewThreadInput, first: NewMessageInput): Promise<number>;
export async function appendMessage(db: DbHandle, saveId: number, threadId: number, msg: NewMessageInput): Promise<number>;
export async function getThreads(db: DbHandle, saveId: number, opts?: { category?: InboxCategory }): Promise<InboxThread[]>;
export async function getThreadView(db: DbHandle, saveId: number, threadId: number): Promise<InboxThreadView | null>;
export async function markThreadRead(db: DbHandle, saveId: number, threadId: number): Promise<void>;
export async function setThreadStatus(db: DbHandle, saveId: number, threadId: number, status: 'open' | 'resolved' | 'expired'): Promise<void>;
export async function countUnreadThreads(db: DbHandle, saveId: number): Promise<number>;
export async function countActionableThreads(db: DbHandle, saveId: number): Promise<number>;
export async function getExpiredActionableThreads(db: DbHandle, saveId: number, season: number, week: number): Promise<InboxThread[]>;

// src/engine/inbox/action-resolver.ts
export interface ResolveActionParams {
  threadId: number; choice: InboxActionChoice; season: number; week: number;
  playerClubId: number | null; counterFee?: number;
}
export interface ResolveActionResult {
  ok: boolean; reason?: string; newStatus: 'open' | 'resolved' | 'expired';
}
export async function resolveInboxAction(db: DbHandle, saveId: number, params: ResolveActionParams): Promise<ResolveActionResult>;

// src/engine/inbox/deadline-sweeper.ts
export async function expireInboxDeadlines(db: DbHandle, saveId: number, season: number, week: number): Promise<number>;

// src/engine/inbox/producers.ts
export const OFFER_TTL_WEEKS = 3;
export const WEEKS_PER_SEASON = 38;
export function addDeadlineWeeks(season: number, week: number, ttl: number): { deadlineSeason: number; deadlineWeek: number };
export async function emitOfferReceived(db: DbHandle, saveId: number, args: { offerId: number; playerName: string; offeringClubName: string; fee: number; season: number; week: number }): Promise<number>;
export async function emitLoanReturn(db: DbHandle, saveId: number, args: { playerName: string; parentClubName: string; season: number; week: number }): Promise<number>;
```

---

## Task 1: Tipos puros da Inbox

**Files:** Create `src/engine/inbox/inbox-types.ts`.
**Interfaces:** Consumes: `TextDescriptor` de `@/i18n/translate`. Produces: todos os tipos do Contract acima.

- [ ] **Step 1 — escrever o arquivo de tipos** (não há teste; é um módulo só de tipos, validado pelo `tsc`):
```ts
// src/engine/inbox/inbox-types.ts
import type { TextDescriptor } from '@/i18n/translate';

export type InboxCategory =
  | 'board' | 'contract' | 'loan' | 'sponsor' | 'scout' | 'injury' | 'transfer';

export type InboxActionKind =
  | 'none'
  | 'offer_response'
  | 'job_offer_response'
  | 'contract_renew'
  | 'acknowledge';

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
  fromSelf: boolean;
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
  lastSeason: number;
  lastWeek: number;
}

export interface InboxThreadView extends InboxThread {
  messages: InboxMessage[];
}
```
- [ ] **Step 2 — confirmar `TextDescriptor` existe e é exportado:** `cd /root/rodrigo/football-manager && grep -n "export type TextDescriptor\|export interface TextDescriptor\|export type TKey" src/i18n/translate.ts` → deve listar `TextDescriptor` e `TKey`. Se `TextDescriptor` não existir com esse nome, usar a forma usada por `news-generator.ts` (`title: { key: TKey; vars?: ... }`) e ajustar o import.
- [ ] **Step 3 — type-check:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 4 — commit:** `git add src/engine/inbox/inbox-types.ts` · msg: `feat(c6): tipos puros da Inbox (threads/mensagens/ações)`.

---

## Task 2: DDL `inbox_threads`/`inbox_messages` (schema + runtime)

**Files:** Modify `src/database/schema.ts` (`TABLE_NAMES` em `:36` e `SCHEMA_SQL` após `news_items` em `:530`), Modify `src/store/database-store.ts` (após bloco `news_items` em `:218`).
**Interfaces:** Produces: tabelas `inbox_threads`/`inbox_messages` + índices. Consumes: nada.

- [ ] **Step 1 — teste falhando** (cria as duas tabelas via `createTestDb` e confere colunas): criar `__tests__/database/inbox-schema.test.ts`:
```ts
import { createTestDb } from './test-helpers';

describe('inbox schema', () => {
  it('cria inbox_threads e inbox_messages com as colunas esperadas', () => {
    const db = createTestDb();
    const threadCols = (db.prepare("PRAGMA table_info('inbox_threads')").all() as Array<{ name: string }>).map((c) => c.name);
    expect(threadCols).toEqual(expect.arrayContaining([
      'id', 'save_id', 'category', 'ref_kind', 'ref_id', 'action_kind',
      'status', 'deadline_season', 'deadline_week', 'read', 'last_season', 'last_week',
    ]));
    const msgCols = (db.prepare("PRAGMA table_info('inbox_messages')").all() as Array<{ name: string }>).map((c) => c.name);
    expect(msgCols).toEqual(expect.arrayContaining([
      'id', 'save_id', 'thread_id', 'season', 'week',
      'title_key', 'title_vars', 'body_key', 'body_vars', 'icon', 'from_self',
    ]));
    db.close();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/inbox-schema.test.ts` → falha com `no such table: inbox_threads` (PRAGMA devolve `[]`, assertion quebra).
- [ ] **Step 3 — implementar DDL em `schema.ts`.** Em `TABLE_NAMES` (após `'news_items',` na `:36`) adicionar:
```ts
  'inbox_threads',
  'inbox_messages',
```
E em `SCHEMA_SQL`, logo após o índice `idx_news_save_read` (`schema.ts:530`, antes do fechamento da template string):
```sql
-- C6 inbox: caixa de tarefas/decisões (acionável + thread + deadline), irmã de news_items.
-- title/body são chaves i18n + JSON vars (engine string-free); leitura é por-thread (read em
-- inbox_threads), distinta do markNewsRead global. deadline_* são (season, week) do relógio do jogo.
CREATE TABLE IF NOT EXISTS inbox_threads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         INTEGER NOT NULL REFERENCES save_games(id),
  category        TEXT    NOT NULL,
  ref_kind        TEXT    NOT NULL DEFAULT 'none',
  ref_id          INTEGER,
  action_kind     TEXT    NOT NULL DEFAULT 'none',
  status          TEXT    NOT NULL DEFAULT 'open',
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
- [ ] **Step 4 — implementar DDL idêntico em `database-store.ts`.** Após o `await db.execAsync(\`...news_items...\`)` que fecha em `:218`, adicionar novo bloco:
```ts
      // C6 inbox: caixa de tarefas/decisões. Espelha exatamente a DDL de schema.ts.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS inbox_threads (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id         INTEGER NOT NULL REFERENCES save_games(id),
          category        TEXT    NOT NULL,
          ref_kind        TEXT    NOT NULL DEFAULT 'none',
          ref_id          INTEGER,
          action_kind     TEXT    NOT NULL DEFAULT 'none',
          status          TEXT    NOT NULL DEFAULT 'open',
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
      `);
```
- [ ] **Step 5 — rodar (passa):** `npx jest __tests__/database/inbox-schema.test.ts` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 6 — commit:** `git add src/database/schema.ts src/store/database-store.ts __tests__/database/inbox-schema.test.ts` · msg: `feat(c6): schema inbox_threads/inbox_messages (schema.ts + database-store)`.

---

## Task 3: Queries `inbox.ts` — open/append/getThreadView (TDD)

**Files:** Create `src/database/queries/inbox.ts`, Create `__tests__/database/inbox.test.ts`.
**Interfaces:** Consumes: `DbHandle` de `./players`, tipos de `@/engine/inbox/inbox-types`, `TKey` de `@/i18n/translate`. Produces: `openThread`, `appendMessage`, `getThreadView`, `toInboxMessage`, `toInboxThread`.

- [ ] **Step 1 — teste falhando** (criar `__tests__/database/inbox.test.ts`, molde de `news.test.ts`):
```ts
import Database from 'better-sqlite3';
import { createTestDb, seedTestDb, createTestDbHandle, TEST_SAVE_ID } from './test-helpers';
import { DbHandle } from '@/database/queries/players';
import { openThread, appendMessage, getThreadView } from '@/database/queries/inbox';
import type { TKey } from '@/i18n/translate';

const k = (s: string) => s as TKey;

describe('inbox queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  beforeEach(() => { rawDb = createTestDb(); seedTestDb(rawDb); db = createTestDbHandle(rawDb); });
  afterEach(() => rawDb.close());

  it('openThread cria thread + 1ª mensagem; getThreadView reconstrói descritores i18n', async () => {
    const id = await openThread(
      db, TEST_SAVE_ID,
      { category: 'transfer', refKind: 'transfer_offer', refId: 42, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: k('inbox.offer_received_title'), titleVars: { player: 'Silva' }, bodyKey: k('inbox.offer_received_body'), bodyVars: { fee: '$5.0M', club: 'ABC' }, icon: '💰' },
    );
    const view = await getThreadView(db, TEST_SAVE_ID, id);
    expect(view).not.toBeNull();
    expect(view!.category).toBe('transfer');
    expect(view!.refKind).toBe('transfer_offer');
    expect(view!.refId).toBe(42);
    expect(view!.actionKind).toBe('offer_response');
    expect(view!.status).toBe('open');
    expect(view!.deadlineWeek).toBe(8);
    expect(view!.read).toBe(false);
    expect(view!.lastWeek).toBe(5);
    expect(view!.messages).toHaveLength(1);
    expect(view!.messages[0].title.key).toBe('inbox.offer_received_title');
    expect(view!.messages[0].title.vars).toEqual({ player: 'Silva' });
    expect(view!.messages[0].body.vars).toEqual({ fee: '$5.0M', club: 'ABC' });
    expect(view!.messages[0].fromSelf).toBe(false);
  });

  it('appendMessage anexa, atualiza last_* e zera read', async () => {
    const id = await openThread(db, TEST_SAVE_ID, { category: 'transfer' },
      { season: 1, week: 5, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
    await appendMessage(db, TEST_SAVE_ID, id,
      { season: 1, week: 7, titleKey: k('inbox.offer_response_title'), bodyKey: k('inbox.offer_response_body'), icon: '✅', fromSelf: true });
    const view = await getThreadView(db, TEST_SAVE_ID, id);
    expect(view!.messages).toHaveLength(2);
    expect(view!.messages[1].fromSelf).toBe(true);
    expect(view!.lastWeek).toBe(7);
    expect(view!.read).toBe(false);
  });

  it('getThreadView devolve null para id inexistente / save alheio', async () => {
    const id = await openThread(db, TEST_SAVE_ID, { category: 'board' },
      { season: 1, week: 1, titleKey: k('inbox.board_title'), bodyKey: k('inbox.board_body'), icon: '🏛️' });
    expect(await getThreadView(db, 999999, id)).toBeNull();
    expect(await getThreadView(db, TEST_SAVE_ID, 999999)).toBeNull();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/inbox.test.ts` → falha (módulo `@/database/queries/inbox` inexistente).
- [ ] **Step 3 — implementar `src/database/queries/inbox.ts`** (parte 1; demais funções nas Tasks 4-5):
```ts
import type { DbHandle } from './players';
import type {
  InboxCategory, InboxActionKind, InboxRefKind,
  InboxThread, InboxMessage, InboxThreadView,
} from '@/engine/inbox/inbox-types';
import type { TKey } from '@/i18n/translate';

export interface NewThreadInput {
  category: InboxCategory;
  refKind?: InboxRefKind;
  refId?: number | null;
  actionKind?: InboxActionKind;
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
  fromSelf?: boolean;
}

interface ThreadRow {
  id: number; category: string; ref_kind: string; ref_id: number | null;
  action_kind: string; status: string; deadline_season: number | null;
  deadline_week: number | null; read: number; last_season: number; last_week: number;
}
interface MessageRow {
  id: number; thread_id: number; season: number; week: number;
  title_key: string; title_vars: string; body_key: string; body_vars: string;
  icon: string; from_self: number;
}

function parseVars(json: string): Record<string, string | number> | undefined {
  if (!json || json === '{}') return undefined;
  try {
    const v = JSON.parse(json) as Record<string, string | number>;
    return Object.keys(v).length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

export function toInboxThread(row: ThreadRow): InboxThread {
  return {
    id: row.id,
    category: row.category as InboxCategory,
    refKind: row.ref_kind as InboxRefKind,
    refId: row.ref_id,
    actionKind: row.action_kind as InboxActionKind,
    status: row.status as InboxThread['status'],
    deadlineSeason: row.deadline_season,
    deadlineWeek: row.deadline_week,
    read: row.read === 1,
    lastSeason: row.last_season,
    lastWeek: row.last_week,
  };
}

export function toInboxMessage(row: MessageRow): InboxMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    season: row.season,
    week: row.week,
    icon: row.icon,
    title: { key: row.title_key as TKey, vars: parseVars(row.title_vars) },
    body: { key: row.body_key as TKey, vars: parseVars(row.body_vars) },
    fromSelf: row.from_self === 1,
  };
}

async function insertMessage(db: DbHandle, saveId: number, threadId: number, msg: NewMessageInput): Promise<number> {
  const result = (await db
    .prepare(
      `INSERT INTO inbox_messages
         (save_id, thread_id, season, week, title_key, title_vars, body_key, body_vars, icon, from_self)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      saveId, threadId, msg.season, msg.week,
      msg.titleKey, JSON.stringify(msg.titleVars ?? {}),
      msg.bodyKey, JSON.stringify(msg.bodyVars ?? {}),
      msg.icon, msg.fromSelf ? 1 : 0,
    )) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function openThread(
  db: DbHandle, saveId: number, thread: NewThreadInput, first: NewMessageInput,
): Promise<number> {
  const result = (await db
    .prepare(
      `INSERT INTO inbox_threads
         (save_id, category, ref_kind, ref_id, action_kind, status, deadline_season, deadline_week, read, last_season, last_week)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, 0, ?, ?)`,
    )
    .run(
      saveId, thread.category, thread.refKind ?? 'none', thread.refId ?? null,
      thread.actionKind ?? 'none', thread.deadlineSeason ?? null, thread.deadlineWeek ?? null,
      first.season, first.week,
    )) as { lastInsertRowid: number | bigint };
  const threadId = Number(result.lastInsertRowid);
  await insertMessage(db, saveId, threadId, first);
  return threadId;
}

export async function appendMessage(
  db: DbHandle, saveId: number, threadId: number, msg: NewMessageInput,
): Promise<number> {
  const id = await insertMessage(db, saveId, threadId, msg);
  await db
    .prepare('UPDATE inbox_threads SET last_season = ?, last_week = ?, read = 0 WHERE save_id = ? AND id = ?')
    .run(msg.season, msg.week, saveId, threadId);
  return id;
}

export async function getThreadView(
  db: DbHandle, saveId: number, threadId: number,
): Promise<InboxThreadView | null> {
  const row = (await db
    .prepare(
      `SELECT id, category, ref_kind, ref_id, action_kind, status, deadline_season, deadline_week, read, last_season, last_week
       FROM inbox_threads WHERE save_id = ? AND id = ?`,
    )
    .get(saveId, threadId)) as ThreadRow | undefined;
  if (!row) return null;
  const msgRows = (await db
    .prepare(
      `SELECT id, thread_id, season, week, title_key, title_vars, body_key, body_vars, icon, from_self
       FROM inbox_messages WHERE save_id = ? AND thread_id = ? ORDER BY id ASC`,
    )
    .all(saveId, threadId)) as MessageRow[];
  return { ...toInboxThread(row), messages: msgRows.map(toInboxMessage) };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/inbox.test.ts` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/database/queries/inbox.ts __tests__/database/inbox.test.ts` · msg: `feat(c6): queries openThread/appendMessage/getThreadView com round-trip i18n`.

---

## Task 4: Queries de listagem/leitura/contagem (TDD)

**Files:** Modify `src/database/queries/inbox.ts`, Modify `__tests__/database/inbox.test.ts`.
**Interfaces:** Produces: `getThreads`, `markThreadRead`, `setThreadStatus`, `countUnreadThreads`, `countActionableThreads`, `getExpiredActionableThreads`.

- [ ] **Step 1 — teste falhando** (append no `describe` existente):
```ts
import {
  getThreads, markThreadRead, setThreadStatus,
  countUnreadThreads, countActionableThreads, getExpiredActionableThreads,
} from '@/database/queries/inbox';

it('getThreads ordena open antes de resolved, depois deadline asc', async () => {
  const a = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 12 },
    { season: 1, week: 5, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
  const b = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
    { season: 1, week: 5, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
  const c = await openThread(db, TEST_SAVE_ID, { category: 'loan' },
    { season: 1, week: 5, titleKey: k('inbox.loan_return_title'), bodyKey: k('inbox.loan_return_body'), icon: '↩️' });
  await setThreadStatus(db, TEST_SAVE_ID, c, 'resolved');
  const ids = (await getThreads(db, TEST_SAVE_ID)).map((t) => t.id);
  expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(a)); // deadline 8 antes de 12
  expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(c)); // open antes de resolved
});

it('markThreadRead marca só a thread alvo; counts refletem', async () => {
  const a = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response' },
    { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
  const b = await openThread(db, TEST_SAVE_ID, { category: 'loan' },
    { season: 1, week: 1, titleKey: k('inbox.loan_return_title'), bodyKey: k('inbox.loan_return_body'), icon: '↩️' });
  expect(await countUnreadThreads(db, TEST_SAVE_ID)).toBe(2);
  await markThreadRead(db, TEST_SAVE_ID, a);
  expect(await countUnreadThreads(db, TEST_SAVE_ID)).toBe(1);
  expect((await getThreadView(db, TEST_SAVE_ID, b))!.read).toBe(false);
});

it('countActionableThreads conta só open + action!=none', async () => {
  await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response' },
    { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
  await openThread(db, TEST_SAVE_ID, { category: 'loan', actionKind: 'none' },
    { season: 1, week: 1, titleKey: k('inbox.loan_return_title'), bodyKey: k('inbox.loan_return_body'), icon: '↩️' });
  const resolved = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response' },
    { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
  await setThreadStatus(db, TEST_SAVE_ID, resolved, 'resolved');
  expect(await countActionableThreads(db, TEST_SAVE_ID)).toBe(1);
});

it('getExpiredActionableThreads pega só vencidas (week==deadline conta)', async () => {
  const expired = await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 6 },
    { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
  await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 9 },
    { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
  await openThread(db, TEST_SAVE_ID, { category: 'loan', actionKind: 'none', deadlineSeason: 1, deadlineWeek: 6 },
    { season: 1, week: 1, titleKey: k('inbox.loan_return_title'), bodyKey: k('inbox.loan_return_body'), icon: '↩️' });
  const ids = (await getExpiredActionableThreads(db, TEST_SAVE_ID, 1, 6)).map((t) => t.id);
  expect(ids).toEqual([expired]); // week==deadline vencido; deadline 9 e a informativa fora
});

it('counts são save-isolados', async () => {
  await openThread(db, TEST_SAVE_ID, { category: 'transfer', actionKind: 'offer_response' },
    { season: 1, week: 1, titleKey: k('inbox.offer_received_title'), bodyKey: k('inbox.offer_received_body'), icon: '💰' });
  expect(await countUnreadThreads(db, 999999)).toBe(0);
  expect(await countActionableThreads(db, 999999)).toBe(0);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/database/inbox.test.ts` → falha (funções não exportadas).
- [ ] **Step 3 — implementar** (append ao fim de `src/database/queries/inbox.ts`):
```ts
export async function getThreads(
  db: DbHandle, saveId: number, opts?: { category?: InboxCategory },
): Promise<InboxThread[]> {
  const where = opts?.category ? 'save_id = ? AND category = ?' : 'save_id = ?';
  const params = opts?.category ? [saveId, opts.category] : [saveId];
  const rows = (await db
    .prepare(
      `SELECT id, category, ref_kind, ref_id, action_kind, status, deadline_season, deadline_week, read, last_season, last_week
       FROM inbox_threads WHERE ${where}
       ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END,
                CASE WHEN deadline_season IS NULL THEN 1 ELSE 0 END,
                deadline_season ASC, deadline_week ASC,
                last_season DESC, last_week DESC, id DESC`,
    )
    .all(...params)) as ThreadRow[];
  return rows.map(toInboxThread);
}

export async function markThreadRead(db: DbHandle, saveId: number, threadId: number): Promise<void> {
  await db.prepare('UPDATE inbox_threads SET read = 1 WHERE save_id = ? AND id = ?').run(saveId, threadId);
}

export async function setThreadStatus(
  db: DbHandle, saveId: number, threadId: number, status: 'open' | 'resolved' | 'expired',
): Promise<void> {
  await db.prepare('UPDATE inbox_threads SET status = ? WHERE save_id = ? AND id = ?').run(status, saveId, threadId);
}

export async function countUnreadThreads(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db
    .prepare('SELECT COUNT(*) AS n FROM inbox_threads WHERE save_id = ? AND read = 0')
    .get(saveId)) as { n: number } | undefined;
  return row?.n ?? 0;
}

export async function countActionableThreads(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db
    .prepare("SELECT COUNT(*) AS n FROM inbox_threads WHERE save_id = ? AND status = 'open' AND action_kind != 'none'")
    .get(saveId)) as { n: number } | undefined;
  return row?.n ?? 0;
}

export async function getExpiredActionableThreads(
  db: DbHandle, saveId: number, season: number, week: number,
): Promise<InboxThread[]> {
  const rows = (await db
    .prepare(
      `SELECT id, category, ref_kind, ref_id, action_kind, status, deadline_season, deadline_week, read, last_season, last_week
       FROM inbox_threads
       WHERE save_id = ? AND status = 'open' AND action_kind != 'none'
         AND deadline_season IS NOT NULL AND deadline_week IS NOT NULL
         AND (deadline_season < ? OR (deadline_season = ? AND deadline_week <= ?))`,
    )
    .all(saveId, season, season, week)) as ThreadRow[];
  return rows.map(toInboxThread);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/database/inbox.test.ts` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/database/queries/inbox.ts __tests__/database/inbox.test.ts` · msg: `feat(c6): listagem/leitura por-thread + contadores e vencidas`.

---

## Task 5: Resolver de ação (TDD, despacha p/ offer-processor)

**Files:** Create `src/engine/inbox/action-resolver.ts`, Create `__tests__/engine/inbox/action-resolver.test.ts`.
**Interfaces:** Consumes: `getThreadView`/`appendMessage`/`setThreadStatus` de `@/database/queries/inbox`; `acceptIncomingOffer`/`rejectIncomingOffer`/`counterIncomingOffer` de `@/engine/transfer/offer-processor`; `setJobOfferStatus` de `@/database/queries/job-offers`. Produces: `resolveInboxAction`, `ResolveActionParams`, `ResolveActionResult`.

- [ ] **Step 1 — teste falhando** (molde de seed do `offer-processor-news.test.ts`; criar `__tests__/engine/inbox/action-resolver.test.ts`):
```ts
import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { openThread, getThreadView } from '@/database/queries/inbox';
import { resolveInboxAction } from '@/engine/inbox/action-resolver';

function seed(db: import('better-sqlite3').Database): void {
  db.pragma('foreign_keys = OFF');
  db.prepare("INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1,'T',1,1,10,'normal',50,'','')").run();
  db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (1,?,?,?)').run('X', 'XX', 'Europe');
  db.prepare('INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (1,?,1,1,3,0,0)').run('L');
  for (const [id, name] of [[10, 'My Club'], [20, 'Other A']] as const) {
    db.prepare(`INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color)
      VALUES (?,1,?,?,1,1,70,100000000,1000000,'S',20000,3,3,3,'#1','#2')`).run(id, name, name.slice(0, 3));
  }
  db.prepare(`INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
    contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent)
    VALUES (1,1,?,?,26,'ST',null,10,20000,3,10000000,75,75,70,90,0,0)`).run('Souza', 'X');
  db.prepare(`INSERT INTO transfer_offers (id, save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type)
    VALUES (1,1,1,20,10,8000000,30000,'pending','transfer')`).run();
}

describe('resolveInboxAction', () => {
  it('accept transfere o jogador, fecha a thread e anexa msg fromSelf', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as any, bodyKey: 'inbox.offer_received_body' as any, icon: '💰' });
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'accept', season: 1, week: 6, playerClubId: 10 });
    expect(r).toMatchObject({ ok: true, newStatus: 'resolved' });
    const player = raw.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number };
    expect(player.club_id).toBe(20);
    const view = await getThreadView(db, 1, tid);
    expect(view!.status).toBe('resolved');
    expect(view!.messages.some((m) => m.fromSelf)).toBe(true);
    raw.close();
  });

  it('reject mantém o jogador e fecha a thread', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as any, bodyKey: 'inbox.offer_received_body' as any, icon: '💰' });
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'reject', season: 1, week: 6, playerClubId: 10 });
    expect(r.ok).toBe(true);
    expect((raw.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number }).club_id).toBe(10);
    expect((raw.prepare('SELECT status FROM transfer_offers WHERE id = 1').get() as { status: string }).status).toBe('rejected');
    raw.close();
  });

  it('counter exige fee>0 e marca offer countered', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as any, bodyKey: 'inbox.offer_received_body' as any, icon: '💰' });
    expect((await resolveInboxAction(db, 1, { threadId: tid, choice: 'counter', season: 1, week: 6, playerClubId: 10 })).reason).toBe('inbox.err_counter_fee');
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'counter', season: 1, week: 6, playerClubId: 10, counterFee: 12000000 });
    expect(r.ok).toBe(true);
    const offer = raw.prepare('SELECT status, fee_offered FROM transfer_offers WHERE id = 1').get() as { status: string; fee_offered: number };
    expect(offer.status).toBe('countered');
    expect(offer.fee_offered).toBe(12000000);
    raw.close();
  });

  it('accept após deadline marca expired e não transfere', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 6 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as any, bodyKey: 'inbox.offer_received_body' as any, icon: '💰' });
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'accept', season: 1, week: 7, playerClubId: 10 });
    expect(r).toMatchObject({ ok: false, reason: 'inbox.err_expired', newStatus: 'expired' });
    expect((raw.prepare('SELECT club_id FROM players WHERE id = 1').get() as { club_id: number }).club_id).toBe(10);
    raw.close();
  });

  it('accept de oferta já não-pending falha e mantém a thread aberta', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    raw.prepare("UPDATE transfer_offers SET status = 'rejected' WHERE id = 1").run();
    const tid = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 8 },
      { season: 1, week: 5, titleKey: 'inbox.offer_received_title' as any, bodyKey: 'inbox.offer_received_body' as any, icon: '💰' });
    const r = await resolveInboxAction(db, 1, { threadId: tid, choice: 'accept', season: 1, week: 6, playerClubId: 10 });
    expect(r.ok).toBe(false);
    expect((await getThreadView(db, 1, tid))!.status).toBe('open');
    raw.close();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/inbox/action-resolver.test.ts` → falha (módulo inexistente).
- [ ] **Step 3 — implementar `src/engine/inbox/action-resolver.ts`:**
```ts
import type { DbHandle } from '@/database/queries/players';
import type { InboxActionChoice } from './inbox-types';
import { getThreadView, appendMessage, setThreadStatus } from '@/database/queries/inbox';
import {
  acceptIncomingOffer, rejectIncomingOffer, counterIncomingOffer,
} from '@/engine/transfer/offer-processor';
import { setJobOfferStatus } from '@/database/queries/job-offers';

export interface ResolveActionParams {
  threadId: number;
  choice: InboxActionChoice;
  season: number;
  week: number;
  playerClubId: number | null;
  counterFee?: number;
}
export interface ResolveActionResult {
  ok: boolean;
  reason?: string;
  newStatus: 'open' | 'resolved' | 'expired';
}

function isExpired(deadlineSeason: number | null, deadlineWeek: number | null, season: number, week: number): boolean {
  if (deadlineSeason === null || deadlineWeek === null) return false;
  return deadlineSeason < season || (deadlineSeason === season && deadlineWeek < week);
}

export async function resolveInboxAction(
  db: DbHandle, saveId: number, params: ResolveActionParams,
): Promise<ResolveActionResult> {
  const view = await getThreadView(db, saveId, params.threadId);
  if (!view) return { ok: false, reason: 'inbox.err_not_found', newStatus: 'expired' };
  if (view.status !== 'open') return { ok: false, reason: 'inbox.err_resolved', newStatus: view.status };

  if (isExpired(view.deadlineSeason, view.deadlineWeek, params.season, params.week)) {
    await setThreadStatus(db, saveId, params.threadId, 'expired');
    return { ok: false, reason: 'inbox.err_expired', newStatus: 'expired' };
  }

  const { season, week } = params;

  if (view.actionKind === 'offer_response') {
    if (params.playerClubId === null) return { ok: false, reason: 'inbox.err_no_club', newStatus: 'open' };
    if (view.refId === null) return { ok: false, reason: 'inbox.err_not_found', newStatus: 'open' };
    if (params.choice === 'accept') {
      const res = await acceptIncomingOffer(db, saveId, view.refId, season, week);
      if (!res.success) return { ok: false, reason: 'inbox.err_offer_gone', newStatus: 'open' };
      await closeWithReply(db, saveId, params.threadId, season, week, 'inbox.offer_accepted_title', 'inbox.offer_accepted_body', '✅');
      return { ok: true, newStatus: 'resolved' };
    }
    if (params.choice === 'reject') {
      await rejectIncomingOffer(db, saveId, view.refId, week);
      await closeWithReply(db, saveId, params.threadId, season, week, 'inbox.offer_rejected_title', 'inbox.offer_rejected_body', '🚫');
      return { ok: true, newStatus: 'resolved' };
    }
    if (params.choice === 'counter') {
      if (!params.counterFee || params.counterFee <= 0) return { ok: false, reason: 'inbox.err_counter_fee', newStatus: 'open' };
      await counterIncomingOffer(db, saveId, view.refId, params.counterFee);
      await closeWithReply(db, saveId, params.threadId, season, week, 'inbox.offer_countered_title', 'inbox.offer_countered_body', '↔️');
      return { ok: true, newStatus: 'resolved' };
    }
    return { ok: false, reason: 'inbox.err_bad_choice', newStatus: 'open' };
  }

  if (view.actionKind === 'job_offer_response') {
    if (view.refId === null) return { ok: false, reason: 'inbox.err_not_found', newStatus: 'open' };
    const status = params.choice === 'accept' ? 'accepted' : 'expired';
    await setJobOfferStatus(db, saveId, season, view.refId, status);
    await closeWithReply(db, saveId, params.threadId, season, week,
      params.choice === 'accept' ? 'inbox.job_accepted_title' : 'inbox.job_rejected_title',
      params.choice === 'accept' ? 'inbox.job_accepted_body' : 'inbox.job_rejected_body', '🤝');
    return { ok: true, newStatus: 'resolved' };
  }

  // acknowledge / contract_renew: só fecha (open p/ navegação tratada na UI)
  await closeWithReply(db, saveId, params.threadId, season, week, 'inbox.ack_title', 'inbox.ack_body', '👍');
  return { ok: true, newStatus: 'resolved' };
}

async function closeWithReply(
  db: DbHandle, saveId: number, threadId: number, season: number, week: number,
  titleKey: string, bodyKey: string, icon: string,
): Promise<void> {
  await appendMessage(db, saveId, threadId, {
    season, week, titleKey: titleKey as never, bodyKey: bodyKey as never, icon, fromSelf: true,
  });
  await setThreadStatus(db, saveId, threadId, 'resolved');
}
```
Nota: `setJobOfferStatus` recebe `(db, saveId, season, offeringClubId, status)` (`job-offers.ts:66`); para threads `job_offer_response`, `refId` deve ser o `offering_club_id` (definido pelo produtor de job offer, fora do escopo desta task). Os `as never` nas chaves contornam o tipo `TKey` estrito sem alargar a API; as chaves reais entram no i18n na Task 9.
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/inbox/action-resolver.test.ts` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/engine/inbox/action-resolver.ts __tests__/engine/inbox/action-resolver.test.ts` · msg: `feat(c6): resolveInboxAction despacha p/ executores de oferta/emprego`.

---

## Task 6: Varredor de deadline (TDD, idempotente)

**Files:** Create `src/engine/inbox/deadline-sweeper.ts`, Create `__tests__/engine/inbox/deadline-sweeper.test.ts`.
**Interfaces:** Consumes: `getExpiredActionableThreads`/`setThreadStatus` de `@/database/queries/inbox`; `resolveInboxAction` de `./action-resolver`. Produces: `expireInboxDeadlines`.

- [ ] **Step 1 — teste falhando** (reusar o `seed` do teste do resolver, copiado inline; criar `__tests__/engine/inbox/deadline-sweeper.test.ts`):
```ts
import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { openThread, getThreadView } from '@/database/queries/inbox';
import { expireInboxDeadlines } from '@/engine/inbox/deadline-sweeper';

function seed(db: import('better-sqlite3').Database): void {
  db.pragma('foreign_keys = OFF');
  db.prepare("INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1,'T',1,1,10,'normal',50,'','')").run();
  db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (1,?,?,?)').run('X', 'XX', 'Europe');
  db.prepare('INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (1,?,1,1,3,0,0)').run('L');
  for (const [id, name] of [[10, 'My Club'], [20, 'Other A']] as const) {
    db.prepare(`INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color)
      VALUES (?,1,?,?,1,1,70,100000000,1000000,'S',20000,3,3,3,'#1','#2')`).run(id, name, name.slice(0, 3));
  }
  db.prepare(`INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
    contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent)
    VALUES (1,1,?,?,26,'ST',null,10,20000,3,10000000,75,75,70,90,0,0)`).run('Souza', 'X');
  db.prepare(`INSERT INTO transfer_offers (id, save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type)
    VALUES (1,1,1,20,10,8000000,30000,'pending','transfer')`).run();
}

describe('expireInboxDeadlines', () => {
  it('expira só a acionável vencida, aplica default reject e é idempotente', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    const expired = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 6 },
      { season: 1, week: 1, titleKey: 'inbox.offer_received_title' as any, bodyKey: 'inbox.offer_received_body' as any, icon: '💰' });
    const future = await openThread(db, 1, { category: 'transfer', refKind: 'transfer_offer', refId: 1, actionKind: 'offer_response', deadlineSeason: 1, deadlineWeek: 12 },
      { season: 1, week: 1, titleKey: 'inbox.offer_received_title' as any, bodyKey: 'inbox.offer_received_body' as any, icon: '💰' });
    const info = await openThread(db, 1, { category: 'loan', actionKind: 'none', deadlineSeason: 1, deadlineWeek: 6 },
      { season: 1, week: 1, titleKey: 'inbox.loan_return_title' as any, bodyKey: 'inbox.loan_return_body' as any, icon: '↩️' });

    const n = await expireInboxDeadlines(db, 1, 1, 7);
    expect(n).toBe(1);
    expect((await getThreadView(db, 1, expired))!.status).toBe('expired');
    expect((await getThreadView(db, 1, future))!.status).toBe('open');
    expect((await getThreadView(db, 1, info))!.status).toBe('open');
    expect((raw.prepare('SELECT status FROM transfer_offers WHERE id = 1').get() as { status: string }).status).toBe('rejected');

    expect(await expireInboxDeadlines(db, 1, 1, 7)).toBe(0); // idempotente
    raw.close();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/inbox/deadline-sweeper.test.ts` → falha (módulo inexistente).
- [ ] **Step 3 — implementar `src/engine/inbox/deadline-sweeper.ts`:**
```ts
import type { DbHandle } from '@/database/queries/players';
import type { InboxActionChoice, InboxActionKind } from './inbox-types';
import { getExpiredActionableThreads, setThreadStatus } from '@/database/queries/inbox';
import { resolveInboxAction } from './action-resolver';

// Ação default aplicada quando o prazo expira sem resposta do jogador.
const DEFAULT_CHOICE: Record<InboxActionKind, InboxActionChoice> = {
  none: 'ack',
  offer_response: 'reject',
  job_offer_response: 'reject',
  contract_renew: 'ack',
  acknowledge: 'ack',
};

export async function expireInboxDeadlines(
  db: DbHandle, saveId: number, season: number, week: number,
): Promise<number> {
  const expired = await getExpiredActionableThreads(db, saveId, season, week);
  let count = 0;
  for (const thread of expired) {
    // Aplica o efeito de domínio da ação default contra a season/week do PRAZO
    // (não a atual) p/ evitar o auto-bloqueio de "expirado" no resolver.
    const deadlineSeason = thread.deadlineSeason ?? season;
    const deadlineWeek = thread.deadlineWeek ?? week;
    await resolveInboxAction(db, saveId, {
      threadId: thread.id,
      choice: DEFAULT_CHOICE[thread.actionKind],
      season: deadlineSeason,
      week: deadlineWeek,
      playerClubId: null,
    });
    await setThreadStatus(db, saveId, thread.id, 'expired');
    count += 1;
  }
  return count;
}
```
Nota de design: `resolveInboxAction` com `playerClubId: null` rejeitaria `offer_response` por falta de clube. Para o sweeper, o efeito desejado de `reject` (marcar a oferta `rejected`) **não** depende do clube, então o sweeper chama o executor direto. Ajuste a implementação para despachar diretamente conforme a ação default em vez de passar por `resolveInboxAction` quando `playerClubId` é desconhecido:
```ts
// (substituir o corpo do for por:)
  for (const thread of expired) {
    if (thread.actionKind === 'offer_response' && thread.refId !== null) {
      await rejectIncomingOffer(db, saveId, thread.refId, week);
    } else if (thread.actionKind === 'job_offer_response' && thread.refId !== null) {
      await setJobOfferStatus(db, saveId, season, thread.refId, 'expired');
    }
    await setThreadStatus(db, saveId, thread.id, 'expired');
    count += 1;
  }
```
com imports `import { rejectIncomingOffer } from '@/engine/transfer/offer-processor';` e `import { setJobOfferStatus } from '@/database/queries/job-offers';` (remover o import de `resolveInboxAction` e o `DEFAULT_CHOICE` se não usados). O `count` reflete só as que estavam `open` (idempotência garantida porque `getExpiredActionableThreads` filtra `status='open'`).
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/inbox/deadline-sweeper.test.ts` → verde. `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/engine/inbox/deadline-sweeper.ts __tests__/engine/inbox/deadline-sweeper.test.ts` · msg: `feat(c6): expireInboxDeadlines determinístico e idempotente`.

---

## Task 7: Produtores + fiação no offer-processor (TDD)

**Files:** Create `src/engine/inbox/producers.ts`, Modify `src/engine/transfer/offer-processor.ts:221-225`, Modify `src/engine/transfer/loan-returns.ts`, Create `__tests__/engine/transfer/offer-processor-inbox.test.ts`.
**Interfaces:** Consumes: `openThread` de `@/database/queries/inbox`. Produces: `OFFER_TTL_WEEKS`, `WEEKS_PER_SEASON`, `addDeadlineWeeks`, `emitOfferReceived`, `emitLoanReturn`.

- [ ] **Step 1 — teste falhando** (criar `__tests__/engine/transfer/offer-processor-inbox.test.ts`, molde de `offer-processor-news.test.ts`):
```ts
import { createTestDb, createTestDbHandle } from '../../database/test-helpers';
import { processPendingOffers } from '@/engine/transfer/offer-processor';
import { getThreads } from '@/database/queries/inbox';
import { addDeadlineWeeks, OFFER_TTL_WEEKS, WEEKS_PER_SEASON } from '@/engine/inbox/producers';

function seed(db: import('better-sqlite3').Database): void {
  db.pragma('foreign_keys = OFF');
  db.prepare("INSERT INTO save_games (id, name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES (1,'T',1,1,10,'normal',50,'','')").run();
  db.prepare('INSERT INTO countries (id, name, code, continent) VALUES (1,?,?,?)').run('X', 'XX', 'Europe');
  db.prepare('INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (1,?,1,1,3,0,0)').run('L');
  for (const [id, name] of [[10, 'My Club'], [20, 'Other A'], [30, 'Other B']] as const) {
    db.prepare(`INSERT INTO clubs (id, save_id, name, short_name, country_id, league_id, reputation, budget, wage_budget,
      stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color)
      VALUES (?,1,?,?,1,1,70,100000000,1000000,'S',20000,3,3,3,'#1','#2')`).run(id, name, name.slice(0, 3));
  }
  const ins = (id: number, club: number) => db.prepare(`INSERT INTO players (id, save_id, name, nationality, age, position, secondary_position, club_id, wage,
    contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent)
    VALUES (?,1,?,?,26,'ST',null,?,20000,3,10000000,75,75,70,90,0,0)`).run(id, 'P' + id, 'X', club);
  ins(1, 10); // do clube do jogador → gera thread
  ins(2, 20); // de outro clube → não gera thread p/ o jogador
  db.prepare(`INSERT INTO transfer_offers (id, save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type)
    VALUES (1,1,1,20,10,8000000,30000,'pending','transfer')`).run();
  db.prepare(`INSERT INTO transfer_offers (id, save_id, player_id, offering_club_id, selling_club_id, fee_offered, wage_offered, status, offer_type)
    VALUES (2,1,2,30,20,8000000,30000,'pending','transfer')`).run();
}

describe('addDeadlineWeeks', () => {
  it('faz rollover de temporada puro', () => {
    expect(addDeadlineWeeks(1, 5, OFFER_TTL_WEEKS)).toEqual({ deadlineSeason: 1, deadlineWeek: 5 + OFFER_TTL_WEEKS });
    expect(addDeadlineWeeks(1, WEEKS_PER_SEASON - 1, 3)).toEqual({ deadlineSeason: 2, deadlineWeek: (WEEKS_PER_SEASON - 1 + 3) - WEEKS_PER_SEASON });
  });
});

describe('offer-processor inbox producer', () => {
  it('cria thread acionável quando o clube do jogador é o vendedor; nada p/ ofertas alheias', async () => {
    const raw = createTestDb(); seed(raw); const db = createTestDbHandle(raw);
    await processPendingOffers(db, 1, 1, 5, 10);
    const threads = await getThreads(db, 1);
    const transfer = threads.filter((t) => t.category === 'transfer' && t.actionKind === 'offer_response');
    expect(transfer).toHaveLength(1);
    expect(transfer[0].refKind).toBe('transfer_offer');
    expect(transfer[0].refId).toBe(1);
    expect(transfer[0].deadlineWeek).toBe(5 + OFFER_TTL_WEEKS);
    raw.close();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/transfer/offer-processor-inbox.test.ts` → falha (módulo `producers` inexistente + nenhuma thread criada).
- [ ] **Step 3 — implementar `src/engine/inbox/producers.ts`:**
```ts
import type { DbHandle } from '@/database/queries/players';
import { openThread } from '@/database/queries/inbox';

export const OFFER_TTL_WEEKS = 3;
export const WEEKS_PER_SEASON = 38;

export function addDeadlineWeeks(
  season: number, week: number, ttl: number,
): { deadlineSeason: number; deadlineWeek: number } {
  const total = week + ttl;
  if (total <= WEEKS_PER_SEASON) return { deadlineSeason: season, deadlineWeek: total };
  return { deadlineSeason: season + 1, deadlineWeek: total - WEEKS_PER_SEASON };
}

export async function emitOfferReceived(
  db: DbHandle, saveId: number,
  args: { offerId: number; playerName: string; offeringClubName: string; fee: number; season: number; week: number },
): Promise<number> {
  const { deadlineSeason, deadlineWeek } = addDeadlineWeeks(args.season, args.week, OFFER_TTL_WEEKS);
  return openThread(
    db, saveId,
    { category: 'transfer', refKind: 'transfer_offer', refId: args.offerId, actionKind: 'offer_response', deadlineSeason, deadlineWeek },
    {
      season: args.season, week: args.week,
      titleKey: 'inbox.offer_received_title' as never,
      titleVars: { player: args.playerName },
      bodyKey: 'inbox.offer_received_body' as never,
      bodyVars: { club: args.offeringClubName, fee: args.fee },
      icon: '💰',
    },
  );
}

export async function emitLoanReturn(
  db: DbHandle, saveId: number,
  args: { playerName: string; parentClubName: string; season: number; week: number },
): Promise<number> {
  return openThread(
    db, saveId,
    { category: 'loan', refKind: 'player', actionKind: 'none' },
    {
      season: args.season, week: args.week,
      titleKey: 'inbox.loan_return_title' as never,
      titleVars: { player: args.playerName },
      bodyKey: 'inbox.loan_return_body' as never,
      bodyVars: { club: args.parentClubName },
      icon: '↩️',
    },
  );
}
```
- [ ] **Step 4 — fiar no `offer-processor.ts`.** Substituir o ramo de `continue` em `:221-225` por emissão de thread (carregar nomes para os vars). O bloco atual é:
```ts
  for (const offer of pending) {
    // Skip offers where the user is the seller — the user decides those
    if (playerClubId !== null && offer.sellingClubId === playerClubId) {
      continue;
    }
```
Trocar por:
```ts
  for (const offer of pending) {
    // Player is the seller: don't auto-resolve — surface an actionable Inbox thread.
    if (playerClubId !== null && offer.sellingClubId === playerClubId) {
      const exists = (await db
        .prepare("SELECT id FROM inbox_threads WHERE save_id = ? AND ref_kind = 'transfer_offer' AND ref_id = ?")
        .get(saveId, offer.id)) as { id: number } | undefined;
      if (!exists) {
        const pl = (await db.prepare('SELECT name FROM players WHERE save_id = ? AND id = ?').get(saveId, offer.playerId)) as { name: string } | undefined;
        const cl = (await db.prepare('SELECT name FROM clubs WHERE save_id = ? AND id = ?').get(saveId, offer.offeringClubId)) as { name: string } | undefined;
        await emitOfferReceived(db, saveId, {
          offerId: offer.id,
          playerName: pl?.name ?? '',
          offeringClubName: cl?.name ?? '',
          fee: offer.feeOffered,
          season, week,
        });
      }
      continue;
    }
```
e adicionar no topo de `offer-processor.ts` (junto dos imports): `import { emitOfferReceived } from '@/engine/inbox/producers';`. A guarda `exists` evita threads duplicadas quando `processPendingOffers` roda toda semana sobre a mesma oferta pendente. Confirmar o campo `offer.feeOffered` lendo o tipo de `getPendingOffers` (`grep -n "feeOffered\|fee_offered" src/engine/transfer/offer-processor.ts`); se o objeto usar snake_case, ajustar.
- [ ] **Step 5 — fiar no `loan-returns.ts`.** Após o player ser movido de volta ao clube-pai (dentro do loop sobre `loans`), chamar `emitLoanReturn`. Como `returnExpiredLoans(db, saveId, season)` não recebe `week`, emitir com `week: WEEKS_PER_SEASON` (fim de temporada) e nomes via lookup. Adicionar import `import { emitLoanReturn, WEEKS_PER_SEASON } from '@/engine/inbox/producers';` e, no ponto onde o retorno é efetivado, antes do `return` final:
```ts
    const pl = (await db.prepare('SELECT name FROM players WHERE save_id = ? AND id = ?').get(saveId, loan.player_id)) as { name: string } | undefined;
    const cl = loan.from_club_id !== null
      ? (await db.prepare('SELECT name FROM clubs WHERE save_id = ? AND id = ?').get(saveId, loan.from_club_id)) as { name: string } | undefined
      : undefined;
    await emitLoanReturn(db, saveId, { playerName: pl?.name ?? '', parentClubName: cl?.name ?? '', season, week: WEEKS_PER_SEASON });
```
(posicionar dentro do `for (const loan of loans)` onde o UPDATE de `club_id` acontece — ler `loan-returns.ts` por completo no momento da execução para o ponto exato).
- [ ] **Step 6 — rodar (passa):** `npx jest __tests__/engine/transfer/offer-processor-inbox.test.ts` → verde. Rodar a suíte de transfer p/ não regredir: `npx jest __tests__/engine/transfer`. `npx tsc --noEmit` → exit 0.
- [ ] **Step 7 — commit:** `git add src/engine/inbox/producers.ts src/engine/transfer/offer-processor.ts src/engine/transfer/loan-returns.ts __tests__/engine/transfer/offer-processor-inbox.test.ts` · msg: `feat(c6): produtores de Inbox + fiação de oferta-recebida e retorno de empréstimo`.

---

## Task 8: Sweeper no game-loop + badge no game-store

**Files:** Modify `src/engine/game-loop.ts:574-575`, Modify `src/store/game-store.ts:62-63,195,237`.
**Interfaces:** Consumes: `expireInboxDeadlines`; `countUnreadThreads`/`countActionableThreads`. Produces: counts no game-loop e no store.

- [ ] **Step 1 — fiar o sweeper no `game-loop.ts`.** Antes da chamada `processPendingOffers` em `:575`, inserir:
```ts
  // 3c-pre. Expira itens acionáveis da Inbox cujo prazo venceu (default action) antes de
  //         processar novas ofertas, p/ o badge refletir só pendências reais da semana.
  await expireInboxDeadlines(db, saveId, season, week);
```
e adicionar o import no topo: `import { expireInboxDeadlines } from '@/engine/inbox/deadline-sweeper';`.
- [ ] **Step 2 — type-check:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 3 — estado/actions no `game-store.ts`.** No bloco `GameState` (junto de `unreadNewsCount` em `:63`):
```ts
  // C6 inbox: badges. actionable tem prioridade na aba.
  unreadInboxCount: number;
  actionableInboxCount: number;
```
Na interface `GameActions` (junto das actions de news):
```ts
  setInboxCounts: (counts: { unread: number; actionable: number }) => void;
  refreshInboxCounts: (db: DbHandle) => Promise<void>;
```
No estado inicial (`startNewGame` e `loadSave`, junto de `unreadNewsCount: 0` em `:195`): adicionar `unreadInboxCount: 0, actionableInboxCount: 0,`. Nas actions (junto de `refreshUnreadNewsCount` em `:238`):
```ts
  setInboxCounts: ({ unread, actionable }) => set({ unreadInboxCount: unread, actionableInboxCount: actionable }),
  refreshInboxCounts: async (db) => {
    const save = get().currentSave;
    if (!save) return;
    const [unread, actionable] = await Promise.all([
      countUnreadThreads(db, save.id),
      countActionableThreads(db, save.id),
    ]);
    set({ unreadInboxCount: unread, actionableInboxCount: actionable });
  },
```
e importar no topo: `import { countUnreadThreads, countActionableThreads } from '@/database/queries/inbox';` (espelhar o import de `countUnread`). Confirmar o tipo `DbHandle` já importado no game-store (usado por `refreshUnreadNewsCount`); reusar.
- [ ] **Step 4 — type-check + suíte do store:** `npx tsc --noEmit` → exit 0. `npx jest __tests__/store` (se houver testes de store) → verde.
- [ ] **Step 5 — commit:** `git add src/engine/game-loop.ts src/store/game-store.ts` · msg: `feat(c6): sweeper no advanceGameWeek + contadores de Inbox no store`.

---

## Task 9: i18n pt/en do bloco `inbox.*`

**Files:** Modify `src/i18n/pt.ts`, Modify `src/i18n/en.ts`.
**Interfaces:** Produces: chaves `inbox.*` (paridade). Consome: nada.

- [ ] **Step 1 — teste falhando:** o teste de paridade já existe (`__tests__/i18n/parity.test.ts`). Rodá-lo após adicionar só ao `pt.ts` deve falhar por chave faltante em `en.ts` — mas vamos adicionar nos dois. Primeiro confirmar o nome/forma do teste: `grep -rn "parity\|toEqual(Object.keys" __tests__/i18n/`. O DoD desta task é o parity verde.
- [ ] **Step 2 — adicionar em `pt.ts`** (no objeto de traduções, agrupado; valores pt):
```ts
  'inbox.tab': 'Caixa',
  'inbox.title': 'Caixa de Entrada',
  'inbox.empty': 'Nenhuma mensagem.',
  'inbox.filter_all': 'Todas',
  'inbox.cat_board': 'Diretoria',
  'inbox.cat_contract': 'Contrato',
  'inbox.cat_loan': 'Empréstimo',
  'inbox.cat_sponsor': 'Patrocínio',
  'inbox.cat_scout': 'Observação',
  'inbox.cat_injury': 'Lesão',
  'inbox.cat_transfer': 'Transferência',
  'inbox.status_open': 'Aberta',
  'inbox.status_resolved': 'Resolvida',
  'inbox.status_expired': 'Expirada',
  'inbox.deadline': 'Prazo: T{season} S{week}',
  'inbox.action_accept': 'Aceitar',
  'inbox.action_reject': 'Recusar',
  'inbox.action_counter': 'Contrapor',
  'inbox.action_open': 'Abrir',
  'inbox.action_ack': 'Ok',
  'inbox.counter_fee_label': 'Valor da contraproposta',
  'inbox.offer_received_title': 'Proposta por {player}',
  'inbox.offer_received_body': '{club} ofereceu {fee} por {player}.',
  'inbox.offer_accepted_title': 'Proposta aceita',
  'inbox.offer_accepted_body': 'Você aceitou a proposta por {player}.',
  'inbox.offer_rejected_title': 'Proposta recusada',
  'inbox.offer_rejected_body': 'Você recusou a proposta.',
  'inbox.offer_countered_title': 'Contraproposta enviada',
  'inbox.offer_countered_body': 'Você pediu {fee}.',
  'inbox.loan_return_title': 'Retorno de empréstimo',
  'inbox.loan_return_body': '{player} retornou de {club}.',
  'inbox.job_accepted_title': 'Proposta de emprego aceita',
  'inbox.job_accepted_body': 'Você aceitou o cargo.',
  'inbox.job_rejected_title': 'Proposta de emprego recusada',
  'inbox.job_rejected_body': 'Você recusou o cargo.',
  'inbox.board_title': 'Mensagem da diretoria',
  'inbox.board_body': '{message}',
  'inbox.ack_title': 'Confirmado',
  'inbox.ack_body': 'Mensagem lida.',
  'inbox.confirm_accept': 'Aceitar esta proposta?',
  'inbox.confirm_reject': 'Recusar esta proposta?',
  'inbox.toast_done': 'Feito.',
  'inbox.toast_error': 'Não foi possível concluir.',
  'inbox.err_expired': 'Prazo expirado.',
  'inbox.err_resolved': 'Esta thread já foi resolvida.',
  'inbox.err_not_found': 'Item não encontrado.',
  'inbox.err_offer_gone': 'A proposta não está mais disponível.',
  'inbox.err_counter_fee': 'Informe um valor de contraproposta válido.',
  'inbox.err_no_club': 'Sem clube para executar a ação.',
  'inbox.err_bad_choice': 'Ação inválida.',
```
- [ ] **Step 3 — adicionar em `en.ts`** as mesmas chaves com valores em inglês (mesma ordem):
```ts
  'inbox.tab': 'Inbox',
  'inbox.title': 'Inbox',
  'inbox.empty': 'No messages.',
  'inbox.filter_all': 'All',
  'inbox.cat_board': 'Board',
  'inbox.cat_contract': 'Contract',
  'inbox.cat_loan': 'Loan',
  'inbox.cat_sponsor': 'Sponsor',
  'inbox.cat_scout': 'Scouting',
  'inbox.cat_injury': 'Injury',
  'inbox.cat_transfer': 'Transfer',
  'inbox.status_open': 'Open',
  'inbox.status_resolved': 'Resolved',
  'inbox.status_expired': 'Expired',
  'inbox.deadline': 'Deadline: S{season} W{week}',
  'inbox.action_accept': 'Accept',
  'inbox.action_reject': 'Reject',
  'inbox.action_counter': 'Counter',
  'inbox.action_open': 'Open',
  'inbox.action_ack': 'OK',
  'inbox.counter_fee_label': 'Counter fee',
  'inbox.offer_received_title': 'Bid for {player}',
  'inbox.offer_received_body': '{club} offered {fee} for {player}.',
  'inbox.offer_accepted_title': 'Bid accepted',
  'inbox.offer_accepted_body': 'You accepted the bid for {player}.',
  'inbox.offer_rejected_title': 'Bid rejected',
  'inbox.offer_rejected_body': 'You rejected the bid.',
  'inbox.offer_countered_title': 'Counter sent',
  'inbox.offer_countered_body': 'You asked for {fee}.',
  'inbox.loan_return_title': 'Loan return',
  'inbox.loan_return_body': '{player} returned from {club}.',
  'inbox.job_accepted_title': 'Job offer accepted',
  'inbox.job_accepted_body': 'You accepted the role.',
  'inbox.job_rejected_title': 'Job offer rejected',
  'inbox.job_rejected_body': 'You declined the role.',
  'inbox.board_title': 'Board message',
  'inbox.board_body': '{message}',
  'inbox.ack_title': 'Acknowledged',
  'inbox.ack_body': 'Message read.',
  'inbox.confirm_accept': 'Accept this bid?',
  'inbox.confirm_reject': 'Reject this bid?',
  'inbox.toast_done': 'Done.',
  'inbox.toast_error': 'Could not complete.',
  'inbox.err_expired': 'Deadline expired.',
  'inbox.err_resolved': 'This thread is already resolved.',
  'inbox.err_not_found': 'Item not found.',
  'inbox.err_offer_gone': 'The bid is no longer available.',
  'inbox.err_counter_fee': 'Enter a valid counter fee.',
  'inbox.err_no_club': 'No club to execute the action.',
  'inbox.err_bad_choice': 'Invalid action.',
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/i18n/parity.test.ts` → verde. `npx tsc --noEmit` → exit 0 (as chaves agora existem; pode-se remover os `as never` das Tasks 5/7 se `TKey` for derivado do pt.ts — verificar e, se sim, trocar `as never`/`as any` por chamadas tipadas em mini-commit de limpeza).
- [ ] **Step 5 — commit:** `git add src/i18n/pt.ts src/i18n/en.ts` · msg: `feat(c6): i18n pt/en do bloco inbox.* (paridade)`.

---

## Task 10: Navegação — aba InboxTab + Stack InboxThread

**Files:** Modify `src/navigation/types.ts`, Modify `src/navigation/TabNavigator.tsx`, Modify `src/navigation/RootNavigator.tsx`.
**Interfaces:** Produces: rotas `InboxTab` e `InboxThread: { threadId: number }`.

- [ ] **Step 1 — tipos.** Em `types.ts`, no `RootStackParamList` (junto de `JobOffers` em `:53`): `InboxThread: { threadId: number };`. No `TabParamList` (junto de `NewsTab` em `:61`): `InboxTab: undefined;`.
- [ ] **Step 2 — aba.** Em `TabNavigator.tsx`: importar `import { InboxScreen } from '@/screens/inbox/InboxScreen';` e `const inboxBadge = useGameStore((s) => s.actionableInboxCount || s.unreadInboxCount);`. Adicionar `<Tab.Screen>` após a `NewsTab`:
```tsx
      <Tab.Screen
        name="InboxTab"
        component={InboxScreen}
        options={{
          title: t('inbox.tab'),
          tabBarBadge: inboxBadge > 0 ? inboxBadge : undefined,
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: fontSize.xl }}>📨</Text>,
        }}
      />
```
- [ ] **Step 3 — Stack.** Em `RootNavigator.tsx`, importar `InboxThreadScreen` e registrar (espelhando o registro de `OffersReceived` em `:88`):
```tsx
      <RootStack.Screen name="InboxThread" component={InboxThreadScreen} options={{ title: t('inbox.title') }} />
```
- [ ] **Step 4 — type-check:** `npx tsc --noEmit` → exit 0 (vai exigir que `InboxScreen`/`InboxThreadScreen` existam; criados na Task 11 — então **executar a Task 11 antes do tsc desta**, ou criar stubs mínimos primeiro). Para manter bite-sized, criar stubs vazios (`export function InboxScreen() { return null; }`) e substituí-los na Task 11.
- [ ] **Step 5 — commit:** `git add src/navigation/types.ts src/navigation/TabNavigator.tsx src/navigation/RootNavigator.tsx` · msg: `feat(c6): aba InboxTab com badge + Stack InboxThread`.

---

## Task 11: Telas InboxScreen + InboxThreadScreen (kit do Design System)

**Files:** Create `src/screens/inbox/InboxScreen.tsx`, Create `src/screens/inbox/InboxThreadScreen.tsx`.
**Interfaces:** Consumes: `getThreads`/`getThreadView`/`markThreadRead` de `@/database/queries/inbox`; `resolveInboxAction` de `@/engine/inbox/action-resolver`; `refreshInboxCounts` do store; `useDatabase`/`useTranslation`; kit `Card`/`Button`/`Text`/`Icon`/`EmptyState`/`Toast`/`useConfirm` (se Design System mergeado) ou tokens `@/theme` como stop-gap.

- [ ] **Step 1 — InboxScreen.** Substituir o stub por uma tela que: no `useFocusEffect` carrega `getThreads(db, saveId)`, agrupa por `category`, e renderiza cada thread num `Card` (ícone da categoria, título da 1ª/última mensagem via `t(msg.title.key, msg.title.vars)`, badge "pendente" quando `status==='open' && actionKind!=='none'`, badge "não-lida" quando `!read`, e o prazo via `t('inbox.deadline', {...})` quando houver). `EmptyState` com `inbox.empty` quando vazio. Tocar numa thread → `navigation.navigate('InboxThread', { threadId })`. Espelhar a estrutura de carregamento da `NewsScreen.tsx` (mesmo padrão de `useDatabase`/store). Após render, `refreshInboxCounts(db)`.
- [ ] **Step 2 — InboxThreadScreen.** Lê `route.params.threadId`; no mount chama `getThreadView` + `markThreadRead` + `refreshInboxCounts`. Renderiza a lista de mensagens (bolhas; `fromSelf` alinhada à direita). Barra de ação só quando `status==='open' && actionKind!=='none' && !vencido`: `Button`s mapeados por `actionKind` (`offer_response` → Aceitar/Recusar/Contrapor com input de fee; `job_offer_response` → Aceitar/Recusar; `contract_renew` → Abrir [deep-link p/ tela de renovação]; `acknowledge` → Ok). Tap → `useConfirm(t('inbox.confirm_*'))` → `resolveInboxAction(db, saveId, { threadId, choice, season, week, playerClubId, counterFee })`. Em `ok` → `Toast(inbox.toast_done)` + recarregar view + `refreshInboxCounts`; em `!ok` → `Toast(t(reason))`. **Nunca** usar `Alert.alert` (no-op no Web). `season`/`week`/`playerClubId` vêm do `game-store`.
- [ ] **Step 3 — type-check:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 4 — suíte completa:** `npx jest` → tudo verde (incl. `career-loop.e2e`, parity, transfer). Rodar a e2e 5× p/ zero flake (padrão W3): `for i in 1 2 3 4 5; do npx jest career-loop || break; done`.
- [ ] **Step 5 — browser (Playwright MCP).** `npm run web` (background). Navegar: avançar semanas até receber uma oferta pelo seu jogador → aba Caixa mostra badge → abrir a thread → Aceitar/Recusar/Contrapor funciona, Toast aparece, badge decrementa, 0 erros de console.
- [ ] **Step 6 — commit:** `git add src/screens/inbox/InboxScreen.tsx src/screens/inbox/InboxThreadScreen.tsx` · msg: `feat(c6): telas InboxScreen + InboxThreadScreen com ação inline e deadline`.

---

## Task 12: Verificação final (DoD)

**Files:** nenhuma (gate).

- [ ] **Step 1:** `npx tsc --noEmit && npx jest` — verde, incl. `career-loop.e2e`, `parity`, `__tests__/database/inbox.test.ts`, `__tests__/engine/inbox/*`, `offer-processor-inbox`.
- [ ] **Step 2:** `grep -rn "Math.random\|Date.now\|new Date(" src/engine/inbox src/database/queries/inbox.ts` → vazio (determinismo).
- [ ] **Step 3:** `grep -rn "Alert.alert" src/screens/inbox` → vazio (RN Web).
- [ ] **Step 4 — DoD:** schema nos dois arquivos; queries+resolver+sweeper+produtores testados; sweeper fiado no game-loop; badge no store/aba; i18n paritário; telas validadas no browser; `git diff` revisado.

---

## Self-Review
1. **Cobertura do spec:** schema (T2), queries CRUD/contagem/vencidas (T3-T4), resolver com despacho a offer-processor/job-offers (T5), sweeper determinístico+idempotente (T6), produtores+fiação oferta/empréstimo (T7), sweeper no game-loop + badge no store (T8), i18n paridade (T9), navegação (T10), telas com ação inline+deadline+useConfirm (T11), verificação (T12). Out-of-scope do spec (composição livre, push, reescrita da NewsScreen, migração das telas órfãs) não entra.
2. **Placeholder scan:** sem "TBD"/"FIXME". Pontos marcados como "ler no momento da execução" (ponto exato do UPDATE em `loan-returns.ts`; forma do `parity.test.ts`; campo `feeOffered` vs snake_case) são verificações de aterramento, não comportamento indefinido. Os `as never`/`as any` nas chaves i18n têm passo de limpeza explícito na T9-Step4 quando `TKey` deriva de `pt.ts`.
3. **Consistência de tipos:** `InboxActionKind`↔despacho (offer_response→accept/reject/counter; job_offer_response→accept/reject; acknowledge/contract_renew→ack/open). Badge `actionableInboxCount || unreadInboxCount` espelha `unreadNewsCount`. `DbHandle` reusado do mesmo módulo (`@/database/queries/players`) em engine, queries e store. `setJobOfferStatus(db,saveId,season,offeringClubId,status)` exige `refId=offering_club_id` para threads de emprego (documentado na T5).
