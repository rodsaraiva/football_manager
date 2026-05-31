# Design: Database Hardening — Índices, Transações e Foreign Keys

**Data:** 2026-05-31
**Status:** Proposto
**Epic:** `db-hardening`
**Escopo:** football-manager v0.1 — camada de persistência (`src/database/`), batches multi-write em telas (`EndOfSeason`/`NewGame`) e harness de testes.

**Goal (uma linha):** Tornar a persistência rápida e atômica — índices nas FKs quentes, um helper `runInTransaction` que envolve os batches de rollover / novo-jogo / lineup, e `foreign_keys = ON` no harness de testes (igualando o runtime), corrigindo as integridades que aparecerem.

---

## 1. Problema / estado atual

Três achados da auditoria (`docs/audit/2026-05-31-gap-audit.md`, seção "Persistência frágil", linha 50) atravessam este epic:

### Gap A — "No indexes on the hottest foreign keys"
O schema só tem índices em tabelas de histórico de fim-de-temporada e em `tactic_lineup`/`assistants`. Verificado em `src/database/schema.ts:258` (`idx_tactic_lineup_tactic`) e `schema.ts:359-365` (awards, results, relegated, player_titles, assistants). **Nenhuma** das FKs quentes do loop semanal tem índice:

- `players.club_id` — `schema.ts:75`. Lido toda semana em montagem de elenco/folha salarial.
- `fixtures(season, week)` e `fixtures.home_club_id`/`away_club_id` — `schema.ts:171-175`. A query de fixtures da semana faz full-scan.
- `club_finances.club_id` (+ `season`) — `schema.ts:143-144`. Tela de Finances e cálculo semanal.
- `match_events.fixture_id` — `schema.ts:184`. Agregação de stats pós-jogo.
- `competition_entries.club_id` — `schema.ts:162` (PK é `(competition_id, club_id)`, então busca por `club_id` isolado não tem índice).
- `player_stats(player_id, season)` — PK é `(player_id, season, competition_id)` (`schema.ts:128`); buscas por `season`/`competition_id` isolados fazem scan.
- `transfer_offers.status` e `transfer_offers.offering_club_id` — `schema.ts:206,210`.

Impacto: cada avanço de semana faz full table scans nessas tabelas; custo cresce linearmente com jogadores/fixtures gerados a cada temporada.

### Gap B — "End-of-season and new-game multi-write batches run without a transaction"
- `src/screens/EndOfSeasonScreen.tsx:325-530` (`handleContinue`): envelhece jogadores, marca free agents, retorna empréstimos, recalcula potencial, gera juvenis (INSERT em `players` + `player_attributes`), persiste competitions/entries/fixtures da nova temporada — **dezenas de `await dbHandle.prepare(...).run()` sequenciais sem `BEGIN/COMMIT`**. Falha no meio (ex.: erro ao inserir um fixture) deixa o save com jogadores envelhecidos mas calendário parcial.
- `src/screens/NewGameScreen.tsx:204-282` (`handleStartGame`): faz `db!.execAsync` com um bloco de `DELETE` em cascata (`schema`/FK chain) seguido de geração e batch-insert de ~6k fixtures. Os DELETEs e os INSERTs **não estão na mesma transação** — falha após os deletes destrói o calendário sem repô-lo.
- `src/database/queries/tactics.ts:144-157` (`setTacticLineup`): `DELETE FROM tactic_lineup` seguido de N `INSERT`. Falha parcial deixa o elenco sem titulares/banco completos. Chamado de `src/screens/tactics/TacticsScreen.tsx:307`.

Achado da auditoria: "rollover/novo-jogo sem transação (falha parcial = save corrompido)".

### Gap C — "Tests run with foreign_keys OFF while runtime runs with it ON"
Runtime liga FK: `src/store/database-store.ts:65` (`PRAGMA foreign_keys = ON;`). O harness **não** liga — `__tests__/database/test-helpers.ts:6-10` (`createTestDb`) cria `new Database(':memory:')` e nunca seta o pragma (better-sqlite3 default é OFF). Só dois testes ligam pontualmente (`schema.test.ts:59`, `seed.test.ts:11`), e `game-loop.test.ts:334` chega a **desligar** FK de propósito para inserir IDs inválidos. Resultado: testes passam com violações de integridade que quebrariam em produção (o mesmo padrão "mocked tests pass while migration breaks in prod" que `.claude/rules/testing.md` proíbe).

---

## 2. Approach

Três entregas independentes, todas dentro de `src/database/` + harness, sem tocar `engine/` puro:

