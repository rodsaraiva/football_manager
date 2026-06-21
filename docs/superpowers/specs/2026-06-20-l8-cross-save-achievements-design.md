# Design (Épico): Conquistas cross-save + leaderboards

**Epic:** l8-cross-save · **Data:** 2026-06-20 · **Horizonte:** longo · **Stack:** Expo 54 / RN 0.81 / TS 5.9
**Goal:** Elevar as conquistas locais por-save a um sistema de **conta** (cross-save, integrado a Play Games / Game Center) e adicionar **leaderboards globais** (maior dinastia, mais títulos), respeitando determinismo, save-isolation e privacidade — sobre a fundação de identidade entregue por L4.

---

## 1. Visão & valor

Hoje uma conquista vive e morre dentro de um save: a tabela `achievements` tem PK `(save_id, achievement_id)` (`src/database/schema.ts:501-507`), toda leitura é `WHERE save_id = ?` (`src/database/queries/achievements.ts:22`) e a tela mostra "X / Y desbloqueadas" do save atual (`src/screens/career/AchievementsScreen.tsx:39`). Começar uma carreira nova zera o painel. Não existe noção de "o que **eu, jogador**, já conquistei em todas as minhas carreiras", nem qualquer comparação com outros jogadores.

A fantasia que este épico serve é a do **técnico com legado que transcende um save**: "já levantei 40 títulos somando todas as minhas carreiras", "minha dinastia de 18 temporadas no Anytown FC está no top 100 mundial", o ping de troféu nativo do Play Games / Game Center que aparece por cima do jogo. É a camada de **prestígio e comparação social** que transforma marcos privados em identidade pública e ranqueada.

Valor concreto:
- **Persistência cross-save**: conquistas viram propriedade da conta, sobrevivem a novos saves e a wipe de save individual.
- **Reconhecimento de plataforma**: troféus espelhados em Play Games (Android) / Game Center (iOS) — credibilidade, descoberta e re-engajamento via notificação nativa.
- **Competição global**: leaderboards de métricas agregadas (títulos totais, maior dinastia, maior sequência de vitórias) dão um teto de aspiração que o single-player sozinho não tem.
- **Privacidade como feature**: o jogador escolhe se aparece nos rankings e sob que nome — opt-in explícito, nunca vazamento de carreira.

Princípio inegociável herdado do core e de L4: **determinismo e save-isolation são preservados**. A elegibilidade de qualquer conquista/score continua sendo decidida por função **pura** sobre snapshot (como `evaluateAchievements`, `src/engine/achievements/achievements-engine.ts:29`); nada de `Math.random`/`Date.now`/`ORDER BY RANDOM` nesses caminhos. O servidor de leaderboard é **autoridade de ranking**, mas a **origem** de cada score é o estado canônico do save sincronizado por L4 — leaderboard nunca é input da simulação.

---

## 2. Estado atual na base (fundação)

O que já existe e serve de alicerce direto:

