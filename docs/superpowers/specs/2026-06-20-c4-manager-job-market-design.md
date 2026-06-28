# Design: Job market do técnico (mercado pleno + contrato + spell de desemprego)

**Epic:** c4-job-market · **Data:** 2026-06-20 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict
**Goal:** Transformar o loop de demissão-resgate do W2 num mercado de técnicos pleno — ofertas por faixa de reputação e ambição do clube, contrato do técnico (duração, cláusula de demissão, expectativa de fim de mandato) e um spell de DESEMPREGO navegável (decaimento de reputação + dreno de poupança), tornando demissão uma continuação real em vez de game-over imediato.

## 1. Problema / estado atual (aterrado no código)

O W2 (plano `docs/superpowers/plans/2026-06-14-w2-rescue-offers.md`) já fechou o corte mínimo do loop de carreira, e está **mergeado**. Hoje existe:

- **Geração de ofertas por banda de reputação**, mas só dois modos crus: up-band quando retido e down-band ("resgate") quando demitido — `src/engine/board/job-offers-engine.ts:25` (`generateJobOffers`) e `:55` (`generateRescueOffers`). Ambas filtram por `c.reputation > / < currentClubReputation && c.reputation <= managerReputation + MANAGER_JOB_OFFER_STEP` e cortam em `MANAGER_JOB_OFFER_MAX` (`src/engine/balance.ts:34-35`, valores `12` e `3`). **Limitações:** (a) não há sinal de **ambição do clube** — um clube grande estagnado e um clube pequeno faminto ofertam com a mesma probabilidade; (b) a seleção é determinística por `reputation desc / id asc`, sem usar o `rng` recebido (`generateJobOffers` recebe `input.rng` mas nunca o consome — `src/engine/board/job-offers-engine.ts:25-40`); (c) não há **bandas intermediárias** (lateral / step-up agressivo) nem distinção de quão "quente" é a oferta.

- **Reputação do técnico persistida e cross-clube** — `manager_reputation INTEGER NOT NULL DEFAULT 50` em `src/database/schema.ts:315` + `addColumnIfMissing(... 'manager_reputation' ...)` em `src/store/database-store.ts:107`; acúmulo de fim de temporada puro em `src/engine/board/manager-reputation-engine.ts:26` (`computeManagerReputationDelta`), persistido em `src/engine/season/season-end-eval.ts:198-209` via `getManagerReputation`/`setManagerReputation` (`src/database/queries/save.ts:38,45`). **Limitação:** a reputação só se move em fim de temporada com clube. Durante um **spell de desemprego** ela fica congelada — não há decaimento, então ficar parado não tem custo de carreira.

- **Demissão → resgate → continuação** — `evaluateSeasonEndBoard` ramifica em `isManagerDismissed(board.consequence)` (`src/engine/season/season-end-eval.ts:223`) e a tela `src/screens/EndOfSeasonScreen.tsx:168-207` roda `runSeasonTransition` + `setUnemployed(true)` + abre o gate de desemprego (resgate) OU `markSaveEnded` → GameOver (sem ofertas). O gate `unemployed` existe em `src/database/schema.ts:317`, `src/store/database-store.ts:111`, queries `setUnemployed`/`isUnemployed` (`src/database/queries/save.ts:64,68`), store (`src/store/game-store.ts:48,192`) e roteamento em `src/screens/home/HomeScreen.tsx:183-186` (gate `jobOffersPending` → `JobOffers`). A `JobOffersScreen` (`src/screens/career/JobOffersScreen.tsx:25`) já tem modo desempregado (header/sub/decline-all — i18n em `src/i18n/pt.ts:1007-1009`). **Limitações:** (a) o spell de desemprego dura **exatamente uma virada** — ou aceita uma oferta-resgate imediata ou a carreira acaba; não há um estado de "desempregado por N temporadas procurando emprego"; (b) **não existe contrato do técnico** — ao assinar (`src/engine/board/accept-job-offer.ts:32`) reseta-se `board_trust` e gera-se objetivo, mas não há duração de mandato, cláusula de demissão (severance) nem expectativa contratual; (c) demissão não tem **custo financeiro pessoal** nem o desemprego tem dreno.

