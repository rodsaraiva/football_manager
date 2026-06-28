# Design: Mini-passes de profundidade de carreira

**Epic:** c8-mini-passes · **Data:** 2026-06-20 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict

**Goal:** Adicionar sete incrementos pequenos, independentes e shipáveis isoladamente que aprofundam a simulação de carreira (pré-temporada, congestionamento/rotação, lesões, empréstimos, forma, bolas paradas, mídia) sem reescrever nenhum sistema existente.

---

## 1. Problema / estado atual

O loop de carreira já é completo (12/12 épicos do MASTER-ROADMAP), mas vários sistemas existem em forma "v0.1": funcionam, mas são rasos. Cada subseção abaixo é aterrada no código que a torna rasa hoje.

**(a) Pré-temporada plana.** `playFriendly` já simula o amistoso com o motor REAL (`preseason-runner.ts:102-113`) e persiste placar/renda, mas o único efeito no elenco é um ganho de fitness fixo de 5–8 pontos para quem foi titular (`preseason-engine.ts:58-66`, `applyFriendlyFitnessGain`). Não há efeito de **moral** nem de **confiança/afiação** ligado ao resultado, nem escala pela força do adversário — vencer o líder ou perder de goleada produz o mesmo +5..8 de fitness. O resultado é simulado mas inconsequente.

**(b) Sem congestionamento de calendário.** A fadiga existe só DENTRO da partida (`match-engine.ts:261-279`, `drainFatigue`) e o fitness semanal é um swing fixo: titular cai `rng.nextInt(5,15)`, reserva recupera `rng.nextInt(5,15)` (`game-loop.ts:421-432`). Não há acúmulo entre jogos próximos — duas partidas na mesma janela (liga + copa) não pesam mais que uma. A lesão na partida é uma probabilidade fixa `INJURY_PROB = 0.002` por bloco (`match-engine.ts:69`), independente do quão sobrecarregado/cansado o jogador chega.

**(c) Lesão sem gravidade real.** A duração é sorteada em semanas inteiras com peso para layoffs curtos (`injury.ts:8-13`, `rollInjuryDuration`, faixa [1,8]), e a recuperação é um simples decremento de 1/semana (`game-loop.ts:437-439`). Não há **tiers** (leve/moderada/grave), nem influência do **physio** na curva (o staff effect existe — `staffEffects.physio` é lido em `game-loop.ts:352-358` mas não afeta recuperação de lesão), nem **retorno abaixo de 100%** de fitness. O jogador volta com o fitness que tinha antes de lesionar.

**(d) Empréstimos cegos.** O retorno de emprestados no fim de temporada já funciona (`loan-returns.ts:16-66`, `returnExpiredLoans` lê `transfers.type='loan'` + `loan_end`). Mas não há como o usuário **monitorar** os jogadores que emprestou (minutos, rating, evolução) durante a temporada, nem **recall** antecipado. O empréstimo é "fire and forget".

**(e) Forma não modela sequência.** `getRecentForm` (`player-stats.ts:128-159`) agrega a temporada INTEIRA (média ponderada por minutos de todas as competições), não os últimos N jogos. O rating efetivo de partida (`player-rating.ts`, via `calculatePlayerRatings` em `match-engine.ts:506-507`) usa overall puro; não há boost/penalidade por estar embalado ou em seca. A `press-engine.ts:45` tem um `IN_FORM_THRESHOLD = 7.0` que opera sobre essa média anual, não sobre forma recente real.

**(f) Bolas paradas sem rotina.** P7 já entregou cobradores designados: tabela `set_piece_takers` (`schema.ts:490-497`), query (`set-piece-takers.ts`), tela (`SetPiecesScreen.tsx`) e `resolveTaker` (`set-piece-takers.ts:16-26`) consumido em `match-engine.ts` (pênalti :660, falta :716/:759, escanteio :643-648). O que falta é **profundidade de rotina**: não há escolha de rotina de escanteio (curto/cruzamento/primeiro pau) que module `CORNER_GOAL_PROB` (`match-engine.ts:71`), nem cobrador secundário/fallback explícito.