- **Catálogo estático declarativo** (`src/engine/achievements/achievements-catalog.ts:18-30`): 11 conquistas MVP, cada uma `{ id, icon, titleKey, descKey }`, com `getAchievementDef(id)` por `Map` (linha 34). **É o ponto único onde metadados de plataforma (Play Games / Game Center achievement id) entram** — basta estender `AchievementDef`.
- **Avaliação pura por snapshot** (`src/engine/achievements/achievements-engine.ts:29-48`): `evaluateAchievements(s: AchievementSnapshot)` retorna os ids cuja condição o snapshot satisfaz; campos `undefined` = "não cumprido". Sem efeitos colaterais, sem React, sem I/O. **Modelo perfeito para também derivar métricas de leaderboard a partir de um snapshot ampliado.**
- **Orquestrador de checkpoint** (`src/engine/achievements/achievements-checkpoint.ts:23-49`): `processAchievementCheckpoint` faz evaluate → `unlockAchievements` (persiste idempotente) → resolve defs → produz news. Toca DB diretamente como `accept-job-offer`, com a decisão pura isolada. **É o gancho natural para, além de persistir local, enfileirar um "espelhar para plataforma" e "atualizar métrica de conta".**
- **Persistência idempotente** (`src/database/queries/achievements.ts:33-59`): `unlockAchievements` retorna **só os ids novos** (compara contra o set existente) — re-checkpoints não duplicam. `getUnlockedAchievements` ordena por `season, week`. **O "retorna só os novos" é exatamente o trigger barato para empurrar à plataforma/leaderboard só o delta.**
- **News producer** já cabe um item por conquista nova (`achievements-checkpoint.ts:36-46`, `category: 'achievement'`), provando que o checkpoint é o lugar dos efeitos derivados.
- **Toast de conquista** já existe (`src/components/AchievementToast.tsx`) — UI de unlock resolvida; falta a variante "espelhado na plataforma".
- **Save-isolation por stride** (`src/database/constants.ts:7-11`, `SAVE_ID_STRIDE = 100_000_000`): toda tabela de mundo recebe `(db, saveId, ...)` e filtra por `save_id`. **Conquistas/scores de conta são, por definição, transversais a `save_id` — exigem uma tabela NÃO-stride, decisão explícita em §7.**
- **Fundação de conta de L4** (`2026-06-20-l4-cloud-save-auth-design.md`): auth nativa (email/OAuth Apple/Google), `userId` disponível na app, secure storage para tokens, e sync de snapshot integral do save (export por `save_id`, `schema_version` no blob). **L8 consome `userId` (chave de toda agregação de conta) e o sync de L4 (a fonte canônica dos números que viram score).** L4 é pré-requisito declarado de L8.
- **Boot/migration idempotente** (`src/store/database-store.ts:60-78`): único ponto de schema — `SCHEMA_SQL` + `addColumnIfMissing` + criação de índices. **Colunas/tabelas novas de L8 entram aqui e em `src/database/schema.ts`, espelhadas (ambos os lugares).**
- **i18n com paridade** (`src/i18n/pt.ts:1103-1107` e `en.ts`): chaves `achievements.*` já cobrem a tela; novas strings (plataforma, leaderboard, privacidade) entram nos dois arquivos.
- **Design System** (`2026-06-20-design-system-premium-design.md`): kit Card/Button/StatBar/Text/Icon/EmptyState/Toast/useConfirm. **Toda tela nova de L8 (perfil de conta, leaderboards, settings de privacidade) usa o kit, nunca estilo inline cru.** A `AchievementsScreen` atual ainda usa estilos inline (`src/screens/career/AchievementsScreen.tsx:72-119`) — sua extensão para a aba "conta" deve migrar para o kit.

Lacunas que o épico preenche: não há (a) noção de conquista/score **de conta** (tudo é per-save); (b) bridge nativa Play Games / Game Center; (c) mapeamento conquista-local → achievement-de-plataforma; (d) leaderboards (cliente ou servidor); (e) modelo/UI de privacidade para presença em ranking.

---

## 3. Decomposição em sub-épicos

1. **Bridge nativa de achievements** — módulo Expo (config plugin / dev client) que fala com Play Games Services (Android) e GameKit / Game Center (iOS), expondo `report(achievementId)` e `submitScore(boardId, value)` com fila offline e no-op no web. Camada fina, sem regra de jogo.
2. **Mapeamento conquistas locais → plataforma** — estender `AchievementDef` com `platformId` (Android/iOS) e wirar o checkpoint para espelhar **só os ids novos** à plataforma; reconciliar com o painel local (in-game continua a verdade visível).
3. **Conquistas de conta (cross-save)** — tabela de conta (não-stride) agregando unlocks de todos os saves por `userId`; novas conquistas "meta" só atingíveis somando carreiras (ex.: 50 títulos totais, 3 dinastias). Agregação derivada do sync de L4.
4. **Leaderboards globais** — definição das boards (maior dinastia em temporadas, títulos totais, maior win streak), cliente que submete score após avanço, e tela de ranking (top N + posição do jogador) no kit do Design System. Servidor opcional próprio vs. boards nativas (ver §4).
5. **Privacidade & presença** — opt-in explícito por board, display name escolhido pelo jogador (≠ identidade real), e enforcement de "nada vai pra rede sem consentimento". Settings no kit.

