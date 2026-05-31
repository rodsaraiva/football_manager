# Design: Save Isolation — Real Multi-Save

**Data:** 2026-05-31
**Status:** Proposto
**Epic:** `save-isolation` (foundational)
**Escopo:** football-manager v0.2

**Goal:** Tornar cada save um mundo independente — criar/jogar o save B nunca toca o save A — adicionando `save_id` a toda tabela de mundo, escopando toda query por `save_id`, e seedando um mundo novo por save.

---

## 1. Problema / Estado atual

O menu lista múltiplos saves (`MainMenuScreen.tsx:103-124`) e permite carregar/deletar cada um, mas **quase nenhuma tabela de mundo tem `save_id`** — só `assistants` (`schema.ts:342`) e o KV `save_games.board_trust` (`schema.ts:267`). Todos os saves leem e escrevem as **mesmas linhas globais** de `players`/`clubs`/`fixtures`/`competitions`/`club_finances`/`tactics`/`board_*`/`season_*`, num único arquivo `football-manager.db` (`database-store.ts:62`). Achados confirmados que este epic resolve:

- **Multi-save is exposed in UI but impossible: world tables have no save_id** — `schema.ts:68,50,168,141,320`; `loadSave()` (`game-store.ts:94-109`) só seta campos em memória, não escopa nenhuma leitura.
- **Save slots are an illusion: new game wipes other saves** — `NewGameScreen.handleStartGame` roda DELETEs globais sem escopo: `DELETE FROM fixtures WHERE season = 1; DELETE FROM competition_entries; DELETE FROM club_finances;` (`NewGameScreen.tsx:208-218`). Criar o save B destrói o calendário e as finanças do save A.
- **Starting a new game globally deletes season-1 data and finances of all existing saves** — mesmo bloco `NewGameScreen.tsx:209-217` (apaga `match_events`/`player_stats`/`season_*` da season 1 de todos).
- **Board objectives/trust/reputation history keyed by (club_id, season) collide across saves** — `board_objectives UNIQUE(club_id, season)` (`schema.ts:327`), `board_trust_history UNIQUE(club_id, season)` (`schema.ts:336`), `club_reputation_history UNIQUE(club_id, season)` (`schema.ts:317`); `upsertBoardObjective` faz `INSERT OR REPLACE` por `(club_id, season)` (`board.ts:55-59`) → dois saves do mesmo clube se sobrescrevem.
- **Youth player and fixture IDs derived from global MAX(id) collide across saves/regenerations** — youth: `SELECT MAX(id) FROM players` (`EndOfSeasonScreen.tsx:405-406`); fixtures/competitions usam offsets determinísticos por season (`EndOfSeasonScreen.tsx:474,485,500-501`; `calendar.ts:204-205`), idênticos entre saves.
- **deleteSave only removes save_games row, orphaning assistants and leaking world state** — `deleteSave` (`saves.ts:81-83`) só faz `DELETE FROM save_games WHERE id = ?`; `assistants` e todo o mundo ficam órfãos.
- **ensureSeasonFixtures regen of an early-buggy save can collide with season-1 raw IDs** — `ensureSeasonFixtures` (`calendar.ts:157-238`) regenera com IDs raw para season 1 (`compIdOffset = 0`), colidindo com a season-1 de qualquer outro save no mundo global compartilhado.

**Impacto agregado:** o recurso headline "múltiplos saves" é não-funcional e **destrutivo** — qualquer jogador com 2+ saves corrompe silenciosamente o progresso. Não há teste guardando isolamento (grep confirma zero testes com dois saves concorrentes).

---

## 2. Estado sólido que reutilizamos