**(g) Mídia rasa.** P5 entregou a coletiva pós-jogo (`press-engine.ts`, `computePressConference`) com 3 tons × 3 resultados e headline i18n. Mas não há **tier de cobertura** (clube grande = mais escrutínio) nem **sentimento de mídia acumulado** que persista entre jogos e module a pressão da diretoria. Cada coletiva é um evento isolado, sem memória.

> **Nota de schema:** o projeto tem fonte única de schema em `src/database/schema.ts` (não há `database-store.ts` de schema — a referência do CLAUDE.md é ao **store** Zustand `src/store/database-store.ts`). DBs novos recebem todas as colunas de `SCHEMA_SQL`; DBs legados precisam de ALTER idempotente (ver §5).

---

## 2. Approach

**Abordagem escolhida: sete sub-passes independentes, cada um auto-contido.** Cada item abaixo tem Problema/Entrega/Teste próprios e NÃO depende dos outros — pode ser implementado, testado, revisado e mergeado isoladamente, em qualquer ordem. Isso casa com o padrão da casa de "commits pequenos e frequentes" e permite priorizar por valor. Toda lógica nova vai para `src/engine/**` puro (zero React/Expo), seguindo `injury.ts`/`match-consequences.ts` (funções puras que retornam decisões, caller persiste) e o orquestrador `game-loop.ts` (toca DB). RNG sempre via `SeededRng` já threadado no loop.

**Princípio de não-regressão:** cada pass preserva o caminho legado byte-for-byte quando a nova feature não está configurada — exatamente como P7 fez com `resolveTaker` (designação honrada NÃO consome o RNG do fallback, `set-piece-takers.ts:21-25`). Defaults novos = comportamento atual.

**Alternativa descartada: um sistema unificado de "condição física" reescrevendo fadiga + lesão + fitness num só módulo.** Seria mais "limpo" conceitualmente, mas (1) acopla três passes que queremos shipar isolados, (2) toca o caminho quente `match-engine.ts`/`game-loop.ts` de uma vez, arriscando os baselines de balanceamento já validados (commit 933f2f1) e o sweep de determinismo (3161e61), e (3) viola o brief ("mantenha cada item curto e executável"). Rejeitada.

---

## 3. Architecture & components

Cada pass lista seus arquivos. Letras (a)..(g) batem com §1.

| Pass | Arquivo | Criar/Alterar | Responsabilidade |
|---|---|---|---|
| (a) | `src/engine/preseason/preseason-effects.ts` | Criar | Puro: dado resultado do amistoso + força relativa, retorna deltas de moral e de "afiação" (sharpness) por participante. |
| (a) | `src/engine/preseason/preseason-runner.ts` | Alterar | Após `simulateMatch`, aplicar deltas de moral/sharpness além do fitness atual. |
| (b) | `src/engine/simulation/congestion.ts` | Criar | Puro: dado nº de jogos numa janela recente, retorna multiplicador de fadiga acumulada e de risco de lesão. |
| (b) | `src/engine/game-loop.ts` | Alterar | No passo 6 (fitness) e antes do passo 7 (lesão), aplicar congestionamento por jogador. |
| (c) | `src/engine/simulation/injury.ts` | Alterar | Adicionar tiers (leve/moderada/grave) e cálculo de fitness-de-retorno; physio acelera. |
| (c) | `src/engine/game-loop.ts` | Alterar | Recuperação de lesão modulada pelo physio; ao zerar, fitness volta < 100. |
| (d) | `src/engine/transfer/loan-portfolio.ts` | Criar | Puro: monta visão de portfólio (deriva status de recall elegível) a partir de linhas de transfers + stats. |
| (d) | `src/database/queries/transfers.ts` | Alterar | `getActiveLoansByParent` (lê emprestados vivos do clube-pai) + `recallLoan` (encerra cedo). |
| (d) | `src/screens/transfers/LoanPortfolioScreen.tsx` | Criar | Tela do kit novo listando emprestados + ação Recall. |
| (e) | `src/database/queries/player-stats.ts` | Alterar | `getLastNMatchForm` (últimos N ratings de partida). |
| (e) | `src/engine/simulation/form.ts` | Criar | Puro: converte sequência recente em modificador de rating efetivo. |
| (e) | `src/engine/simulation/player-rating.ts` | Alterar | Aceitar `formModifier` opcional por jogador. |
| (f) | `src/engine/simulation/match-engine.ts` | Alterar | `SetPieceTakers` ganha `cornerRoutine`; modula `CORNER_GOAL_PROB`. |
| (f) | `src/database/queries/set-piece-takers.ts` + `schema.ts` | Alterar | Coluna `corner_routine`. |
| (f) | `src/screens/tactics/SetPiecesScreen.tsx` | Alterar | Seletor de rotina de escanteio. |
| (g) | `src/engine/press/media-sentiment.ts` | Criar | Puro: tier de cobertura por reputação + acúmulo de sentimento a partir do outcome da coletiva. |
| (g) | `src/database/queries/save.ts` + `schema.ts` | Alterar | Persistir `media_sentiment` por save. |
| (g) | `src/engine/press/press-engine.ts` | Alterar | `computePressConference` consome tier e devolve novo sentimento. |
| Todos | `src/i18n/pt.ts` + `en.ts` | Alterar | Strings novas, paridade pt/en. |

