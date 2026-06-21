# Design (Épico): Cloud save + contas/auth

**Epic:** l4-cloud-save · **Data:** 2026-06-20 · **Horizonte:** longo · **Stack:** Expo 54 / RN 0.81 / TS 5.9
**Goal:** Permitir que o jogador crie uma conta, faça login nativo e continue a MESMA carreira em qualquer dispositivo, com sincronização de saves na nuvem e resolução de conflito previsível — sem nunca permitir progressão offline.

---

## 1. Visão & valor

Hoje o jogo é 100% local: o DB SQLite (`football-manager.db`) vive no device, os saves são linhas em `save_games` (`src/database/schema.ts:304-321`) e a lista é lida por `getAllSaves` ordenando por `updated_at DESC` (`src/database/queries/saves.ts:67-72`). Trocar de celular = perder a carreira. Reinstalar o app = perder tudo.

A fantasia que este épico serve é a do **técnico cuja carreira é sua, não do aparelho**: começar a temporada no celular no ônibus, continuar no tablet em casa, recuperar 10 temporadas de dinastia depois de trocar de telefone. É também a fundação de monetização e social — sem identidade de conta não há L5 (multiplayer/ligas online) nem L8 (perfis/rankings cross-player). Este épico é **pré-requisito declarado de L5 e L8**.

Valor concreto:
- **Continuidade cross-device**: o save segue o jogador, não o device.
- **Durabilidade**: reinstalar/perder o aparelho não apaga a carreira.
- **Identidade**: base de conta para features sociais e de longo prazo.

Princípio de design **inegociável** (herdado do core): **sem progressão offline**. A simulação determinística (`SeededRng`, `src/engine/rng.ts:5`) só avança quando há autoridade de servidor sobre o estado canônico do save — caso contrário dois devices avançam a mesma semana em paralelo e divergem irreconciliavelmente. Offline o jogador pode **ler** (consultar elenco, táticas, histórico) mas **não avançar semana**.

---

## 2. Estado atual na base (fundação)

O que já existe e serve de alicerce:

- **Save isolation por stride**: cada save ocupa um espaço de IDs disjunto `[saveId*STRIDE, (saveId+1)*STRIDE)`, com `SAVE_ID_STRIDE = 100_000_000` e `saveOffset()` (`src/database/constants.ts:7-11`). Toda query de mundo já recebe `(db, saveId, ...)` e filtra por `save_id` — confirmado em `WORLD_TABLES_FOR_MIGRATION` (`src/database/migration.ts:11-17`) e nas colunas `save_id` em ~30 tabelas (`src/database/schema.ts`). **Isso significa que um save é um subconjunto de linhas perfeitamente delimitável por `save_id` — base ideal para snapshot/export.**
- **Tabela `save_games`** com metadados de progresso: `current_season`, `current_week`, `player_club_id`, `difficulty`, `ended`, e crucialmente `created_at` / `updated_at` TEXT ISO (`src/database/schema.ts:319-320`). `updateSaveWeek` já carimba `updated_at = new Date().toISOString()` a cada avanço (`src/database/queries/saves.ts:81-91`). **`updated_at` é o relógio lógico natural para last-write-wins.**
- **DELETE_BY_SAVE_TABLES** (`src/database/queries/saves.ts:96-118`): já existe o inventário completo de tabelas a varrer para apagar um save inteiro, com a ordem de FK e o cuidado do ciclo `clubs<->save_games`. **A mesma lista, invertida em SELECT, dá o conjunto de export de um snapshot.**
- **Boot/migration idempotente**: `useDatabaseStore.initialize` (`src/store/database-store.ts:60-335`) abre o DB, roda `SCHEMA_SQL`, `addColumnIfMissing`, `migrateSaveIdAsync` e cria índices. Já é o único ponto de entrada de schema — é onde colunas de sync entram.
- **Store de jogo em memória**: `useGameStore` (`src/store/game-store.ts`) guarda `currentSave` e gates (`preseasonPending`, `pressPending`, etc.). `loadSave` (linha 169) reidrata o estado a partir de uma `SaveGame`. É o ponto onde um "lock de sync" / estado de conexão entra na UI.
- **MainMenuScreen** (`src/screens/MainMenuScreen.tsx:19,36,46`): única tela que lista/deleta/carrega saves via `getAllSaves`/`deleteSave`. **Não há cap rígido de 5 slots no código** — o "até 5 slots" é convenção de produto, não constraint de schema; o épico pode revisitar isso para contas.
- **Determinismo total**: o engine roda em cima de `SeededRng`, zero `Math.random`/`ORDER BY RANDOM` em caminhos de simulação. **Determinismo é o que torna "replay de eventos" teoricamente possível, mas o estado SQLite resultante é a verdade canônica — ver §4.**
- **app_settings** key-value (`src/database/schema.ts:448-451`, queries em `src/database/queries/settings.ts`): bom lar para tokens locais NÃO-sensíveis e flags; tokens sensíveis vão em secure storage (ver §7).
- **Design System**: a UI nova (Card/Button/StatBar/Text/Icon/EmptyState/Toast/useConfirm) definida em `2026-06-20-design-system-premium-design.md` — todas as telas novas deste épico (login, conta, status de sync, resolução de conflito) usam o kit, nunca estilos inline crus.

