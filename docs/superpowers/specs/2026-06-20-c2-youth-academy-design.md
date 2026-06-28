# Design: Base de verdade (Youth Academy)

**Epic:** c2-youth · **Data:** 2026-06-20 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict

**Goal:** Transformar a Academia de Base de um intake estático de 2-5 jovens/temporada (hoje invisível, num empty state) em um loop de dinastia jogável: níveis de academia com efeito real, preview de intake, pipeline jovem→reserva→profissional com promoção/integração, empréstimo de desenvolvimento com tracking e recall, reputação de academia comparável entre clubes e especialização de youth coach.

---

## 1. Problema / estado atual

A geração de jovens **já existe e roda determinística**, mas é rasa e não tem superfície de jogo:

- O motor `generateYouthPlayers` (`src/engine/youth/youth-academy.ts:96-126`) produz `academyLevel + rng.nextInt(-1, 0)` jovens, clampado em `[2, 5]` (`youth-academy.ts:99-101`). `basePotential = 40 + academyLevel*8 + youthCoachBonus + rng.nextInt(-5,10)` clampado `[45,95]` (`youth-academy.ts:111-112`); `currentOverall = basePotential - rng.nextInt(10,20)` clampado `[30,70]` (`youth-academy.ts:114-116`). É 100% SeededRng, sem `Math.random`/`Date.now`.
- O intake é disparado **só no rollover de temporada**: `generateClubYouth` (`src/engine/season/end-of-season-ops.ts:56-106`) é chamado em `season-rollover.ts:63` (clube humano) e `:101` (cada clube de IA). Jovens entram direto na tabela `players` com `club_id` do clube, `wage 5000`, `contract_end = newSeason+3`, `market_value 100000` (`end-of-season-ops.ts:86-92`). **Não há tier**: jovem e profissional convivem na mesma `players.club_id` sem distinção de squad.
- **`academyLevel` (1-5) tem efeito fraco e opaco**: só mexe no count e no `basePotential` (`youth-academy.ts:100,111`). O upgrade existe (`src/engine/finance/upgrades.ts`, coluna `clubs.youth_academy` em `schema.ts:70`, check `BETWEEN 1 AND 5`), mas o jogador não vê preview do que ganha. `youthCoachBonus` vem de `getStaffEffects(...).youthQualityBonus = round(ability/20*10)` (`src/engine/staff/staff-effects.ts:22`) — 0-10, sem especialização.
- **A tela é um stub.** `YouthAcademyScreen.tsx` (`src/screens/squad/YouthAcademyScreen.tsx:6-22`) é só título + empty state com emoji 🌱 e `t('youth.empty')`. Está roteada (`RootNavigator.tsx:112`) e linkada com destaque na Squad (`SquadListScreen.tsx:109`) e Home (`home.youth_academy_link`), ou seja: lugar de destaque, conteúdo zero.
- **Empréstimo de desenvolvimento não existe como loop de base.** Há infra de loan genérico: `transfers.type='loan'` + `loan_end` (`schema.ts:241`), `returnExpiredLoans` no rollover (`src/engine/transfer/loan-returns.ts:16-66`, chamado em `season-rollover.ts:49`), `players.loan_wage`/`loan_wage_share`/`is_loan_listed` (`schema.ts:99-102`). Mas **não há tracking de minutos/desempenho do empréstimo nem recall mid-season**, e nada conecta loan a desenvolvimento de jovem.
- **Não há reputação de academia comparável.** O único report relacionado é `ReportsYouthScreen.tsx` (lê squad U21 via `buildYouthReport`, `src/engine/reports/youth-report.ts:43`, `U21_AGE_LIMIT=21`) — analisa quem já está no elenco, não a *produtividade histórica* da academia nem a comparação entre clubes.

Resumo: o intake determinístico é a fundação certa, mas falta tier (reserva), promoção/integração, alavancas visíveis de nível, empréstimo de desenvolvimento com tracking, e métrica de reputação de academia. É o maior loop de dinastia ausente — sinergia direta com C1 (profundidade de carreira).

---

## 2. Approach

**Abordagem escolhida — tier de squad via coluna em `players`, intake previsível, e camada de tracking de empréstimo separada.**