### Contracts (assinaturas TS exatas)

```ts
// (a) src/engine/preseason/preseason-effects.ts
export interface FriendlyEffectInput {
  myGoals: number;
  oppGoals: number;
  myReputation: number;
  oppReputation: number;   // escala: bater rep maior vale mais moral
  participated: boolean;
}
export interface FriendlyEffect {
  moraleDelta: number;     // aplicado via applyMoraleDelta no caller
  sharpnessDelta: number;  // 0..N pontos de afiação (nova coluna match_sharpness)
}
export function computeFriendlyEffect(input: FriendlyEffectInput): FriendlyEffect;

// (b) src/engine/simulation/congestion.ts
export interface CongestionInput {
  gamesInWindow: number;   // jogos do jogador na janela recente (ex.: últimas 3 semanas)
  baseFitnessDrop: number; // o swing atual (5..15) já sorteado
}
export interface CongestionResult {
  fitnessDrop: number;     // baseFitnessDrop escalado por pile-up
  injuryRiskMult: number;  // >=1; multiplica INJURY_PROB efetivo do jogador
}
export function computeCongestion(input: CongestionInput): CongestionResult;

// (c) src/engine/simulation/injury.ts  (ADITIVO ao módulo existente)
export type InjurySeverity = 'knock' | 'moderate' | 'serious';
export interface InjuryAssignment {            // estende o existente
  playerId: number;
  weeksLeft: number;
  severity: InjurySeverity;                    // novo
  returnFitnessCap: number;                    // 60..90: fitness máx ao voltar
}
export function classifyInjury(weeksLeft: number): InjurySeverity;
export function injuryRecoveryStep(
  weeksLeft: number,
  physioAbility: number,                       // 0..20, de staffEffects
): number;                                     // novas semanas restantes (>=0)

// (d) src/engine/transfer/loan-portfolio.ts
export interface LoanedPlayerRow {
  playerId: number; name: string; loanClubId: number; loanClubName: string;
  loanEnd: number; appearances: number; avgRating: number; minutesPlayed: number;
}
export interface LoanPortfolioEntry extends LoanedPlayerRow {
  recallEligible: boolean;   // janela aberta + ainda na vigência
}
export function buildLoanPortfolio(
  rows: LoanedPlayerRow[], currentSeason: number, currentWeek: number,
): LoanPortfolioEntry[];

// (e) src/engine/simulation/form.ts
export function computeFormModifier(recentRatings: number[]): number; // ex.: -1.0..+1.0 no rating efetivo
// player-rating.ts: PlayerMatchInput ganha campo opcional
//   formModifier?: number;

// (f) match-engine.ts: SetPieceTakers ganha campo opcional
export type CornerRoutine = 'auto' | 'near_post' | 'far_post' | 'short';
//   cornerRoutine?: CornerRoutine;
export function cornerRoutineMultiplier(routine: CornerRoutine | undefined): number;

// (g) src/engine/press/media-sentiment.ts
export type MediaTier = 'local' | 'national' | 'global';
export function mediaTierForReputation(reputation: number): MediaTier;
export interface SentimentInput {
  current: number;            // -100..100, persistido por save
  outcome: PressOutcome;      // reusa o tipo de press-engine
  tone: PressTone;
  tier: MediaTier;            // tier amplifica o swing
}
export function nextMediaSentiment(input: SentimentInput): number; // próximo valor clamped
```

