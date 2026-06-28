# Design (Épico): Multiplayer / Ligas Online

**Epic:** l5-multiplayer · **Data:** 2026-06-20 · **Horizonte:** longo · **Stack:** Expo 54 / RN 0.81 / TS 5.9

**Goal:** permitir que jogadores reais compitam entre si — ligas entre amigos e comparação assíncrona de carreiras — explorando o determinismo já existente no engine como base de confiança/replay.

---

## 1. Visão & valor

A fantasia central: "meu save vale mais que o do meu amigo". Hoje o football-manager é estritamente single-player offline — cada save é um universo isolado (ID space disjunto por `SAVE_ID_STRIDE`, `src/database/constants.ts:7`). O épico abre a dimensão social, que é o motor de retenção mais forte do gênero (FM Online, comunidades de save-sharing, ligas de amigos no Discord).

Dois modos de fantasia, com pesos diferentes de risco/valor:

- **Assíncrono (comparação de carreiras / "save battle"):** todos jogam o **mesmo mundo inicial** (mesma seed), e ao fim de N temporadas comparam-se troféus, reputação do clube, valor de elenco, finanças. Sem necessidade de servidor de simulação — só de armazenar/comparar resultados. É o caminho de menor risco e maior alavancagem do determinismo.
- **Liga entre amigos (síncrono leve / "draft league"):** cada humano controla um clube **dentro do mesmo mundo compartilhado**; as semanas avançam quando todos confirmam suas decisões (tática, transferências), e um árbitro autoritativo simula a rodada. Alto valor, alto custo (servidor + sync + anti-cheat).

O determinismo do engine (mesma seed → mesmo resultado, `SeededRng`/mulberry32 em `src/engine/rng.ts:13`) é o ativo estratégico: torna **verificável** qualquer resultado reproduzindo a simulação a partir de (seed + inputs). Isso é a fundação de anti-cheat e de replays compartilháveis.

## 2. Estado atual na base (fundação real)

O que JÁ existe e serve de alicerce — aterrado em código:

- **Determinismo total do engine.** `SeededRng` (`src/engine/rng.ts:5-54`) é mulberry32 puro: estado de 32 bits, sem `Math.random`/`Date.now`. `advanceGameWeek` recebe `rng: SeededRng` por parâmetro (`src/engine/game-loop.ts:173`) e o stream é cuidadosamente preservado — o comentário em `src/engine/game-loop.ts:300-310` mostra que a ordem de consumo do rng é tratada como contrato (override do match do usuário é excluído do batch "so the week rng stream is identical"). O runner ordena fixtures por id para determinismo (`src/engine/game-loop.ts:297`). Sub-rng derivados usam aritmética da seed: `new SeededRng(saveId * season * (week + 1))` (`src/engine/game-loop.ts:709`).
- **Autoridade de simulação centralizada.** `advanceGameWeek` é o único orquestrador que muta o mundo por semana (`src/engine/game-loop.ts:285-833`). Todo efeito (resultados, stats, finanças, moral, lesões, aposentadorias, transferências) passa por ele. Isso é exatamente o "servidor autoritativo" que precisamos — só falta movê-lo para um host confiável e alimentá-lo com inputs assinados.
- **Save = unidade replicável e isolada.** `save_games` (`src/database/schema.ts:304-321`) tem `current_season`/`current_week`/`player_club_id`/`difficulty` — o estado de carreira de um humano cabe num registro + suas tabelas world-scoped. O `SAVE_ID_STRIDE` (`src/database/constants.ts:7`) garante que ids de dois saves nunca colidem, o que facilita **mesclar/comparar** vários saves numa mesma base (ex.: importar o save de um amigo para comparação local).
- **Inputs do humano já são dados discretos persistidos.** Tática ativa (`tactics`/`tactic_lineup`, `schema.ts:270-300`), cobradores de bola parada (`set_piece_takers`, `schema.ts:490-497`), ofertas de transferência (`transfer_offers`, `schema.ts:244-259`). Tudo o que um humano "decide" numa semana já está modelado como linhas de DB → é serializável como um "pacote de comandos da rodada".
- **Snapshot/migração de mundo existe.** `migration.ts` faz backfill de `save_id` em todas as world tables (`WORLD_TABLES_FOR_MIGRATION`, `src/database/migration.ts:11`). A lista canônica de tabelas (`TABLE_NAMES`, `schema.ts:1-37`) é o inventário do que precisa ser serializado para transmitir um mundo.
- **News/inbox i18n-safe para eventos sociais.** `news_items` guarda chaves i18n + JSON vars (`schema.ts:514-527`), padrão ideal para feed de eventos multiplayer ("Fulano venceu a rodada", "nova oferta de Fulano") sem strings hardcoded.

