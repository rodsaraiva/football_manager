# Design: Match Consequences — lesões, cartões, suspensões e vantagem de casa

**Data:** 2026-05-31
**Status:** Proposto
**Escopo:** football-manager v0.1 · epic `match-consequences`
**Audit:** `docs/audit/2026-05-31-gap-audit.md` (seção sim-match)

**Goal:** Fazer a partida ter consequências persistentes — vantagem de casa realmente altera o resultado, lesões e suspensões tiram o jogador das próximas rodadas, pressing influencia chances — e recalibrar a média de gols para ~2.5/jogo.

---

## 1. Problema / estado atual

Seis achados da auditoria (todos `confirmed`), todos no motor de partida. Verificados contra o código:

1. **"Home advantage and attendance scaling have zero effect on match outcomes"** — `team-strength.ts:111-113` aplica `homeAdv` **só em `overall`** (`if (isHome) overall *= homeAdv;`). Mas `match-engine.ts` nunca lê `.overall`: o cálculo de chance usa `team.strength.attack`, `opp.strength.defense`, `midfield`, `tempo` (`attackP` em `match-engine.ts:440-447`). Logo casa não dá vantagem nenhuma, e toda a tubulação de `homeAdvantageMultiplier()` (`match-engine.ts:189-192`) + constantes `HOME_ADVANTAGE_BASE/MAX`/`STADIUM_CAPACITY` (`match-engine.ts:77-79`) é inerte.

2. **"Injuries occurring during a match never sideline the player afterwards"** — `runBlock` emite evento `'injury'` e força substituição (`match-engine.ts:636-655`) sem severidade/duração. Em `game-loop.ts:459-467` os eventos são persistidos como linhas, mas nada lê o evento de lesão para setar `injury_weeks_left`. A única escrita pós-jogo nessa coluna é o decremento semanal `UPDATE players SET injury_weeks_left = MAX(0, injury_weeks_left - 1)` (`game-loop.ts:547`). Jogador "lesionado" joga a rodada seguinte com disponibilidade total.

3. **"Red cards and accumulated yellows produce no suspensions"** — o engine modela amarelo/segundo-amarelo/vermelho direto removendo o jogador da partida (`match-engine.ts:555-633`), mas grep por `suspen`/`suspended` no projeto retorna **zero**, e não há coluna nem query de suspensão (schema só tem `injury_weeks_left`, `schema.ts:83`). `pickStartingEleven`/`buildSquadFromSavedIds` filtram só por `fitness > 30 && injuryWeeksLeft === 0` (`game-loop.ts:154`, `360`, `401`, `409`, `415`). Vermelho não gera ban; amarelos acumulados são irrelevantes.

4. **"Pressing tactic has no effect on chances"** — `team.strength.pressing` (escala 0-1) influencia fadiga (`match-engine.ts:248`), posse (`:355`) e taxa de amarelo (`:556`), mas **nunca** entra em `attackP` (`:440-447`) nem na recuperação de bola/criação de chance. Pressing alto não converte em mais/menos chances.

5. **"Average goals per match (~3.17) overshoot the documented 2.5 target"** — o cabeçalho do engine declara "tuned for ~2.5 goals/match" (`match-engine.ts:48`), mas a soma de caminhos de gol (open play + corner + pênalti + follow-ups de cartão) entrega ~3.17 empiricamente (audit). Constantes a recalibrar: `GOAL_BASE_PROB=0.016` usado como `*6` em `attackP` (`:53`, `:441`), `CORNER_GOAL_PROB=0.05` (`:59`), `PENALTY_PROB=0.003` (`:58`).

6. **"Player-rating secondary-goal assist branch is dead code"** — `player-rating.ts:52-57` soma +0.5 quando `e.secondaryPlayerId === player.id && e.type === 'goal'`. Mas todos os eventos `'goal'` em `match-engine.ts` são empurrados com `secondaryPlayerId: null` (`:483`, `:525`, `:545`); assistências são eventos `'assist'` separados (`:486`, `:527`). O ramo nunca dispara — assistência já é contada via evento `'assist'` (`player-rating.ts:38`), então isto é dupla-contagem morta.