---

## 4. Data flow

- **(a)** `PreSeasonScreen` → `playFriendly` (`preseason-runner.ts`) → após `simulateMatch`, calcula `computeFriendlyEffect` por participante do elenco do usuário → aplica fitness (atual) + `applyMoraleDelta` (de `morale-engine`) + grava `match_sharpness`. Determinístico via o `rng` já recebido em `PlayFriendlyParams.rng`.
- **(b)** `advanceGameWeek` passo 6: para cada jogador do elenco, conta jogos recentes (de `player_stats`/fixtures) → `computeCongestion(gamesInWindow, baseDrop)` escala o `fitnessDrop` antes do `UPDATE players SET fitness`. Passo 7: o `injuryRiskMult` é repassado a um `assignMatchInjuries` parametrizado (o motor já emite o evento `injury`; o multiplicador altera a CHANCE no `match-engine`, ou — mais barato — pós-filtra/escala no caller; ver §6).
- **(c)** `advanceGameWeek` passo 7: em vez do decremento fixo `injury_weeks_left - 1`, usa `injuryRecoveryStep(weeksLeft, staffEffects.physio)`. Quando chega a 0, faz `UPDATE players SET fitness = MIN(fitness, returnFitnessCap)` para retorno < 100.
- **(d)** `LoanPortfolioScreen` → `getActiveLoansByParent(db, saveId, playerClubId)` + `getRecentForm`/stats por jogador → `buildLoanPortfolio` → render. Ação Recall → `recallLoan` (move `players.club_id` de volta ao pai, limpa `loan_wage`, neutraliza `loan_end` — mesma mecânica de `returnExpiredLoans:53-60`).
- **(e)** `loadClubMatchData`/`loadWeekClubData` (`game-loop.ts:223-272`) já carregam o elenco; adicionar leitura de `getLastNMatchForm` por jogador → `computeFormModifier` → injetar em `PlayerMatchInput.formModifier` no cálculo de ratings (`match-engine.ts:494-507`).
- **(f)** `SetPiecesScreen` grava `corner_routine`; `loadClubMatchData:252` lê via `getSetPieceTakers` (já thread `setPieceTakers` ao motor); `runBlock` multiplica `CORNER_GOAL_PROB` por `cornerRoutineMultiplier(team.takers?.cornerRoutine)` em `match-engine.ts:624`.
- **(g)** Após coletiva (`PressConferenceScreen` → `computePressConference`), `nextMediaSentiment` calcula o novo sentimento (tier vem da reputação do clube) → persiste em `save_games.media_sentiment`. O valor acumulado pode modular a confiança da diretoria em coletivas futuras (entrada `current`).

---

## 5. Schema changes

Toda coluna nova entra em `src/database/schema.ts` (`SCHEMA_SQL`, fonte única) **e** ganha ALTER idempotente para DBs existentes. O padrão `migration.ts` só migra `save_id`; para colunas novas seguimos o mesmo idioma (`PRAGMA table_info` → `ALTER TABLE ... ADD COLUMN`), adicionando-as ao fluxo de migração (twins async + sync). Todas as tabelas world já carregam `save_id`; queries novas recebem `(db, saveId, ...)`.