O que **não** existe: qualquer camada de rede, auth, identidade de usuário, ou persistência fora do dispositivo. Tudo isso é dependência de **L4 (auth/backend)**.

## 3. Decomposição em sub-épicos

1. **Snapshot/serialização de mundo** — serializar/desserializar um save completo (todas as `TABLE_NAMES`) em formato versionado e portável, com hash determinístico do estado.
2. **Replay-verification** — re-executar `advanceGameWeek` a partir de (snapshot + seed + pacote de comandos) e comparar o hash resultante. Núcleo do anti-cheat.
3. **Modelo de competição assíncrona** — definir "save battle": mundo-semente comum, métricas de ranking, janela de N temporadas, comparação local primeiro (import de arquivo).
4. **Backend + identidade (depende de L4)** — usuários, salas/ligas, armazenamento de snapshots/comandos, rankings.
5. **Sync de estado** — protocolo de upload de comandos + download do estado resolvido da rodada; reconciliação e tratamento de divergência.
6. **Árbitro autoritativo síncrono** — servidor roda `advanceGameWeek` para o mundo compartilhado quando todos confirmam; só ele detém a seed-mestra da rodada.
7. **Anti-cheat / autoridade** — validação server-side via replay, detecção de inputs ilegais (orçamento, regras de janela), rate limiting.
8. **UI de multiplayer (kit novo)** — telas de lobby/liga, ranking, comparação de saves, feed social — usando o kit do épico de Design System.

## 4. Opções de arquitetura

### Opção A — Comparação assíncrona local-first (sem servidor de simulação)
Cada jogador simula localmente seu próprio save. Para comparar, exporta um **snapshot + manifesto de provas** (seed, comandos por temporada, hashes intermediários). A comparação roda **localmente** ao importar o arquivo do amigo: o dispositivo re-simula o save do outro a partir das provas e confirma que o resultado declarado bate. Ranking é montado client-side a partir dos snapshots importados.
- **Prós:** não precisa de backend de simulação; aproveita 100% do determinismo; funciona offline; risco baixíssimo; entrega valor já na Fase 1. Anti-cheat "barato" (replay local).
- **Contras:** sem ranking global automático; troca de arquivos é manual (compartilhar `.fmworld`); re-simular o save inteiro pode ser caro no device (mitigável com hashes por temporada + verificação amostral).

### Opção B — Servidor autoritativo "thin" (assíncrono com backend de armazenamento)
Backend (depende de L4) armazena snapshots + comandos + rankings, mas **não simula** — confia no cliente e verifica por replay sob demanda (ou amostral em servidor Node rodando o mesmo `engine/`, que é React-free e portável: ver `CLAUDE.md` "Engine puro... zero dependência de React/Expo").
- **Prós:** ranking global e ligas persistentes; engine roda igual no servidor (mesmo TS); anti-cheat por replay server-side é forte; ainda sem simulação síncrona complexa.
- **Contras:** exige backend (L4) + custo de hospedar replays; latência de verificação; superfície de cheat maior que A (cliente simula primeiro).

### Opção C — Árbitro autoritativo síncrono (liga entre amigos verdadeira)
Servidor detém a seed-mestra de cada rodada e é o **único** a chamar `advanceGameWeek` para o mundo compartilhado. Clientes enviam apenas pacotes de comandos; recebem o estado resolvido (delta ou snapshot).
- **Prós:** experiência social mais rica (múltiplos humanos no mesmo mundo); anti-cheat máximo (cliente nunca decide resultado); seed nunca exposta.
- **Contras:** mudança arquitetural grande (engine precisa rodar headless no servidor com I/O de DB server-side); coordenação de turnos (todos confirmam); maior custo operacional e de teste; risco alto.

**Recomendação:** faseado **A → B → C**. A entrega A (local-first) valida a fantasia e exercita snapshot+replay sem nenhuma dependência de backend, comprando tempo para L4. B reaproveita o engine no servidor para ranking global. C só depois de B provar o pipeline de replay autoritativo. Nunca pular para C direto: o custo de validar determinismo cross-platform (device vs servidor) é o gargalo real e precisa ser amortizado por A/B primeiro.