Cada peça é entregável e testável isoladamente: bridge com mock de plataforma; mapeamento com snapshot in-memory; agregação de conta com dois saves em DB real; leaderboard client contra fake server; privacidade com testes de gate puros.

---

## 4. Opções de arquitetura

### Eixo A — Onde vivem os leaderboards: boards nativas vs. servidor próprio

**Opção A1 — Boards nativas (Play Games / Game Center) [RECOMENDADA para Fase 4].**
Usa os leaderboards das próprias plataformas: a board, o ranking, a anti-fraude básica e a UI de overlay são deles; nós só fazemos `submitScore`. Conquistas idem (`report`).
- **Prós**: zero backend novo, zero custo de operação, UI nativa polida grátis, integra com o ecossistema social do jogador (amigos no Play Games), anti-cheat de plataforma.
- **Contras**: web fica de fora (no-op), boards limitadas ao que as plataformas permitem (faixas de int64, sem boards "ricas"), governança fora do nosso controle, e exige dev client (sai do Expo Go).

**Opção A2 — Servidor próprio (reusa o backend de L4).**
O backend de snapshots de L4 ganha endpoints de leaderboard; o app submete score autenticado por `userId`; ranking e top-N vêm da nossa API; UI 100% nossa (cross-plataforma, inclui web).
- **Prós**: cross-plataforma real, boards arbitrariamente ricas, controle total de privacidade/governança, fonte única (o snapshot de L4 já está no servidor → score pode ser **recomputado server-side** a partir do save canônico, reduzindo cheating).
- **Contras**: backend, custo, anti-fraude por nossa conta, mais superfície de privacidade/LGPD.

**Opção A3 — Híbrido [RECOMENDADA como destino].** Bridge nativa para **achievements** (alto valor, baixo custo, A1) + servidor próprio para **leaderboards** (recompute server-side a partir do snapshot de L4, A2). Conquistas espelham na plataforma e contam pra conta; scores são autoritativos no nosso servidor e cross-plataforma.
- **Trade-off**: mais peças, mas separa o que cada lado faz melhor. Faseável: A1 primeiro (barato), servidor de leaderboard depois.

### Eixo B — Fonte do score: cliente reporta vs. servidor recomputa

**Opção B1 — Cliente reporta** o valor calculado localmente (rápido, simples) — vulnerável a save adulterado.
**Opção B2 — Servidor recomputa [RECOMENDADA]** o score a partir do snapshot de L4 já sincronizado, usando a **mesma função pura** que o cliente (compartilhada via `src/engine`). Determinismo garante que cliente e servidor cheguem ao mesmo número para o mesmo save; divergência = fraude/bug. Requer que a função de score não dependa de nada além do snapshot.

### Eixo C — Modelo de conquista de conta: espelho vs. catálogo separado

**Opção C1 — Espelho** (conquista de conta = "desbloqueada em qualquer save") — simples, reusa o catálogo atual.
**Opção C2 — Catálogo de conta separado [RECOMENDADA]** com conquistas **meta** que só fazem sentido somando carreiras (50 títulos totais, 3 dinastias ≥10 temporadas). Estende o padrão de `ACHIEVEMENTS` num segundo array `ACCOUNT_ACHIEVEMENTS`, avaliado por uma função pura sobre um `AccountSnapshot` agregado. Mantém a separação clara entre marco-de-save e marco-de-jogador.

**Recomendação consolidada:** A3 + B2 + C2, faseado (achievements nativos antes; leaderboards server-side e conquistas de conta depois).

---

## 5. Pré-requisitos & dependências

- **L4 (cloud save + auth) — bloqueante.** Sem `userId` não há agregação de conta nem submissão autenticada; sem o sync de snapshot não há fonte canônica para recompute server-side. L8 começa **só após** L4 entregar auth + sync.
- **Dev client / config plugin** — Play Games e GameKit exigem código nativo: sair do Expo Go, configurar `expo-dev-client`, IDs de aplicativo no Google Play Console e App Store Connect. Não instalar nada global sem autorização; tudo via `node_modules` + config do projeto.
- **Design System** (`2026-06-20-design-system-premium-design.md`) — telas novas no kit.
- **Determinismo** (`src/engine/rng.ts`) — funções de score/elegibilidade puras e determinísticas, reutilizáveis client+server.
- **Servidor de leaderboard** (Fase 4+) reusa a infra de backend de L4 (auth, storage do snapshot).
- **Contas de developer/console**: Google Play Games Services e App Store Connect (Game Center) — configuração externa fora do código.