| Pass | Tabela | Coluna nova | Tipo / default | Índice |
|---|---|---|---|---|
| (a) | `players` | `match_sharpness` | `INTEGER NOT NULL DEFAULT 100 CHECK (match_sharpness BETWEEN 1 AND 100)` | — (lido com o resto do row de `players`) |
| (c) | `players` | `injury_severity` | `TEXT` (NULL = sem lesão; 'knock'/'moderate'/'serious') | — |
| (c) | `players` | `injury_return_fitness` | `INTEGER` (NULL; cap aplicado no retorno) | — |
| (f) | `set_piece_takers` | `corner_routine` | `TEXT NOT NULL DEFAULT 'auto'` | PK já é `(save_id, club_id)` |
| (g) | `save_games` | `media_sentiment` | `INTEGER NOT NULL DEFAULT 0` (-100..100) | — (1 row por save) |

Observações:
- DBs novos: colunas vêm de `SCHEMA_SQL`. DBs legados: `ADD COLUMN` precisa ser NULLABLE ou ter DEFAULT (SQLite não aceita NOT NULL sem default em tabela populada) — por isso `match_sharpness`/`media_sentiment`/`corner_routine` têm DEFAULT, e `injury_severity`/`injury_return_fitness` são NULLABLE.
- **(d) não cria tabela**: empréstimos já vivem em `transfers` (`schema.ts:231-242`, `type='loan'` + `loan_end`) e `players.club_id`/`loan_wage`. Só novas queries.
- **(b)/(e) não criam coluna**: derivam de `player_stats`/`fixtures` existentes. "Jogos na janela" pode sair de `player_stats.appearances` deltas semanais ou de fixtures recentes do clube (decisão de implementação; preferir fixtures por precisão de janela).

---

## 6. Error handling & edge cases

- **(a)** Elenco vazio / amistoso sem titulares do usuário: `computeFriendlyEffect` com `participated=false` → deltas 0 (espelha `applyFriendlyFitnessGain` que retorna fitness inalterado). Moral nunca sai de [1,100] (clamp de `applyMoraleDelta`). Sharpness clamped [1,100].
- **(b)** `gamesInWindow=0` ou 1 → `injuryRiskMult=1` e `fitnessDrop=baseFitnessDrop` (sem regressão). O multiplicador de lesão NÃO deve quebrar determinismo: aplicar como escala da probabilidade ANTES do `rng.next()` (mesma posição no stream) ou como roll adicional consumido SEMPRE (mesmo quando mult=1), nunca condicional — senão dois caminhos divergem o RNG. Preferir escalar `INJURY_PROB` via parâmetro no `match-engine` (1 roll, posição fixa).
- **(c)** `physioAbility=0` → curva = decremento de 1/semana (legado). `weeksLeft` já em 0 → no-op. `returnFitnessCap` nunca > fitness atual (não "cura" subindo fitness). Tier mapeado deterministicamente de `weeksLeft` (sem RNG novo).
- **(d)** Recall fora da janela de transferências (`isTransferWindow`, `game-loop.ts:276-278`) → `recallEligible=false`, botão desabilitado. Jogador já retornado (`club_id` != clube emprestado) → não aparece no portfólio (mesma checagem de `loan-returns.ts:46-49`). Recall em RN Web não pode usar `Alert.alert` (no-op no web — ver memória `reference_rn_web_alert`); usar `useConfirm` do kit novo.
- **(e)** Menos de N jogos recentes → `computeFormModifier` usa os que houver; 0 jogos → modificador 0 (rating = overall puro, legado). Nunca acessa índice fora do array.
- **(f)** `cornerRoutine` ausente/`'auto'` → multiplicador 1.0 (byte-for-byte com hoje). Clubes da IA sem row → `undefined` → `'auto'` (mesmo fallback de P7).
- **(g)** `media_sentiment` clamped [-100,100]. Tier derivado de reputação determinística (sem RNG). Coletiva pulada (`press.skip`) → sentimento inalterado.

