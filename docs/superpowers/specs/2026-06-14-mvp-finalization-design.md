# MVP Finalization — Design (Release-Ready)

**Goal:** Levar o football-manager de "roadmap de produto 100% entregue" a um **MVP release-ready**: sem becos sem saída, loop de carreira completo, experiência narrativa coesa, reprodutível e com um portão de QA.

**Finish-line escolhida:** Release-ready (escopo máximo aninhado).

**Estratégia de validação:** Híbrida — um e2e headless multi-temporada como rede de regressão (W0) + **um** passe manual no browser até a 1ª virada de temporada (W7).

**Sequência:** Harness-first (B): **W0 → W1 → W2 → W3 → W4 → W5 → W6 → W7** (com ressalvas de dependência abaixo).

> **Este documento foi revisado após uma auditoria adversarial multi-agente (11 agentes) contra o código real em 2026-06-14.** As correções estão incorporadas; as premissas verificadas estão marcadas com ✅ e as que foram refutadas/ajustadas com ⚠️.

---

## Estado de partida (verificado 2026-06-14)

- ✅ 12/12 épicos do MASTER-ROADMAP + 9/9 pilares (P1–P9) mergeados; suíte **1000 testes / 150 suites**; mercado da IA determinístico (`07ba87b`).
- ✅ Save CRUD completo (`saves.ts`: create/get/update/delete com cascata em 28 tabelas) e ciclo GameOver→MainMenu→NewGame funcionam.
- ✅ **46 rotas** do `RootStackParamList` registradas no `RootNavigator` — zero rotas órfãs.
- ⚠️ "Único stub honesto" **não** era o único problema de release. A auditoria encontrou também:
  - **Determinismo (W5):** `Math.random()` em `AssistantHiringScreen.tsx:110` (retirementAge entra no DB) e `Object.keys(groups)` sem `.sort()` em `round-progression.ts:155` (ordem de grupos de mata-mata pode depender da ordem de query). Os `Date.now()` em `saves.ts`/`ui-store.ts` são benignos (timestamps/ids de UI).
  - **i18n residual (W7):** strings hardcoded em `OffersReceivedScreen.tsx:271` ("Your counter is on the table…", já existe a chave `offers.counter_sent_msg`), `PlayerDetailScreen.tsx:501` ("Borrower pays (%)"), e fallbacks "Player #id" em vários lugares.
  - **Sem tela de Settings global** (o toggle de idioma vive no MainMenu). Decidido: fora do MVP (aceitável).
- ⚠️ **LINCHPIN CRÍTICO:** `advanceGameWeek` **NÃO** chama `rolloverSeason`. A virada de temporada (promoção/rebaixamento + `rolloverSeason`: envelhecer, expirar contratos, gerar youth, regenerar elenco da IA, **ensureSeasonFixtures**) só roda em `EndOfSeasonScreen.handleContinue` (UI, linha ~337–375). O `full-season.e2e` chega a season 2 week 1 e **para** — nunca avança para dentro da season 2 (que não teria fixtures). Consequência: o e2e headless do W0 **precisa orquestrar a virada** explicitamente.

---

## Decisão fundacional: extrair `runSeasonTransition` (F0)

A orquestração de virada que hoje vive em `EndOfSeasonScreen.handleContinue` (computar promoção/rebaixamento via `buildDivisionPairs`/`computeDivisionSwaps` + `UPDATE clubs.league_id` + `rolloverSeason`) deve ser **extraída** para uma função headless reutilizável:

```
runSeasonTransition(db, saveId, { endedSeason, newSeason, playerClubId, rng }): Promise<void>
```

Ela é chamada por: (a) `EndOfSeasonScreen` (refactor — comportamento idêntico), (b) o **harness e2e do W0** entre temporadas, e (c) o **ramo demitido→aceitar-resgate do W2** (para o novo clube). Isso dedup­lica a lógica, torna a virada testável headless e desbloqueia W0 e W2.

**Alternativa considerada e rejeitada para o MVP:** mover `rolloverSeason` para dentro de `advanceGameWeek` no bloco `isSeasonEnd`. É mais limpo a longo prazo, mas muda o fluxo de UI existente (que insere promoção/rebaixamento + telas entre o fim e o rollover) e tem blast radius maior. Preferir a extração de `runSeasonTransition` para o MVP; avaliar a internalização pós-MVP.

`runSeasonTransition` é o **primeiro deliverable do W0**.

---

## Modelo de execução