Lacunas que o épico preenche: não há (a) noção de usuário/conta, (b) backend, (c) qualquer coluna de versão/owner/sync em `save_games`, (d) cliente HTTP de sync, (e) UI de auth.

---

## 3. Decomposição em sub-épicos

1. **Auth nativa** — cadastro/login (email+senha e/ou OAuth Apple/Google), sessão persistida em secure storage, `userId` disponível para a app. Telas Login/Conta no kit do Design System.
2. **Modelo de sync (snapshot vs incremental)** — definir a unidade de sincronização: snapshot integral do save (export de todas as linhas `save_id`) vs. diff incremental. Inclui serializador determinístico do save.
3. **Versionamento & detecção de conflito** — colunas de versão/owner em `save_games`, relógio lógico (contador monotônico + `updated_at`), e a regra de detecção "o servidor tem versão mais nova que a base do meu pull".
4. **Resolução de conflito (last-write vs merge)** — política de reconciliação quando dois devices divergem: last-write-wins com escolha explícita do jogador, e/ou fork ("manter os dois"). Sem merge automático de mundo (ver §4/§9).
5. **Backend** — serviço de armazenamento de snapshots por usuário, autenticação, e enforcement de "sem progressão offline" (autoridade de avanço). Define o contrato HTTP que o cliente consome.
6. **Cliente de sync no app** — orquestrador que faz pull no load, push após cada avanço de semana (commit), e gerencia o estado de conexão/lock na UI, espelhando o padrão de `src/engine/game-loop.ts`.

Cada peça é entregável e testável isoladamente (auth sem sync; serializador sem backend; detecção de conflito com dois DBs in-memory).

---

## 4. Opções de arquitetura

### Eixo A — Unidade de sync: Snapshot vs Incremental

**Opção A1 — Snapshot integral por save (RECOMENDADA).**
Cada push serializa TODAS as linhas do save (todas as tabelas com `save_id == X`, reusando o inventário de `DELETE_BY_SAVE_TABLES` em modo SELECT) num blob versionado e o envia. O pull baixa o blob e reconstrói o subconjunto local (DELETE do save local + INSERT do snapshot, dentro de uma transação).
- **Prós**: trivialmente correto (o save é atômico e auto-contido por design de stride); reusa a delimitação `save_id` que já existe; reconstrução = wipe+reinsert que já temos (`deleteSave` + inserts de seed); imune a drift de schema parcial (o blob carrega `schema_version`).
- **Contras**: payload maior (uma carreira de 10 temporadas pode ter dezenas de milhares de linhas). Mitigável com gzip + push só de saves "sujos".

**Opção A2 — Diff incremental por tabela/linha.**
Rastrear mutações por linha (changelog) e sincronizar só o delta.
- **Prós**: payload mínimo por avanço.
- **Contras**: exige changelog/dirty-tracking em TODA escrita do engine (invasivo em `game-loop.ts` e em cada query), reconstrução de estado por replay de deltas (frágil), e merge de deltas concorrentes é exatamente o problema difícil que queremos evitar. Alto custo, alto risco.