**Determinismo (regra dura):** nenhum pass introduz `Math.random`/`Date.now`/`new Date()`/`ORDER BY RANDOM`. Onde houver aleatoriedade nova ((a) sharpness/moral, (b) lesão), consumir o `SeededRng` já threadado, e na MESMA posição do stream independentemente da feature estar ligada (padrão `resolveTaker`).

---

## 7. Testing strategy

TDD obrigatório (engine/database/store). better-sqlite3 REAL em memória, nunca mock. Cada pass tem suíte isolada espelhando a estrutura de `__tests__` existente.

**Unit puro (motor):**
- **(a)** `computeFriendlyEffect`: golden — vitória sobre rep maior → maior moral que vitória sobre rep menor; derrota → moral negativa; `participated=false` → tudo 0. Edge — placares iguais (empate) → delta neutro pequeno.
- **(b)** `computeCongestion`: golden — `gamesInWindow=1` → mult=1, drop=base; `=3` → mult>1, drop>base monotônico. Edge — `=0` idêntico a `=1`.
- **(c)** `classifyInjury`/`injuryRecoveryStep`: golden — `weeksLeft<=2`→'knock', médio→'moderate', `>=6`→'serious'; physio 20 recupera mais rápido que physio 0; nunca negativo. `returnFitnessCap` cresce com gravidade (mais grave volta pior).
- **(d)** `buildLoanPortfolio`: golden — janela aberta + vigente → `recallEligible=true`; expirado → não elegível.
- **(e)** `computeFormModifier`: golden — 5 ratings altos → modificador positivo; 5 baixos → negativo; vazio → 0; assimetria (seca pesa).
- **(f)** `cornerRoutineMultiplier`: `'far_post'` > `'short'` em conversão de cabeça; `'auto'`/undefined === 1.0 exato.
- **(g)** `mediaTierForReputation`/`nextMediaSentiment`: thresholds de tier; tier 'global' amplia o swing; clamp em ±100.

**Integração (DB real, better-sqlite3):**
- **(a)** Rodar `playFriendly` num save semeado e assertar que moral E sharpness mudaram (não só fitness) para titulares; suplentes inalterados.
- **(c)** `advanceGameWeek` com jogador lesionado + physio: assertar `injury_weeks_left` cai mais rápido e que no retorno `fitness <= injury_return_fitness`.
- **(d)** `getActiveLoansByParent` + `recallLoan`: após recall, `players.club_id` = pai e `loan_wage` NULL.
- **(f)** Migração: criar DB legado sem `corner_routine`, rodar migração, assertar coluna presente com default 'auto'.

**Determinismo (sweep, alinhado a 3161e61):** mesma seed → mesmo resultado em `playFriendly` e `advanceGameWeek` com cada feature ligada/desligada. O caminho legado (features off) deve produzir resultado IDÊNTICO ao atual (guard de não-regressão — re-rodar baselines de balanceamento de 933f2f1).

**Antes de declarar pronto:** `npm test` + `npx tsc --noEmit` verdes; telas novas/alteradas ((d),(f)) validadas no Playwright MCP; `git diff` revisado.

---

## 8. Dependencies & sequencing