1. **Tier de elenco (`players.squad_tier`)**: nova coluna `'youth' | 'reserve' | 'first'`. Jovens nascem `'youth'`. Promoção é uma transição explícita de tier (não muda `club_id`), reversível e auditável. As queries de elenco existentes (`getPlayersByClub`) ganham filtro opcional de tier; o motor de partida só considera `'first'`/`'reserve'` elegíveis conforme regra.
2. **Intake previsível + preview**: extrair as fórmulas mágicas de `youth-academy.ts` para um módulo de *levers* puro (`youth-levers.ts`) que produz um **preview determinístico** (faixa de count, faixa de potencial, nº esperado de "joias") a partir de `(academyLevel, youthCoachBonus, academyReputation, specialization)` — usado tanto pela tela (preview antes do intake) quanto pelo gerador real (mesma seed = mesmo resultado).
3. **Pipeline de desenvolvimento jovem→reserva→profissional**: motor puro `youth-progression.ts` decide, no rollover, transições de tier por idade/overall/minutos, e expõe `evaluatePromotion(player, squadContext)` para a ação manual do jogador (botão "Promover ao elenco principal").
4. **Empréstimo de desenvolvimento**: nova tabela `youth_loans` que estende o loan genérico com tracking de minutos/rating acumulados e flag de recall. Reaproveita `returnExpiredLoans` no fim de temporada e adiciona `processYouthLoanWeek` (acumula minutos/rating a partir de `player_stats`/`match_events` do clube emprestador) e `recallYouthLoan` (mid-season). O ganho de desenvolvimento do jovem emprestado é função dos minutos/rating reais.
5. **Reputação de academia**: coluna `clubs.academy_reputation` (1-100), evoluída por *produtos da academia* (jovens promovidos que viraram titulares / vendidos com lucro), com histórico anual em nova tabela `academy_reputation_history` (espelhando o padrão de `club_reputation_history`). Alimenta `youth-levers` (academias reputadas atraem melhores intakes) e o ranking comparativo na tela.
6. **Especialização do youth coach**: coluna `staff.youth_specialization` (`'balanced' | 'technical' | 'physical' | 'mental' | 'position:GK'...`) que enviesa os `POSITION_BOOSTS`/grupos de atributo no `generateAttributes` (`youth-academy.ts:70-87`) de forma determinística.
7. **UI**: reescrever `YouthAcademyScreen` com o novo kit (`Card`/`StatBar`/`Text`/`Icon`/`Button`/`EmptyState`/`Toast`/`useConfirm` de `2026-06-20-design-system-premium-design.md`): seções "Intake da próxima temporada (preview)", "Reservas (pipeline)", "Empréstimos ativos", "Reputação de academia (ranking)". Promoção/recall via `Button` + `useConfirm` (nunca `Alert.alert` — no-op no RN Web).

**Alternativa descartada — tabela `youth_players` separada da `players`.** Modelar jovens numa tabela própria isolaria o tier, mas duplicaria todo o aparato de atributos/stats/contratos/transferências e exigiria *migrar* o jovem para `players` na promoção (perda de id, de histórico de `player_stats`, de scouting). O intake atual já insere em `players` (`end-of-season-ops.ts:86-101`) e o report U21 já lê de lá (`youth-report.ts:45`). Uma coluna `squad_tier` mantém um único id de jogador por toda a carreira (jovem→reserva→ídolo), preserva histórico e save-isolation, e é uma transição barata. Descartada.

---

## 3. Architecture & components

### Arquivos a Criar / Alterar