- A query layer é **uniforme**: todo módulo em `src/database/queries/*` recebe um `DbHandle` (`players.ts:3-9`) como 1º arg e usa prepared statements parametrizados. Adicionar um `saveId` é mecânico e local a cada função.
- `assistants` **já prova o padrão** `save_id` ponta a ponta: coluna + `UNIQUE(save_id, role)` + índice + queries escopadas (`schema.ts:339-365`, `assistants.ts:38-68`) + leitura no loop (`game-loop.ts:663,687`).
- `currentSave.id` **já está no store** e já chega ao loop como `saveId` (`game-store.ts:80,99`; `HomeScreen.tsx:223`; `game-loop.ts:110,324`). Falta apenas propagá-lo às demais queries.
- As migrações idempotentes via `addColumnIfMissing` / `CREATE TABLE IF NOT EXISTS` já existem em `database-store.ts:25-185` — é o mecanismo de schema que este epic estende (sem inventar framework novo).
- Testes usam `better-sqlite3` real em memória com `createTestDbHandle`/`seedTestDb` (`__tests__/database/test-helpers.ts`) — base direta para os testes de isolamento.

---

## 3. Abordagem

**Estratégia escolhida: A — `save_id` em toda tabela de mundo + escopo por query (single shared DB).**

Foi a opção mandatada pela coordenação cross-epic (save-isolation "owns the multi-save schema change — adding save_id to world tables + a lightweight idempotent migration in database-store.ts"), e os epics irmãos (`db-hardening`, `competitions-real`, `match-consequences`, `progression-wired`) assumem **um único schema** com colunas novas, não arquivos por save.

**Alternativa real considerada e rejeitada: B — um arquivo SQLite por save** (`football-manager-save-<id>.db`). Rejeitada porque: (1) o `DbHandle` é um **singleton global** construído uma vez em `database-store.initialize()` e injetado em 33 módulos via `useDatabaseStore` — trocar de arquivo a cada `loadSave` exigiria reconstruir e re-propagar o handle por todo o app; (2) quebra a suposição dos epics irmãos de um schema só; (3) clones de template por save complicam migração de schema (cada arquivo migra sozinho). A estratégia A mantém um handle, um schema, e isola por `WHERE save_id = ?`.

Como `players.club_id` e `clubs` são **mutados por save** (transferências fazem `UPDATE players SET club_id` — `offer-processor.ts:46`; idades sobem; budgets mudam), eles **não são dados de referência estáticos**: cada save precisa da sua cópia. Apenas `countries` e `leagues` são imutáveis e permanecem globais (sem `save_id`).

---

## 4. Arquitetura & componentes

### Princípio de escopo

Tabelas dividem-se em três classes:

| Classe | Tabelas | Tratamento |
|---|---|---|
| **Referência global (imutável)** | `countries`, `leagues`, `app_settings` | Sem `save_id`. Compartilhadas. |
| **Mundo (per-save, com coluna)** | `clubs`, `players`, `player_attributes`, `club_finances`, `competitions`, `competition_entries`, `fixtures`, `transfers`, `transfer_offers`, `transfer_blocks`, `tactics`, `board_objectives`, `board_trust_history`, `club_reputation_history`, `season_competition_results`, `season_relegated`, `season_awards`, `season_player_titles`, `staff` | Coluna `save_id` própria + `WHERE save_id = ?` em toda query. |
| **Mundo (per-save, via dono)** | `player_stats`, `match_events`, `tactic_positions`, `tactic_lineup` | Herdam o save pelo FK ao dono (`player_id`/`fixture_id`/`tactic_id`). Sem coluna própria; já isoladas pois seus donos têm IDs per-save. Filtragem direta opcional via JOIN onde houver query independente. |

> Decisão "via dono" para `player_stats`/`match_events`/`tactic_*`: seus PKs/FKs sempre apontam para linhas já escopadas (um `player_id`/`fixture_id`/`tactic_id` pertence a exatamente um save após a regeneração de IDs — ver §6). Adicionar `save_id` nelas seria redundante e infla o trabalho; mantemos só onde a query é executada sem o dono em mãos. **`player_stats` recebe `save_id` próprio** porque `getPlayerStatsByCompetition` (`player-stats.ts:94-99`) consulta por `(season, competition_id)` sem `player_id`, e relatórios de artilheiros varrem a competição inteira — sem `save_id` próprio, dependeria de JOIN em `players`. Idem trade-off documentado em §6.