1. **Índices**: adicionar `CREATE INDEX IF NOT EXISTS` ao final de `SCHEMA_SQL` (`schema.ts`). São idempotentes e aplicados tanto no boot do runtime (`db.execAsync(SCHEMA_SQL)`) quanto em `createAllTables` dos testes — **nenhum framework de migração novo é necessário** (coordenação com `save-isolation`/`db-hardening` abaixo).
2. **Transações**: criar `src/database/transaction.ts` com `runInTransaction(db, fn)`. Alternativa considerada e descartada: usar `expo-sqlite.withTransactionAsync` (`node_modules/expo-sqlite/build/SQLiteDatabase.d.ts:92`) e `better-sqlite3.transaction()` separadamente — rejeitada porque exigiria expor a conexão crua nos dois caminhos e duplicar lógica. Escolhido: dirigir `BEGIN`/`COMMIT`/`ROLLBACK` via `DbHandle.prepare(...).run()`, que é a **única** interface comum aos dois backends (verificado: BEGIN/COMMIT/ROLLBACK funcionam e BEGIN aninhado lança em better-sqlite3 — ver §4.2). Isso mantém o helper agnóstico de backend e usável tanto de tela quanto de módulo de engine (coordenação com `testable-orchestration`).
3. **FK nos testes**: ligar `PRAGMA foreign_keys = ON` em `createTestDb` e corrigir as violações que surgirem.

---

## 3. Architecture & components

| Arquivo | Mudança | Responsabilidade |
|---|---|---|
| `src/database/schema.ts` | Adiciona ~9 `CREATE INDEX IF NOT EXISTS` ao fim de `SCHEMA_SQL` (string, antes do backtick de fechamento na linha 366) | Declarar os índices das FKs quentes. Aplicado em runtime e testes pela mesma string. |
| `src/database/transaction.ts` **(novo)** | Exporta `runInTransaction<T>(db: DbHandle, fn: () => Promise<T>): Promise<T>` | Único ponto de atomicidade reutilizável. Não importa React/Expo nem better-sqlite3 — depende só de `DbHandle`. |
| `src/database/queries/tactics.ts` | `setTacticLineup` envolve o `DELETE` + loop de `INSERT` em `runInTransaction` | Lineup vira tudo-ou-nada. |
| `src/screens/EndOfSeasonScreen.tsx` | `handleContinue` (linhas 325-530): o bloco de mutações (idade → free agents → loans → potencial → juvenis → calendário) roda dentro de `runInTransaction(dbHandle, async () => { ... })` | Rollover atômico. Os `try { } catch { }` internos de "may already exist" (ex.: linhas 478, 493, 512) precisam ser revistos — ver §7. |
| `src/screens/NewGameScreen.tsx` | `handleStartGame`: DELETE-cascade + geração + batch-insert de fixtures dentro de um único `runInTransaction(dbHandle, ...)` substituindo os dois `db!.execAsync` separados (linhas 208, 277) | Criação de save atômica; novo jogo nunca deixa calendário parcial. |
| `src/store/database-store.ts` | Nenhuma mudança de contrato. `wrapExpoDb` já provê `prepare().run()`. (Opcional: dropar o `BEGIN TRANSACTION` solto de `generateSeedSQL` não faz parte deste epic.) | — |
| `__tests__/database/test-helpers.ts` | `createTestDb` chama `db.pragma('foreign_keys = ON')` após `createAllTables` | Igualar harness ao runtime. |

### 3.1 Interface do `runInTransaction`

```ts
// src/database/transaction.ts
import { DbHandle } from './queries/players';

export async function runInTransaction<T>(
  db: DbHandle,
  fn: () => Promise<T>,
): Promise<T> {
  await db.prepare('BEGIN').run();
  try {
    const result = await fn();
    await db.prepare('COMMIT').run();
    return result;
  } catch (err) {
    try { await db.prepare('ROLLBACK').run(); } catch { /* já abortada */ }
    throw err;
  }
}
```

- Aceita `DbHandle` (mesmo tipo que todas as queries já recebem — `src/database/queries/players.ts:3-9`), logo funciona com `wrapExpoDb` (runtime) e `createTestDbHandle` (testes) **e** de dentro de qualquer módulo de `engine/` que já receba um `DbHandle` (ex.: `advanceGameWeek` em `game-loop.ts:323` recebe `dbHandle`). Isso satisfaz a coordenação com `testable-orchestration` (que vai mover o rollover para a engine): o batch leva o helper junto, esteja na tela ou na engine.
- `fn` executa suas mutações via `db` (o mesmo handle) — a transação aberta vale para a conexão inteira em SQLite (uma conexão por DB), então todas as escritas subsequentes entram nela.

