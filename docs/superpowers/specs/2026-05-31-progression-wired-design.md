# Design: Progression Wired — treino, comissão técnica e moral dinâmica

**Data:** 2026-05-31
**Status:** Proposto
**Epic:** `progression-wired`
**Escopo:** football-manager v0.1

---

## 1. Goal

Fazer minutos, desempenho, foco de treino, comissão técnica e moral **realmente importarem**: alimentar `calculateWeeklyProgression`/`recalculatePotential` com dados reais por jogador, conectar `getStaffEffects` aos resultados, persistir o foco de treino, e mover moral por resultados/banco/transferências expondo uma superfície mínima de gestão (team talk / elogiar-criticar).

---

## 2. Problem / current state

Sete gaps confirmados no audit (`docs/audit/2026-05-31-gap-audit.md`), todos da dimensão `progression`:

- **[CRITICAL] Weekly training feeds the engine hardcoded inputs** — `game-loop.ts:487-490` chama `calculateWeeklyProgression` com `minutesPlayedRecent: 90`, `totalPossibleMinutes: 90`, `avgRatingRecent: 6.5`, `trainingFocus: 'balanced'` literais. Os fatores `getMinutesFactor`/`getPerformanceFactor` (`progression.ts:49-62`) e o ramo de foco (`progression.ts:72-81`) são código inalcançável; titulares e reservas evoluem idêntico. Os dados reais existem em `player_stats` (`avg_rating`, `minutes_played`, schema.ts:126-127) mas nunca são lidos de volta.
- **[HIGH] getStaffEffects is dead code** — `staff-effects.ts:17` tem zero callers em produção. `game-loop.ts:478` usa só `club.trainingFacilities`; `EndOfSeasonScreen.tsx:400` cravou `youthCoachBonus: 5`. `trainingBonus`, `injuryRecoveryBonus`, `scoutAccuracy`, `youthQualityBonus`, `tacticBonus` nunca chegam a nenhum outcome. `ProgressionInput` (progression.ts:5-14) não tem slot pra `trainingBonus`.
- **[HIGH] Training Focus screen is non-functional** — `TrainingScreen.tsx:37` usa `useState<TrainingFocus>('Balanced')` sem dispatch, sem DB write; não há coluna `training_focus` (só `training_facilities`, schema.ts:61). Strings inglesas cravadas, `borderRadius: 12` (linhas 96,132) e `fontSize: 36` (linha 111) hardcoded.
- **[HIGH] recalculatePotential fed currentOverall 70** — `EndOfSeasonScreen.tsx:382` passa `currentOverall: 70` pra todos. Em `potential.ts:29`, `expectedRating` fica sempre 6.3; em `potential.ts:61`, `minCap = max(basePotential-20, 70)` impede o teto de cair abaixo de 70. `getPlayersByClub` (linha 369) não traz attributes — `getPlayersWithAttributesByClub` (players.ts:119) existe e não é usado.
- **[MEDIUM] Veterans never decline and sub-0.5 weekly gains are rounded away** — a lógica de declínio de veteranos existe (`progression.ts:118-170`) mas como o foco/minutos são fixos ela quase nunca diverge; e `game-loop.ts:505-524` aplica `Math.round(attr + change)` por semana, então qualquer ganho/perda < 0.5 some toda semana (jamais acumula).
- **[MEDIUM] Youth gen hardcoded (bonus/country) and no ordinary age-based retirement** — `EndOfSeasonScreen.tsx:400-401` crava `youthCoachBonus: 5`, `countryCode: 'EN'`, `nationality: 'Local'` (linha 412). Não há aposentadoria ordinária por idade entre `RETIREMENT_MIN_AGE` (33) e `MAX_PLAYER_AGE` (41) — só a compulsória ≥41 (`retirement-engine.ts:23-32`) e a antecipada por moral baixa (que nunca dispara, ver abaixo).
- **[HIGH] Player morale never changes during play** — `updatePlayerMorale` (players.ts:197) tem zero callers. `game-loop.ts:705-712` só **lê** moral pra manter `consecutive_low_morale_weeks`; nenhum resultado/transferência/rotação muta moral. Como o seed nasce com moral alta, o streak de moral-baixa (`retirement-engine.ts:56`) e a aposentadoria antecipada **nunca disparam** em jogo normal. Não há team talk / elogiar / criticar.