## 5. Pré-requisitos & dependências

- **L4 (auth/backend)** — bloqueante para B e C (identidade de usuário, armazenamento remoto, rankings). A **não** depende de L4.
- **Determinismo cross-platform garantido** — `SeededRng` é puro JS de 32 bits (`rng.ts`), mas é preciso provar que o **engine inteiro** (não só o rng) é bit-idêntico entre Hermes/JSC (device) e Node (servidor). Riscos: ordenação de `Map`/`Set` iteration, `Math.trunc`/float (ex.: `*_progress` em `game-loop.ts:402-409`), `ON CONFLICT` ordering. Precisa de uma suíte de golden-hash determinístico antes de B.
- **Épico Design System** (`2026-06-20-design-system-premium-design.md`) — a UI de multiplayer (sub-épico 8) deve consumir o novo kit (Card/Button/StatBar/Text/Icon/EmptyState/Toast/useConfirm), não estilos inline.
- **Versionamento de schema/seed** — comparar saves exige que ambos tenham sido gerados com a **mesma versão de seed e de balance** (`src/engine/balance.ts`). Mundos de versões diferentes não são comparáveis.
- **i18n pt/en** — todo evento social novo entra como chave em `src/i18n/pt.ts` + `en.ts` com paridade.

## 6. Faseamento

**Fase 1 — Snapshot + hash determinístico (engine/database, sem rede).**
Entregável testável: `serializeWorld(db, saveId) → WorldSnapshot` e `deserializeWorld(db, snapshot) → newSaveId` que sobrevivem a um round-trip (export→import→export produz snapshots iguais). `worldHash(snapshot)` estável. Teste de integração better-sqlite3 real: criar save, avançar K semanas, serializar, importar em DB limpo, avançar mais semanas em ambos com a mesma seed → hashes idênticos. Sem mock.

**Fase 2 — Replay-verification local.**
Entregável: `verifyReplay({ baseSnapshot, seed, commands[] }) → { ok, finalHash }` que re-roda `advanceGameWeek` por temporada e confere contra o hash declarado. Teste: snapshot adulterado (ex.: orçamento inflado) → `ok=false`. Comando ilegal (oferta acima do orçamento) → rejeitado.

**Fase 3 — Save battle assíncrono local-first (Opção A).**
Entregável: export/import de `.fmworld` via filesystem do device; tela de comparação (kit novo) listando dois saves lado a lado (troféus/reputação/valor de elenco) com selo "verificado" do replay. Sem backend.

**Fase 4 — Backend de armazenamento + ranking (Opção B, pós-L4).**
Entregável: upload de snapshot+provas autenticado; verificação server-side via mesmo `engine/` rodando em Node; ranking de liga persistente. Feed social em `news_items`.

**Fase 5 — Árbitro síncrono (Opção C).**
Entregável: liga de amigos com turnos confirmados; servidor único chama `advanceGameWeek` com seed-mestra; cliente envia só comandos. Detecção de divergência cliente↔servidor.

## 7. Schema/infra changes (alto nível)

Toda nova tabela é world/save-scoped, entra em **ambos** `src/database/schema.ts` E o backfill de `database-store`/`migration.ts` (`WORLD_TABLES_FOR_MIGRATION`), respeita `SAVE_ID_STRIDE` e queries recebem `(db, saveId, ...)`.

- **`save_games`**: novas colunas `world_seed INTEGER` (seed-mestra do mundo, hoje implícita na geração), `world_version TEXT` (versão de seed+balance para comparabilidade), `multiplayer_room_id TEXT` (NULL = single-player), `last_synced_week INTEGER`.
- **`round_commands`** (nova, save-scoped): pacote serializado de comandos do humano por (season, week) — tática, transfers, set-pieces — em JSON i18n-free. É o input verificável da rodada.
- **`world_snapshots`** (nova, local cache): snapshots serializados + `world_hash` por (saveId, season). Permite verificação amostral sem re-simular tudo.
- **Infra server-side (Fase 4+, fora deste repo de app):** o engine TS é empacotado como módulo Node compartilhado (já é React-free); DB server-side usa o mesmo `SCHEMA_SQL`. Nenhuma mudança no engine além de extrair I/O para uma interface `DbHandle` (já é o padrão — `advanceGameWeek` recebe `dbHandle`, `game-loop.ts:168`).