- **`runSeasonTransition`** (`src/engine/season/season-transition.ts:25`) faz aging de assistentes + promoção/rebaixamento + `rolloverSeason`. É o orquestrador que vira o mundo e é reusado tanto no ramo normal quanto no demitido. **Não tem hook** para um técnico sem clube (hoje o ramo demitido sempre passa o `playerClubId` antigo).

- **E2E de career-loop** — `__tests__/e2e/career-loop.e2e.test.ts:41,76,93` cobre: 3 temporadas com troca; demitido+resgate aceito; demitido sem aceitar (encerra). Helper `endSeasonHeadless` (`__tests__/e2e/test-helpers.ts:262`) espelha a `EndOfSeasonScreen`. **Limitação:** não cobre spell de desemprego com mais de uma virada, decaimento de reputação, dreno de poupança nem expiração/renovação de contrato.

**Resumo:** o esqueleto existe; falta profundidade — bandas e ambição na geração, contrato do técnico como entidade persistida, e um spell de desemprego que seja um estado de jogo (com custo) e não uma bifurcação instantânea.

## 2. Approach

Estender as três peças já existentes sem reescrever o loop:

1. **Mercado pleno (geração de ofertas):** introduzir **ambição do clube** (`clubAmbition`) como peso multiplicativo na seleção e fazer `generateJobOffers`/`generateRescueOffers` realmente **consumirem o `rng`** para sortear entre os candidatos qualificados (ponderado por ambição + proximidade de banda), em vez do corte puramente lexicográfico. Adicionar **bandas nomeadas** (`step_up`, `lateral`, `rescue`) num único `generateManagerOffers` parametrizado, mantendo `generateJobOffers`/`generateRescueOffers` como wrappers finos (compat com `season-end-eval.ts` e os testes do W2). `clubAmbition` deriva de dados já existentes (reputação do clube vs. divisão — um clube de reputação alta numa divisão baixa é "faminto"); fica num helper puro.

2. **Contrato do técnico:** nova tabela `manager_contracts` (1 linha ativa por save, save-isolated) com `club_id`, `start_season`, `end_season`, `wage_per_season`, `release_clause` (severance pago ao técnico em caso de demissão), `expectation` (objetivo contratual macro). Criada/assinada em `acceptJobOffer` e na criação de jogo (NewGame), lida na `JobOffersScreen` e numa nova `ManagerProfileScreen` (perfil de carreira). A **expiração** de contrato é avaliada no fim de temporada: contrato vencido sem renovação → o técnico vira agente livre (entra no spell de desemprego mesmo sem ter sido demitido, mas sem severance).

3. **Spell de desemprego como estado:** o `unemployed` deixa de durar "uma virada". Adicionar `unemployed_since_season` ao save. Enquanto desempregado, **cada virada de temporada** (uma nova "rodada de mercado") aplica: decaimento de reputação (`MANAGER_REP_UNEMPLOYED_DECAY` por temporada) e dreno de poupança pessoal (`manager_savings -= MANAGER_UNEMPLOYED_DRAIN`). Gera-se um novo lote de ofertas-resgate a cada rodada (reputação decaída → bandas menores). A carreira só termina quando o técnico **opta** por encerrar (decline-all explícito) ou quando reputação/poupança chegam a um piso terminal. Demissão paga severance (`release_clause`) para a poupança, dando fôlego ao spell.

**Determinismo:** toda escolha de oferta usa `SeededRng` (`src/engine/rng`) derivado de `season`+`saveId` como já feito em `season-end-eval.ts:235` (`offerRng`). Zero `Math.random`/`Date.now`/`ORDER BY RANDOM`.

**Alternativa descartada — "agentes técnicos rivais" (mercado de IA simétrico):** modelar técnicos de IA disputando as mesmas vagas (clubes demitem/contratam técnicos fictícios, criando escassez real de vagas). Descartada: explode o escopo (precisa de entidades técnico-IA, ciclo de contratação rival, persistência por clube) e o jogo é single-manager — o valor percebido (vagas "somem" se você demora) não compensa o custo e o risco de não-determinismo/flaky (já houve flaky no mercado de IA — ver MEMORY). Mantemos o mercado **centrado no jogador**: ofertas são geradas sob demanda para o save, não simuladas globalmente.