**Não-gap (importante):** partidas IA×IA usam `simulateAiMatch` (`game-loop.ts:187-208`), um coin-flip por reputação que **não** chama `simulateMatch` nem persiste eventos. Lesões/cartões/suspensões só existirão para o clube humano. Plugar o engine real na IA é do epic `world-sim` (achado "All non-player matches use a reputation-only coin flip"), **fora deste escopo**.

---

## 2. Abordagem

Concentrar a mudança em três pontos: (a) `team-strength.ts` passa a aplicar `homeAdv` e pressing aos setores (`attack`/`midfield`/`defense`) em vez de só `overall`, resolvendo gaps #1 e #4 sem tocar a estrutura de `attackP`; (b) `game-loop.ts` ganha um passo pós-partida que lê os eventos `'injury'`/`'red'`/`'yellow'` e materializa duração de lesão e suspensão nas colunas `injury_weeks_left` (existente) e `suspension_weeks_left` (nova); (c) recalibrar 3 constantes de probabilidade no engine e remover o ramo morto de rating. A lógica de **amostragem** de duração de lesão e de **decisão** de ban (vermelho = 1, a cada N amarelos = 1) vive em um módulo puro novo (`match-consequences.ts`) testável sem DB; `game-loop.ts` só faz I/O. Alternativa descartada: pôr a duração de lesão dentro do `MatchEvent` no próprio `simulateMatch` — rejeitada porque sujaria a assinatura do evento (persistido no schema `match_events`) e misturaria política de jogo com a simulação determinística.

---

## 3. Arquitetura & componentes

Engine permanece puro (sem React/Expo). O I/O fica em `game-loop.ts`.

| Módulo | Mudança | Responsabilidade / interface |
|---|---|---|
| `src/engine/simulation/team-strength.ts` | **editar** `calculateTeamStrength` | Aplicar `homeAdv` a `attack`/`midfield`/`defense` (não só `overall`) e dobrar pressing como modificador setorial. Assinatura **inalterada**. |
| `src/engine/simulation/match-engine.ts` | **editar** constantes + `attackP` | Recalibrar `GOAL_BASE_PROB`/`CORNER_GOAL_PROB`/`PENALTY_PROB` p/ ~2.5; injetar fator de pressing em `attackP`. Sem mudança de assinatura pública. |
| `src/engine/simulation/player-rating.ts` | **editar** | Remover o loop morto de secondary-goal (`:52-57`). |
| `src/engine/simulation/match-consequences.ts` | **criar** | Módulo puro. Decide consequências a partir de eventos + RNG. |
| `src/database/queries/players.ts` | **criar** 2 helpers | `setPlayerInjury`, `setPlayerSuspension` (UPDATE tipados). |
| `src/engine/game-loop.ts` | **editar** `advanceGameWeek` | Após persistir eventos do jogo humano, aplicar lesões/suspensões; estender decremento semanal e filtros de seleção. |
| `src/database/schema.ts` | **editar** tabela `players` | Adicionar coluna `suspension_weeks_left` (ver §6). |

### 3.1 `match-consequences.ts` (novo, puro)

```ts
import { MatchEvent } from '@/types';
import { SeededRng } from '@/engine/rng';

export interface InjuryOutcome { playerId: number; weeks: number; }
export interface SuspensionOutcome { playerId: number; weeks: number; reason: 'red' | 'yellow_accumulation'; }

/** Amostra duração (semanas) das lesões emitidas nesta partida. */
export function resolveMatchInjuries(events: MatchEvent[], rng: SeededRng): InjuryOutcome[];

/**
 * Suspensões geradas SÓ por esta partida:
 *  - cada 'red' (direto ou 2º amarelo) ⇒ 1 semana.
 * priorYellowsBySeason: amarelos acumulados na temporada ANTES desta partida,
 * por jogador. Cruzar múltiplo de YELLOW_SUSPENSION_THRESHOLD ⇒ +1 semana.
 */
export function resolveMatchSuspensions(
  events: MatchEvent[],
  priorYellowsBySeason: Map<number, number>,
  rng: SeededRng,
): SuspensionOutcome[];
```