Cada workstream vira branch `feat/<slug>` com seu **próprio plano detalhado**. Padrão por workstream (igual P1–P9): subagent implementa (TDD, sem merge/push) → Diretor Técnico verifica (`tsc` + `jest` completo **incluindo o e2e do W0** + browser quando há UI) → merge ff + push.

**Convenções transversais (obrigatórias):** TDD com better-sqlite3 real (nunca mock); `src/engine/` puro (orquestradores que tocam DB seguem `game-loop.ts`); colunas/tabelas novas em **ambos** schema.ts E database-store.ts; save-isolation `(db, saveId, …)`; i18n pt/en com paridade; tokens de `@/theme`; **zero** `ORDER BY RANDOM`/`Math.random`/`Date.now` em caminhos do engine.

**Ressalvas de dependência (da auditoria):**
- **W0 é BLOQUEANTE** e usa **reverse-TDD**: escrever o e2e com os asserts desejados primeiro, implementar até passar. Nenhum outro workstream mescla sem W0 verde.
- As **2 micro-correções de determinismo do W5** são pré-requisito do assert de reprodutibilidade do W0 — landar no início do W0.
- **W2** depende de W0 (rede) + `runSeasonTransition` (F0). **W6** depende de W0+W2 estáveis. **W3** depende de W0 (adiciona 6 pontos de integração ao loop).

---

## W0 — `runSeasonTransition` + E2E de carreira multi-temporada (rede de regressão)

**Por quê:** Release-ready exige uma rede que prove o loop inteiro a cada feature.

**Entrega:**
1. **F0 — `runSeasonTransition`** (extração descrita acima) com teste unitário (uma virada produz promoção/rebaixamento + fixtures da nova temporada + elenco envelhecido).
2. **Micro-fixes de determinismo (do W5):** `AssistantHiringScreen.tsx:110` Math.random→rng semeado; `round-progression.ts:155` `Object.keys(groups).sort()`. (Pequenos; primeiro, para o assert de reprodutibilidade ser válido.)
3. **Helpers** em `__tests__/e2e/test-helpers.ts`: `playUntilSeasonEnd(ctx, seed)` (avança até `isSeasonEnd`), wrapper que chama `runSeasonTransition` na virada, e `respondToJobOfferGate(ctx, offeringClubIdOrNull)` (aceita via `acceptJobOffer` ou limpa `job_offers_pending` para recusar; retorna se houve troca).
4. **`__tests__/e2e/career-loop.e2e.test.ts`**: joga **≥3 temporadas completas** (cada ~58 semanas) via `advanceGameWeek` + `runSeasonTransition` entre elas. Exercita o caminho **NÃO-demitido**: aceitar uma oferta de emprego numa virada (troca de clube) e recusar noutra; acúmulo de reputação; conquistas; gate de pré-temporada; datas FIFA.

**Asserts (expandidos, da auditoria):** (1) nenhuma exceção no span; (2) cada virada: `processSeasonEndBoard` roda, `manager_reputation` acumula, `board_trust` reseta ao inicial se oferta aceita; (3) após aceitar: `save_games.player_club_id === novo_id`, fixtures válidas para o novo clube na próxima semana, `board_trust === BOARD_TRUST_INITIAL`; (4) ao recusar: `player_club_id` persiste, fixtures regeneram para o clube original; (5) promoção/rebaixamento físico antes do rollover, refletido nas divisões da nova temporada; (6) youth academy gera para o clube do jogador também; (7) semana/temporada corretas; (8) `manager_reputation` persiste através de múltiplas trocas.

**Reprodutibilidade (absorve o teste do W5):** rodar o loop 2× com o mesmo seed → estado-chave idêntico (standings, orçamentos, ofertas, posições). E o teste roda 5× sem flake.

**DoD:** career-loop e2e verde e determinístico (5×, 0 flake); cobre aceitar (≥1 virada com troca) e recusar (≥1 virada). Ramo demitido→resgate fica para o W2.

**Risco:** médio (a premissa de rollover headless exigiu F0). **Tam:** M-L.

---

## W1 — Sistema de contratação de comissão técnica

**Por quê:** Fecha o stub `staff.hire_coming_soon` (StaffScreen.tsx:117). ⚠️ **Não é "fechar um stub" — é construir o sistema do zero.** Infra existente (✅): tabela `staff`, `src/types/staff.ts`, `getStaffByClub`/`getStaffByRole`, `wage_budget` no clube, `getStaffEffects` consumido em game-loop + youth.