## 3. Architecture & components

### Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/engine/board/job-offers-engine.ts` | Alterar | Adicionar `clubAmbition`, `OfferBand`, `generateManagerOffers` (consome `rng`, pondera por ambição/banda); refatorar `generateJobOffers`/`generateRescueOffers` como wrappers. |
| `src/engine/board/club-ambition.ts` | Criar | `computeClubAmbition(input)` puro: reputação×divisão → escalar 0..1 de "fome" de contratar. |
| `src/engine/board/manager-contract-engine.ts` | Criar | Puro: `buildManagerContract(input)` (duração/wage/release/expectation por banda+reputação); `isContractExpiring(contract, season)`. |
| `src/engine/board/manager-reputation-engine.ts` | Alterar | Adicionar `applyUnemploymentDecay(current)` puro (decaimento por temporada parada). |
| `src/database/schema.ts` | Alterar | Nova tabela `manager_contracts`; colunas `unemployed_since_season`, `manager_savings` em `save_games`; índice. |
| `src/store/database-store.ts` | Alterar | `addColumnIfMissing` para as colunas novas (migração espelhada). |
| `src/database/queries/manager-contract.ts` | Criar | `upsertManagerContract`, `getActiveManagerContract`, `clearManagerContract` (save-isolated). |
| `src/database/queries/save.ts` | Alterar | `getManagerSavings`/`setManagerSavings`; `getUnemployedSince`/`setUnemployedSince`. |
| `src/engine/board/accept-job-offer.ts` | Alterar | Após o switch, gravar contrato via `buildManagerContract` + `upsertManagerContract`. |
| `src/engine/season/season-end-eval.ts` | Alterar | Avaliar expiração de contrato; passar `clubAmbition` aos candidatos; ramo de spell de desemprego (decaimento+dreno+novo lote). |
| `src/engine/season/unemployment-spell.ts` | Criar | Orquestrador (estilo `game-loop.ts`): `advanceUnemploymentSeason(db, {saveId, season, rng})` — decaimento, dreno, novo lote de ofertas, checagem de piso terminal. |
| `src/screens/career/JobOffersScreen.tsx` | Alterar | Exibir contrato proposto (duração/wage/cláusula) por oferta; no modo desempregado mostrar poupança/rep decaída; migrar para kit do Design System. |
| `src/screens/career/ManagerProfileScreen.tsx` | Criar | Perfil de carreira: reputação, contrato atual, poupança, histórico de clubes. Kit do Design System. |
| `src/navigation/types.ts` + stack | Alterar | Registrar `ManagerProfile`. |
| `src/i18n/pt.ts` + `src/i18n/en.ts` | Alterar | Chaves `joboffers.contract_*`, `managerprofile.*`, `unemployed.*` (paridade). |
| `__tests__/...` | Criar | Ver §7. |

### Contract (assinaturas TS exatas)

