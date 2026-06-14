# W3 — Inbox/News Persistente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o feed de notícias persistente: uma tabela `news_items`, queries tipadas, badge de não-lidas na aba, e 6 produtores que gravam manchetes nos momentos certos (coletiva, transferências, diretoria, conquistas, scouting, convocações FIFA), com a `NewsScreen` mesclando persistidas + histórias de liga on-the-fly.

**Architecture:** Tabela `news_items` (save-isolada) declarada em schema.ts **e** garantida em runtime no database-store.ts. `src/database/queries/news.ts` expõe `insertNewsItem`/`getNewsItems`/`markNewsRead`/`countUnread` + `toNewsItem` (row→`NewsItem`). Produtores headless (engine/orquestradores que já têm `db/saveId/season/week`) chamam `insertNewsItem` no momento do evento. A `NewsScreen` carrega as persistidas da temporada, converte para `NewsItem`, mescla com os geradores efêmeros existentes (dedup por `id`, ordena por priority) e marca tudo como lido ao abrir. Badge na `NewsTab` lê `unreadNewsCount` do `game-store`.

**Tech Stack:** TypeScript 5.9 strict, expo-sqlite (runtime) / better-sqlite3 (testes reais em memória, nunca mock), Zustand, React Navigation v7, i18n pt/en com paridade.

**Faseamento:** W3a (infra + coletiva) → W3b (transferências, diretoria, conquistas) → W3c (scouting, convocações FIFA). Cada fase é mergeável e deixa o app funcionando.

**Convenções (obrigatórias):** TDD com better-sqlite3 real; coluna/tabela nova em **ambos** schema.ts e database-store.ts; save-isolation `(db, saveId, …)` com `save_id` no primeiro WHERE; i18n pt/en em paridade (pt.ts é a fonte; en.ts é `Record<keyof typeof pt, string>`); tokens de `@/theme`; **zero** `Math.random`/`Date.now`/`ORDER BY RANDOM` em caminhos de engine. Os produtores **não** podem quebrar o `career-loop.e2e` (W0).

---

## Referências de código (verificadas 2026-06-14)

| Ponto | Arquivo:linha | Nota |
|---|---|---|
| SCHEMA_SQL (tabela achievements como molde) | `src/database/schema.ts:500-506` | PK + `save_id` + índice |
| Índices compostos | `src/database/schema.ts:463-484` | `CREATE INDEX IF NOT EXISTS` |
| Migração runtime (CREATE TABLE + addColumnIfMissing) | `src/store/database-store.ts:26-35, 113-136` | tabela nova vai aqui também |
| Padrão de query (insert/select tipado) | `src/database/queries/transfers.ts:69-94` | `DbHandle`, `(db, saveId, …)` |
| `DbHandle` | `src/database/queries/players.ts` | importado nas queries |
| NewsTab (sem badge hoje) | `src/navigation/TabNavigator.tsx:37-41` | adicionar `tabBarBadge` |
| `NewsItem` / `sortNews` | `src/engine/news/news-generator.ts:24-31, 777-779` | tipo alvo do merge |
| NewsScreen (regenera no mount) | `src/screens/news/NewsScreen.tsx:41-387` | mesclar + markRead |
| Coletiva `applyTone` | `src/screens/match/PressConferenceScreen.tsx:84-113` | tem `db/saveId/season`; `week` via store |
| Transferências `executeAcceptedTransfer` | `src/engine/transfer/offer-processor.ts:17-101` | tem `db/saveId/season/week` |
| Diretoria `evaluateSeasonEndBoard` | `src/engine/season/season-end-eval.ts:157-172` | tem `db/saveId/endedSeason/newSeason` + `board.outcome/consequence` |
| Conquistas `processAchievementCheckpoint` | `src/engine/achievements/achievements-checkpoint.ts:22-32` | tem `db/saveId/season/week`; retorna `AchievementDef[]` |
| Scouting `TODO(news)` | `src/engine/game-loop.ts:544` | `advanced.reachedFull`; tem `db/saveId/season/week/playerClubId` |
| Convocações FIFA | `src/engine/game-loop.ts:500-523` | `internationalCallUps[]`; mesmo escopo |
| i18n bloco news | `src/i18n/pt.ts` / `en.ts` (`news.*`) | adicionar chaves novas |
| Teste de paridade | `__tests__/i18n/parity.test.ts` | roda no full suite |
| game-store (`week`,`season`,`currentSave`,actions) | `src/store/game-store.ts:10-220` | adicionar `unreadNewsCount` |