---

## 4. Data flow

### 4.1 Índices
Boot do runtime: `database-store.ts:67` já roda `await db.execAsync(SCHEMA_SQL)` — os novos `CREATE INDEX IF NOT EXISTS` entram aí automaticamente. Testes: `createTestDb` → `createAllTables(db)` → `db.exec(SCHEMA_SQL)` (`schema.ts:372-374`). Nenhuma chamada extra. Para DBs já existentes em dispositivos, `IF NOT EXISTS` torna a re-execução do SCHEMA_SQL no boot suficiente — sem `addColumnIfMissing` nem passo de migração dedicado.

### 4.2 Transações
- **Tela → helper**: `handleContinue`/`handleStartGame` chamam `runInTransaction(dbHandle, async () => { /* batch atual, inalterado */ })`. As mutações internas continuam usando `dbHandle.prepare(...).run()`; ficam dentro do `BEGIN`/`COMMIT` da conexão.
- **NewGame (web)**: hoje usa `db!.execAsync(SQL_MULTI)`. Os `DELETE`s e o `INSERT ... VALUES (...)` em massa passam a rodar via `dbHandle.prepare(stmt).run()` dentro de `runInTransaction` — ou, alternativamente, mantém-se o `execAsync` mas com o SQL já contendo `BEGIN; ... COMMIT;` envolto (o caminho atual de `generateSeedSQL` em `seed.ts:58` já faz isso). Decisão: padronizar no helper para um só mecanismo; o batch de fixtures continua sendo um único INSERT multi-VALUES por performance (não voltar a inserts individuais — `NewGameScreen.tsx:272` é explícito sobre isso).
- **Aninhamento**: BEGIN dentro de BEGIN lança em SQLite ("cannot start a transaction within a transaction" — verificado). `setTacticLineup` é chamado isolado de `TacticsScreen` (`TacticsScreen.tsx:307`), nunca de dentro de um rollover, então não há risco de aninhamento real. O helper **não** implementa savepoints — se um caller futuro aninhar, o erro é explícito e desejável (não silenciar).

### 4.3 FK nos testes
`createTestDb` liga FK → todos os 23 arquivos que usam `createTestDb` (verificado: 23 callers) passam a enforce integridade. `game-loop.test.ts:334` já desliga/religa FK localmente para seu caso de IDs inválidos — esse override local continua válido e intencional.

---

## 5. Schema changes

**Nenhuma coluna/tabela nova.** Apenas índices (DDL idempotente), adicionados ao fim de `SCHEMA_SQL` em `src/database/schema.ts`:

```sql
CREATE INDEX IF NOT EXISTS idx_players_club            ON players(club_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_season_week    ON fixtures(season, week);
CREATE INDEX IF NOT EXISTS idx_fixtures_home           ON fixtures(home_club_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_away           ON fixtures(away_club_id);
CREATE INDEX IF NOT EXISTS idx_finances_club_season    ON club_finances(club_id, season);
CREATE INDEX IF NOT EXISTS idx_match_events_fixture    ON match_events(fixture_id);
CREATE INDEX IF NOT EXISTS idx_comp_entries_club       ON competition_entries(club_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_season     ON player_stats(season, competition_id);
CREATE INDEX IF NOT EXISTS idx_transfer_offers_status  ON transfer_offers(status);
CREATE INDEX IF NOT EXISTS idx_transfer_offers_club    ON transfer_offers(offering_club_id);
```

**Coordenação com `save-isolation`**: esse epic vai adicionar `save_id` a várias tabelas world. Quando isso ocorrer, os índices acima devem virar compostos com `save_id` como coluna líder (ex.: `idx_players_club` → `(save_id, club_id)`). Este epic **não** antecipa `save_id` (a coluna ainda não existe); entrega os índices na forma atual. A re-derivação composta é trabalho de `save-isolation` no momento em que a coluna entrar — ambos os epics editam `SCHEMA_SQL` no mesmo arquivo, então a ordem de merge importa (ver §9). Nenhum framework de migração é inventado aqui: como em `save-isolation`/`db-hardening`, confia-se em `SCHEMA_SQL` idempotente re-executado no boot (`database-store.ts:67`).

---

## 6. Error handling & edge cases