---

## 6. Faseamento

**Fase 1 — Bridge nativa (achievements) com fila offline.**
Módulo `src/native/platform-achievements` (interface TS pura + impl nativa) com `reportAchievement(platformId)` e fila persistida (reusa `app_settings` ou tabela própria) para quando offline; **no-op explícito no web** (lembrar: web é alvo de dev). Entregável testável: testes da fila e do gating (web → no-op) com a impl nativa mockada por interface; smoke manual em dev client Android.

**Fase 2 — Mapeamento local → plataforma.**
Estender `AchievementDef` com `platformId?: { android?: string; ios?: string }` (`achievements-catalog.ts`). No `processAchievementCheckpoint`, para cada **id novo** retornado por `unlockAchievements`, enfileirar `reportAchievement`. Entregável: teste que, dado um snapshot que desbloqueia N conquistas novas, enfileira exatamente N reports (e zero em re-checkpoint), com DB real (better-sqlite3) — nunca mock de DB.

**Fase 3 — Conquistas de conta (cross-save).**
Tabela `account_achievements` (não-stride, chaveada por `userId`) + `ACCOUNT_ACHIEVEMENTS` catalog + `evaluateAccountAchievements(s: AccountSnapshot)` puro. `AccountSnapshot` agregado a partir de todos os saves do usuário (somatório de títulos, maior dinastia, total de unlocks). Nova aba/seção "Conta" na `AchievementsScreen` migrada para o kit do Design System. Entregável: dois saves em DB real → snapshot de conta correto → conquistas meta corretas; tela renderiza local + conta.

**Fase 4 — Leaderboards globais.**
Definir boards (maior dinastia em temporadas, títulos totais, maior win streak), `computeLeaderboardScores(s: AccountSnapshot)` puro (reutilizado client+server), cliente de submissão pós-avanço, e tela de ranking (top N + posição própria) no kit. Submissão A1 (nativa) e/ou A2 (servidor) conforme decisão de §4. Entregável: scores corretos por função pura (testes), submissão idempotente, tela de ranking com estado vazio (EmptyState do kit).

**Fase 5 — Privacidade & presença.**
Opt-in por board (default OFF), display name escolhido pelo jogador, gate puro `canSubmit(board, prefs)` que impede qualquer ida à rede sem consentimento; settings no kit. Entregável: testes de gate (sem opt-in → zero submissão), fluxo de escolha de nome, e revisão de que nada sensível sai sem consentimento.

Cada fase é independente e shippável: Fase 1-2 entregam valor (troféus nativos) sem depender de servidor; 3-5 dependem progressivamente de L4 e/ou backend.

---

## 7. Schema/infra changes (alto nível)

Mudanças sempre **espelhadas** em `src/database/schema.ts` (DDL) e aplicadas no boot de `src/store/database-store.ts:68-78` (`SCHEMA_SQL` + `addColumnIfMissing`), com índices idempotentes.

- **`account_achievements`** (NÃO-stride; cross-save por design): `(user_id TEXT, achievement_id TEXT, unlocked_at TEXT, source_save_id INTEGER NULL, PRIMARY KEY (user_id, achievement_id))`. Decisão explícita: esta tabela **não** usa `save_id`/stride — é a primeira tabela de **conta**, não de mundo. Documentar isso no schema (como o comentário de `achievements` em `schema.ts:499-500`).
- **`platform_sync_queue`** (fila de espelhamento offline): `(id, kind TEXT 'achievement'|'score', payload TEXT, status, created_at)` — drena quando online. Alternativa leve: reusar `app_settings` se a fila for pequena (decisão de Fase 1).
- **`leaderboard_prefs`** (privacidade): `(user_id TEXT, board_id TEXT, opted_in INTEGER DEFAULT 0, display_name TEXT, PRIMARY KEY (user_id, board_id))`. Default opt-out.
- **`AchievementDef`** (não-DB): novo campo `platformId?: { android?: string; ios?: string }`.
- **Native/infra**: config plugin Expo para Play Games + GameKit; entitlements iOS (Game Center); IDs em Play Console / App Store Connect (externos, não versionados no DB).
- **Backend (Fase 4, se A2)**: endpoints de leaderboard sobre a infra de L4; recompute server-side reusa as funções puras de `src/engine`.