**Decisão de fiação dos produtores:** cada produtor grava no ponto headless onde já tem `db/saveId/season/week`. Board (season-end) grava com `season=newSeason, week=1` para aparecer junto do season recap. Scouting/FIFA gravam dentro de `advanceGameWeek`. Achievements gravam **dentro** de `processAchievementCheckpoint` (cobre os 4 call-sites de uma vez). Transferências gravam dentro de `executeAcceptedTransfer` **apenas** quando o clube do jogador está envolvido (evita duplicar com o gerador efêmero de transferências grandes da liga).

---

# FASE W3a — Infra + produtor "coletiva"

## Task 1: Tabela `news_items` no schema e na migração runtime

**Files:**
- Modify: `src/database/schema.ts` (bloco SCHEMA_SQL + índices)
- Modify: `src/store/database-store.ts` (CREATE TABLE IF NOT EXISTS em runtime)

- [ ] **Step 1: Declarar a tabela no SCHEMA_SQL**

Em `src/database/schema.ts`, junto das outras tabelas (após `achievements`), adicionar:

```sql
CREATE TABLE IF NOT EXISTS news_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id     INTEGER NOT NULL REFERENCES save_games(id),
  season      INTEGER NOT NULL,
  week        INTEGER NOT NULL,
  category    TEXT    NOT NULL,
  title_key   TEXT    NOT NULL,
  title_vars  TEXT    NOT NULL DEFAULT '{}',
  body_key    TEXT    NOT NULL,
  body_vars   TEXT    NOT NULL DEFAULT '{}',
  icon        TEXT    NOT NULL DEFAULT '📰',
  priority    INTEGER NOT NULL DEFAULT 50,
  read        INTEGER NOT NULL DEFAULT 0
);
```

E junto aos `CREATE INDEX` (linhas ~463-484):

```sql
CREATE INDEX IF NOT EXISTS idx_news_save_season ON news_items(save_id, season, week);
CREATE INDEX IF NOT EXISTS idx_news_save_read   ON news_items(save_id, read);
```

- [ ] **Step 2: Garantir a tabela em runtime**

Em `src/store/database-store.ts`, no bloco de criação de tabelas em runtime (junto de `friendlies`, linhas ~113-136), adicionar **o mesmo DDL** (CREATE TABLE IF NOT EXISTS news_items + os dois índices). Manter idêntico ao schema.ts.

- [ ] **Step 3: Commit**

```bash
git add src/database/schema.ts src/store/database-store.ts
git commit -m "feat(news): tabela news_items (schema + migração runtime)"
```

## Task 2: queries/news.ts (TDD primeiro)

**Files:**
- Create: `src/database/queries/news.ts`
- Test: `__tests__/database/news.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

Em `__tests__/database/news.test.ts` (seguir o padrão dos testes de DB existentes: `better-sqlite3` real em memória + `seedTestDb`/`TEST_SAVE_ID`; copiar o cabeçalho de outro teste em `__tests__/database/`):

```typescript
import { createTestDb, TEST_SAVE_ID } from '../helpers/test-db'; // usar o helper real do repo
import { insertNewsItem, getNewsItems, markNewsRead, countUnread, toNewsItem } from '@/database/queries/news';