- **Rollback após ROLLBACK falho**: o `catch` interno do helper engole erro do próprio `ROLLBACK` (transação já abortada pelo SQLite) para não mascarar o erro original — só o `err` de `fn` propaga.
- **`handleContinue` hoje engole exceção** (`EndOfSeasonScreen.tsx:522-529` faz `catch (err) { setNewSeason(false); ... }` e ainda navega). Com a transação, uma falha no batch agora reverte tudo; o `catch` da tela deve **manter** o comportamento de não avançar a semana (não chamar `updateWeek(newSeason, 1)` no caminho de erro) — ver §7 ajuste.
- **`try/catch` "may already exist"** dentro do batch (`EndOfSeasonScreen.tsx:478,493,512` — `createCompetition`/`addCompetitionEntry`/`createFixture`): hoje silenciam UNIQUE violations. Dentro de uma transação, um erro **não-capturado** aborta tudo. Esses catches locais **continuam capturando** o erro de duplicata (não relançam), então não disparam ROLLBACK — comportamento preservado. Risco: se um INSERT legítimo falhar por outro motivo, hoje é silenciado; após a mudança continua silenciado por esses catches. Não é regressão (este epic não muda os catches), mas fica registrado como dívida para `competitions-real`.
- **NewGame em web**: se o batch de ~6k fixtures falhar no meio, o ROLLBACK garante que os DELETEs anteriores também revertam — o save não fica sem calendário (era exatamente o modo de corrupção do Gap B).
- **FK ON revela violações reais**: ordem de INSERT importa (ex.: `player_stats.competition_id` referencia `competitions(id)` — `schema.ts:120`; juvenis inserem `players` antes de `player_attributes`, que é a ordem correta — `EndOfSeasonScreen.tsx:410,418`). Qualquer teste que insira filho antes de pai vai quebrar e ser corrigido reordenando o seed do teste, **não** desligando FK.
- **`tactic_lineup` com FK ON**: `setTacticLineup` insere `player_id` que deve existir em `players`. O teste de regressão `game-loop.test.ts:331-340` insere IDs 999001+ inexistentes **de propósito** com FK OFF local — esse override permanece; o resto do harness fica com FK ON.

---

## 7. Ajuste pontual em `EndOfSeasonScreen.handleContinue`

O `catch` final (`EndOfSeasonScreen.tsx:522-528`) hoje, em erro, faz `setNewSeason(false); updateWeek(season, 1); navigation.navigate('Game')` — ou seja, **avança mesmo após falha parcial** (o bug que a transação resolve). Com `runInTransaction`, a falha reverte o DB; a tela deve então **não** marcar a temporada como iniciada. Mudança mínima: no `catch`, não chamar `updateWeek`/`setNewSeason(false)` (deixar o usuário re-tentar), apenas logar e sinalizar erro de UI. O comportamento de sucesso (linhas 519-521) fica fora do `try` de transação, executando só após COMMIT.

---

## 8. Testing strategy

SQLite real (`better-sqlite3`) em memória, sem mock (`.claude/rules/testing.md`). Novos testes em `__tests__/database/`:

### `transaction.test.ts` (novo)
- **Commit**: `runInTransaction` com inserts → linhas persistem após retorno.
- **Rollback em erro**: `fn` lança no meio de 3 inserts → tabela fica vazia (atomicidade). Caso edge crítico.
- **Valor de retorno**: `fn` retorna `T` → helper repassa.
- **ROLLBACK não mascara erro**: o erro de `fn` propaga (não o de ROLLBACK).
- **Aninhamento lança**: `runInTransaction` dentro de outro → erro "within a transaction" propaga (documenta o contrato).
- Roda contra um `DbHandle` produzido por `createTestDbHandle` (caminho idêntico ao runtime via `prepare().run()`).

### `setTacticLineup` (estender teste existente de tactics, ou novo caso)
- **Atomicidade**: forçar falha (ex.: FK ON + `player_id` inexistente no meio do loop) → `tactic_lineup` mantém o estado anterior, não fica parcial. Verifica que o DELETE inicial também reverteu.

### Índices (`__tests__/database/schema.test.ts` — já liga FK em :59)
- Asserção via `PRAGMA index_list('players')` / `sqlite_master` de que `idx_players_club`, `idx_fixtures_season_week` etc. existem após `createAllTables`.
- (Opcional, mais forte) `EXPLAIN QUERY PLAN` de `SELECT * FROM players WHERE club_id = ?` contém `USING INDEX idx_players_club` (golden path do loop semanal).