```ts
// src/engine/board/club-ambition.ts
export interface ClubAmbitionInput {
  reputation: number;   // 1..100
  divisionLevel: number; // 1 = topo
}
/** Fome de contratar: clube de reputação alta em divisão baixa puxa para 1; equilibrado ~0.5. */
export function computeClubAmbition(input: ClubAmbitionInput): number; // 0..1

// src/engine/board/job-offers-engine.ts  (estendido)
export type OfferBand = 'step_up' | 'lateral' | 'rescue';
export interface ManagerOfferCandidate extends JobOfferCandidateClub {
  ambition: number; // 0..1 (computeClubAmbition)
}
export interface GenerateManagerOffersInput {
  managerReputation: number;
  currentClubId: number | null;       // null quando desempregado (sem clube atual)
  currentClubReputation: number;      // reputação de referência; usar managerReputation quando sem clube
  candidates: ManagerOfferCandidate[];
  bands: OfferBand[];                  // quais bandas considerar
  rng: SeededRng;
}
export interface ManagerOffer { offeringClubId: number; band: OfferBand }
/** Filtra por banda+ceiling, pondera por (ambição × proximidade de banda) e sorteia até MANAGER_JOB_OFFER_MAX. */
export function generateManagerOffers(input: GenerateManagerOffersInput): ManagerOffer[];
// wrappers (compat W2): generateJobOffers → bands:['step_up','lateral']; generateRescueOffers → bands:['rescue']

// src/engine/board/manager-contract-engine.ts
export interface ManagerContractInput {
  clubReputation: number;
  managerReputation: number;
  band: OfferBand;
  startSeason: number;
  rng: SeededRng;
}
export interface ManagerContractTerms {
  startSeason: number;
  endSeason: number;           // startSeason + duração (2..4)
  wagePerSeason: number;       // derivado de reputação do clube
  releaseClause: number;       // severance pago ao técnico se demitido
  expectation: number;         // alvo macro (ex.: reputação mínima a manter)
}
export function buildManagerContract(input: ManagerContractInput): ManagerContractTerms;
export function isContractExpiring(endSeason: number, currentSeason: number): boolean;

// src/engine/board/manager-reputation-engine.ts (add)
/** Decaimento de reputação por temporada de desemprego. Clampa ao piso MANAGER_REP_FLOOR. */
export function applyUnemploymentDecay(current: number): { next: number; delta: number };

// src/database/queries/manager-contract.ts
export interface ManagerContractRow extends ManagerContractTerms { clubId: number }
export async function upsertManagerContract(db: DbHandle, saveId: number, c: ManagerContractRow): Promise<void>;
export async function getActiveManagerContract(db: DbHandle, saveId: number): Promise<ManagerContractRow | null>;
export async function clearManagerContract(db: DbHandle, saveId: number): Promise<void>;

// src/database/queries/save.ts (add)
export async function getManagerSavings(db: DbHandle, saveId: number): Promise<number>;
export async function setManagerSavings(db: DbHandle, saveId: number, v: number): Promise<void>;
export async function getUnemployedSince(db: DbHandle, saveId: number): Promise<number | null>;
export async function setUnemployedSince(db: DbHandle, saveId: number, season: number | null): Promise<void>;

// src/engine/season/unemployment-spell.ts
export interface AdvanceUnemploymentParams { saveId: number; season: number; rng: SeededRng }
export interface AdvanceUnemploymentResult {
  reputationAfter: number;
  savingsAfter: number;
  generatedOfferClubIds: number[];
  terminal: boolean; // reputação/poupança no piso → carreira encerra
}
export async function advanceUnemploymentSeason(db: DbHandle, p: AdvanceUnemploymentParams): Promise<AdvanceUnemploymentResult>;
```

Novas constantes em `src/engine/balance.ts` (próximas de `MANAGER_JOB_OFFER_*`/`MANAGER_REP_*`):
```ts
export const MANAGER_REP_UNEMPLOYED_DECAY = -4;   // por temporada parada
export const MANAGER_REP_FLOOR = 1;               // piso de reputação
export const MANAGER_CONTRACT_MIN_SEASONS = 2;
export const MANAGER_CONTRACT_MAX_SEASONS = 4;
export const MANAGER_SAVINGS_INITIAL = 0;
export const MANAGER_UNEMPLOYED_DRAIN = 1;        // unidade de poupança drenada/temporada
export const MANAGER_SAVINGS_FLOOR = -3;          // poupança terminal → encerra carreira
export const MANAGER_OFFER_AMBITION_WEIGHT = 0.6; // peso da ambição no sorteio ponderado
```

## 4. Data flow

**Assinatura (aceitar oferta):**
`JobOffersScreen.handleAccept` → `acceptJobOffer` (switch clube + reset trust + objetivo, igual hoje em `accept-job-offer.ts:43-67`) → **novo:** `buildManagerContract({band, clubReputation, managerReputation, startSeason})` → `upsertManagerContract` → se vinha de spell, `setUnemployedSince(null)` + `setUnemployed(false)` (espelha o store em `JobOffersScreen.tsx:84-87`).

**Fim de temporada (retido):** `evaluateSeasonEndBoard` → após acúmulo de manager rep, ler `getActiveManagerContract`; se `isContractExpiring(end, newSeason)` e sem renovação → não gera up-band, mas marca `expiringContract` no resultado (UI oferece renovação/saída). Candidatos passam a carregar `ambition = computeClubAmbition(...)` montado a partir de `allClubs` + `divByLeague` (já disponíveis em `season-end-eval.ts:216-222`).