describe('news queries', () => {
  it('insere e recupera por temporada, ordenado por priority desc', async () => {
    const db = await createTestDb();
    await insertNewsItem(db, TEST_SAVE_ID, {
      season: 1, week: 5, category: 'transfer', icon: '💰',
      titleKey: 'news.persist_transfer_in_title', titleVars: { player: 'Silva' },
      bodyKey: 'news.persist_transfer_in_body', bodyVars: { fee: '$5.0M', from: 'ABC' }, priority: 70,
    });
    await insertNewsItem(db, TEST_SAVE_ID, {
      season: 1, week: 6, category: 'board', icon: '🏛️',
      titleKey: 'news.persist_board_met_title', bodyKey: 'news.persist_board_met_body', priority: 95,
    });
    const rows = await getNewsItems(db, TEST_SAVE_ID, 1);
    expect(rows).toHaveLength(2);
    expect(rows[0].priority).toBe(95); // ordenado por priority desc

    const item = toNewsItem(rows[0]);
    expect(item.title.key).toBe('news.persist_board_met_title');
    expect(item.category).toBe('board');
  });

  it('countUnread conta só não-lidas; markNewsRead zera', async () => {
    const db = await createTestDb();
    await insertNewsItem(db, TEST_SAVE_ID, { season: 1, week: 1, category: 'info', icon: 'ℹ️', titleKey: 'news.raw', bodyKey: 'news.raw', priority: 10 });
    await insertNewsItem(db, TEST_SAVE_ID, { season: 1, week: 2, category: 'info', icon: 'ℹ️', titleKey: 'news.raw', bodyKey: 'news.raw', priority: 10 });
    expect(await countUnread(db, TEST_SAVE_ID)).toBe(2);
    await markNewsRead(db, TEST_SAVE_ID);
    expect(await countUnread(db, TEST_SAVE_ID)).toBe(0);
  });

  it('é save-isolado', async () => {
    const db = await createTestDb();
    await insertNewsItem(db, TEST_SAVE_ID, { season: 1, week: 1, category: 'info', icon: 'ℹ️', titleKey: 'news.raw', bodyKey: 'news.raw', priority: 10 });
    expect(await countUnread(db, 999999)).toBe(0);
  });

  it('title_vars/body_vars persistem como JSON e voltam parseados', async () => {
    const db = await createTestDb();
    await insertNewsItem(db, TEST_SAVE_ID, {
      season: 2, week: 3, category: 'callup', icon: '🌍',
      titleKey: 'news.persist_callup_title', titleVars: { count: 3 },
      bodyKey: 'news.persist_callup_body', priority: 60,
    });
    const item = toNewsItem((await getNewsItems(db, TEST_SAVE_ID, 2))[0]);
    expect(item.title.vars).toEqual({ count: 3 });
  });
});
```

> **Nota:** confirmar o nome real do helper de DB de teste (`createTestDb`/`seedTestDb` e `TEST_SAVE_ID`) lendo um teste vizinho em `__tests__/database/` antes de rodar. Ajustar o import.

- [ ] **Step 2: Rodar o teste e verificar que falha**

Run: `npx jest __tests__/database/news.test.ts`
Expected: FAIL — `Cannot find module '@/database/queries/news'`.

- [ ] **Step 3: Implementar `src/database/queries/news.ts`**

```typescript
import type { DbHandle } from './players';
import type { NewsItem, NewsCategory } from '@/engine/news/news-generator';
import type { TKey } from '@/i18n/translate';

export interface NewsItemInput {
  season: number;
  week: number;
  category: NewsCategory;
  titleKey: TKey;
  titleVars?: Record<string, string | number>;
  bodyKey: TKey;
  bodyVars?: Record<string, string | number>;
  icon: string;
  priority: number;
}

export interface PersistedNewsRow {
  id: number;
  season: number;
  week: number;
  category: string;
  title_key: string;
  title_vars: string;
  body_key: string;
  body_vars: string;
  icon: string;
  priority: number;
  read: number;
}