### FK ON no harness — regressão da suíte inteira
- Após ligar FK em `createTestDb`, rodar `npm test` completo (62 suítes / 536 testes baseline). Qualquer falha nova = violação de integridade pré-existente mascarada; corrigir reordenando seeds do teste afetado. **Critério de pronto**: suíte verde com FK ON (exceto o override local intencional de `game-loop.test.ts:334`).

### Rollover / new-game (integração, se `testable-orchestration` ainda não extraiu)
- Se o batch permanecer na tela durante este epic, cobrir indiretamente via `transaction.test.ts`; se `testable-orchestration` já tiver movido o rollover para um módulo de engine, adicionar um teste de "rollover falha no fixture N → DB inalterado".

---

## 9. Dependencies & sequencing

- **Independente para começar**: índices, `runInTransaction` e `setTacticLineup` não dependem de nenhum sibling. Podem entrar primeiro.
- **`save-isolation` (sobreposição em `schema.ts`)**: quando `save_id` for adicionado às tabelas world, os índices deste epic devem virar compostos `(save_id, ...)`. Recomendação de ordem: **db-hardening entra antes**, `save-isolation` depois rebaseia os índices para compostos (uma linha cada). Ambos editam `SCHEMA_SQL` — resolver conflito de merge mantendo as duas versões reconciliadas (índice composto vence). Este epic **não** inventa migração: usa o mesmo `SCHEMA_SQL` idempotente que `save-isolation` usará.
- **`testable-orchestration` (move o rollover para a engine)**: o helper foi desenhado para `DbHandle`, então o batch leva `runInTransaction` junto quando migrar para `game-loop.ts`/módulo de engine. Coordenar: se `testable-orchestration` extrair `handleContinue` antes deste epic envolver a transação, aplicar o `runInTransaction` no novo local de engine em vez da tela. Sem dependência hard de ordem; só de onde o wrap é colocado.
- **`db-hardening` (este epic) habilita os demais**: ligar FK ON pode revelar bugs de integridade que outros epics (ex.: `match-consequences` adicionando suspensões, `competitions-real` gerando rounds) precisarão respeitar. Entregar FK ON cedo dá um harness mais honesto para todos.

---

## 10. Out of scope

- **`save_id` / multi-save** (Gap C1 da auditoria) — pertence a `save-isolation`. Aqui só se preparam índices que serão recompostos lá.
- **Wrapping de transação em outros batches** além de rollover/new-game/lineup (ex.: `processAiTransfers` em `game-loop.ts:238`, persistência de match stats) — não estão na lista do epic; podem ganhar `runInTransaction` depois, mas não agora.
- **Savepoints / transações aninhadas reais** — o helper lança em aninhamento de propósito; suporte a savepoint é YAGNI.
- **Performance benchmarking formal** dos índices (medir ganho real de ms) — confia-se no plano de query; não há suíte de benchmark no projeto.
- **Substituir `generateSeedSQL`'s `BEGIN TRANSACTION` solto** (`seed.ts:58`) pelo helper — funciona, fora de escopo.
- **Tornar os índices compostos com `save_id`** — bloqueado por `save-isolation` (coluna ainda não existe).

---

## Self-review

- **Placeholders/TBD**: nenhum. Todos os `file:line` foram verificados por leitura direta (schema.ts, EndOfSeasonScreen.tsx:325-530, NewGameScreen.tsx:204-282, tactics.ts:144-157, test-helpers.ts, database-store.ts, game-loop.test.ts:334).
- **Consistência interna**: o helper usa exclusivamente `DbHandle.prepare().run()` — confirmado disponível em `wrapExpoDb` (`database-store.ts:39-52`) e `createTestDbHandle` (`test-helpers.ts:32-46`); `BEGIN`/`COMMIT`/`ROLLBACK` via prepare verificados em better-sqlite3 (incl. aninhamento lançando).
- **Ambiguidade resolvida**: NewGame web usa `db!.execAsync` (raw expo), não `dbHandle` — §4.2 explicita a escolha de padronizar no helper via `prepare`, mantendo o INSERT multi-VALUES único por performance.
- **Risco registrado**: os `try/catch` "may already exist" dentro do batch de rollover não disparam ROLLBACK (capturam localmente) — comportamento preservado, dívida anotada para `competitions-real`. O ajuste do `catch` final de `handleContinue` (§7) é a única mudança de comportamento de UI e está isolado.
- **Engine puro intacto**: nenhuma mudança em `engine/`; o helper vive em `src/database/` e só depende de `DbHandle`.