### Componentes que mudam ou são criados

| Módulo | Responsabilidade | Interface |
|---|---|---|
| `src/database/schema.ts` | Declarar `save_id INTEGER` (+ FK a `save_games`) em cada tabela de mundo; ajustar `UNIQUE(...)` para incluir `save_id`; adicionar índices compostos `(save_id, ...)`. | `SCHEMA_SQL`, `createAllTables` (sem mudança de assinatura). |
| `src/store/database-store.ts` | Migração idempotente: `addColumnIfMissing(db, '<tabela>', 'save_id', 'INTEGER')` para cada tabela de mundo; substituir o **reseed-on-empty global** (`database-store.ts:187-197`) por seed apenas de `countries`/`leagues` (referência); o seed de mundo passa a ser **por save** (ver `seedWorldForSave`). | `initialize()`. |
| `src/database/seed.ts` | Nova função `seedWorldForSave(db, data, saveId)`: insere clubs/players/attributes/staff/tactics com `save_id` e **IDs reescritos por offset de save** (ver §6). Mantém `generateSeedSQL` mas parametrizado por `saveId`/offset. | `seedWorldForSave(db: DbHandle, data: SeedData, saveId: number): Promise<void>` (+ variante SQL-string para web, espelhando `generateSeedSQL`). |
| `src/database/queries/*` (12 módulos de mundo) | Toda função ganha `saveId: number` (após `db`) e injeta `WHERE save_id = ?` em SELECT/UPDATE/DELETE e a coluna em INSERT. | Ex.: `getClubsByLeague(db, saveId, leagueId)`, `getPlayersByClub(db, saveId, clubId)`, `getFixturesByWeek(db, saveId, season, week)`, `createFixture(db, saveId, input)`, `upsertBoardObjective(db, saveId, obj)`. |
| `src/database/queries/saves.ts` | `deleteSave` passa a apagar **todo o mundo do save** numa transação (todas as tabelas de mundo `WHERE save_id = ?`, + `player_stats`/`match_events`/`tactic_*` via subselect pelo dono, + `assistants`). `createSave` inalterado (já cria a linha pai). | `deleteSave(db, saveId)` (mesma assinatura, novo corpo transacional). |
| `src/store/game-store.ts` | `loadSave`/`startNewGame` já guardam `currentSave.id`. Adicionar getter de conveniência opcional. **Sem nova responsabilidade de dados** — só garante que `currentSave.id` é a fonte única do `saveId` ativo. | — |
| `src/engine/game-loop.ts` | `advanceGameWeek` já recebe `saveId` (`game-loop.ts:324`). Passa `saveId` a cada chamada de query interna. **Engine permanece puro** (recebe `saveId` por parâmetro, não importa store). | `AdvanceWeekParams.saveId` (já existe). |
| `src/engine/competition/calendar.ts` | `generateSeasonCalendar`/`ensureSeasonFixtures` recebem `saveId`; persistência usa offset de save nos IDs e grava `save_id`. | `ensureSeasonFixtures(db, saveId, season)`. |
| Screens (`NewGameScreen`, `EndOfSeasonScreen`, `HomeScreen`, relatórios, etc.) | Ler `currentSave.id` do store e passá-lo a toda query. `NewGameScreen.handleStartGame`: trocar os DELETEs globais por `seedWorldForSave(db, data, saveId)`. | — |

**Engine puro mantido:** todo `save_id` chega ao engine como **parâmetro de função** (`AdvanceWeekParams.saveId`, args de `ensureSeasonFixtures`). Nenhum import de React/Zustand entra em `engine/`.

---

## 5. Data flow