---

## 3. Approach

Threading de **dados reais** pelos pontos existentes, sem inventar framework novo. Cada laço já presente em `game-loop.ts` (progressão semanal) e `EndOfSeasonScreen.tsx` (recálculo de potencial + geração de jovens) passa a consultar `player_stats`/`staff`/`countries` antes de chamar a engine pura. A engine pura ganha apenas: (a) um slot `trainingBonus` em `ProgressionInput`; (b) uma função pura de delta de moral; (c) uma função pura de aposentadoria ordinária por idade. Estado fracionário (ganhos < 0.5/semana) é resolvido **acumulando em uma coluna `attr_progress` decimal** em vez de arredondar a cada semana — alternativa ao "guardar attributes como REAL", escolhida por ser aditiva e não tocar o tipo das 18 colunas de atributo existentes.

Alternativa considerada e rejeitada: persistir `training_focus` **por jogador**. Rejeitada — a UI (`TrainingScreen`) escolhe um foco para o time todo; persistir por clube (`clubs.training_focus`) é o que casa com a tela e com a chamada única em `game-loop`.

---

## 4. Architecture & components

Engine permanece **pura** (sem React/Expo). Wiring fica em `game-loop.ts`/`EndOfSeasonScreen.tsx`/screens.

### Engine (pura — `src/engine/`)

| Módulo | Mudança | Responsabilidade / interface |
|---|---|---|
| `training/progression.ts` | **Editar** `ProgressionInput` + `getTrainingFactor` | Adicionar campo `staffTrainingBonus: number` (0..~0.3) ao input; `getTrainingFactor(facilityLevel, staffTrainingBonus)` retorna `1 + facilityLevel*0.06 + staffTrainingBonus`. Nenhuma outra lógica muda — minutos/rating/foco já estão corretos, só recebiam lixo. |
| `staff/staff-effects.ts` | **Sem mudança de fórmula** | Já mapeia abilities→bonuses corretamente (`getStaffEffects`, linha 17). Só ganha callers. |
| `morale/morale-engine.ts` | **Criar** | `computeMatchMoraleDelta(input): number` puro. Input: `{ result: 'win'|'draw'|'loss'; played: boolean; minutesPlayed: number; goalDiff: number; benchStreakWeeks: number }`. Retorna delta clampável (ex.: vitória jogando +3, derrota jogando -4, banco prolongado -2, goleada sofrida extra -1). Também `computeWeeklyMoraleDrift(currentMorale): number` (regressão suave rumo a 50 quando nada acontece). Também `applyMoraleDelta(current, delta): number` clampa em [1,100]. |
| `morale/team-talk.ts` | **Criar** | `computeTeamTalkDelta(tone, context): number` puro para a superfície de gestão. `tone: 'praise'|'criticize'|'motivate'`; context com forma recente. Retorna delta (e risco: criticar jogador em boa fase pode dar delta negativo). Mantém engine testável sem DB. |
| `retirement/retirement-engine.ts` | **Editar** | Adicionar `detectOrdinaryRetirements(players, rng)`: para jogadores na faixa `[RETIREMENT_MIN_AGE, MAX_PLAYER_AGE)`, probabilidade de aposentar crescente com idade (ex.: 33→5%, 37→25%, 40→60%), independente de moral. Não toca `detectCompulsoryRetirements` (≥41) nem a via de moral. |
| `balance.ts` | **Editar** | Constantes novas: `MORALE_WIN_BONUS`, `MORALE_LOSS_PENALTY`, `MORALE_DRAW_DELTA`, `MORALE_BENCH_PENALTY`, `MORALE_DRIFT_TARGET=50`, `ORDINARY_RETIREMENT_BASE_PROB`, `ORDINARY_RETIREMENT_AGE_SLOPE`, `ATTR_PROGRESS_APPLY_THRESHOLD` (não usado — ver §6, acumulação contínua). |

### Database (`src/database/`)