Formato de snapshot: serialização tabela-a-tabela seguindo `TABLE_NAMES` (`schema.ts:1-37`), com normalização de ids **relativa ao saveOffset** (`constants.ts:9`) para que o mesmo mundo importado em saveIds diferentes produza hash igual.

## 8. Riscos & decisões abertas

- **Determinismo cross-runtime (risco central).** O rng é puro, mas o engine itera `Map`/`Set` (`clubData`, `financeClubIds`) cuja ordem de inserção precisa ser estável entre Hermes e Node. Decisão aberta: adotar ordenação explícita por id em todo ponto de iteração que alimenta o rng, ou aceitar verificação por hash de **resultados** (placares/stats) em vez de hash de estado bruto. Recomendado: hash de resultados observáveis, mais robusto a diferenças de ordenação interna.
- **Custo de re-simulação no device.** Re-rodar N temporadas para verificar é caro. Mitigação: hashes por temporada + verificação amostral (verificar 1 em K temporadas, escolhida deterministicamente).
- **Comparabilidade entre versões.** Atualizar `balance.ts` ou o gerador de seed invalida comparações antigas. Decisão: bloquear comparação se `world_version` diferir; versionar explicitamente.
- **`advanceGameWeek` usa `updated_at`/timestamps?** Sim — `updateSaveWeek`/`createSave` gravam `updated_at` (`saves.ts:52,89`). Isso é metadado **não-simulacional** e deve ser excluído do hash de mundo. Confirmar que nenhum caminho de engine deriva lógica de timestamp.
- **Anti-cheat em Opção A é local.** Um jogador pode importar um arquivo forjado, mas a verificação por replay no **importador** o pega; o risco é só "auto-trapaça" (irrelevante). Ranking global (B) exige verificação server-side.
- **Seed-mestra em C.** Como impedir que o cliente preveja resultados se o engine é determinístico e o cliente conhece a seed? Em C a seed da rodada **nunca** é enviada ao cliente — só o servidor a detém. Decisão de design firme.
- **Tamanho do snapshot.** Um mundo com muitas temporadas acumula `match_events`/`player_stats`/`transfers`. Avaliar snapshot "magro" (sem histórico de eventos, só estado atual + provas) vs "gordo".

## 9. Não-objetivos / fora de escopo

- **Tempo real / partida jogada simultaneamente por dois humanos** — o engine é por-semana, não tick-a-tick; não há ambição de PvP ao vivo.
- **Chat/voz/social genérico** — feed de eventos via `news_items` basta; não construir mensageria.
- **Matchmaking competitivo / ELO** — ranking simples de liga, sem sistema de matchmaking.
- **Monetização / cosméticos** — fora deste épico.
- **Implementar L4** — auth/backend é épico próprio; aqui só consumimos sua API.
- **Re-arquitetar o engine para rodar parcialmente no servidor antes da Fase 5** — o engine já é portável; não antecipar refactor.

## 10. Spec self-review

- **Aterrado em código real?** Sim — `rng.ts:5-54` (determinismo), `game-loop.ts:168-833` (autoridade + contrato do rng stream), `schema.ts` (`TABLE_NAMES`, `save_games`, world tables), `constants.ts:7-11` (`SAVE_ID_STRIDE`/`saveOffset`), `migration.ts:11` (inventário de world tables). Nenhuma função/coluna inventada.
- **Respeita convenções?** Save-isolation `(db, saveId, ...)` + `SAVE_ID_STRIDE`; novas colunas em schema **e** migração; engine puro reusável no servidor; `SeededRng` único como fonte de aleatoriedade; i18n via `news_items`/chaves; UI no kit novo (`design-system-premium`).
- **Altitude estratégica (não TDD)?** Sim — sub-épicos, opções A/B/C com recomendação faseada, sem passos de implementação linha-a-linha.
- **Dependências explícitas?** L4 marcado como bloqueante de B/C; Design System para UI; determinismo cross-runtime como pré-req técnico de B.
- **Riscos reais identificados?** Determinismo Hermes↔Node, custo de re-simulação, exclusão de timestamps do hash, comparabilidade entre versões, seed-mestra em C.
- **Lacuna conhecida:** o formato exato de `round_commands` e a fronteira "hash de estado vs hash de resultados" ficam para o plano da Fase 1/2 — decisão de design sinalizada, não resolvida aqui (apropriado para spec de épico).