```
MainMenu.handleLoadSave(save)
  └─ game-store.loadSave(save)            → currentSave.id = save.id      (saveId ativo)
HomeScreen useEffect / handleAdvance
  └─ lê currentSave.id  → passa como saveId a:
       ensureSeasonFixtures(db, saveId, season)
       getFixturesByClub(db, saveId, clubId, season)
       advanceGameWeek({ ..., saveId })
            └─ getPlayersByClub(db, saveId, clubId)
               getClubById(db, saveId, clubId)
               updateFixtureResult(db, saveId, ...)
               upsertBoardObjective(db, saveId, ...)
               ... (toda query escopada)
NewGame.handleStartGame
  └─ saveId = createSave(...)             → cria linha pai
     seedWorldForSave(db, seedData, saveId)   → clona o mundo SÓ para este save (IDs com offset)
     generateSeasonCalendar(... saveId)       → fixtures/competitions com save_id + offset
EndOfSeason.handleContinue
  └─ usa currentSave.id em youth-gen (IDs com offset de save), calendar regen, board pipeline
MainMenu.handleDeleteSave
  └─ deleteSave(db, saveId)               → apaga todo o mundo do save numa transação
```

Pontos-chave:
- O `saveId` ativo tem **fonte única**: `useGameStore.getState().currentSave.id`. Nenhuma query infere save por outro caminho.
- `countries`/`leagues` continuam lidos sem `saveId` (`getAllCountries`/`getAllLeagues` inalterados) — são referência.
- O **seed deixa de ser global-on-empty**; passa a ser invocado explicitamente por `createSave`/`handleStartGame`, garantindo que criar o save B só insere linhas com o `save_id` de B.

---

## 6. Schema changes

> Mecanismo: estende as migrações idempotentes existentes em `database-store.ts` (`addColumnIfMissing`, `CREATE INDEX IF NOT EXISTS`). Nenhum framework novo. Coordenar com `db-hardening` (que adiciona índices e FK-on em testes) — os índices compostos abaixo são **propostos por este epic** mas podem ser consolidados no passo de índices do `db-hardening` para evitar duplicação.

### Coluna `save_id` (tabelas de mundo)

`ALTER TABLE <t> ADD COLUMN save_id INTEGER` (idempotente via `addColumnIfMissing`) para:
`clubs`, `players`, `player_attributes`, `club_finances`, `competitions`, `competition_entries`, `fixtures`, `transfers`, `transfer_offers`, `transfer_blocks`, `tactics`, `staff`, `board_objectives`, `board_trust_history`, `club_reputation_history`, `season_competition_results`, `season_relegated`, `season_awards`, `season_player_titles`, `player_stats`.

No `SCHEMA_SQL` fresh (DB novo), declarar `save_id INTEGER NOT NULL REFERENCES save_games(id)` nessas tabelas. Na migração de DB **existente**, a coluna entra como `INTEGER` (nullable, sem `NOT NULL` — SQLite não permite `ADD COLUMN NOT NULL` sem default em tabela populada). Linhas legadas pré-migração ficam com `save_id = NULL`; ver "Edge cases".

### Constraints `UNIQUE` atualizadas (incluir `save_id`)

- `competition_entries`: `PRIMARY KEY (competition_id, club_id)` permanece (IDs já per-save via offset). Sem mudança.
- `board_objectives`: `UNIQUE(club_id, season)` → `UNIQUE(save_id, club_id, season)`.
- `board_trust_history`: `UNIQUE(club_id, season)` → `UNIQUE(save_id, club_id, season)`.
- `club_reputation_history`: `UNIQUE(club_id, season)` → `UNIQUE(save_id, club_id, season)`.
- `season_competition_results`: `UNIQUE(season, competition_id)` → `UNIQUE(save_id, season, competition_id)`.
- `season_relegated`: `UNIQUE(season, league_id, club_id)` → `UNIQUE(save_id, season, league_id, club_id)`.
- `season_awards`: `UNIQUE(season, competition_id, award_type, rank)` → `UNIQUE(save_id, season, competition_id, award_type, rank)`.
- `season_player_titles`: `UNIQUE(season, competition_id, player_id)` → `UNIQUE(save_id, season, competition_id, player_id)`.