| Arquivo | Mudança | Responsabilidade |
|---|---|---|
| `schema.ts` | **Editar** | `clubs.training_focus TEXT NOT NULL DEFAULT 'balanced'`; `player_attributes_progress` (player_id PK + 18 colunas REAL DEFAULT 0) **OU** 18 colunas REAL em `player_attributes` — ver §6. |
| `store/database-store.ts` | **Editar** | Migrações idempotentes via `addColumnIfMissing` já existente (linha 25): adicionar `training_focus` em `clubs` e as colunas de progresso fracionário. |
| `queries/clubs.ts` | **Editar** | `getClubTrainingFocus(db, clubId)`, `setClubTrainingFocus(db, clubId, focus)`; incluir `training_focus` no `rowToClub`/`Club` type (types/club.ts). |
| `queries/player-stats.ts` | **Editar** | `getRecentForm(db, playerId, season)` → `{ minutesPlayed, totalPossibleMinutes, avgRating }` agregando `player_stats` da temporada corrente (já há `getPlayerStatsForPlayer`, linha 103). |
| `queries/players.ts` | **Reusar** | `updatePlayerMorale` (linha 197) ganha callers; `getPlayersWithAttributesByClub` (linha 119) substitui `getPlayersByClub` no recálculo de potencial. |
| `queries/staff.ts` | **Reusar** | `getStaffByClub` (linha 26) já existe; o wiring monta `StaffEffectsInput` a partir das `ability` por `role`. |

### Wiring (game-loop & screens)

| Arquivo | Mudança |
|---|---|
| `engine/game-loop.ts` | (a) Antes do laço de progressão (linha ~481): carregar `getStaffByClub` → `getStaffEffects`, `getClubTrainingFocus`, e por jogador `getRecentForm`; passar reais a `calculateWeeklyProgression`. (b) Trocar o `Math.round(attr+change)` (505-524) por acumulação fracionária (§6). (c) Após `persistMatchStats` (linha 472): laço de moral pós-jogo via `computeMatchMoraleDelta`+`updatePlayerMorale`, para o **clube do player e clubes de IA** (coordena com `ai-world-alive`). (d) Drift semanal de moral pra quem não jogou. |
| `screens/EndOfSeasonScreen.tsx` | (a) Recálculo de potencial: usar `getPlayersWithAttributesByClub` + `calculateOverall(player.attributes, player.position)` como `currentOverall`. (b) Geração de jovens: `youthCoachBonus` de `getStaffEffects().youthQualityBonus`, `countryCode`/`nationality` do `countries.code` via clube (ver §5). (c) Aposentadoria ordinária via `detectOrdinaryRetirements` + `retirePlayer` para todos os clubes. |
| `screens/tactics/TrainingScreen.tsx` | Ler/escrever foco via store+DB; i18n em todas as strings; `borderRadius`/`fontSize` via tokens de `@/theme`. |
| `screens/squad/PlayerDetailScreen.tsx` (ou `SquadListScreen`) | Adicionar ações **team talk / elogiar / criticar** chamando `computeTeamTalkDelta`+`updatePlayerMorale`. Superfície mínima — um botão por tom. |
| `store/game-store.ts` ou novo `store/training-store.ts` | Ação `setTrainingFocus(focus)` que persiste no DB e expõe `trainingFocus` à tela. (Zustand puro, padrão dos stores existentes.) |
| `i18n/pt.ts` + `i18n/en.ts` | Chaves novas: `training.focus_*`, `morale.team_talk_*`, etc. Manter paridade (há teste de paridade em `__tests__/i18n/parity.test.ts`). |
| `types/club.ts` | Campo `trainingFocus: TrainingFocus`. |

---

## 5. Data flow

**Progressão semanal (game-loop, jogo do player):**
1. `getStaffByClub(db, playerClubId)` → soma `ability` por `role` → `getStaffEffects({...})` → `trainingBonus`.
2. `getClubTrainingFocus(db, playerClubId)` → `'balanced'|'technical'|'tactical'|'physical'`.
3. Por jogador do elenco: `getRecentForm(db, p.id, season)` → minutos reais/possíveis + rating médio.
4. `calculateWeeklyProgression({ age, attributes, effectivePotential, minutesPlayedRecent, totalPossibleMinutes, avgRatingRecent, trainingFocus, trainingFacilityLevel, staffTrainingBonus })`.
5. Aplicar deltas **acumulando** em `*_progress`; ao cruzar ±1.0, mover 1 ponto inteiro pra `player_attributes` e subtrair do acumulador (§6).