**Fim de temporada (demitido):** ramo `isManagerDismissed` continua em `EndOfSeasonScreen.tsx:168`, mas agora: `runSeasonTransition` + `setUnemployed(true)` + `setUnemployedSince(season)` + creditar `release_clause` do contrato à poupança (`setManagerSavings(savings + clause)`) + `clearManagerContract`. Gate de desemprego abre como hoje.

**Spell de desemprego (nova virada sem clube):** quando o técnico desempregado avança a temporada sem aceitar, a `EndOfSeasonScreen`/`HomeScreen` chama `advanceUnemploymentSeason(db, {saveId, season, rng})`: aplica `applyUnemploymentDecay`, dreno de poupança, gera novo lote via `generateManagerOffers(bands:['rescue'], currentClubId:null, currentClubReputation:managerReputation)` e persiste; se `terminal` → `markSaveEnded` → GameOver. Caso contrário, reabre o gate `jobOffersPending`.

**Determinismo:** `rng = new SeededRng(season * 6151 + saveId)` (mesma fórmula de `offerRng` em `season-end-eval.ts:235`) propagado a `generateManagerOffers` e `buildManagerContract` (este usa `season * 31337 + clubId`, espelhando `season-end-board.ts:97`).

## 5. Schema changes

**`save_games` (colunas novas)** — em `src/database/schema.ts` (bloco `CREATE TABLE save_games`, junto de `unemployed` na linha 317) **e** `src/store/database-store.ts` (`addColumnIfMissing`, junto da linha 111):
```sql
unemployed_since_season INTEGER,                       -- NULL quando empregado
manager_savings         INTEGER NOT NULL DEFAULT 0
```

**`manager_contracts` (tabela nova)** — `src/database/schema.ts`, registrar nome no array de tabelas (junto de `job_offers` na linha 33) e criar com `CREATE TABLE IF NOT EXISTS`:
```sql
CREATE TABLE IF NOT EXISTS manager_contracts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id           INTEGER NOT NULL REFERENCES save_games(id),
  club_id           INTEGER NOT NULL REFERENCES clubs(id),
  start_season      INTEGER NOT NULL,
  end_season        INTEGER NOT NULL,
  wage_per_season   INTEGER NOT NULL,
  release_clause    INTEGER NOT NULL,
  expectation       INTEGER NOT NULL,
  UNIQUE(save_id)                       -- 1 contrato ativo por save
);
CREATE INDEX IF NOT EXISTS idx_manager_contracts_save ON manager_contracts(save_id);
```
Como `manager_contracts` é nova, em produção (DB já existente) o `CREATE TABLE IF NOT EXISTS` no boot de `database-store.ts` cria-a; saves antigos simplesmente não terão linha (`getActiveManagerContract` → `null`, tratado como "sem contrato" / contrato implícito não-bloqueante). **Save-isolation:** toda query recebe `(db, saveId, ...)` e filtra por `save_id`, seguindo o padrão de `src/database/queries/save.ts` e `job-offers.ts`. Sem coluna sintética de stride — o save-isolation aqui é por `save_id` explícito (padrão da casa; `SAVE_ID_STRIDE` aplica-se a IDs de entidades semeadas, não a flags do save).

## 6. Error handling & edge cases

