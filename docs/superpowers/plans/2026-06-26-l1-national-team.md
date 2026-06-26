# Plan: L1 — Seleção nacional (backend, Fases 1–5)

**Epic:** l1-national · **Spec:** [l1](../specs/2026-06-20-l1-national-team-design.md) · **Data:** 2026-06-26
**Escopo aprovado:** Fases 1–5 (backend completo). UI (Fase 6) fica para depois — QA visual indisponível.

**Invariantes:** determinismo (SeededRng, zero Math.random/Date.now/ORDER BY RANDOM), save-isolation
(toda tabela com save_id, SAVE_ID_STRIDE intocado, queries `(db, saveId, ...)`), engine puro, i18n pt/en paridade,
schema espelhado em schema.ts **E** store/database-store.ts.

## Decisões (resolvidas na pesquisa de fundação)
- **Opção A** (spec §4): `national_fixtures` espelho + **reuso sem reescrita** de `standings.calculateStandings(fixtures, ids)`,
  `knockout.*`, `fixture-generator.generateRoundRobin/generateKnockoutRound` (todos puros, agnósticos a ids).
  Só código novo de DB = persistência (twin de `ensureSeasonFixtures`, batch INSERT) + loader → shape `Fixture`.
- **Dados reais:** 5 nações (`English/Spanish/Italian/German/French` → England/Spain/Italy/Germany/France), todas
  `continent='Europe'`. Vira **1 campeonato europeu**. Toda lógica é **data-driven por N nações** (escala se o seed crescer).
- **Mapa demônimo→país:** constante no engine (`DEMONYM_TO_COUNTRY`), pois `players.nationality` (demônimo) não casa com
  `countries.name`/`code`. Bloqueia tudo → primeira task.
- **Seleção do usuário:** determinística = nação com mais jogadores do clube do usuário (desempate por country_id menor);
  setter `setUserManagedNation` exposto p/ gatilho futuro (inbox/reputação). `national_teams.is_user_managed`.
- **Resultados de rivais:** modelo agregado via SeededRng a partir da força do pool (top-N). Match engine reservado à
  seleção do usuário (a partir da Fase 3); na Fase 1–2 a do usuário também é abstrata.
- **C8 (Fase 5):** estender a contagem de congestão para incluir `national_fixtures` do jogador na janela; substituir a
  fadiga-flat de viagem (`applyTravelFatigue`) por carga de minutos real só para quem joga (evita dupla punição §8).
- **SeededRng namespaced:** sorteio de grupos `season*524287 + competitionId`; resultados abstratos
  `saveId*7919 + season*1000 + week*31 + 0x4E54` (inclui saveId).
- **Calendário:** janelas FIFA `[7,15,23,31]` (4/temporada); `SEASON_END_WEEK=58` intocado. Eliminatória = duplo
  round-robin de 5 nações (8 rodadas → 2 temporadas). Torneio a cada 2 temporadas, concentrado nas janelas da temporada
  de torneio. Teste assere zero colisão com semana 58 e 1 jogo/janela.

---

## Unidade L1-A — Modelo + competição internacional real, resultados abstratos (Fases 1+2)
Consolida o degrau abstrato (Opção C) já na estrutura final (Opção A) p/ não jogar código fora.
- `DEMONYM_TO_COUNTRY` + helpers de nacionalidade→country/continent (engine puro).
- Tabela **`national_teams`** (id, save_id, country_id, name, continent, strength, is_user_managed) — schema.ts + store.
- Pool puro: `deriveNationalPool(players, country, topN)` (elegível ≥ INTERNATIONAL_CALLUP_MIN_OVERALL), `computeNationalStrength(pool)`.
- Seed das seleções no novo jogo (1/nação jogável); `is_user_managed` determinístico + `setUserManagedNation`.
- Tabela **`national_fixtures`** (espelho: home_national_id/away_national_id, competition_id, season, week, round, gols, played) + índices.
- Persistência: `ensureNationalFixtures(db, saveId, season)` (twin batch-INSERT) + `loadNationalFixtures → Fixture[]`.
- Eliminatória: `generateRoundRobin(nationalIds, ...)` nas janelas FIFA; sorteio determinístico; resultados abstratos
  (todas as seleções) via SeededRng+força; standings via `calculateStandings`.
- Plug na fase `game-loop/international-duty.ts` (sem quebrar fadiga/news atuais).
- **Teste (better-sqlite3):** avançar 2 temporadas, seed fixa → tabela das eliminatórias idêntica em 2 execuções;
  seleção do usuário com N jogos; save-isolation (2 saves não colidem); sem colisão de semana.

## Unidade L1-B — Convocação gerida + XI real (Fase 3)
- Generalizar `selectCallUps` → convocação do POOL da seleção (auto/IA), lista de `NATIONAL_SQUAD_SIZE=23`.
- Tabela **`national_callups`** (save_id, national_team_id, season, window, player_id, is_starter, source 'auto'|'manual').
- Override manual do usuário (engine puro decide, query persiste). Jogos da seleção do usuário passam a usar **escalação real**
  no match engine (substitui o resultado-only só para a seleção dirigida; rivais seguem abstratos).
- **Teste:** override manual respeitado na simulação; golden path de convocação automática estável por seed.

## Unidade L1-C — Torneio final (Fase 4)
- Grupos → mata-mata reusando `seedClChampionsKnockout`/`buildNextKnockoutRound`/`resolveKnockoutTie` sobre national ids.
- Premiação + registro em histórico de carreira (`manager_career`/legacy) + news (`category` internacional, i18n pt/en).
- **Teste:** torneio completo determinístico (mesma seed = mesmo campeão); mata-mata progride corretamente.

## Unidade L1-D — Prestígio + caps + sinergia C8 (Fase 5)
- Deltas de `manager_reputation` por resultado internacional: `MANAGER_REP_NATIONAL_*` em balance + delta análogo a
  `computeManagerReputationDelta`; gravar via `setManagerReputation`.
- Tabela **`national_caps`** (save_id, player_id, caps, goals) — acumulado de carreira na seleção; incrementa por jogo.
- C8: estender contagem de congestão p/ incluir `national_fixtures`; remover dupla punição (viagem vs minutos).
- **Teste:** vencer torneio aumenta `manager_reputation` deterministicamente; minutos na seleção elevam a carga
  consumida por C8 (sem stacking com fadiga de viagem).

---

## Não-objetivos (spec §9)
Mercado/naturalização internacional, categorias de base, editor de seleções, tática profunda de rivais, múltiplas
seleções simultâneas, reescrita do match engine, amistosos internacionais geridos, **UI/telas novas** (Fase 6, depois).

## Execução
4 unidades sequenciais (B depende das tabelas de A; C da competição de B; D dos resultados de C). Workflows
subagent-driven (TDD): implementer(high)→verify(tsc+jest node+ui)→debug→reviewer→fix. Commit + review entre unidades.

## Gate por unidade
`npx tsc --noEmit` 0 · `npm test` (node+ui) verde · teste de determinismo da unidade verde.