**Moral pós-jogo (game-loop):** após `persistMatchStats`, para cada jogador do elenco do player (e, no laço de IA, dos clubes de IA): `computeMatchMoraleDelta({result, played, minutesPlayed, goalDiff, benchStreakWeeks})` → `applyMoraleDelta` → `updatePlayerMorale`. Quem não joga acumula `MORALE_BENCH_PENALTY`; drift semanal puxa moral parada de volta a 50. Isso liga o streak de `retirement-engine.ts:56` que destrava a aposentadoria antecipada anunciada (já existente em `game-loop.ts:714-739`).

**Team talk (screen → DB):** botão dispara `computeTeamTalkDelta(tone, {recentForm})` → `updatePlayerMorale`. Sem engine impura: a screen lê forma via `getRecentForm`, calcula delta puro, persiste.

**Fim de temporada (EndOfSeasonScreen):**
- Potencial: `getPlayersWithAttributesByClub` → `calculateOverall(attrs, position)` → `recalculatePotential({..., currentOverall})`.
- Jovens: `getClubById(playerClubId)` → join `leagues.country_id → countries.code` (ou `getClubCountryCode(db, clubId)` novo helper em `queries/clubs.ts`) → `countryCode`; `youthCoachBonus = getStaffEffects().youthQualityBonus`; `nationality` = nome do país via `countries`.
- Aposentadoria ordinária: para **todos os clubes** carregar `id, name, age` → `detectOrdinaryRetirements(players, rng)` → `retirePlayer`. Coordena com `ai-world-alive` (rejuvenescimento dos elencos de IA).

---

## 6. Schema changes

Migrações **idempotentes** via `addColumnIfMissing` (database-store.ts:25), no mesmo bloco das migrações existentes (linhas 69-157). **Não** introduz framework novo — assume o mecanismo de `db-hardening`/`save-isolation` para o resto. Se `save-isolation` adicionar `save_id` às world tables, `training_focus` e as colunas de progresso herdam o escopo de save automaticamente (são colunas em `clubs`/`player_attributes`, já per-save após aquela migração).

1. **`clubs.training_focus`** — `TEXT NOT NULL DEFAULT 'balanced'`. Persiste o foco escolhido na `TrainingScreen`.
   ```ts
   await addColumnIfMissing(db, 'clubs', 'training_focus', "TEXT NOT NULL DEFAULT 'balanced'");
   ```

2. **Progresso fracionário de atributos** — resolve o gap "sub-0.5 gains rounded away". Decisão: **adicionar 18 colunas REAL `*_progress` em `player_attributes`** (mesma PK `player_id`, sem tabela nova), default 0. A cada semana soma-se o delta em `*_progress`; quando `|*_progress| >= 1`, transfere `trunc()` pontos inteiros pra coluna INTEGER correspondente e mantém o resto fracionário. Isso preserva ganhos lentos de veteranos/reservas em vez de zerá-los todo `Math.round`.
   ```ts
   for (const c of ['finishing','passing', /* ...18 attrs... */]) {
     await addColumnIfMissing(db, 'player_attributes', `${c}_progress`, 'REAL NOT NULL DEFAULT 0');
   }
   ```
   Alternativa rejeitada: trocar as 18 colunas INTEGER por REAL — quebraria `CHECK`/leitura e exigiria tocar todo `rowToAttributes`.

Nenhuma tabela nova. `recent-minutes tracking` **não** precisa de coluna: `player_stats.minutes_played`/`avg_rating` (schema.ts:126-127) já é a fonte; `getRecentForm` agrega de lá.

---

## 7. Error handling & edge cases