**Recomendação: A1 (snapshot)**, com otimização de payload (gzip + flag `dirty`) como fase posterior, não como pré-requisito.

### Eixo B — Resolução de conflito: Last-write-wins vs Merge

**Opção B1 — Last-write-wins com confirmação do jogador (RECOMENDADA).**
Cada save tem uma `sync_version` (contador monotônico incrementado a cada push). No pull, se o servidor tem `sync_version` > a base do device, e o device tem mudanças locais não-empurradas, há **conflito**. A UI apresenta os dois lados (ex: "Nuvem: Temporada 5, Sem 12 · Local: Temporada 5, Sem 9") e o jogador escolhe: **usar nuvem**, **usar local (sobrescreve)**, ou **manter os dois** (fork → cria um novo save local com novo `save_id`).
- **Prós**: determinístico, explicável, sem perda silenciosa; "manter os dois" elimina destruição irreversível; alinha com "sem progressão offline" (conflitos são raros porque offline não avança).
- **Contras**: pede decisão ao jogador em colisões.

**Opção B2 — Merge automático de mundo.**
Tentar fundir dois estados de mundo divergentes (jogos jogados em ambos, transferências, etc.).
- **Contras**: **inviável e indesejado**. O mundo é um grafo causal determinístico; fundir duas linhas de tempo que avançaram semanas diferentes produz estado incoerente (mesmo jogador transferido para dois clubes, fixtures duplicados). Não há semântica de merge correta. **Fora de escopo (§9).**

**Recomendação: B1.** Sem merge automático, nunca.

### Eixo C — Enforcement de "sem progressão offline"

**Opção C1 — Lock otimista no cliente (RECOMENDADA para MVP do épico).**
O avanço de semana (`game-loop`) só é permitido se o cliente está online E detém o "lock" do save (pull recente bem-sucedido confirmando que ninguém empurrou versão mais nova). Após commit local, push imediato; se o push falhar (offline/conflito), o avanço é revertido (transação) ou o save entra em estado "pendente de sync" e o avanço fica bloqueado até resolver.

**Opção C2 — Autoridade total de servidor (simulação no backend).**
Mover o avanço para o servidor.
- **Contras**: reescreve o engine como serviço, latência por semana, custo de infra alto. **Fora de escopo deste épico** (poderia ser L5+).

**Recomendação: C1** — lock otimista + push obrigatório pós-commit; offline = somente leitura.

---

## 5. Pré-requisitos & dependências

- **Design System** (`2026-06-20-design-system-premium-design.md`) **concluído** — todas as telas novas (Login, Conta, Status de Sync, Modal de Conflito) consomem o kit.
- **Save isolation** já entregue (`src/database/constants.ts`, `migration.ts`) — fundação obrigatória; sem ela não há snapshot por save.
- **Decisão de produto/infra**: provedor de auth e storage do backend (ex.: serviço gerenciado com auth + blob store, ou backend próprio). É decisão de §8 a resolver antes da Fase 4.
- **expo-secure-store** (ou equivalente) para tokens de sessão — verificar se já está no projeto antes de adicionar dependência; não instalar nada global.
- **Política de privacidade / LGPD-GDPR** para dados de conta (email) — pré-requisito legal antes de lançar auth real.
- **É pré-requisito de**: L5 (online/ligas) e L8 (perfis/social). Este épico não os implementa.

---

## 6. Faseamento

**Fase 1 — Serializador de save (offline, sem rede).**
Implementar `exportSave(db, saveId): SaveSnapshot` e `importSave(db, snapshot): newSaveId`, reusando a lista de tabelas de `DELETE_BY_SAVE_TABLES` (modo SELECT) e a reconstrução estilo `deleteSave`+insert. `SaveSnapshot` carrega `schemaVersion`, `syncVersion`, e as linhas por tabela. Determinístico: exportar→importar→exportar produz blobs idênticos.
*Entregável testável*: round-trip em better-sqlite3 in-memory — exportar um save jogado N semanas, importar em DB limpo, e verificar paridade total (mesmo elenco, fixtures, finanças, standings). **Zero mock.**