| Arquivo | Ação | Responsabilidade / interface |
|---|---|---|
| `src/engine/youth/youth-levers.ts` | Criar | Motor puro: deriva preview de intake (count/potencial/joias) e modificadores a partir de nível+coach+reputação+specialization. Sem React, sem DB. |
| `src/engine/youth/youth-academy.ts` | Alterar | Consumir `youth-levers` p/ count/potencial/specialization; aceitar `academyReputation` e `specialization` no input. Manter SeededRng. |
| `src/engine/youth/youth-progression.ts` | Criar | Motor puro: `evaluateTierTransitions` (rollover) e `evaluatePromotion` (ação manual). Decide youth→reserve→first. |
| `src/engine/youth/youth-loans.ts` | Criar | Orquestrador (toca DB, padrão `game-loop.ts`): `processYouthLoanWeek`, `recallYouthLoan`, `settleYouthLoanDevelopment`. Recebe `(db, saveId, ...)`. |
| `src/engine/youth/academy-reputation.ts` | Criar | Motor puro `computeAcademyReputationDelta` + orquestrador `applyAcademyReputation` (rollover). |
| `src/database/schema.ts` | Alterar | Colunas `players.squad_tier`, `clubs.academy_reputation`, `staff.youth_specialization`; tabelas `youth_loans`, `academy_reputation_history`; índices; registrar nomes em `TABLE_NAMES`. |
| `src/store/database-store.ts` | Alterar | `addColumnIfMissing` p/ as 3 colunas; criar as 2 tabelas novas (mesmo padrão de `loan_end`/`loan_wage` em `database-store.ts:72,91,150`). |
| `src/database/queries/youth.ts` | Criar | Queries tipadas tier-aware + youth_loans + academy_reputation. Todas `(db, saveId, ...)`. |
| `src/database/queries/players.ts` | Alterar | `getPlayersByClub`/`getPlayersWithAttributesByClub` aceitam filtro `tier?`; `promotePlayerTier`. |
| `src/database/queries/clubs.ts` | Alterar | `rowToClub` mapeia `academy_reputation`; `getClubsByCountry` já traz divisão p/ ranking. |
| `src/engine/season-rollover.ts` | Alterar | Encaixar `evaluateTierTransitions`, `settleYouthLoanDevelopment` e `applyAcademyReputation` na transação (`season-rollover.ts:41-105`). |
| `src/engine/game-loop.ts` | Alterar | Chamar `processYouthLoanWeek` na varredura semanal (após apuração de partidas). |
| `src/screens/squad/YouthAcademyScreen.tsx` | Reescrever | Tela real com novo kit: preview, reservas, empréstimos, ranking de reputação. |
| `src/types/player.ts` | Alterar | `Player.squadTier: SquadTier`. |
| `src/types/club.ts` | Alterar | `Club.academyReputation: number`. |
| `src/i18n/pt.ts` + `src/i18n/en.ts` | Alterar | Chaves `youth.*` novas, paridade pt/en. |

### Contract (assinaturas TS exatas)