- **Jogador sem `player_stats` na temporada** (recém-chegado/jovem): `getRecentForm` retorna `minutesPlayedRecent: 0`, `totalPossibleMinutes: 0`, `avgRatingRecent: 0`. `progression.ts:95-97` já trata `totalPossibleMinutes === 0 → minutesPct = 0`; `getMinutesFactor(0, age)` → jovem ≤24 ganha 0.1, ≥25 ganha 0.0 (early-exit). Comportamento correto, mantido.
- **`totalPossibleMinutes`**: calculado de aparições do clube na temporada (nº de jogos × 90), não 38×90 fixo — semanas iniciais não devem punir 100% de quem jogou tudo.
- **Sem staff de um role**: `ability = 0` → bonus 0; `getStaffEffects` não quebra (divisões por 20 sobre 0).
- **Foco inválido no DB** (save antigo sem coluna): default `'balanced'` cobre via DEFAULT da migração; leitura faz fallback defensivo a `'balanced'`.
- **Moral clamp**: `applyMoraleDelta` clampa [1,100] respeitando o `CHECK (morale BETWEEN 1 AND 100)` (schema.ts:81). Nunca escreve fora do range.
- **Progresso fracionário não vaza limites**: ao aplicar pontos inteiros, ainda clampa o resultado em [1,99] como hoje (game-loop.ts:505-524); o acumulador residual nunca leva o atributo além do clamp.
- **Aposentadoria ordinária vs. anunciada**: jogador com `will_retire_at_season_end = 1` (via moral) não deve ser sorteado de novo — filtrar por essa flag em `detectOrdinaryRetirements`.
- **Determinismo**: aposentadoria ordinária usa o `SeededRng` da temporada (mesmo padrão de `EndOfSeasonScreen.tsx:402`), mantendo replays determinísticos exigidos pelos testes.

---

## 8. Testing strategy

TDD obrigatório (engine/database/store). SQLite real com `better-sqlite3`, **nunca mock** (CLAUDE.md). Ver `__tests__/` para padrões.

**Engine pura (unit):**
- `progression.test.ts` (estender): titular 80%+ minutos com rating 7.5 ganha mais que reserva 10% minutos; foco `technical` faz atributos técnicos subirem mais que físicos; `staffTrainingBonus` aumenta o ganho monotonicamente; veterano 33+ com poucos minutos **declina** (delta físico < 0).
- `morale-engine.test.ts` (novo): vitória jogando > 0; derrota jogando < 0; banco prolongado < 0; drift puxa 30→ mais perto de 50 e 70→ mais perto de 50; clamp em [1,100].
- `team-talk.test.ts` (novo): elogiar em má fase ajuda; criticar em boa fase pode ferir.
- `retirement-engine.test.ts` (estender): `detectOrdinaryRetirements` não pega <33; prob cresce com idade; respeita `will_retire_at_season_end`; determinístico com mesma seed.
- `staff-effects.test.ts` (existe): inalterado.

**Integração (SQLite real):**
- `progression-wiring.test.ts` (novo): seed clube+jogador+`player_stats`; rodar `advanceGameWeek`; assertar que titular de alta nota e reserva divergem; que `training_focus='physical'` desvia ganhos; que `*_progress` acumula entre semanas e eventualmente incrementa 1 ponto inteiro (cobre o gap de arredondamento).
- `morale-wiring.test.ts` (novo): sequência de derrotas via `advanceGameWeek` derruba moral abaixo de `RETIREMENT_MORALE_THRESHOLD`, o streak sobe, e na janela de anúncio um veterano elegível recebe `will_retire_at_season_end = 1` — fechando a cadeia hoje inalcançável.
- `potential-recalc.test.ts` (novo/estender): no fim de temporada, dois jogadores de overall real distinto (star vs reserva) recebem `expectedRating` distintos e o `minCap` acompanha o overall real (não 70).
- `youth-staff.test.ts` (novo): `youthCoachBonus` alto eleva `base_potential` médio dos jovens vs. coach fraco; `nationality`/`countryCode` derivam do país do clube (ex.: clube BR → nomes do pool BR).
- `training-focus-persistence.test.ts` (novo): `setClubTrainingFocus` → reler com `getClubTrainingFocus` retorna o valor; default `'balanced'` em clube novo.

**Edges cobertos:** jogador sem stats; clube sem staff de um role; save antigo migrado (coluna ausente → default); moral no limite do clamp.

---

## 9. Dependencies & sequencing