- **Save antigo sem contrato** (`getActiveManagerContract` → `null`): tratar como técnico sem cláusula — demissão credita severance 0; expiração não dispara. Sem crash.
- **Nenhum candidato qualificado** (reputação decaída abaixo de qualquer clube): `generateManagerOffers` retorna `[]`. No spell, lote vazio numa virada **não** encerra a carreira sozinho — só o piso de reputação/poupança encerra; assim o jogador não fica preso sem ação. UI mostra `joboffers.empty` + botão "avançar/encerrar".
- **Poupança/reputação no piso** (`MANAGER_SAVINGS_FLOOR` / `MANAGER_REP_FLOOR`): `advanceUnemploymentSeason` retorna `terminal:true` → carreira encerra deterministicamente (não depende de oferta).
- **`currentClubId: null` no desemprego:** `generateManagerOffers` ignora o filtro `c.id !== currentClubId` quando `null` e usa `managerReputation` como `currentClubReputation` de referência (sem clube, não há "abaixo do atual" — todos os clubes ≤ ceiling qualificam para `rescue`).
- **Renovação não aceita + contrato expirado:** vira agente livre **sem** severance (saída natural, não demissão) → entra no spell. Distinto de demissão (que paga cláusula).
- **Aceitar oferta durante spell:** `acceptJobOffer` grava novo contrato e zera `unemployed_since_season`; severance acumulada na poupança permanece (é do técnico).
- **Determinismo sob retry:** `advanceUnemploymentSeason` é idempotente por `(saveId, season)` — reexecutar a mesma virada com o mesmo seed produz o mesmo lote (usa `UNIQUE(save_id, season, offering_club_id)` de `job_offers` em `schema.ts:331` para não duplicar).
- **`Alert.alert` é no-op no web** (MEMORY `reference_rn_web_alert`): a confirmação de aceitar oferta (`JobOffersScreen.tsx:172`) deve migrar para o `useConfirm` do kit do Design System, não depender de `Alert`.

## 7. Testing strategy (TDD, better-sqlite3 real)

Engine puro primeiro (unit), depois orquestradores e e2e com SQLite real em memória — **nunca** mock (regra do subprojeto). Escrever teste antes da implementação em tudo que toca `engine/`/`database/`.

**Unit — puros (`__tests__/engine/board/`):**
- `club-ambition.test.ts`: clube rep alta + divisão baixa → ambição > clube equilibrado; clamp 0..1; monotonicidade.
- `manager-offers.test.ts` (golden + edge): banda `step_up` exclui clubes ≤ atual; `rescue` exclui clubes ≥ atual; ceiling `managerRep + STEP` respeitado; **mesmo seed → mesmo lote**; seeds diferentes → lotes possivelmente diferentes (consome rng); ambição maior aumenta probabilidade (rodar N seeds, comparar frequência); `currentClubId:null` qualifica todos ≤ ceiling. Wrappers `generateJobOffers`/`generateRescueOffers` mantêm o comportamento dos testes do W2 (`__tests__/engine/board/rescue-offers.test.ts`) — não regredir.
- `manager-contract-engine.test.ts`: duração ∈ [MIN,MAX]; `wagePerSeason` cresce com reputação do clube; `releaseClause` proporcional; `isContractExpiring` true só quando `currentSeason >= endSeason`.
- `manager-reputation-engine.test.ts` (estender): `applyUnemploymentDecay` aplica `MANAGER_REP_UNEMPLOYED_DECAY` e clampa em `MANAGER_REP_FLOOR`.

**Queries (`__tests__/database/queries/`, padrão `seedTestDb` + `TEST_SAVE_ID`):**
- `manager-contract.test.ts`: upsert → get retorna termos; `UNIQUE(save_id)` substitui contrato; `clearManagerContract` → get `null`; isolamento por `save_id` (dois saves não vazam).
- `manager-savings.test.ts`: set/get savings; `setUnemployedSince(null)` → `getUnemployedSince` null.

**Orquestrador (`__tests__/engine/season/unemployment-spell.test.ts`):** contexto e2e real; setar `unemployed` + `unemployed_since_season`; `advanceUnemploymentSeason` decai rep, drena poupança, gera lote, e retorna `terminal:true` quando savings/rep atingem piso. Idempotência: rodar 2× a mesma virada não duplica ofertas.

**E2E (`__tests__/e2e/career-loop.e2e.test.ts` — estender):**
- *golden:* demitido → spell de **2+ temporadas** desempregado (decaimento visível, poupança drenando) → aceita oferta-resgate de banda menor → continua e joga a temporada seguinte sem crash; reputação pós-spell < reputação na demissão.
- *golden:* contrato expira sem renovação → vira agente livre (sem severance) → spell.
- *edge:* spell até o piso terminal → `markSaveEnded` (ended=1).
- *determinismo:* dois saves, mesmo seed, mesmo caminho de spell → estado-chave idêntico (espelha o caso `:104` existente).
Estender `endSeasonHeadless`/adicionar `advanceUnemploymentHeadless` no `test-helpers.ts` (`:262`) para dirigir o spell sem UI. Rodar o arquivo 5× verde (anti-flaky, alinhado ao W2 Task 6).