Constantes (em `src/engine/balance.ts`, junto às demais):
- `INJURY_DURATION_WEIGHTS` — distribuição ponderada 1-8 semanas (enviesada para curtas; ex.: 1-2 semanas ~60%, 3-5 ~30%, 6-8 ~10%).
- `RED_SUSPENSION_WEEKS = 1`
- `YELLOW_SUSPENSION_THRESHOLD = 5` (a cada 5 amarelos na temporada ⇒ 1 semana)
- `YELLOW_SUSPENSION_WEEKS = 1`

**Regra de cruzamento de limiar:** dado `prior` amarelos antes da partida e `gained` nesta partida, dispara ban se `floor((prior+gained)/THRESHOLD) > floor(prior/THRESHOLD)`. Garante 1 ban por múltiplo cruzado, sem recontagem.

### 3.2 `team-strength.ts` (gaps #1 e #4)

Hoje (`:104-113`): mentality entra em attack/defense; `homeAdv` só em `overall`. Mudança:

```ts
const homeFactor = isHome ? homeAdv : 1;
const pressFactor = PRESSING_MOD[tactic.pressing]; // 0.3 | 0.5 | 0.8

let defense = average(defenseRatings) * (1 + mentalityMod.defense) * homeFactor;
let midfield = average(midfieldRatings) * homeFactor;
let attack = average(attackRatings) * (1 + mentalityMod.attack) * homeFactor
           * (1 + (pressFactor - 0.5) * PRESSING_ATTACK_GAIN); // §4

const sectors = [defense, midfield, attack].filter((v) => v > 0);
let overall = average(sectors); // já reflete homeFactor pelos setores
// NÃO multiplicar overall por homeAdv de novo (era a linha 111-113)
```

`PRESSING_ATTACK_GAIN` (nova constante em `match-engine.ts` ou `balance.ts`, ~0.12): pressing alto (0.8) dá +~3.6% em ataque, baixo (0.3) dá −~2.4%, centrado em medium. O penalty por jogador faltante (`:116-119`) permanece. Assinatura de `calculateTeamStrength` **não muda** — só o corpo.

### 3.3 `match-engine.ts` (gap #5 calibração)

Reduzir os caminhos de gol até a média cair de ~3.17 para ~2.5 (alvo ±0.15). Ajuste de partida (a confirmar empiricamente nos testes): `GOAL_BASE_PROB 0.016 → ~0.013`, `CORNER_GOAL_PROB 0.05 → ~0.04`, `PENALTY_PROB 0.003 → ~0.0025`. **A calibração é guiada pelo teste de média** (§8), não chutada: o desenvolvedor itera as constantes até o teste de 2000 partidas passar. Atualizar o comentário `:48` se as constantes mudarem.

### 3.4 `game-loop.ts` (orquestração I/O)

Dentro do bloco `if (playerFixture)`, **depois** de persistir eventos (`:467`) e stats (`:472`):

1. `setInjury` — `const injuries = resolveMatchInjuries(matchResult.events, rng);` → para cada `InjuryOutcome` cujo jogador é do `playerClubId`, `await setPlayerInjury(db, playerId, weeks)`.
2. `setSuspension` — carregar `priorYellowsBySeason` via SUM de `player_stats.yellow_cards` na temporada (antes do upsert desta partida) ou somar incrementalmente; chamar `resolveMatchSuspensions(...)` → `await setPlayerSuspension(db, playerId, weeks)` para jogadores do `playerClubId`.