**Fase 2 — Versionamento & detecção de conflito (offline).**
Adicionar colunas de sync a `save_games` (ver §7). Implementar `bumpSyncVersion` no commit de avanço e `detectConflict(localMeta, remoteMeta): 'none' | 'remote-ahead' | 'diverged'` como função pura testável.
*Entregável testável*: simular dois "devices" (dois DBs) divergindo da mesma base e asserir que `detectConflict` classifica corretamente cada caso.

**Fase 3 — Auth nativa (cliente + telas).**
Login/cadastro, sessão em secure storage, `userId` na app. Backend de auth pode ser stub/mock-server nesta fase para destravar a UI, mas testes de fluxo não mockam o cliente — usam um fake server local.
*Entregável testável*: login persiste sessão; reabrir app mantém sessão; logout limpa; telas validadas no browser (Playwright) com o kit do DS.

**Fase 4 — Backend de snapshots + cliente de sync.**
Contrato HTTP: `GET /saves` (lista meta), `GET /saves/:id` (snapshot), `PUT /saves/:id` (push com `If-Match: syncVersion`), `DELETE /saves/:id`. Cliente: pull no load, push pós-commit, lock otimista. Enforcement de offline=read-only.
*Entregável testável*: ciclo completo contra um servidor de teste — criar save no device A, push, pull no device B, avançar em B, push, pull em A.

**Fase 5 — Resolução de conflito (UI + lógica).**
Modal de conflito (kit DS) com as 3 ações (usar nuvem / usar local / manter os dois→fork). Fork cria novo `save_id` local via `importSave`.
*Entregável testável*: provocar divergência real, asserir que cada ação produz o estado esperado (incl. fork não corrompe nenhum dos dois saves — checagem de isolamento por stride).

**Fase 6 — Polimento: offline gating, gzip de payload, push de "dirty only", i18n pt/en.**
*Entregável testável*: offline bloqueia avanço com mensagem clara; payload comprimido; paridade i18n pt/en em todas as strings novas.

---

## 7. Schema/infra changes (alto nível)

**Colunas novas em `save_games`** (declarar em `src/database/schema.ts` E adicionar via `addColumnIfMissing` em `src/store/database-store.ts`, padrão idempotente já estabelecido nas linhas 95-188):
- `cloud_id TEXT` — identificador estável do save na nuvem (UUID gerado no 1º push; desacopla do `id` autoincrement local, que difere entre devices).
- `owner_user_id TEXT` — dono do save (FK lógica para a conta).
- `sync_version INTEGER NOT NULL DEFAULT 0` — contador monotônico, incrementa a cada push bem-sucedido. Relógio lógico para detecção de conflito.
- `base_sync_version INTEGER NOT NULL DEFAULT 0` — versão do último pull; base contra a qual o conflito é medido.
- `sync_state TEXT NOT NULL DEFAULT 'local'` — `local | synced | dirty | conflict`.
- `last_pushed_at TEXT` / `last_pulled_at TEXT` — diagnóstico/UX.

**Constante de versão de schema**: `SCHEMA_VERSION` (novo, junto a `src/database/constants.ts`) carimbada em cada `SaveSnapshot` — pull de snapshot com versão diferente roda migração antes de importar.

**Secure storage**: token de sessão de auth fica em secure store do device (NUNCA em `app_settings`/SQLite em claro, NUNCA commitado). `app_settings` pode guardar apenas flags não-sensíveis (ex.: `last_synced_save_cloud_id`).

**Backend (alto nível)**: armazena por usuário um conjunto de snapshots; cada PUT é condicional (`If-Match` na `sync_version`) para rejeitar push stale e devolver 409 (→ conflito). Sem lógica de simulação no servidor nesta fase (C1).

**Sem `Date.now()`/`new Date()` em caminhos de engine**: o carimbo `updated_at` já vive na camada de query (`saves.ts`), fora do engine determinístico — manter assim. `sync_version` é um contador puro, não temporal.

---

## 8. Riscos & decisões abertas