⚠️ **Reconciliar com o hiring de assistente existente:** já há `AssistantHiringScreen.tsx` + `assistant-engine.ts` (com `generateAssistant`/retirementAge). W1 deve **generalizar** esse padrão para todas as funções (scout/physio/youth_coach/fitness_coach) e unificar com o de assistente — não duplicar. Decidir no plano do W1 se substitui ou coexiste.

**Entrega:**
- Motor puro `src/engine/staff/staff-market.ts`: `generateStaffCandidates(role, clubReputation, rng)` (ability 1–20 escalada por reputação; wage ∝ ability×banda por função; nomes via `generateStaffName(countryCode, rng)` reusando pools — NÃO `generatePlayerName`); `canHireStaff({budget, wageBudget, wage, currentCountForRole, maxSlots})`.
- Constantes `STAFF_ROLE_LIMITS` em `balance.ts` (proposta: scout 2, assistant 2, physio/youth_coach/fitness_coach 1).
- Queries em `src/database/queries/staff.ts`: `hireStaff(db, saveId, clubId, candidate)` (insert + debita custo se houver), `fireStaff(db, saveId, staffId)`. Hiring fee/severance **opcionais em $0 na V1.0** (só compromisso salarial via wage); adicionar pós-release sem quebrar `contractEnd`.
- UI `StaffScreen.tsx`: substituir o botão desabilitado por fluxo de contratação (candidatos por função → ability/wage/contrato → Contratar, validando budget/wage_budget) + Dispensar na comissão atual.
- i18n: substituir `hire_coming_soon`; adicionar `staff.hire_title/hire_button/fire_button/hiring_cost/free_agent/...` (paridade pt/en).

**DoD:** TDD do motor + queries; browser (contratar reflete em staff count + budget/wage_budget; dispensar); tsc + suíte (W0 incluso).

**Risco:** médio (escopo subestimado no spec original). **Tam:** M.

---

## W2 — Demitido → ofertas-resgate (CRÍTICO)

**Por quê:** Era o corte deliberado de P6 (comentário literal em `EndOfSeasonScreen.tsx:255`: "rescue offers are explicitly out of scope"). Fecha o loop "ser demitido → procurar emprego".

⚠️ **Estado verificado:** demissão em `EndOfSeasonScreen.tsx:312–325` roteia direto para `markSaveEnded`→GameOver **antes** de qualquer promoção/rebaixamento ou `rolloverSeason`. Ofertas (`generateJobOffers`) só são geradas no bloco `!isManagerDismissed`. `generateJobOffers` filtra `reputation > currentClubReputation` (sempre "para cima"). `acceptJobOffer` troca `player_club_id` + reseta trust, mas **não** roda virada.

**Entrega:**
- Motor `generateRescueOffers(managerReputation, currentClubReputation, candidates, rng)` (ou parâmetro `direction: 'down'` em `generateJobOffers`): clubes de reputação **menor** (banda para baixo). Teste valida que as ofertas são de reputação < manager rep.
- Refactor de `EndOfSeasonScreen.handleContinue`: se demitido **e** há ofertas-resgate → armar `job_offers_pending` + rotear para `JobOffersScreen` (com enquadramento "desempregado/resgate"); se demitido **e** zero ofertas → `markSaveEnded`→GameOver; se não demitido → fluxo atual.
- **CORE GAP:** no ramo demitido→aceitar-resgate, **chamar `runSeasonTransition(novo_clube)`** após `acceptJobOffer`, antes de `navigate('Game')` — senão a temporada N+1 começa sem virada (elenco não envelhece, contratos não expiram, fixtures não regeneram). **NÃO** chamar `runSeasonTransition` dentro de `acceptJobOffer` (o fluxo normal já roda a virada — duplo-envelhecimento). Disparar no handler da `JobOffersScreen`/EndOfSeason.
- i18n: `career.fired_title/fired_status/rescue_offer_header` (paridade).

**Entrega de teste:** estender o career-loop e2e com o ramo demitido→resgate: trust baixo forçado → `generateRescueOffers` (rep menor) → (a) recusar → GameOver/`markSaveEnded`; (b) aceitar → `acceptJobOffer` + **`runSeasonTransition` dispara** + elenco do novo clube envelhecido (player.age X→X+1) + `manager_reputation` persiste + `board_trust` inicial.

**Risco:** **crítico** — reordena o fluxo de demissão e a virada para o novo clube. Mitigação: W0 + `runSeasonTransition` (F0) já no lugar; teste de integração dedicado. Se a virada do novo clube exigir cirurgia maior que o esperado, reavaliar: "recusar→GameOver" sozinho já entrega valor; "aceitar→continuar" pode virar patch pós-MVP. Decidir no plano do W2.