```ts
// src/types/player.ts
export type SquadTier = 'youth' | 'reserve' | 'first';
// Player ganha: squadTier: SquadTier;

// src/engine/youth/youth-levers.ts
export type YouthSpecialization =
  | 'balanced' | 'technical' | 'physical' | 'mental'
  | 'position'; // viés posicional definido pelo grupo do coach

export interface IntakeLevers {
  academyLevel: number;       // 1-5  (clubs.youth_academy)
  youthCoachBonus: number;    // 0-10 (staff-effects.youthQualityBonus)
  academyReputation: number;  // 1-100 (clubs.academy_reputation)
  specialization: YouthSpecialization;
}

export interface IntakePreview {
  countMin: number;
  countMax: number;
  potentialMin: number;       // teto realista do melhor prospecto
  potentialMax: number;
  expectedGems: number;       // nº esperado de prospectos com pot >= GEM_THRESHOLD
  reputationTier: 'elite' | 'forte' | 'mediana' | 'fraca';
}

export const GEM_THRESHOLD = 80;

/** Preview determinístico (sem rng) — mesma entrada, mesma faixa. */
export function previewIntake(levers: IntakeLevers): IntakePreview;

/** Aplicado pelo gerador real: count e teto de potencial efetivos desta seed. */
export function resolveIntakeCount(levers: IntakeLevers, rng: SeededRng): number;
export function potentialCeiling(levers: IntakeLevers): number;

// src/engine/youth/youth-academy.ts (input estendido)
export interface YouthGenerationInput {
  clubId: number;
  academyLevel: number;
  youthCoachBonus: number;
  academyReputation: number;          // NOVO
  specialization: YouthSpecialization; // NOVO
  countryCode: string;
  rng: SeededRng;
}

// src/engine/youth/youth-progression.ts
export interface TierCandidate {
  playerId: number;
  age: number;
  currentOverall: number;
  effectivePotential: number;
  squadTier: SquadTier;
  seasonMinutesPercent: number; // 0-100
}
export interface SquadContext {
  firstTeamSize: number;
  starterAvgOverall: number; // benchmark (cf. ReportsYouthScreen top-11 avg)
}
export interface TierTransition {
  playerId: number;
  from: SquadTier;
  to: SquadTier;
  reason: 'age' | 'overall' | 'integration' | 'manual';
}
/** Rollover: transições automáticas (youth->reserve por idade/overall). Determinístico. */
export function evaluateTierTransitions(
  candidates: TierCandidate[], ctx: SquadContext, rng: SeededRng,
): TierTransition[];
/** Ação manual: jovem/reserva pode ser promovido ao elenco principal? */
export function evaluatePromotion(
  candidate: TierCandidate, ctx: SquadContext,
): { allowed: boolean; reason: 'ready' | 'too_raw' | 'squad_full' };

// src/engine/youth/youth-loans.ts (orquestradores — tocam DB)
export interface YouthLoanWeekResult { trackedPlayerIds: number[]; }
export function processYouthLoanWeek(
  db: DbHandle, saveId: number, season: number, week: number,
): Promise<YouthLoanWeekResult>;
export function recallYouthLoan(
  db: DbHandle, saveId: number, loanId: number, season: number, week: number,
): Promise<{ recalled: boolean; reason?: string }>;
/** Rollover: converte minutos/rating do empréstimo em ganho de desenvolvimento. */
export function settleYouthLoanDevelopment(
  db: DbHandle, saveId: number, endedSeason: number, rng: SeededRng,
): Promise<number[]>;

// src/engine/youth/academy-reputation.ts
export interface AcademyOutput {
  promotedToFirstTeam: number;   // jovens que viraram 'first' na temporada
  graduatesSoldForProfit: number;
  graduateStarterCount: number;  // produtos da base que são titulares hoje
}
export function computeAcademyReputationDelta(
  current: number, output: AcademyOutput,
): number; // delta clampado, somado e re-clampado [1,100] pelo chamador
export function applyAcademyReputation(
  db: DbHandle, saveId: number, season: number,
): Promise<void>;

// src/database/queries/youth.ts
export interface YouthLoanRow {
  id: number; playerId: number; parentClubId: number; loanClubId: number;
  startSeason: number; loanEnd: number;
  minutesPlayed: number; appearances: number; avgRating: number;
  recalled: 0 | 1;
}
export function getActiveYouthLoans(db: DbHandle, saveId: number, parentClubId: number): Promise<YouthLoanRow[]>;
export function getAcademyReputationRanking(
  db: DbHandle, saveId: number, countryId: number,
): Promise<Array<{ clubId: number; name: string; academyReputation: number; rank: number }>>;
```

---

## 4. Data flow

**Intake (rollover de temporada)** — `season-rollover.ts:41-105` (dentro de `runInTransaction`):
1. (existente) age players, `returnExpiredLoans`, `expireContracts`, `recalcSquadPotential`.
2. **NOVO** `settleYouthLoanDevelopment(db, saveId, endedSeason, rng)`: para cada `youth_loans` ativo, lê minutos/rating acumulados e aplica ganho de overall/potencial determinístico antes do jovem voltar.
3. (existente) `generateClubYouth` — agora monta `academyReputation` (de `clubs`) e `specialization` (do `staff.youth_specialization` do youth_coach) e chama `generateYouthPlayers` com input estendido; `previewIntake` já era a base da fórmula.
4. **NOVO** `evaluateTierTransitions` por clube: promove jovens elegíveis para `reserve`/`first` (UPDATE `players.squad_tier`).
5. **NOVO** `applyAcademyReputation`: calcula `AcademyOutput` da temporada, grava `clubs.academy_reputation` novo + linha em `academy_reputation_history`.
6. (existente) `applyOrdinaryRetirements`, `recalculateMarketValues`.

**Semana (game-loop)** — após apuração das partidas: `processYouthLoanWeek` percorre `youth_loans` ativos, soma os minutos/rating da rodada (a partir dos `player_stats`/eventos do clube emprestador) no acumulador da linha.