i18n: novas chaves `achievements.account_*`, `leaderboard.*`, `privacy.*` em `pt.ts` **e** `en.ts` com paridade.

---

## 8. Riscos & decisões abertas

- **Dependência dura de L4**: se L4 atrasar, L8 trava em Fase 3+. Mitigar entregando Fases 1-2 (achievements nativos por-save espelhados) que **não** exigem conta — valor cedo.
- **Web fica de fora das boards nativas**: web é alvo de dev; A1 vira no-op no web. Se cross-plataforma for requisito de produto, A2 (servidor) é obrigatório, não opcional.
- **Anti-fraude**: cliente reportando score é falsificável (save editado). B2 (recompute server-side) mitiga, mas exige snapshot canônico no servidor (de L4) e a mesma função pura nos dois lados — risco de drift se não compartilharem o módulo de `src/engine`.
- **Dev client obrigatório**: sair do Expo Go aumenta atrito de build/CI; validar pipeline antes de comprometer a fase.
- **LGPD/privacidade**: display name + ranking público = dado pessoal. Default opt-out é decisão de design; revisar consentimento e direito de remoção.
- **Decisões abertas**: (a) fila offline em tabela própria vs. `app_settings`? (b) A2 servidor próprio entra no MVP de L8 ou fica para iteração? (c) conquistas de conta espelham na plataforma também, ou são só in-game? (d) migrar a `AchievementsScreen` inteira para o kit nesta épica ou só a aba nova? (e) win streak precisa de coluna nova de tracking ou é derivável do histórico existente?

---

## 9. Não-objetivos / fora de escopo

- **Merge automático de progresso entre saves** — agregação é somatório/máximo determinístico, não reconciliação de mundos (isso é L4/L5).
- **Multiplayer / ligas online** — é L5; L8 só ranqueia métricas single-player agregadas.
- **Trocar o engine de simulação** — L8 lê snapshots, nunca altera regra de jogo; leaderboard jamais é input da simulação.
- **Conquistas dinâmicas/geradas** — catálogo continua estático e declarativo.
- **Boards "ricas" / sociais avançadas** (chat, clãs, temporadas ranqueadas) — fora; foco em boards de métrica simples.
- **Reescrever a persistência per-save de `achievements`** — ela permanece como verdade in-game; conta é camada **adicional**.

---

## 10. Spec self-review

- **Aterrado em código real?** Sim: catálogo (`achievements-catalog.ts:18-34`), engine puro (`achievements-engine.ts:29-48`), checkpoint (`achievements-checkpoint.ts:23-49`), persistência idempotente (`achievements.ts:33-59`), schema (`schema.ts:499-509`), tela (`AchievementsScreen.tsx:39,72-119`), stride (`constants.ts:7-11`), boot/migration (`database-store.ts:60-78`), i18n (`pt.ts:1103-1107`), e a fundação de L4 (`2026-06-20-l4-cloud-save-auth-design.md`).
- **Respeita determinismo/save-isolation?** Sim: elegibilidade e score são funções puras sobre snapshot; recompute server-side reusa o mesmo módulo; nenhuma fonte não-determinística em caminho de engine; tabelas de conta são explicitamente não-stride com justificativa.
- **Convenções (kit, i18n, schema espelhado)?** Sim: telas novas no kit do Design System, i18n pt/en com paridade, mudanças espelhadas em `schema.ts` + `database-store.ts`.
- **Dependências explícitas?** Sim: L4 bloqueante, dev client, Design System, contas de console.
- **Faseamento entrega valor cedo?** Sim: Fases 1-2 dão troféus nativos sem servidor nem conta.
- **Riscos honestos / decisões abertas marcadas?** Sim, §8 — sem "TBD" mascarado; cada questão tem dono de fase.