- **`save-isolation` (antes):** dona da migração de `save_id` nas world tables e do mecanismo idempotente em `database-store.ts`. Este epic **reusa** `addColumnIfMissing`; não cria framework. Se `save_id` entrar em `clubs`/`player_attributes`, as colunas novas deste epic ficam per-save de graça. Não bloqueia o desenvolvimento da engine pura, mas as migrações deste epic devem aterrissar **depois** ou **junto** das de `save-isolation` para evitar conflito de ordem no bloco de migração.
- **`db-hardening` (junto/antes):** dona de índices e wrapping transacional. O laço de moral pós-jogo e o de progressão se beneficiam de um índice em `player_stats(player_id, season)` que `db-hardening` deve prover; sem ele, `getRecentForm` ainda funciona (scan), só mais lento.
- **`ai-world-alive` (coordena, depois/junto):** este epic torna progressão/moral/aposentadoria aplicáveis a clubes de IA. `ai-world-alive` é dona de rodar a simulação real para jogos IA×IA (hoje `simulateAiMatch` é coin-flip de reputação, game-loop.ts:187-208). **Sem ela**, clubes de IA não geram `player_stats` reais, então a progressão/moral de IA só roda com inputs neutros. Decisão: aplicar moral pós-jogo a IA **somente quando** houver resultado real disponível; a aposentadoria ordinária por idade roda independente (não precisa de stats) e já vale para IA neste epic.
- **`board-stakes` (coordena):** dona das interações com a diretoria. Este epic expõe `updatePlayerMorale` e a função de team-talk; `board-stakes` pode acoplar deltas de moral vindos de decisões do board reusando `applyMoraleDelta`. Sem dependência dura — interfaces compartilhadas, não código.
- **`match-consequences` (coordena):** dona de suspensões; lê/escreve `players` no mesmo laço pós-jogo. Coordenar a ordem das escritas em `players` (moral vs. suspensão) para não competirem pela mesma row no mesmo `advanceGameWeek` — ambas podem ser writes independentes; sem conflito lógico.

---

## 10. Out of scope

- **Simulação real de jogos IA×IA** — é de `ai-world-alive`. Aqui só consumimos o resultado quando existir.
- **Game-over ao ser demitido** (gap board-stakes), suspensões por cartão (gap match-consequences), promoção/rebaixamento físico (competitions-real) — outros epics.
- **Tela rica de moral/relacionamento** (histórico, gráficos, conversas multi-jogador) — entregamos a superfície **mínima** (team talk / elogiar / criticar). Aprofundamento é pós-v0.1.
- **Balanceamento fino** das curvas de progressão/moral/aposentadoria — entregamos constantes plausíveis em `balance.ts`; tuning numérico é iterativo e fora do escopo de wiring.
- **Persistência de foco de treino por jogador** — rejeitada em §3; só por clube.
- **`week-advance.ts` órfão** — não revivido aqui; a finança multi-clube é de `ai-world-alive`/`transfer-finance`. Removê-lo é decisão de outro epic.

---

## Self-review

- **Placeholders:** nenhum "TBD"/"simplified" remanescente; todos os `file:line` foram verificados por leitura direta (progression.ts, potential.ts, staff-effects.ts, youth-academy.ts, retirement-engine.ts, game-loop.ts:420-739, EndOfSeasonScreen.tsx:360-468, TrainingScreen.tsx, players.ts:112-199, player-stats.ts, schema.ts:50-129, database-store.ts:25-157, balance.ts, team-strength.ts:74, clubs.ts, countries schema).
- **Consistência:** `getStaffEffects` é reusado sem mudar fórmula (correto — o audit confirma a fórmula certa, só o caller falta). `trainingBonus` precisa do novo slot em `ProgressionInput` — explicitado em §4. Schema usa o `addColumnIfMissing` já existente — sem framework novo (alinhado ao briefing).
- **Ambiguidade resolvida:** "recent-minutes tracking" no briefing **não** vira coluna nova — esclarecido em §6 que `player_stats` já é a fonte. Decisão de acumulação fracionária explicitada com migração concreta (18 colunas `*_progress`).
- **Dependência honesta:** §9 admite que moral de IA depende de `ai-world-alive` para stats reais, e que aposentadoria ordinária de IA é entregável aqui sem ela.