**Ação manual (tela)**: jogador toca "Promover" → `evaluatePromotion` (puro) valida → `promotePlayerTier` (query) faz UPDATE → `Toast` de sucesso. "Recall" → `recallYouthLoan` → restaura `club_id`/`loan_wage` (espelha `loan-returns.ts:53-60`) e marca `recalled=1`.

**Preview (tela)**: `previewIntake(levers)` puro, sem DB além de ler `clubs.youth_academy`, `clubs.academy_reputation`, e a ability/specialization do youth_coach.

---

## 5. Schema changes

Em **`src/database/schema.ts`** (`SCHEMA_SQL`) e **`src/store/database-store.ts`** (migração via `addColumnIfMissing`, padrão de `database-store.ts:72-152`):

```sql
-- players: tier de elenco (default 'first' para todo o seed legado)
ALTER TABLE players ADD COLUMN squad_tier TEXT NOT NULL DEFAULT 'first';
-- clubs: reputação de academia (1-100)
ALTER TABLE clubs ADD COLUMN academy_reputation INTEGER NOT NULL DEFAULT 50;
-- staff: especialização do youth coach
ALTER TABLE staff ADD COLUMN youth_specialization TEXT NOT NULL DEFAULT 'balanced';

CREATE TABLE IF NOT EXISTS youth_loans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id        INTEGER NOT NULL REFERENCES save_games(id),
  player_id      INTEGER NOT NULL REFERENCES players(id),
  parent_club_id INTEGER NOT NULL REFERENCES clubs(id),
  loan_club_id   INTEGER NOT NULL REFERENCES clubs(id),
  start_season   INTEGER NOT NULL,
  loan_end       INTEGER NOT NULL,
  minutes_played INTEGER NOT NULL DEFAULT 0,
  appearances    INTEGER NOT NULL DEFAULT 0,
  rating_sum     REAL    NOT NULL DEFAULT 0,  -- avg = rating_sum / appearances
  recalled       INTEGER NOT NULL DEFAULT 0,
  settled        INTEGER NOT NULL DEFAULT 0   -- 1 após settleYouthLoanDevelopment
);

CREATE TABLE IF NOT EXISTS academy_reputation_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id    INTEGER NOT NULL REFERENCES save_games(id),
  club_id    INTEGER NOT NULL REFERENCES clubs(id),
  season     INTEGER NOT NULL,
  reputation INTEGER NOT NULL CHECK (reputation BETWEEN 1 AND 100),
  delta      INTEGER NOT NULL,
  UNIQUE(save_id, club_id, season)  -- idempotente como club_reputation_history
);

CREATE INDEX IF NOT EXISTS idx_youth_loans_save_parent ON youth_loans(save_id, parent_club_id);
CREATE INDEX IF NOT EXISTS idx_youth_loans_active ON youth_loans(save_id, settled, recalled);
CREATE INDEX IF NOT EXISTS idx_players_save_tier ON players(save_id, club_id, squad_tier);
CREATE INDEX IF NOT EXISTS idx_academy_rep_hist ON academy_reputation_history(save_id, club_id, season);
```

Adicionar `'youth_loans'` e `'academy_reputation_history'` em `TABLE_NAMES` (`schema.ts:1-37`) para a migração save_id (`migration.ts:62-69`) cobri-las. Toda query nova é `save_id`-scoped; ids seguem `saveOffset`/`SAVE_ID_STRIDE` (`constants.ts:7-11`) — `youth_loans.id`/`academy_reputation_history.id` são AUTOINCREMENT como `club_finances`/`club_reputation_history` (não precisam de offset manual). O default `squad_tier='first'` garante que saves existentes não tenham jogadores some-tier; o intake passa a inserir `'youth'` explicitamente em `end-of-season-ops.ts:87`.

---

## 6. Error handling & edge cases