**Tam:** M.

---

## W3 — Inbox / News persistente (COMPLETO; XL, faseado)

**Por quê:** Coesão narrativa. ⚠️ **Estado verificado:** `news-generator.ts` é puro/efêmero; `NewsScreen.tsx` regenera no mount; **não existe** tabela `news_items` nem `queries/news.ts`; **0/6 produtores** persistem; `TabNavigator` NewsTab **sem** badge; há `TODO(news)` explícito em `game-loop.ts:544` (revelação de scouting). Escopo real é **XL**, não L.

**Sub-decomposição (no plano dedicado do W3):**
- **W3a — Infra:** tabela `news_items (id, save_id, season, week, category, title_key, title_vars JSON, body_key, body_vars JSON, icon, read DEFAULT 0)` (schema.ts + database-store.ts; índice `(save_id, season, week)`); `queries/news.ts` (`insertNewsItem`/`getNewsItems`/`markNewsRead`/`countUnread`) **com TDD primeiro**; badge `tabBarBadge` na NewsTab via `countUnread`; `NewsScreen` lê persistidas + **mescla** com as histórias de liga on-the-fly (dedup, ordenar por priority+timestamp) e marca como lido ao abrir (refactor profundo). + 1 produtor: **coletiva** (`PressConferenceScreen.applyTone` → persiste `headlineKey`).
- **W3b — Produtores de alto impacto:** **transferências** (`executeAcceptedTransfer` em `offer-processor.ts` — nome correto, ⚠️ não "executeTransfer"; precisa receber season/week), **diretoria** (`processSeasonEndBoard`: objetivo cumprido/falho, confiança, promoção/rebaixamento), **conquistas** (`achievements-checkpoint`: cada `AchievementDef` desbloqueado).
- **W3c — Produtores restantes:** **revelação de scouting** (fecha o `TODO(news)` em game-loop.ts:544 quando `reachedFull`), **convocações FIFA** (`internationalCallUps` em advanceGameWeek).
- i18n: chaves de manchete por produtor (paridade).

**DoD:** TDD das queries (antes dos produtores); cada produtor com teste validando `insertNewsItem` no momento certo; NewsScreen + badge validados no browser; tsc + suíte (W0 incluso — os 6 pontos de integração não podem quebrar o loop).

**Risco:** médio-alto (6 integrações + refactor do NewsScreen). **Tam:** **XL**.

---

## W4 — Onboarding / tooltips contextuais

**Por quê:** Acessibilidade. ✅ `OnboardingModal` (P8) existe e é gateado por `onboarding_seen`. ✅ `app_settings` (k/v) + `getSetting`/`setSetting` existem. ⚠️ **Não existe** componente `ContextualHint`.

**Entrega:**
- `src/components/ContextualHint.tsx` (novo): ícone "?" → tooltip dismissável; tokens de `@/theme`.
- Persistência via `app_settings`, chave `hint_seen_<screen>` (global, simples).
- Aplicar em **3 telas existentes**: `TacticsScreen` (formação/mentalidade), `TransferMarketScreen` (fluxo de oferta), `ReportsHubScreen` (✅ existe — métricas/relatórios).
- i18n `hints.tactics_intro/transfers_intro/reports_intro` (paridade). YAGNI — sem tour guiado; distinto do modal de onboarding do P8 (camada separada, dismiss por dica).

**DoD:** TDD da persistência da flag; browser (dica aparece 1×, dismissável, não reaparece após reload); tsc + suíte.

**Risco:** baixo-médio (componente novo + decisão de persistência resolvida). **Tam:** P.

---

## W5 — Hardening de reprodutibilidade

**Por quê:** Travar o determinismo para um release. ⚠️ A premissa "só os 2 sites de hoje" estava errada.

**Entrega:**
- **2 micro-fixes (landados no início do W0):** `AssistantHiringScreen.tsx:110` `Math.random()`→`rng.nextInt` semeado (espelhar `assistant-engine.ts:70`); `round-progression.ts:155` `Object.keys(groups)` → `.sort()` (ordem determinística de grupos de mata-mata independente da query).
- Sweep documentado: `grep -rnE "Math.random|Date.now|new Date\(\)|ORDER BY RANDOM" src/engine src/database src/store` classificando cada ocorrência crítica (engine/sim) vs benigna (UI/timestamp: `saves.ts`, `ui-store.ts`). UI pode usar Date.now/Math.random (não afeta determinismo de simulação).
- Teste de reprodutibilidade: **absorvido pelo W0** (loop 2× mesmo seed → idêntico).