export async function insertNewsItem(db: DbHandle, saveId: number, input: NewsItemInput): Promise<number> {
  const result = (await db
    .prepare(
      `INSERT INTO news_items
        (save_id, season, week, category, title_key, title_vars, body_key, body_vars, icon, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      saveId,
      input.season,
      input.week,
      input.category,
      input.titleKey,
      JSON.stringify(input.titleVars ?? {}),
      input.bodyKey,
      JSON.stringify(input.bodyVars ?? {}),
      input.icon,
      input.priority,
    )) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

export async function getNewsItems(db: DbHandle, saveId: number, season: number): Promise<PersistedNewsRow[]> {
  return (await db
    .prepare(
      `SELECT id, season, week, category, title_key, title_vars, body_key, body_vars, icon, priority, read
       FROM news_items WHERE save_id = ? AND season = ?
       ORDER BY priority DESC, week DESC, id DESC`,
    )
    .all(saveId, season)) as PersistedNewsRow[];
}

export async function markNewsRead(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('UPDATE news_items SET read = 1 WHERE save_id = ? AND read = 0').run(saveId);
}

export async function countUnread(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db
    .prepare('SELECT COUNT(*) AS n FROM news_items WHERE save_id = ? AND read = 0')
    .get(saveId)) as { n: number } | undefined;
  return row?.n ?? 0;
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

export function toNewsItem(row: PersistedNewsRow): NewsItem {
  return {
    id: `persist-${row.id}`,
    icon: row.icon,
    title: { key: row.title_key as TKey, vars: parseVars(row.title_vars) },
    body: { key: row.body_key as TKey, vars: parseVars(row.body_vars) },
    category: row.category as NewsCategory,
    priority: row.priority,
  };
}
```

- [ ] **Step 4: Rodar o teste e verificar que passa**

Run: `npx jest __tests__/database/news.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/database/queries/news.ts __tests__/database/news.test.ts
git commit -m "feat(news): queries tipadas (insert/get/markRead/countUnread) com TDD"
```

## Task 3: Categorias novas + chaves i18n base

**Files:**
- Modify: `src/engine/news/news-generator.ts` (estender `NewsCategory`)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts`
- Modify: `src/screens/news/NewsScreen.tsx` (estilos de card para categorias novas — opcional, fallback já existe)

- [ ] **Step 1: Estender `NewsCategory`**

Em `news-generator.ts:9-22`, adicionar as categorias dos produtores:

```typescript
export type NewsCategory =
  | 'headline' | 'result' | 'standings' | 'transfer' | 'injury'
  | 'topscorer' | 'info' | 'star' | 'streak' | 'comeback' | 'league'
  | 'season_recap' | 'retirement'
  | 'press' | 'board' | 'achievement' | 'scouting' | 'callup';
```

- [ ] **Step 2: Adicionar chaves i18n (pt.ts primeiro, depois en.ts — paridade)**

No bloco `news.*` de `pt.ts` e `en.ts`, adicionar (pt mostrado; espelhar em en):

```
// Coletiva (W3a)
'news.persist_press_positive_title': 'Coletiva: tom confiante',
'news.persist_press_positive_body': 'O técnico passou segurança à imprensa após a partida.',
'news.persist_press_negative_title': 'Coletiva: clima tenso',
'news.persist_press_negative_body': 'Declarações duras na entrevista coletiva.',
'news.persist_press_neutral_title': 'Coletiva pós-jogo',
'news.persist_press_neutral_body': 'O treinador comentou o resultado com cautela.',
```

> As chaves de W3b/W3c são adicionadas nas suas tasks. Manter `news.persist_*` como prefixo.

- [ ] **Step 3: Rodar paridade + tsc**

Run: `npx jest __tests__/i18n/parity.test.ts && npx tsc --noEmit`
Expected: PASS / sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/engine/news/news-generator.ts src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(news): categorias persistidas + chaves i18n da coletiva"
```

## Task 4: Produtor "coletiva" grava news na `applyTone`

**Files:**
- Modify: `src/screens/match/PressConferenceScreen.tsx`

- [ ] **Step 1: Persistir manchete ao aplicar o tom**

Em `applyTone` (após `setCurrentTrust(nextTrust)`, antes de `setResult(res)`), inserir a notícia. O `week` vem do store (`useGameStore((s) => s.week)` — adicionar o seletor no topo do componente junto de `season`). Mapear `res.confidenceDelta` (ou o `tone`) para positivo/negativo/neutro:

```typescript
const tier = res.confidenceDelta > 0 ? 'positive' : res.confidenceDelta < 0 ? 'negative' : 'neutral';
await insertNewsItem(dbHandle, saveId, {
  season, week,
  category: 'press', icon: '🎙️', priority: 65,
  titleKey: `news.persist_press_${tier}_title` as TKey,
  bodyKey: `news.persist_press_${tier}_body` as TKey,
});
```

Importar `insertNewsItem` de `@/database/queries/news` e `TKey` de `@/i18n/translate`. Após inserir, atualizar o badge: `useGameStore.getState().refreshUnreadNewsCount?.(dbHandle)` (a action é criada na Task 6 — se ainda não existir nesta fase, deixar a chamada protegida por `?.`).

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/screens/match/PressConferenceScreen.tsx
git commit -m "feat(news): coletiva persiste manchete em news_items"
```

## Task 5: NewsScreen mescla persistidas + marca como lido

**Files:**
- Modify: `src/screens/news/NewsScreen.tsx`

- [ ] **Step 1: Carregar e mesclar persistidas**

No `useEffect`, após montar `items` (antes do empty-state e `setNews(sortNews(items))`):

```typescript
// ── Persisted news (W3) — merge with on-the-fly stories ──
const persistedRows = await getNewsItems(dbHandle, saveId, season);
const persisted = persistedRows.map(toNewsItem);
const seen = new Set(items.map((i) => i.id));
for (const p of persisted) if (!seen.has(p.id)) items.push(p);
```

Importar `getNewsItems`, `toNewsItem` de `@/database/queries/news`.

- [ ] **Step 2: Marcar como lido ao abrir + zerar badge**

Ainda no `useEffect`, após `setNews(sortNews(items))`:

```typescript
await markNewsRead(dbHandle, saveId);
useGameStore.getState().setUnreadNewsCount?.(0);
```

Importar `markNewsRead`. (A action `setUnreadNewsCount` é criada na Task 6; usar `?.` se necessário nesta fase.)

- [ ] **Step 3: Validar no browser**

Subir o web server (background do harness, porta 8082, `--clear`), navegar até a aba Notícias após uma coletiva, confirmar que a manchete da coletiva aparece no feed. Sem erros no console.

- [ ] **Step 4: Commit**

```bash
git add src/screens/news/NewsScreen.tsx
git commit -m "feat(news): NewsScreen mescla persistidas + marca como lido"
```

## Task 6: Badge de não-lidas na NewsTab

**Files:**
- Modify: `src/store/game-store.ts` (campo `unreadNewsCount` + actions)
- Modify: `src/navigation/TabNavigator.tsx` (`tabBarBadge`)

- [ ] **Step 1: Estado no game-store**

Adicionar ao `GameState`: `unreadNewsCount: number` (default `0`); actions:

```typescript
setUnreadNewsCount: (n: number) => void;
refreshUnreadNewsCount: (db: DbHandle) => Promise<void>;
```

Implementação:

```typescript
unreadNewsCount: 0,
setUnreadNewsCount: (n) => set({ unreadNewsCount: n }),
refreshUnreadNewsCount: async (db) => {
  const save = get().currentSave;
  if (!save) return;
  const n = await countUnread(db, save.id);
  set({ unreadNewsCount: n });
},
```

Importar `countUnread` de `@/database/queries/news` e `DbHandle` de `@/database/queries/players`. Resetar `unreadNewsCount: 0` no `reset()`/`loadSave` conforme o padrão dos outros campos.

- [ ] **Step 2: Badge na NewsTab**

Em `TabNavigator.tsx:37-41`, ler o store e passar `tabBarBadge`:

```typescript
const unreadNews = useGameStore((s) => s.unreadNewsCount);
// ...
<Tab.Screen
  name="NewsTab"
  component={NewsScreen}
  options={{
    title: t('nav.tab_news'),
    tabBarBadge: unreadNews > 0 ? unreadNews : undefined,
    tabBarIcon: ({ color }) => <Text style={{ color, fontSize: fontSize.xl }}>📰</Text>,
  }}
/>
```

- [ ] **Step 3: Atualizar o badge após avançar semana**

No(s) ponto(s) que consomem `advanceGameWeek` (HomeScreen, onde a semana avança e o achievements checkpoint roda), chamar `refreshUnreadNewsCount(dbHandle)` após a persistência da semana. Garantir que, ao entrar na NewsScreen, o badge zera (Task 5 Step 2).

- [ ] **Step 4: Validar no browser**

Jogar 1 semana com um produtor ativo (coletiva) → badge aparece com contagem; abrir Notícias → badge zera. tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/store/game-store.ts src/navigation/TabNavigator.tsx src/screens/home/HomeScreen.tsx
git commit -m "feat(news): badge de não-lidas na NewsTab via game-store"
```

---

# FASE W3b — Produtores de alto impacto

## Task 7: Produtor de transferências (clube do jogador)

**Files:**
- Modify: `src/engine/transfer/offer-processor.ts`
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts`
- Test: `__tests__/engine/transfer/offer-processor-news.test.ts`

- [ ] **Step 1: Chaves i18n**

```
'news.persist_transfer_in_title': 'Reforço: {player}',
'news.persist_transfer_in_body': 'Contratado de {from} por {fee}.',
'news.persist_transfer_out_title': 'Saída: {player}',
'news.persist_transfer_out_body': 'Transferido para {to} por {fee}.',
```
(espelhar em en.ts)

- [ ] **Step 2: Teste falhando**

Em `__tests__/engine/transfer/offer-processor-news.test.ts`: criar DB real, seed com clube do jogador + um jogador, chamar `executeAcceptedTransfer` com `toClubId = playerClubId` e depois com `fromClubId = playerClubId`, e assertar que `getNewsItems` retorna 1 item de categoria `'transfer'` em cada caso (in/out). Assertar que transferência entre dois clubes **alheios** ao jogador **não** gera news persistida (continua sendo coberta pelo gerador efêmero). Passar `playerClubId` ao executor (ver Step 3).

Run: `npx jest offer-processor-news` → FAIL.

- [ ] **Step 3: Persistir no executor**

`executeAcceptedTransfer` já recebe `db, saveId, params{...season, week...}`. Adicionar um parâmetro opcional `playerClubId?: number | null` ao `params` e, após `createTransfer(...)`, se `playerClubId != null && (toClubId === playerClubId || fromClubId === playerClubId)`, inserir a news. Buscar o nome do jogador (já há query `getPlayerById`/equivalente — usar a existente) e os shortNames dos clubes:

```typescript
if (playerClubId != null && (toClubId === playerClubId || fromClubId === playerClubId)) {
  const incoming = toClubId === playerClubId;
  await insertNewsItem(db, saveId, {
    season, week, category: 'transfer', icon: incoming ? '✍️' : '🔁', priority: 72,
    titleKey: incoming ? 'news.persist_transfer_in_title' : 'news.persist_transfer_out_title',
    titleVars: { player: playerName },
    bodyKey: incoming ? 'news.persist_transfer_in_body' : 'news.persist_transfer_out_body',
    bodyVars: incoming ? { from: otherClubShort, fee: formatFee(fee) } : { to: otherClubShort, fee: formatFee(fee) },
  });
}
```

`processPendingOffers` (offer-processor.ts:114) já recebe `playerClubId` — repassar ao `executeAcceptedTransfer`. `formatFee` pode reusar o helper de `news-generator.ts` (exportá-lo se necessário) ou inline simples.

Run: `npx jest offer-processor-news` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/engine/transfer/offer-processor.ts src/i18n/pt.ts src/i18n/en.ts __tests__/engine/transfer/offer-processor-news.test.ts
git commit -m "feat(news): transferências do clube do jogador persistem manchete"
```

## Task 8: Produtor de diretoria (season-end board)

**Files:**
- Modify: `src/engine/season/season-end-eval.ts`
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts`
- Test: estender `__tests__/engine/season/season-end-eval*.test.ts` (ou criar `-news` vizinho)

- [ ] **Step 1: Chaves i18n**

```
'news.persist_board_met_title': 'Diretoria satisfeita',
'news.persist_board_met_body': 'A meta da temporada {season} foi cumprida.',
'news.persist_board_partial_title': 'Diretoria parcialmente satisfeita',
'news.persist_board_partial_body': 'A meta da temporada {season} foi cumprida em parte.',
'news.persist_board_failed_title': 'Diretoria insatisfeita',
'news.persist_board_failed_body': 'A meta da temporada {season} não foi atingida.',
'news.persist_board_fired_title': 'Você foi demitido',
'news.persist_board_fired_body': 'A diretoria encerrou seu ciclo após a temporada {season}.',
```
(espelhar em en.ts)

> **Valores reais (verificados em `src/types/board.ts`):** `TrustOutcome = 'objective_met' | 'objective_partial' | 'objective_failed'`; `TrustConsequence = 'none' | 'budget_cut' | 'budget_bonus' | 'fired'`. Não existe `'objective_exceeded'` nem `'dismissed'`.

- [ ] **Step 2: Teste falhando**

Estender o teste de `evaluateSeasonEndBoard`: após avaliar uma temporada, `getNewsItems(db, saveId, newSeason)` contém 1 item categoria `'board'` cujo `title_key` reflete `board.outcome`/`board.consequence`. Caso `consequence === 'dismissed'`, usa a chave `dismissed`.

Run: `npx jest season-end-eval` → FAIL no novo assert.

- [ ] **Step 3: Persistir após `processSeasonEndBoard`**

Em `season-end-eval.ts`, logo após obter `board` (linha ~172), inserir a news com `season: newSeason, week: 1` (aparece no recap da nova temporada):

```typescript
const boardTier = board.consequence === 'fired'
  ? 'fired'
  : board.outcome === 'objective_failed' ? 'failed'
  : board.outcome === 'objective_partial' ? 'partial' : 'met';
await insertNewsItem(db, saveId, {
  season: newSeason, week: 1, category: 'board',
  icon: boardTier === 'fired' ? '🚪' : boardTier === 'failed' ? '⚠️' : boardTier === 'partial' ? '🟡' : '🏛️',
  priority: boardTier === 'fired' ? 100 : 94,
  titleKey: `news.persist_board_${boardTier}_title` as TKey,
  bodyKey: `news.persist_board_${boardTier}_body` as TKey,
  bodyVars: { season: endedSeason },
});
```

Run: `npx jest season-end-eval` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/engine/season/season-end-eval.ts src/i18n/pt.ts src/i18n/en.ts __tests__/engine/season/
git commit -m "feat(news): diretoria (season-end) persiste manchete de meta/demissão"
```

## Task 9: Produtor de conquistas (achievements checkpoint)

**Files:**
- Modify: `src/engine/achievements/achievements-checkpoint.ts`
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts`
- Test: `__tests__/engine/achievements/achievements-checkpoint-news.test.ts`

- [ ] **Step 1: Chaves i18n**

```
'news.persist_achievement_title': 'Conquista desbloqueada!',
'news.persist_achievement_body': '{name}',
```
(espelhar em en.ts) — `name` recebe o título já traduzido do achievement? Não: o engine é puro. Usar a chave de nome do `AchievementDef` se existir (ex.: `def.titleKey`), passando `bodyKey: def.titleKey` direto. Se `AchievementDef` tiver `titleKey: TKey`, preferir:

```
'news.persist_achievement_title': 'Conquista desbloqueada!',
```
e usar `bodyKey: def.titleKey` (sem inventar texto).

- [ ] **Step 2: Teste falhando**

Forçar um snapshot que desbloqueia ≥1 achievement, chamar `processAchievementCheckpoint`, assertar que `getNewsItems` contém N itens categoria `'achievement'` (1 por def nova). Re-chamar com o mesmo snapshot → **não** duplica (já que `unlockAchievements` só retorna as novas).

Run: `npx jest achievements-checkpoint-news` → FAIL.

- [ ] **Step 3: Persistir dentro do checkpoint**

Em `processAchievementCheckpoint`, após obter `newlyIds`/`defs`, antes do `return`, inserir 1 news por def:

```typescript
const defs = newlyIds.map((id) => getAchievementDef(id)).filter((d): d is AchievementDef => d != null);
for (const def of defs) {
  await insertNewsItem(p.db, p.saveId, {
    season: p.season, week: p.week, category: 'achievement', icon: def.icon, priority: 96,
    titleKey: 'news.persist_achievement_title',
    bodyKey: def.titleKey, // chave já existente do AchievementDef (descKey também disponível)
  });
}
return defs;
```

> **Verificado em `src/engine/achievements/achievements-catalog.ts:7-11`:** `AchievementDef` tem `icon: string`, `titleKey: TKey`, `descKey: TKey`. Usar `def.icon` e `def.titleKey` — não hardcodar texto.

Run: `npx jest achievements-checkpoint-news` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/engine/achievements/achievements-checkpoint.ts src/i18n/pt.ts src/i18n/en.ts __tests__/engine/achievements/achievements-checkpoint-news.test.ts
git commit -m "feat(news): conquistas desbloqueadas persistem manchete"
```

---

# FASE W3c — Produtores restantes (dentro do game-loop)

## Task 10: Produtor de scouting (fecha o TODO(news))

**Files:**
- Modify: `src/engine/game-loop.ts` (linha ~544)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts`
- Test: `__tests__/engine/game-loop-news-scouting.test.ts` (ou estender um e2e de scouting existente)

- [ ] **Step 1: Chaves i18n**

```
'news.persist_scouting_title': 'Relatório de observação completo',
'news.persist_scouting_body': 'Seu olheiro concluiu a avaliação de um alvo.',
```
(espelhar em en.ts)

- [ ] **Step 2: Teste falhando**

Seed: clube do jogador + scout com ability alta + assignment de scouting com `knowledge` perto de 100. Rodar `advanceGameWeek` 1×. Assertar que `getNewsItems(db, saveId, season)` contém ≥1 item categoria `'scouting'` (o `reachedFull` disparou). Caso `knowledge` continue < 100, **nada** é gravado.

Run: `npx jest game-loop-news-scouting` → FAIL.

- [ ] **Step 3: Substituir o TODO(news)**

No bloco de scouting (game-loop.ts ~535-549), trocar o comentário `TODO(news)` por:

```typescript
if (advanced.reachedFull) {
  await insertNewsItem(db, saveId, {
    season, week, category: 'scouting', icon: '🔎', priority: 80,
    titleKey: 'news.persist_scouting_title',
    bodyKey: 'news.persist_scouting_body',
  });
}
```

`season`/`week` são params de `advanceGameWeek`. Importar `insertNewsItem`.

Run: `npx jest game-loop-news-scouting` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/engine/game-loop.ts src/i18n/pt.ts src/i18n/en.ts __tests__/engine/game-loop-news-scouting.test.ts
git commit -m "feat(news): revelação de scouting persiste manchete (fecha TODO)"
```

## Task 11: Produtor de convocações FIFA

**Files:**
- Modify: `src/engine/game-loop.ts` (bloco ~500-523)
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts`
- Test: `__tests__/engine/game-loop-news-callup.test.ts`

- [ ] **Step 1: Chaves i18n**

```
'news.persist_callup_title': 'Convocação internacional',
'news.persist_callup_body_one': '{count} jogador convocado para a seleção.',
'news.persist_callup_body_other': '{count} jogadores convocados para a seleção.',
```
(espelhar em en.ts)

- [ ] **Step 2: Teste falhando**

Seed: clube do jogador com jogadores de overall alto e nacionalidades variadas. Avançar até uma semana de pausa FIFA (`isInternationalBreak(week)`). Assertar que, quando `internationalCallUps.length > 0`, `getNewsItems` contém 1 item categoria `'callup'` com `titleVars.count === internationalCallUps.length`. Sem convocações → sem news.

Run: `npx jest game-loop-news-callup` → FAIL.

- [ ] **Step 3: Persistir após calcular `internationalCallUps`**

No bloco FIFA (após o `for` que preenche `internationalCallUps`, dentro do `if (isInternationalBreak(week))`):

```typescript
if (internationalCallUps.length > 0) {
  await insertNewsItem(db, saveId, {
    season, week, category: 'callup', icon: '🌍', priority: 75,
    titleKey: 'news.persist_callup_title',
    bodyKey: internationalCallUps.length === 1 ? 'news.persist_callup_body_one' : 'news.persist_callup_body_other',
    bodyVars: { count: internationalCallUps.length },
  });
}
```

Run: `npx jest game-loop-news-callup` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/engine/game-loop.ts src/i18n/pt.ts src/i18n/en.ts __tests__/engine/game-loop-news-callup.test.ts
git commit -m "feat(news): convocações FIFA persistem manchete"
```

## Task 12: Estilos de card para categorias novas + verificação final

**Files:**
- Modify: `src/screens/news/NewsScreen.tsx` (estilos opcionais para `press/board/achievement/scouting/callup`)

- [ ] **Step 1: Adicionar estilos de card (opcional, melhora visual)**

Em `NewsScreen.tsx`, adicionar entradas no `styles` e no array de `style` condicional do card para as 5 categorias novas (reusar `colors` de `@/theme`; ex.: `board` → `colors.gold`, `achievement` → `colors.success`, `scouting` → `colors.accent`, `callup` → `colors.primaryLight`, `press` → `colors.primary`). Categorias sem estilo já caem no fallback do `card` base — então isto é cosmético.

- [ ] **Step 2: Suíte completa + tsc + e2e**

Run: `npx tsc --noEmit && npm test`
Expected: tudo verde, incluindo `career-loop.e2e` (os 6 produtores não podem quebrar o loop). Rodar o e2e 5× para confirmar zero flake:
`for i in 1 2 3 4 5; do npx jest career-loop.e2e || break; done`

- [ ] **Step 3: Validação no browser (passe manual)**

Web server (porta 8082, `--clear`): jogar até pegar coletiva + uma transferência do clube + fim de temporada (board) → abrir Notícias, confirmar manchetes persistidas mescladas com as histórias de liga; badge incrementa ao longo das semanas e zera ao abrir. 0 erros de console.

- [ ] **Step 4: Commit**

```bash
git add src/screens/news/NewsScreen.tsx
git commit -m "feat(news): estilos de card para categorias persistidas"
```

---

## Self-Review (preencher antes do merge de cada fase)

**Cobertura do spec (W3):**
- [x] Tabela `news_items` (schema + runtime) com índice — Task 1
- [x] `queries/news.ts` (`insertNewsItem`/`getNewsItems`/`markNewsRead`/`countUnread`) com TDD — Task 2
- [x] Badge `tabBarBadge` via `countUnread` — Task 6
- [x] NewsScreen mescla persistidas + on-the-fly + marca lido — Task 5
- [x] Produtor coletiva — Task 4 (W3a)
- [x] Produtores transferências / diretoria / conquistas — Tasks 7–9 (W3b)
- [x] Produtores scouting (fecha TODO) / convocações FIFA — Tasks 10–11 (W3c)
- [x] i18n por produtor com paridade — em cada task

**Consistência de tipos:** `NewsItemInput` (camelCase) ↔ colunas (snake_case) mapeadas só dentro de `news.ts`. `toNewsItem` reconstrói `NewsItem` com `id: persist-<rowId>` (não colide com ids efêmeros). `NewsCategory` estendido antes de qualquer produtor usá-lo.

**Riscos:** (1) dedup persistido×efêmero — resolvido por prefixo de id distinto + transferências persistidas só do clube do jogador; (2) badge reativo — `unreadNewsCount` no store, refresh após advanceWeek e zero ao abrir NewsScreen; (3) os 6 produtores rodam em caminhos já cobertos pelo `career-loop.e2e` — Task 12 valida 5×.

## Notas de verificação ao executar (confirmar contra o código real, não inventar)
- Nome do helper de DB de teste (`createTestDb`/`seedTestDb`, `TEST_SAVE_ID`) — ler um teste vizinho em `__tests__/database/`.
- Valores exatos de `board.outcome`/`board.consequence` em `season-end-board.ts`.
- Campo de título em `AchievementDef` (`titleKey`/`nameKey`).
- Query existente para nome de jogador e shortName de clube no `offer-processor.ts`.
- Onde `advanceGameWeek` é consumido na UI para encaixar `refreshUnreadNewsCount` (HomeScreen e/ou MatchHalftime).