**Ordenação do decremento (corrige risco do achado #2):** mover o `injury_weeks_left` decrement (`:547`) e adicionar o `suspension_weeks_left` decrement para **antes** de aplicar as novas lesões/suspensões, para que um ban/lesão recém-criado conte a partir da próxima semana e não seja imediatamente decrementado a zero nesta. Sequência final no bloco:

```
decrementInjuriesAndSuspensions(playerClubId)   // semana corrente "passa"
→ aplica novas lesões (resolveMatchInjuries)
→ aplica novas suspensões (resolveMatchSuspensions)
```

3. Filtros de seleção — adicionar `&& p.suspensionWeeksLeft === 0` a:
   - `pickStartingEleven` candidato (`:154`)
   - `buildSquadFromSavedIds` titular e fallback (`:360`, `:366`)
   - `buildBenchFromSavedIds` (`:401`) e benches sem-lineup (`:409`, `:415`)
   Requer adicionar `suspensionWeeksLeft` a `PlayerForPick` (`:130-138`) e ao mapeamento em `loadSquadWithAttributes` (`:218-226`), lendo de `getPlayerById`. (Suspenso continua no elenco e recebe salário — correto; só não é escalável.)

> Nota: IA×IA não gera eventos persistidos, então lesões/suspensões da IA não ocorrem nesta epic (ver §1 não-gap e §9). `setPlayerInjury`/`setPlayerSuspension` só são chamados para `playerClubId`.

### 3.5 `players.ts` (queries tipadas)

```ts
export async function setPlayerInjury(db: DbHandle, playerId: number, weeks: number): Promise<void>;
//  → UPDATE players SET injury_weeks_left = ? WHERE id = ?  (sobrescreve; lesão nova ganha)
export async function setPlayerSuspension(db: DbHandle, playerId: number, weeks: number): Promise<void>;
//  → UPDATE players SET suspension_weeks_left = suspension_weeks_left + ? WHERE id = ?  (acumula)
```

Estender `Player`/`getPlayerById` (`players.ts:26`, `:76`) para expor `suspensionWeeksLeft` (mapear de `suspension_weeks_left`).

---

## 4. Fluxo de dados

```
simulateMatch (engine puro)
  └─ events[] (inclui 'injury','yellow','red' já existentes)
        │
advanceGameWeek (game-loop.ts, só playerFixture)
  ├─ persiste fixture result + events + player_stats   (já existe)
  ├─ DECREMENTA injury_weeks_left & suspension_weeks_left  (semana corrente)   ◄ reordenado
  ├─ resolveMatchInjuries(events, rng)   → setPlayerInjury(playerId, weeks)
  ├─ priorYellows = SUM(player_stats.yellow_cards) season  (antes do upsert)
  ├─ resolveMatchSuspensions(events, priorYellows, rng) → setPlayerSuspension(...)
  └─ progression / fitness (já existe)

Próxima semana → pickStartingEleven/buildSquad* filtram
   injuryWeeksLeft===0 && suspensionWeeksLeft===0  → jogador sentado
```

Telas/store: nenhuma mudança obrigatória nesta epic. `suspension_weeks_left` fica disponível para a UI de elenco mostrar "Suspenso (Nx)" análogo a "Lesionado", mas isso é incremento de outra epic de telas. Reset de amarelos por temporada: o decremento de suspensão e a contagem de amarelos vivem em `player_stats` por `(player_id, season, competition_id)` — ao virar a temporada, `season` muda e `priorYellowsBySeason` recomeça do zero naturalmente; `suspension_weeks_left` remanescente é zerado no rollover de fim de temporada (ver §7).

---

## 5. Schema changes

Nova coluna em `players` (`schema.ts`, bloco `:68-93`):

```sql
suspension_weeks_left INTEGER NOT NULL DEFAULT 0
```

- **Migração:** **não** introduzir framework próprio. Adicionar a coluna ao `CREATE TABLE players` (bancos de teste em memória recriam o schema do zero) e registrar a coluna na lista de migração idempotente **de propriedade do epic `db-hardening`/`save-isolation`** (mesmo mecanismo que adiciona `save_id`). Este epic apenas **declara** a necessidade da coluna; o `ALTER TABLE players ADD COLUMN suspension_weeks_left INTEGER NOT NULL DEFAULT 0` para bancos persistentes existentes é aplicado pela migração idempotente daquele epic.
- **Seed:** `seed.ts:24` e `:73` montam o INSERT de players por colunas explícitas. Como a coluna tem `DEFAULT 0`, **não** é preciso adicioná-la ao INSERT do seed (a coluna assume 0). Confirmar em §8 com teste.

Nenhuma outra tabela muda. `match_events` e `player_stats` já têm o que precisamos.

---

## 6. Tratamento de erros & edge cases

- **Lesão sem banco de reservas / `subsUsed === MAX_SUBS`:** o engine já lida com isso na partida (`match-engine.ts:652-654` só remove o jogador). A persistência de `injury_weeks_left` é independente do que aconteceu com a sub — todo evento `'injury'` do clube humano gera duração. Ok.
- **Segundo amarelo → vermelho:** `match-engine.ts:564-568` emite **dois** eventos (`'yellow'` e `'red'`) no mesmo minuto. `resolveMatchSuspensions` conta o `'red'` para o ban de 1 semana; o `'yellow'` desse par **também** entra na contagem de acúmulo da temporada (consistente com regras reais — o amarelo que vira vermelho ainda conta). Documentar no teste para fixar o comportamento.
- **Mesmo jogador, lesão + vermelho na mesma partida:** colunas independentes; ambas aplicadas. Seleção sentará o jogador enquanto qualquer uma for > 0.
- **Lesão nova vs. lesão pré-existente:** `setPlayerInjury` **sobrescreve** (a lesão da partida define a nova duração). Como o decremento já rodou antes, não há risco de zerar a lesão nova.
- **Decremento de suspensão:** análogo ao de lesão — `MAX(0, suspension_weeks_left - 1)`, só para `club_id = playerClubId`.
- **Jogador suspenso que está no `homeLineupSaved`:** `buildSquadFromSavedIds` cai no fallback (já existe para lesão/fitness) e escala outro. Se não houver substituto elegível para o slot, o slot fica vazio — comportamento idêntico ao atual para lesionados; não regride.
- **Pressing × home advantage compõem multiplicativamente** em `attack`: limites já controlados (`HOME_ADVANTAGE_MAX=1.12`, ganho de pressing ~±3.6%). Sem clamp adicional necessário; o teste de média garante que a calibração absorve isso.
- **Determinismo:** todas as amostragens usam o `rng` (`SeededRng`) já fluindo por `advanceGameWeek`. Mesma seed ⇒ mesmas lesões/suspensões.

---

## 7. Estratégia de testes (SQLite real, nunca mock)

TDD obrigatório (engine/database/store). Banco em memória com `better-sqlite3`.

**Unit — `match-consequences.test.ts` (puro):**
- `resolveMatchInjuries`: eventos com 1 `'injury'` ⇒ 1 outcome com `weeks ∈ [1,8]`; zero eventos ⇒ `[]`; mesma seed ⇒ mesma duração (determinismo).
- `resolveMatchSuspensions`: 1 `'red'` ⇒ ban 1 semana; sem cartões ⇒ `[]`; **cruzamento de limiar**: prior=4, +1 amarelo (total 5) ⇒ ban; prior=5, +1 (total 6) ⇒ sem ban; prior=4, +2 (total 6) ⇒ exatamente 1 ban; o par yellow+red do segundo-amarelo conta o amarelo no acúmulo.

**Unit — `team-strength.test.ts` (estender):**
- `isHome:true` aumenta `attack`, `midfield` e `defense` vs `isHome:false` para o mesmo elenco (hoje só `overall` mudaria).
- pressing `high` > `medium` > `low` em `attack` para o mesmo elenco.

**Unit — `player-rating.test.ts` (ajustar):**
- Garantir que assistência continua sendo +0.5 **uma vez** (via evento `'assist'`), e que um gol com `secondaryPlayerId` não-nulo **não** dá bônus extra ao secundário (ramo morto removido). Como o engine nunca seta secondary em goals, montar evento sintético no teste para travar a remoção.

**Unit/integração — `match-engine.test.ts` (estender):**
- **Calibração:** rodar N=2000 partidas equilibradas (elencos iguais, seeds variadas) e assertar `mediaGols ∈ [2.35, 2.65]`. Este é o teste que guia a escolha das constantes.
- **Vantagem de casa:** N=2000 partidas elenco-iguais ⇒ `homeWinRate > awayWinRate` e `homeWinRate ∈ [0.42, 0.52]` aprox. (hoje 38.6% vs 39.1%).
- **Attendance:** `attendance=60000` produz mais gols da casa, em média, que `attendance=1000` (hoje idênticos a 1.584).

**Integração — `game-loop` (novo arquivo de teste, SQLite real):**
- Forçar (seed escolhida) uma partida do clube humano com evento `'injury'` ⇒ após `advanceGameWeek`, `getPlayerById(...).injuryWeeksLeft > 0`.
- Partida com `'red'` para jogador do clube humano ⇒ `suspension_weeks_left > 0` depois; e na **semana seguinte** esse jogador **não** aparece no XI montado por `pickStartingEleven`.
- Decremento: jogador com `injury_weeks_left=2` no início ⇒ vira 1 após a semana, e uma lesão **nova** na mesma semana não é zerada (ordenação correta).
- Schema: tabela `players` recém-criada tem `suspension_weeks_left` default 0; seed insere players sem erro (coluna ausente do INSERT assume default).

Antes de concluir: `npm test` verde, `npx tsc --noEmit` limpo. UI não muda ⇒ sem validação de browser obrigatória.

---

## 8. Dependências & sequenciamento

- **`db-hardening` / `save-isolation` (precede idealmente):** detêm o mecanismo de migração idempotente. A coluna `suspension_weeks_left` deve ser adicionada à lista de migração deles. Se este epic landar antes, a coluna entra no `CREATE TABLE` (cobre testes e bancos novos) e a migração idempotente é adicionada quando `db-hardening` landar — sem conflito, porque `ADD COLUMN ... DEFAULT 0` é idempotente-friendly. **Coordenar:** declarar a coluna no PR; não inventar migração paralela.
- **`world-sim` (independente / depois):** quando IA×IA passar a usar `simulateMatch` e persistir eventos, lesões/suspensões da IA virão "de graça" se aquele epic reusar `resolveMatchInjuries`/`resolveMatchSuspensions` por clube. Este epic deixa os helpers puros e por-clube justamente para habilitar isso, mas **não** implementa o caminho da IA.
- **Reset de temporada:** o rollover de fim de temporada (`game-loop.ts:777-779` já zera flags de aposentadoria por SQL) deve também zerar `suspension_weeks_left` e `injury_weeks_left` dos remanescentes. Acrescentar essas duas colunas ao `UPDATE` existente — mudança pequena dentro deste epic, sem novo arquivo.
- Sem dependência de `competitions-real`, `progression-wired` ou `match-injuries-screen`.

---

## 9. Fora de escopo

- Plugar o engine real em partidas IA×IA (`simulateAiMatch`) — epic `world-sim`. Sem isso, suspensões/lesões só afetam o clube humano (assumido e documentado).
- UI de elenco/telas mostrando "Suspenso"/"Lesionado (Nx)" e contagem de amarelos — epic de telas. A coluna fica pronta para consumo.
- Tabela de histórico de suspensões ou notícias de imprensa sobre lesões.
- Severidade de lesão por tipo de jogada / atributos (ex.: pressing alto = mais lesão). Duração é amostrada por distribuição fixa; refinar é pós-v0.1.
- Limites de cartão por competição distintos (liga vs copa) — usamos acúmulo único por `(player, season)` via `player_stats`.
- Recalibrar posse/xG além do necessário para bater a média de gols.

---

## 10. Spec self-review

- **Placeholders/TBD:** nenhum. Toda constante nova tem valor inicial proposto e/ou é guiada por teste (calibração de gols).
- **Consistência interna:** ordenação decremento-antes-de-aplicar aparece em §3.4, §4 e §7 de forma idêntica. Coluna `suspension_weeks_left` referida igual em §3, §5, §7, §8.
- **Engine puro:** `match-consequences.ts` importa só `MatchEvent` (tipo) e `SeededRng` — sem React/Expo/DB. I/O isolado em `game-loop.ts`/`players.ts`. ✔
- **Ambiguidade resolvida:** regra de cruzamento de limiar de amarelos definida por fórmula explícita (`floor` deltas) em §3.1, com casos de teste em §7. `setPlayerInjury` sobrescreve, `setPlayerSuspension` acumula — divergência intencional e documentada (§3.5, §6).
- **Fundamentação:** todos os file:line citados foram lidos/grepados (team-strength.ts:104-119, match-engine.ts:48-79/189-192/440-447/483-655, player-rating.ts:52-57, game-loop.ts:130-138/154/360-417/459-549/777-779, schema.ts:68-93, players.ts:26/76/136). ✔
- **Risco aberto:** os valores exatos das constantes de calibração (§3.3) são alvos a confirmar pelo teste de média — declarado explicitamente, não é placeholder.