**DoD:** 0 fontes de não-determinismo em caminhos de engine; sweep documentado; W0 5× idêntico verde.

**Risco:** baixo (2 fixes pequenos). **Tam:** P.

---

## W6 — Balanceamento (leve; depende de W0+W2 fechados)

**Por quê:** Afinar o que destoa, informado pelos dados do W0. ⚠️ Depende criticamente de W0 estável; sem baseline, "claramente destoa" é scope-creep.

**Entrega (time-boxed, máx. ~1 dia):**
- Instrumentar o e2e do W0 para emitir métricas com **baselines pré-aprovados**: gols/jogo **2.0–3.5**; transferências IA/temporada **4–12**; mediana de moral **50–65** (< 30 em < 5% dos jogadores); semanas até scouting 100% **8–14** (scout elite); acúmulo de rep do treinador **+0..+15** numa carreira de sucesso, **≥ -6** em fracasso.
- Ajustar **3–4 levers** (constantes em `balance.ts`) **apenas** se uma métrica desviar **≥ 20%** do baseline, cada um com teste de faixa (assert na janela).

**DoD:** se todas as métricas caem nos baselines → fecha **"validado, sem mudança"** (resultado aceitável e esperado); senão, levers ajustados com testes de faixa verdes.

**Risco:** médio (subjetivo, mitigado por baselines). **Tam:** P.

---

## W7 — Portão de release (QA)

**Por quê:** Sign-off final.

**Entrega:**
- **Corrigir i18n residual** (achados da auditoria): `OffersReceivedScreen.tsx:271` → usar `t('offers.counter_sent_msg')`; `PlayerDetailScreen.tsx:501` "Borrower pays (%)" → chave nova; revisar fallbacks "Player #id".
- Sweep de placeholder: 0 `coming_soon`/"em breve" (após W1); ✅ rotas já verificadas sem órfãs.
- Passe sem erro de console nas telas principais (Home, Club/Staff/Transfers/Board, Reports, Career, fluxos de Match).
- **Roteiro de QA manual** em `docs/test-plans/2026-XX-w7-manual-qa.md`: nova partida→Onboarding; Home→Notícias (badge + feed persistido, W3); Club→Staff (contratar, W1); avançar até fim de temporada; EndOfSeason→aceitar oferta (W2); pré-temporada; tooltips nas 3 telas (W4); 0 erros de console. **Um** passe manual até a 1ª virada.

**DoD:** checklist de release marcado; i18n residual corrigido; passe manual sem becos/crash; suíte 100% verde; tsc limpo.

**Risco:** baixo-médio. **Tam:** M.

---

## Decisões abertas (resolver nos planos por workstream)

- **Rollover (F0):** extrair `runSeasonTransition` (recomendado) vs internalizar em advanceGameWeek (pós-MVP). → extrair no W0.
- **W1 reconciliação:** generalizar o AssistantHiring existente para todas as funções vs sistema novo unificado.
- **W1 slots:** `STAFF_ROLE_LIMITS` (proposta: scout 2, assistant 2, demais 1).
- **W1 custo:** hiring fee/severance em $0 na V1.0.
- **W2 fallback:** se a virada do novo clube no ramo demitido for cirúrgica demais, "recusar→GameOver" sozinho fecha o MVP e "aceitar→continuar" vira patch.
- **W3 faseamento:** W3a (infra+coletiva) → W3b (transfer/diretoria/conquistas) → W3c (scouting/convocações).
- **Settings global:** fora do MVP (toggle de idioma no MainMenu basta).

## Definition of Done do MVP (global)

1. `runSeasonTransition` extraído; career-loop e2e (≥3 temporadas, aceitar+recusar) verde e **determinístico (5×)**.
2. Contratação de staff funcional (sem stub), reconciliada com o assistant-hiring.
3. Demitido→resgate fecha o loop (recusar→GameOver garantido; aceitar→continuar com virada correta, ou patch documentado).
4. Inbox/News persistente com os 6 produtores integrados+testados + badge.
5. Onboarding + 3 tooltips contextuais.
6. 0 fontes de não-determinismo no engine; reprodutibilidade travada por teste.
7. Balanceamento validado (sem mudança ou com levers em faixa).
8. QA: 0 placeholder/becos/crash; i18n residual corrigido; suíte 100% verde; tsc limpo; passe manual feito.