> SQLite **não permite** `ALTER TABLE ... ADD CONSTRAINT`. Para DBs existentes, a constraint nova só vale em DB fresh. Para DB legado, a colisão `(club_id, season)` cross-save é mitigada porque (a) o `save_id` na cláusula `INSERT OR REPLACE` muda a linha-alvo via os índices e (b) DBs legados têm no máximo o mundo global de um "save zero" — ver "Migração de DB legado" abaixo. Se for necessário endurecer, um rebuild de tabela (`CREATE new; INSERT SELECT; DROP; RENAME`) fica a cargo do `db-hardening` num passo controlado; **fora do escopo deste epic** mantê-lo idempotente para todas as tabelas.

### Índices compostos (hot paths)

`CREATE INDEX IF NOT EXISTS` para os caminhos varridos toda semana (coordenar com `db-hardening`):
- `idx_players_save_club ON players(save_id, club_id)`
- `idx_fixtures_save_season_week ON fixtures(save_id, season, week)`
- `idx_fixtures_save_comp ON fixtures(save_id, competition_id)`
- `idx_finances_save_club ON club_finances(save_id, club_id)`
- `idx_clubs_save_league ON clubs(save_id, league_id)`
- `idx_player_stats_save_comp ON player_stats(save_id, season, competition_id)`
- `idx_tactics_save_club ON tactics(save_id, club_id)`

### Reescrita de IDs por save (elimina colisão de `MAX(id)` e offsets globais)

A causa-raiz das colisões de youth/fixture é IDs determinísticos **globais**. Solução: cada save recebe um **offset de espaço de IDs** = `saveId * SAVE_ID_STRIDE`, onde `SAVE_ID_STRIDE` é uma constante grande (ex.: `100_000_000`) maior que o maior espaço de IDs de um único mundo (clubs+players+fixtures de todas as seasons de um save cabem bem abaixo disso).

- **Seed por save** (`seedWorldForSave`): `clubId_save = clubId_seed + saveId*STRIDE`; idem players/attributes/staff/tactics. Os FKs internos do seed (player.club_id, tactic.club_id) são reescritos com o mesmo offset.
- **Youth gen** (`EndOfSeasonScreen.tsx:405`): trocar `SELECT MAX(id) FROM players` por `SELECT MAX(id) FROM players WHERE save_id = ?` → o `MAX` passa a ser **por save**, nunca colide entre saves.
- **Fixtures/competitions** (`EndOfSeasonScreen.tsx:474,485,500-501`, `calendar.ts:204-205`): manter o offset por season **dentro do espaço do save** — id final = `saveId*STRIDE + seasonOffset + rawId`. Assim `ensureSeasonFixtures` para season 1 (que hoje usa `offset 0`) deixa de colidir com a season-1 de outro save.
- `leagues`/`countries` mantêm IDs do seed (globais, compartilhados) — clubs referenciam `league_id` do seed normalmente (leagues não têm offset).

> Trade-off: reescrever IDs no seed adiciona uma soma por linha, mas elimina toda a família de bugs de colisão e mantém os IDs **estáveis e determinísticos por save** (necessário para os offsets de season existentes continuarem válidos).

---

## 7. Error handling & edge cases