- **Precede tudo:** nada bloqueia o épico — os sistemas-base (amistosos, fadiga, lesão, empréstimos, forma, bolas paradas, coletiva) já existem em produção.
- **Design System (`2026-06-20-design-system-premium-design.md`):** as telas novas/alteradas — (d) `LoanPortfolioScreen` e (f) seletor em `SetPiecesScreen` — devem usar o **novo kit** (Card/Button/StatBar/Text semânticos/Icon/EmptyState/Toast/useConfirm), não estilos inline crus como o `SetPiecesScreen` atual (que usa `StyleSheet.create` + `colors`/`spacing` direto, `SetPiecesScreen.tsx:159-226`). Idealmente os passes (d)/(f) entram DEPOIS dos sub-passes D3/D4 do Design System (componentes de lista/formulário e confirmação) para não criar UI a ser retrabalhada. Os passes puros (a/b/c/e/g) NÃO dependem do Design System e podem ir antes.
- **Ordem sugerida por valor/baixo risco:** (a) → (c) → (e) → (b) → (f) → (d) → (g). (b) e (c) tocam o caminho quente `game-loop`/`match-engine`; fazê-los após (a)/(e) ganha confiança no harness de determinismo.
- **Relação com outros épicos:** independente de C1–C7; (g) (sentimento de mídia) pode futuramente alimentar um épico de "narrativa/board" mas aqui fica self-contained.

---

## 9. Out of scope

- Tabela dedicada de lesões com histórico/recorrência (aqui só colunas em `players`).
- Calendário visual de congestionamento / agendamento manual de amistosos extra (a pré-temporada continua com `PRESEASON_MAX_FRIENDLIES=3`, `preseason-engine.ts:4`).
- Cláusulas de empréstimo (opção de compra, % de jogos obrigatórios) — só monitorar + recall.
- IA usando rotinas de escanteio / sentimento de mídia (features novas continuam exclusivas do clube do usuário, como P7).
- Reescrita do modelo de fadiga intra-partida (`drainFatigue`) ou do cálculo de força (`team-strength`).
- Nova entidade de "imprensa" com entrevistas individuais — (g) só adiciona tier + sentimento acumulado à coletiva existente.

---

## 10. Spec self-review

- **Placeholder scan:** sem "TBD"/"FIXME"/"???" no documento.
- **Consistência interna:** letras (a)..(g) batem entre §1 (problema), §3 (arquivos), §4 (fluxo), §5 (schema), §6 (edge), §7 (testes), §9 (escopo). Sub-passes declarados independentes e cada um com problema/entrega/teste.
- **Refs de código verificadas (lidas nesta sessão):**
  - `preseason-engine.ts:4,58-66` (fitness fixo, max friendlies); `preseason-runner.ts:92-156` (playFriendly, PlayFriendlyParams.rng).
  - `match-engine.ts:69` (INJURY_PROB), `:71` (CORNER_GOAL_PROB), `:261-279` (drainFatigue), `:494-507` (ratings), `:624,643-648,660,716,759` (resolveTaker em set pieces).
  - `injury.ts:8-13,24-36` (rollInjuryDuration, assignMatchInjuries, InjuryAssignment).
  - `match-consequences.ts` (padrão puro retorna-decisão).
  - `game-loop.ts:276-278` (isTransferWindow), `:352-358` (staffEffects.physio lido), `:421-432` (fitness swing), `:437-444` (recuperação/aplicação de lesão).
  - `loan-returns.ts:16-66` (returnExpiredLoans, mecânica de recall reaproveitável).
  - `press-engine.ts:33-43,45,71-95` (matriz tom×resultado, IN_FORM_THRESHOLD, computePressConference).
  - `set-piece-takers.ts` (query) + `set-piece-takers.ts:16-26` (resolveTaker) + `schema.ts:490-497` (tabela).
  - `SetPiecesScreen.tsx:25-29,159-226` (slots + estilos inline a migrar p/ kit).
  - `schema.ts:78-108` (players), `:231-242` (transfers), `:304-313` (save_games + preseason_pending), `:337-347` (friendlies).
  - `player-stats.ts:128-159` (getRecentForm agrega temporada — base do gap de forma).
  - `rng.ts:5-54` (SeededRng API: next/nextInt/nextFloat/pick/shuffle/weightedPick).
  - `migration.ts:11-19,44-80` (padrão ALTER idempotente / twins async+sync).
- **Determinismo & schema:** §6 fixa a regra de RNG na mesma posição do stream; §5 fixa schema.ts como fonte única + ALTER idempotente para colunas novas e justifica NULLABLE/DEFAULT por restrição do SQLite.