**DoD:** `npx tsc --noEmit` + `npx jest` verdes; paridade i18n (`__tests__/i18n/parity.test.ts`); `JobOffersScreen` e `ManagerProfileScreen` validadas no browser via Playwright MCP (UI nova).

## 8. Dependencies & sequencing

- **Precede tudo:** W2 (`2026-06-14-w2-rescue-offers.md`) — **já mergeado**. C4 estende, não substitui.
- **Design System (`2026-06-20-design-system-premium-design.md`):** a `JobOffersScreen` e a nova `ManagerProfileScreen` devem usar o novo kit (Card/Button/StatBar/Text semânticos/Icon/EmptyState/Toast/`useConfirm`), não estilos inline crus como os atuais de `JobOffersScreen.tsx:206-263`. Idealmente C4 entra **após** o épico de Design System estabilizar o kit; se entrar antes, usar os componentes existentes (`SectionCard`, `StatBar`, `EmptyState` em `src/components/`) e marcar a migração de `Alert`→`useConfirm` como dependência de D3/D4. **Sequência recomendada:** Design System → C4.
- **Ordem interna:** (1) balance consts + schema/migração + queries; (2) engine puro (ambição, ofertas, contrato, decaimento) com testes; (3) `acceptJobOffer` grava contrato; (4) `season-end-eval`/`unemployment-spell`; (5) telas + i18n + nav; (6) e2e estendido. Engine antes de UI.
- **Sem dependência** de outros épicos C; consome apenas `clubs`/`leagues`/`save_games`/`job_offers` já existentes.

## 9. Out of scope

- Técnicos de IA rivais / escassez global de vagas (ver Alternativa descartada §2).
- Negociação salarial interativa (contraproposta de wage/duração) — o contrato é gerado, não negociado nesta iteração.
- Staff/comissão técnica acompanhando o técnico entre clubes (assistentes seguem o clube, não o manager).
- Histórico narrativo de carreira além do já coberto por `season-history` e pelo perfil básico.
- Reputação derivada de mídia/torcida durante o spell (só decaimento por inatividade).
- Mudança nas regras de demissão do board (`trust-engine.ts`/`season-end-board.ts`) — C4 reage à demissão, não a redefine.

## 10. Spec self-review

- **Placeholder scan:** sem "TBD"/"???"/"FIXME". Todas as assinaturas TS e SQL estão concretas; constantes nomeadas com valores propostos.
- **Refs de código verificadas (lidas nesta sessão):** `job-offers-engine.ts:25,55` (rng não consumido confirmado); `balance.ts:34-35,26-32`; `manager-reputation-engine.ts:26`; `season-end-eval.ts:198-244` (ramo `isManagerDismissed`, candidatos com `divByLeague`); `accept-job-offer.ts:32-77`; `season-end-board.ts:97` (seed objetivo); `season-outcome.ts:4`; `season-transition.ts:25`; `schema.ts:304-332` (save_games + job_offers, `unemployed` na 317); `database-store.ts:107-111` (migrações); `save.ts:38-82` (queries existentes); `game-store.ts:48,192`; `HomeScreen.tsx:183-186` (gate); `JobOffersScreen.tsx:18,84-130,172` (modo desempregado, Alert); `EndOfSeasonScreen.tsx:139-207`; `test-helpers.ts:242-330`; `career-loop.e2e.test.ts:41-109`; i18n `pt.ts:999-1009`.
- **Consistência interna:** `generateManagerOffers` retorna `band` para `acceptJobOffer` derivar o contrato (banda → duração/wage). Wrappers preservam o contrato público do W2 (testes não regridem). `unemployed_since_season` + `manager_savings` cobrem o estado de spell que o `unemployed` booleano sozinho não modela. Piso terminal é a única condição de game-over automática no spell — alinhado a "demissão = continuação".
- **Riscos:** (a) ponderação por ambição é testável por frequência mas não por igualdade exata — testes usam tolerância/contagem de N seeds; (b) migração de `Alert`→`useConfirm` depende do kit do Design System estar pronto — explicitado em §8; (c) idempotência do spell apoia-se no `UNIQUE` de `job_offers` (`schema.ts:331`) — coberto em teste.