- **DB legado (saves pré-migração, `save_id = NULL`):** a migração não tem como atribuir um save a linhas globais órfãs com segurança. Estratégia: na migração, se existir **exatamente um** `save_games` row e linhas de mundo com `save_id IS NULL`, fazer `UPDATE <t> SET save_id = <único saveId> WHERE save_id IS NULL` (adoção do mundo global pelo único save existente). Se houver 0 ou ≥2 saves, deixar `NULL` e **não** tentar adivinhar; o app trata `save_id IS NULL` como "mundo legado não migrável" e o MainMenu pode oferecer recriar. Documentar que multi-save só é garantido para mundos criados pós-migração.
- **`seedWorldForSave` parcial (falha no meio):** envolver em `BEGIN/COMMIT`, `ROLLBACK` no catch (espelha `seed.ts:9-43`). Falha → nenhum mundo do save criado → `deleteSave(saveId)` limpa a linha pai órfã.
- **`deleteSave` transacional:** todas as deleções `WHERE save_id = ?` + subselects de `player_stats`/`match_events`/`tactic_*` num único `BEGIN/COMMIT`. FK-on (do `db-hardening`) garante que nenhuma linha filha sobrevive; sem FK-on, a ordem das deleções respeita as dependências (filhos antes de pais).
- **Query chamada sem `saveId` (regressão):** `saveId` vira parâmetro **obrigatório** (não opcional) nas funções de mundo → `tsc --noEmit` quebra em qualquer call site não migrado. Isso é a rede de segurança: a migração das ~80 chamadas é guiada pelo compilador.
- **`saveId` inválido / `currentSave` null:** screens já guardam `if (!currentSave) return` (`HomeScreen.tsx:199`). Manter o guard antes de qualquer query escopada.
- **`STRIDE` overflow:** `saveId*STRIDE` com `saveId` crescente cabe em `Number.MAX_SAFE_INTEGER` para milhares de saves (`STRIDE=1e8` → seguro até `saveId ~9e7`); IDs continuam inteiros JS seguros.

---

## 8. Testing strategy

SQLite real em memória (`better-sqlite3`), **nunca mock** (regra do projeto). Helpers: `createTestDb`/`createTestDbHandle`; adicionar `seedWorldForSave` test-friendly.

**Teste-âncora (isolamento, o que faltava):**
1. `createSave` A (clube X) e `createSave` B (clube Y); `seedWorldForSave` para cada.
2. Avançar A: simular transferências/finanças/fixtures de A.
3. **Assert**: o mundo de B é byte-idêntico ao pós-seed — `players`/`clubs`/`fixtures`/`club_finances` de B inalterados; squad/budget/calendário de B intactos.
4. **Assert reverso**: deletar B (`deleteSave`) não toca nenhuma linha de A.

**Casos unit/integração adicionais:**
- **Seed por save:** dois saves → contagens de `players WHERE save_id = A` e `= B` iguais ao seed; nenhum `player` com `save_id` cruzado; IDs de A e B disjuntos (offset STRIDE).
- **Board collision:** `upsertBoardObjective(db, A, {clubId, season:1})` e `(db, B, {clubId, season:1})` para o **mesmo `club_id` lógico** coexistem (a constraint `UNIQUE(save_id, club_id, season)` permite ambos); `getBoardObjective(db, A, ...)` não vê o de B. (Cobre o achado de colisão `(club_id, season)`.)
- **Youth ID isolation:** gerar youth em A e B na mesma season → IDs disjuntos; `MAX(id) WHERE save_id=?` por save; nenhum INSERT colide.
- **ensureSeasonFixtures season 1:** rodar para A e B → cada um gera fixtures com seu `save_id`; A vê só os seus em `getFixturesByWeek(db, A, 1, w)`; regen de B não apaga fixtures de A (cobre o achado de colisão season-1 raw IDs).
- **deleteSave completude:** após `deleteSave(B)`, `COUNT(*) WHERE save_id = B = 0` em **todas** as tabelas de mundo + `assistants`; `player_stats`/`match_events`/`tactic_*` de B (via dono) também zerados; mundo de A intacto.
- **NewGame não destrói save anterior:** criar save A, jogar 1 semana, criar save B → recarregar A e assertar fixtures/finanças/squad de A preservados (replica o cenário do achado "new game wipes other saves").
- **Migração legado:** seedar DB no schema antigo (sem `save_id`) com um único save → rodar `initialize()` → linhas adotadas pelo save (`save_id` preenchido); com dois saves legados → linhas ficam `NULL` e não corrompem.
- **Parity tsc:** `npx tsc --noEmit` limpo após migrar todos os call sites (compilador como rede de regressão).