- **[DECISÃO] Provedor de auth/backend**: serviço gerenciado (auth+blob) vs backend próprio. Impacta custo, LGPD, e o contrato HTTP da Fase 4. Resolver antes da Fase 4.
- **[DECISÃO] OAuth obrigatório vs email/senha**: Apple exige Sign in with Apple se houver login social na App Store. Decidir matriz de provedores.
- **[RISCO] Tamanho do snapshot**: dinastias longas geram payloads grandes. Mitigação: gzip + push só de `dirty` (Fase 6). Medir cedo com um save de 10+ temporadas.
- **[RISCO] "Manter os dois" e o cap de slots**: fork cria novo save; se mantivermos um limite de slots, fork pode esbarrar nele. Decidir se contas pagas/gratuitas têm cap diferente (liga com monetização).
- **[RISCO] Migração de schema durante pull**: snapshot antigo (schema N-2) importado em cliente novo. A `SCHEMA_VERSION` + caminho de migração de snapshot precisam ser robustos. Reusar a filosofia idempotente de `database-store.ts`.
- **[RISCO] Relógio de parede não-confiável para conflito**: por isso a detecção usa `sync_version` (contador), não `updated_at`. `updated_at` é só display/desempate humano no modal.
- **[DECISÃO] Saves locais legados pré-auth**: usuários atuais têm saves sem `owner_user_id`. No 1º login, oferecer "adotar saves locais nesta conta" (set `owner_user_id`, 1º push).
- **[RISCO] Determinismo vs replay**: tentação de sincronizar "só a seed + ações" e re-simular. Rejeitado — o estado SQLite é canônico; re-simulação cross-version não é garantida idêntica se o engine evoluir. Snapshot do estado, não replay.

---

## 9. Não-objetivos / fora de escopo

- **Merge automático de mundos divergentes** — explicitamente proibido (§4 B2). Conflito sempre resolvido por escolha do jogador.
- **Simulação no servidor** (autoridade total / C2) — fora; o avanço continua no cliente com lock otimista. Possível em L5+.
- **Multiplayer / ligas online / interação entre jogadores** — é L5, este épico só entrega a fundação de identidade.
- **Perfis públicos, rankings, social** — é L8.
- **Progressão offline** — não-objetivo permanente: offline é read-only por design.
- **Sync incremental por delta** (§4 A2) — fora; snapshot integral é a unidade.
- **Cross-save / transferência de jogadores entre saves** — cada save segue isolado por stride.

---

## 10. Spec self-review

- **Aterrado em código real?** Sim — `save_games` (`schema.ts:304-321`), `getAllSaves`/`updateSaveWeek`/`deleteSave`/`DELETE_BY_SAVE_TABLES` (`saves.ts:67-118`), `SAVE_ID_STRIDE`/`saveOffset` (`constants.ts:7-11`), `migrateSaveIdAsync` (`migration.ts:44-59`), boot idempotente (`database-store.ts:60-335`), `loadSave` (`game-store.ts:169`), `SeededRng` (`rng.ts:5`), orquestrador `game-loop.ts`. Sem funções/colunas inventadas.
- **Respeita convenções?** Colunas novas em `schema.ts` E `database-store.ts` (idempotente); engine puro intocado; sem `Math.random`/`Date.now` no engine; TDD com better-sqlite3 real (Fases 1/2/5); kit do Design System nas telas; i18n pt/en (Fase 6); tokens de `@/theme`.
- **Respeita "sem progressão offline"?** Sim — §4 C1 e §9 o tornam constraint central, não detalhe.
- **Altitude estratégica (não TDD step-by-step)?** Sim — sub-épicos, opções com trade-offs e recomendação, faseamento com entregável por fase.
- **Decisões abertas honestas?** Sim — provedor de backend, OAuth, cap de slots no fork e migração de snapshot estão marcados como decisões/risco, sem "TBD" vazio.
- **Pré-requisito de L5/L8 explícito?** Sim (§1, §5, §9).
- **Lacuna conhecida**: o contrato HTTP exato e o provedor de backend ficam para a fase de plano (depende da decisão de §8) — proposital, não placeholder.