- **Save legado sem as colunas**: `addColumnIfMissing` checa `PRAGMA table_info` (`database-store.ts:32-34`); defaults preenchem o seed antigo. `squad_tier='first'` mantém comportamento atual (todos elegíveis) até o primeiro intake.
- **Promoção com elenco cheio**: `evaluatePromotion` retorna `{allowed:false, reason:'squad_full'}` se `firstTeamSize` ≥ limite — UI mostra motivo, sem mutação.
- **Recall após `loan_end` já processado**: `recallYouthLoan` valida `settled=0` e `recalled=0`; se a linha já foi liquidada retorna `{recalled:false}`. Espelha a guarda de `loan-returns.ts:49` (só age se o jogador ainda está no clube emprestador).
- **Jovem emprestado sem minutos**: `settleYouthLoanDevelopment` com `appearances=0` aplica ganho de desenvolvimento neutro/negativo pequeno (estagnou) — nunca divide por zero (`avg = appearances>0 ? rating_sum/appearances : 0`).
- **Determinismo**: count, potencial, specialization e settle de loan usam só `SeededRng` (`youth-academy.ts` já é o padrão). Preview é puro sem rng. Zero `ORDER BY RANDOM`, `Math.random`, `Date.now`, `new Date()`. Ranking ordena por `academy_reputation DESC, club_id ASC` (tie-break estável).
- **Clamp**: `academy_reputation` re-clampado `[1,100]` pelo chamador após delta (CHECK no schema reforça); potencial/overall clampados como em `youth-academy.ts:66-68`.
- **Loan a clube que faliu/sumiu**: `recallYouthLoan`/settle checam existência do clube como `loan-returns.ts:43`.

---

## 7. Testing strategy

TDD, better-sqlite3 **real** em memória (nunca mock), integração > unit quando toca DB/store. Cobertura por camada:

**`youth-levers.ts` (unit puro)**
- Golden: `previewIntake({level:5, coach:10, rep:90, spec:'balanced'})` → faixas maiores que `level:1`. `expectedGems` cresce monotonicamente com nível e reputação.
- Edge: `level:1, coach:0, rep:1` → `countMin>=2` (piso histórico do clamp `[2,5]` de `youth-academy.ts:101`). `potentialCeiling` nunca > 95 (`youth-academy.ts:112`).

**`youth-academy.ts` (determinismo)**
- Mesma seed + mesmo input estendido ⇒ jogadores idênticos (nome/atributos/potencial). Duas seeds diferentes ⇒ divergem.
- `specialization:'technical'` enviesa atributos técnicos vs `'balanced'` na mesma seed (comparar agregados).

**`youth-progression.ts` (unit puro)**
- `evaluateTierTransitions`: jovem com idade>limite e overall>=benchmark vira `reserve`/`first`; jovem cru permanece `youth`. Determinístico p/ mesma seed.
- `evaluatePromotion`: `ready` quando overall ≥ `starterAvgOverall - margem` (espelha o critério `isReady` de `ReportsYouthScreen.tsx:136-137`); `squad_full` quando elenco no teto.

**`youth-loans.ts` (integração com DB real)**
- `processYouthLoanWeek`: cria `youth_loans` ativo, insere `player_stats`/eventos da rodada no clube emprestador, roda a semana → `minutes_played`/`appearances`/`rating_sum` acumulam.
- `settleYouthLoanDevelopment`: empréstimo com muitos minutos+rating alto ⇒ ganho de overall/potencial > empréstimo com 0 minuto. Idempotente (`settled=1` não re-aplica).
- `recallYouthLoan`: restaura `club_id` ao `parent_club_id`, limpa `loan_wage` (cf. `loan-returns.ts:53-55`), marca `recalled=1`; segunda chamada retorna `{recalled:false}`.

**`academy-reputation.ts` (integração)**
- `applyAcademyReputation`: clube que promoveu 2 jovens a titular sobe reputação; clube sem produtos cai/estagna. Grava `academy_reputation_history` único por `(save,club,season)` (UNIQUE).

**Rollover integrado (`season-rollover.ts`)**
- Cenário golden: temporada completa com intake + 1 loan ativo + 1 promoção → ao fim: jovem voltou liquidado, tier transicionou, reputação atualizada, **save B na mesma seed = save A** (sweep de determinismo já é regra do projeto).

**save-isolation**: criar 2 saves, intake/loans em cada, garantir que queries de um nunca enxergam o outro (`saveOffset` + `save_id` em todo WHERE).

---

## 8. Dependencies & sequencing