Edge: save com clube em divisão diferente entre A e B; transferência em A movendo um player não pode aparecer no squad de B (mesmo `club_id` lógico, `save_id` distinto).

---

## 9. Dependencies & sequencing

**Este é o epic fundacional — deve aterrissar primeiro.** Ele estabelece a coluna `save_id` e as assinaturas `(db, saveId, ...)` que os outros consomem.

- **`db-hardening`** (índices, transações, FK-on em testes): **depende deste**, mas há overlap explícito nos índices compostos `(save_id, ...)` e no FK-on. Coordenar: este epic propõe os índices em §6; `db-hardening` consolida/owns o passo final de índices e o rebuild-de-tabela para constraints `UNIQUE` em DB legado (este epic não tenta rebuild idempotente universal). O `deleteSave` transacional deste epic se beneficia do FK-on do `db-hardening`, mas funciona sem ele (ordem de deleção manual).
- **`save-isolation` fornece a coluna `save_id`** que os achados de outros epics assumem ao adicionar suas próprias colunas:
  - `match-consequences` (suspensões): adiciona `suspension_weeks_left` em `players` — players já per-save aqui.
  - `progression-wired` (`training_focus`): persiste em `tactics`/`clubs` — já per-save aqui.
  - `competitions-real` (`season_promoted` + knockout state): novas tabelas/colunas season devem nascer **com `save_id`** seguindo o padrão deste epic.
- **Ordem recomendada:** `save-isolation` → `db-hardening` → demais epics (que então adicionam colunas já no schema multi-save). Epics que tocam `engine/game-loop`/`EndOfSeasonScreen` devem **rebasear** sobre as novas assinaturas `(db, saveId, ...)`.

---

## 10. Out of scope

- **Estratégia B (arquivo por save)** — avaliada e rejeitada (§3); não será implementada.
- **Rebuild universal de tabelas para constraints `UNIQUE` em DB legado** — delegado ao passo controlado do `db-hardening`; aqui só DB fresh ganha as constraints novas e DB legado é mitigado por adoção do save único.
- **Índices finais e FK-on em testes** — owned por `db-hardening`; aqui apenas propostos.
- **Mundo da IA vivo** (IA paga salários, simula com engine real, base da IA) — outros epics (`ai-world`/`finance`); este epic apenas garante que cada save tem **seu** mundo, não que esse mundo evolui melhor.
- **Migração de saves entre dispositivos / export-import** — fora de v0.2.
- **`countries`/`leagues` editáveis por save** (custom leagues) — permanecem referência global imutável.

---

## Auto-revisão

- **Placeholders:** nenhum "TBD"/placeholder; todos os caminhos citados foram verificados via Read/Grep (`schema.ts`, `database-store.ts`, `game-store.ts`, `saves.ts`, `board.ts`, `player-stats.ts`, `NewGameScreen.tsx`, `EndOfSeasonScreen.tsx`, `calendar.ts`, `game-loop.ts`, `assistants.ts`, `test-helpers.ts`).
- **Consistência interna:** a classe "via dono" (§4) e a decisão de dar `save_id` próprio a `player_stats` estão reconciliadas em §4/§6 (motivo: query por `(season, competition_id)` sem `player_id` em `player-stats.ts:94-99`). A estratégia A é coerente com a nota cross-epic e com `assistants` como precedente.
- **Ambiguidade resolvida:** o ponto "constraint `UNIQUE` não alterável em DB legado" é explicitado em §6 com a fronteira de escopo (§10) — não fica como "talvez".
- **Engine puro:** confirmado — `save_id` só entra no engine por parâmetro (`AdvanceWeekParams.saveId` já existe; `ensureSeasonFixtures(db, saveId, ...)`), zero import de store.