- **Precede**: este épico depende do **Design System** (`2026-06-20-design-system-premium-design.md`, D3 componentes / D4 telas migradas). A reescrita de `YouthAcademyScreen` usa `Card`/`StatBar`/`Text`/`Icon`/`Button`/`EmptyState`/`Toast`/`useConfirm` do novo kit — **não** estilos inline crus como o stub atual (`YouthAcademyScreen.tsx:24-62`). Se o kit ainda não estiver pronto, a camada de engine/DB/queries pode ser entregue primeiro (não depende de UI) e a tela segue depois.
- **Reaproveita sem alterar contrato**: `getStaffEffects` (`staff-effects.ts:22`), `returnExpiredLoans` (`loan-returns.ts`), `recalcSquadPotential`/`generateClubYouth` (`end-of-season-ops.ts`), `buildYouthReport` (`youth-report.ts`), `calculateOverall`.
- **Sinergia com C1 (profundidade de carreira)**: o pipeline de tier e a reputação de academia alimentam métricas de dinastia de C1; entregar c2 antes/junto dá substância ao loop de longo prazo. Sem dependência de schema cruzada além de `players.squad_tier`.
- **Ordem interna sugerida**: (1) schema + migração + types; (2) `youth-levers` + estender `youth-academy`; (3) `youth-progression`; (4) `youth-loans` + game-loop hook; (5) `academy-reputation`; (6) wiring no `season-rollover`; (7) queries; (8) tela; (9) i18n.

---

## 9. Out of scope

- **Negociação de empréstimo com IA** (ofertas de outros clubes pedindo seus jovens emprestados): aqui só o loop *outbound* de desenvolvimento iniciado pelo jogador + tracking/recall. Negociação fica no épico de transferências/IA.
- **Tela/competição de reservas jogável** (calendário próprio de jogos da equipe B): o tier `reserve` existe como estado de pipeline, sem fixtures dedicados nesta entrega.
- **Geração de academias regionais / nações de scouting** além dos 5 `NAME_POOLS` atuais (`youth-academy.ts:22-43`).
- **Reescrita do `ReportsYouthScreen`**: continua lendo o elenco U21 como hoje; ganha no máximo um link cruzado para a nova tela.
- **Wonderkids/hidden gems com fog-of-war de scouting** sobre o intake: o preview é determinístico e revela faixas, não esconde prospectos.
- **Balanceamento fino de levers** (valores exatos de multiplicadores): definidos na implementação via baselines de balanceamento (padrão W6), não fixados neste design.

---

## 10. Spec self-review

- **Placeholder scan**: sem "TBD"/"???"/lorem. Todas as fórmulas citam ou estendem código real.
- **Consistência interna**: `squad_tier` aparece em types, schema, queries, progression e tela coerentemente; defaults (`'first'`/`50`/`'balanced'`) repetidos igual em §3/§5/§6; `GEM_THRESHOLD=80` único.
- **Refs de código verificadas** (lidas nesta sessão):
  - `src/engine/youth/youth-academy.ts:96-126` (gerador, clamps, fórmulas) ✔
  - `src/engine/season/end-of-season-ops.ts:56-106` (insert de intake) ✔
  - `src/engine/season-rollover.ts:41-105` (ordem da transação de rollover) ✔
  - `src/engine/transfer/loan-returns.ts:16-66` (retorno de empréstimo, guardas) ✔
  - `src/database/schema.ts:57-108,402-410` (clubs/players/club_reputation_history; check 1-5) ✔
  - `src/store/database-store.ts:32-34,72,91,150-152` (`addColumnIfMissing`, padrão de migração) ✔
  - `src/database/migration.ts:62-69` (`TABLE_NAMES` → save_id) ✔
  - `src/database/queries/clubs.ts:24-43` (`rowToClub`), `queries/players.ts:116-143` (getters de elenco) ✔
  - `src/engine/staff/staff-effects.ts:22` (`youthQualityBonus`) ✔
  - `src/engine/reports/youth-report.ts:10,43-71` + `src/screens/reports/ReportsYouthScreen.tsx:136-137` (critério "ready") ✔
  - `src/screens/squad/YouthAcademyScreen.tsx:6-62` (stub atual) · `RootNavigator.tsx:112` · `SquadListScreen.tsx:109` ✔
  - `src/database/constants.ts:7-11` (`SAVE_ID_STRIDE`/`saveOffset`) ✔
- **Determinismo**: todos os caminhos de engine usam `SeededRng`; preview é puro; ordenações têm tie-break estável. ✔
