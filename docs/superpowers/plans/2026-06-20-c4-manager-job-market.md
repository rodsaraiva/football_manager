# C4 — Manager Job Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação (2-5 min). NUNCA pule "escrever teste → ver falhar → implementar → ver passar". Subagents NÃO commitam — o passo "commit" descreve o que o orquestrador commita.

**Goal:** Transformar o loop de demissão-resgate do W2 num mercado de técnicos pleno: ofertas ponderadas por ambição do clube + banda, contrato do técnico (duração/wage/cláusula/expectativa) e um spell de DESEMPREGO navegável (decaimento de reputação + dreno de poupança), tornando demissão uma continuação real em vez de game-over imediato.

**Architecture:** Estender as três peças do W2 sem reescrever o loop. (1) `generateManagerOffers` parametrizado por banda consome o `SeededRng` e pondera candidatos por `computeClubAmbition × proximidade de banda`; `generateJobOffers`/`generateRescueOffers` viram wrappers finos (compat W2). (2) Nova tabela `manager_contracts` (1 contrato ativo por save) gerada em `acceptJobOffer` via `buildManagerContract`. (3) `unemployed` deixa de durar uma virada: novas colunas `unemployed_since_season`+`manager_savings` no `save_games`, e `advanceUnemploymentSeason` aplica decaimento+dreno+novo lote por virada até um piso terminal. Engine puro antes de UI; tudo determinístico.

**Tech Stack:** TS 5.9 strict · Jest 29 + ts-jest · better-sqlite3 REAL em testes · `SeededRng` (`@/engine/rng`) · Zustand · React Navigation v7.

**Convenções:** TDD obrigatório em `engine/`/`database/`/`store/`; engine puro (ZERO React/Expo); SQLite REAL nos testes (NUNCA mock); colunas/tabelas novas em `src/database/schema.ts` E `src/store/database-store.ts` (migração espelhada via `addColumnIfMissing`/`execAsync`); save-isolation por `save_id` explícito em toda query (padrão de `save.ts`/`job-offers.ts`); ZERO `Math.random`/`Date.now`/`ORDER BY RANDOM` no engine; constantes em `src/engine/balance.ts`; i18n pt/en com paridade (`__tests__/i18n/parity.test.ts`); tokens de `@/theme`. Branch `feat/c4-job-market`. Commits terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Precedente a espelhar:**
- Geração de ofertas: `src/engine/board/job-offers-engine.ts` (`generateJobOffers:25`, `generateRescueOffers:55`).
- Acúmulo de rep: `src/engine/board/manager-reputation-engine.ts:26` (`computeManagerReputationDelta`).
- Queries de save: `src/database/queries/save.ts` (`getManagerReputation:38`, `setManagerReputation:45`, `setUnemployed:64`).
- Queries com tabela própria: `src/database/queries/job-offers.ts` (`insertJobOffer`, `getPendingJobOffers`).
- Assinatura de contrato: `src/engine/board/accept-job-offer.ts:32`.
- Orquestrador de virada: `src/engine/season/season-transition.ts:25`, `src/engine/season/season-end-eval.ts:59`.
- Seed determinístico de oferta: `season-end-eval.ts:235` / `test-helpers.ts:280` → `new SeededRng(season * 6151 + saveId)`.
- E2E + helper: `__tests__/e2e/career-loop.e2e.test.ts`, `__tests__/e2e/test-helpers.ts:262` (`endSeasonHeadless`).
- Migração espelhada: `src/store/database-store.ts:107-122`.

---

## File Structure

- **Create** `src/engine/board/club-ambition.ts` — `computeClubAmbition` puro (reputação × divisão → fome 0..1).
- **Create** `src/engine/board/manager-contract-engine.ts` — `buildManagerContract`, `isContractExpiring` (puro).
- **Create** `src/database/queries/manager-contract.ts` — `upsertManagerContract`/`getActiveManagerContract`/`clearManagerContract` (save-isolated).
- **Create** `src/engine/season/unemployment-spell.ts` — `advanceUnemploymentSeason` (orquestrador: decaimento+dreno+novo lote+piso terminal).
- **Modify** `src/engine/balance.ts:35` — constantes `MANAGER_REP_UNEMPLOYED_DECAY`, `MANAGER_REP_FLOOR`, `MANAGER_CONTRACT_*`, `MANAGER_SAVINGS_*`, `MANAGER_UNEMPLOYED_DRAIN`, `MANAGER_OFFER_AMBITION_WEIGHT`.
- **Modify** `src/engine/board/job-offers-engine.ts` — `OfferBand`, `ManagerOfferCandidate`, `generateManagerOffers` (consome rng + ambição); `generateJobOffers`/`generateRescueOffers` viram wrappers (compat W2 mantida).
- **Modify** `src/engine/board/manager-reputation-engine.ts:45` — `applyUnemploymentDecay`.
- **Modify** `src/database/schema.ts:36,317,321` — tabela `manager_contracts` + colunas `unemployed_since_season`/`manager_savings` em `save_games` + nome no array de tabelas.
- **Modify** `src/store/database-store.ts:111` — `addColumnIfMissing` das colunas novas + `execAsync` da tabela `manager_contracts`.
- **Modify** `src/database/queries/save.ts:73` — `getManagerSavings`/`setManagerSavings`/`getUnemployedSince`/`setUnemployedSince`.
- **Modify** `src/engine/board/accept-job-offer.ts` — gravar contrato via `buildManagerContract` + `upsertManagerContract`; zerar `unemployed_since_season`.
- **Modify** `src/engine/season/season-end-eval.ts:212-244` — candidatos com `ambition`; usar `generateManagerOffers`.
- **Modify** `__tests__/e2e/test-helpers.ts:262` — estender `endSeasonHeadless` (ramo demitido: severance+`setUnemployedSince`+`clearManagerContract`) + novo `advanceUnemploymentHeadless`.
- **Modify** `__tests__/e2e/career-loop.e2e.test.ts` — casos de spell multi-temporada / contrato expirado / piso terminal / determinismo.
- **Test (create)** `__tests__/engine/board/club-ambition.test.ts`, `manager-offers.test.ts`, `manager-contract-engine.test.ts`; `__tests__/database/queries/manager-contract.test.ts`, `manager-savings.test.ts`; `__tests__/engine/season/unemployment-spell.test.ts`.
- **Test (modify)** `__tests__/engine/board/reputation-engine.test.ts` (ou novo `manager-reputation-decay.test.ts`).

**Contract (assinaturas exatas):**

```ts
// src/engine/board/club-ambition.ts
export interface ClubAmbitionInput { reputation: number; divisionLevel: number }
export function computeClubAmbition(input: ClubAmbitionInput): number; // 0..1

// src/engine/board/job-offers-engine.ts (estendido)
export type OfferBand = 'step_up' | 'lateral' | 'rescue';
export interface ManagerOfferCandidate extends JobOfferCandidateClub { ambition: number } // 0..1
export interface GenerateManagerOffersInput {
  managerReputation: number;
  currentClubId: number | null;       // null quando desempregado
  currentClubReputation: number;      // referência; usar managerReputation quando sem clube
  candidates: ManagerOfferCandidate[];
  bands: OfferBand[];
  rng: SeededRng;
}
export interface ManagerOffer { offeringClubId: number; band: OfferBand }
export function generateManagerOffers(input: GenerateManagerOffersInput): ManagerOffer[];
// wrappers (assinatura W2 PRESERVADA — sem rng, ordenação determinística):
export function generateJobOffers(input: GenerateJobOffersInput): { offeringClubId: number }[];
export function generateRescueOffers(input: GenerateRescueOffersInput): { offeringClubId: number }[];

// src/engine/board/manager-contract-engine.ts
export interface ManagerContractInput {
  clubReputation: number; managerReputation: number; band: OfferBand; startSeason: number; rng: SeededRng;
}
export interface ManagerContractTerms {
  startSeason: number; endSeason: number; wagePerSeason: number; releaseClause: number; expectation: number;
}
export function buildManagerContract(input: ManagerContractInput): ManagerContractTerms;
export function isContractExpiring(endSeason: number, currentSeason: number): boolean;

// src/engine/board/manager-reputation-engine.ts (add)
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
  reputationAfter: number; savingsAfter: number; generatedOfferClubIds: number[]; terminal: boolean;
}
export async function advanceUnemploymentSeason(db: DbHandle, p: AdvanceUnemploymentParams): Promise<AdvanceUnemploymentResult>;
```

**Decisão de compat crítica (W2):** `__tests__/engine/board/rescue-offers.test.ts` chama `generateRescueOffers` **sem `rng`** e exige ordenação `reputação desc, id asc` + top `MANAGER_JOB_OFFER_MAX` (caso `:47` espera exatamente `[2,3,4]`). Portanto os **wrappers preservam a assinatura e o comportamento determinístico atuais** (não introduzir `rng` neles). O sorteio ponderado por ambição vive SÓ em `generateManagerOffers`, que `season-end-eval` passa a chamar diretamente com `bands` + `rng`. Os wrappers continuam existindo para qualquer chamador legado e para os testes W2 não regredirem.

**Seeds determinísticos (reusar fórmulas existentes):**
- Oferta: `new SeededRng(season * 6151 + saveId)` (igual `season-end-eval.ts:235`).
- Contrato: `new SeededRng(season * 31337 + clubId)` (espelha o padrão de `season-end-board.ts`).

---

## Task 1: Constantes de balance (C4)

**Files:** Modify `src/engine/balance.ts`.
**Interfaces:** Produces: novas constantes numéricas. Consumes: nada.

- [ ] **Step 1 — implementar (constantes não têm teste próprio; são exercitadas pelos testes seguintes):** após a linha `export const MANAGER_JOB_OFFER_MAX = 3;` (`balance.ts:35`) adicionar:
```ts
// C4 manager job market — unemployment spell + contract + ambition weighting.
export const MANAGER_REP_UNEMPLOYED_DECAY = -4;   // reputação perdida por temporada parada
export const MANAGER_REP_FLOOR = 1;               // piso de reputação (clamp)
export const MANAGER_CONTRACT_MIN_SEASONS = 2;
export const MANAGER_CONTRACT_MAX_SEASONS = 4;
export const MANAGER_SAVINGS_INITIAL = 0;
export const MANAGER_UNEMPLOYED_DRAIN = 1;        // poupança drenada por temporada de desemprego
export const MANAGER_SAVINGS_FLOOR = -3;          // poupança terminal → encerra a carreira
export const MANAGER_OFFER_AMBITION_WEIGHT = 0.6; // peso da ambição no sorteio ponderado
```
- [ ] **Step 2 — rodar (tipos):** `npx tsc --noEmit` → exit 0 (sem novos erros).
- [ ] **Step 3 — commit:** orquestrador: `git add src/engine/balance.ts` · msg: `feat(c4): constantes de balance do mercado de técnicos`.

---

## Task 2: `computeClubAmbition` (puro, TDD)

**Files:** Create `src/engine/board/club-ambition.ts`, Create `__tests__/engine/board/club-ambition.test.ts`.
**Interfaces:** Produces: `computeClubAmbition(input): number`. Consumes: nada.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/board/club-ambition.test.ts`:
```ts
import { computeClubAmbition } from '@/engine/board/club-ambition';

describe('computeClubAmbition', () => {
  it('retorna sempre 0..1 (clamp)', () => {
    for (const rep of [1, 50, 100]) {
      for (const div of [1, 2, 5]) {
        const a = computeClubAmbition({ reputation: rep, divisionLevel: div });
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it('clube de reputação alta em divisão baixa é mais faminto que clube equilibrado', () => {
    const faminto = computeClubAmbition({ reputation: 80, divisionLevel: 4 });
    const equilibrado = computeClubAmbition({ reputation: 50, divisionLevel: 2 });
    expect(faminto).toBeGreaterThan(equilibrado);
  });

  it('é monotônico: descer de divisão (mesma reputação) aumenta a fome', () => {
    const div1 = computeClubAmbition({ reputation: 70, divisionLevel: 1 });
    const div3 = computeClubAmbition({ reputation: 70, divisionLevel: 3 });
    expect(div3).toBeGreaterThan(div1);
  });
});
```
- [ ] **Step 2 — rodar (falha: módulo inexistente):** `npx jest club-ambition` → `Cannot find module '@/engine/board/club-ambition'`.
- [ ] **Step 3 — implementar** `src/engine/board/club-ambition.ts`:
```ts
export interface ClubAmbitionInput {
  reputation: number;    // 1..100
  divisionLevel: number; // 1 = topo
}

/**
 * Fome de contratar: um clube de reputação alta numa divisão baixa "merece mais" do que
 * tem hoje, então busca técnico com agressividade (→ 1). Um clube cuja reputação combina
 * com a divisão fica perto de 0.5. Puro e determinístico; sem rng.
 */
export function computeClubAmbition(input: ClubAmbitionInput): number {
  const rep = Math.min(100, Math.max(1, input.reputation));
  const div = Math.max(1, input.divisionLevel);
  // "merecimento" de divisão a partir da reputação: rep 100 → div 1, rep ~0 → div ~5.
  const expectedDivision = 1 + ((100 - rep) / 100) * 4; // 1..5
  const gap = expectedDivision - div;                   // >0 quando está ABAIXO do que merece
  // gap ∈ [-4, +4] → escalar para 0..1 centrado em 0.5.
  return Math.min(1, Math.max(0, 0.5 + gap / 8));
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest club-ambition` → verde.
- [ ] **Step 5 — commit:** `git add src/engine/board/club-ambition.ts __tests__/engine/board/club-ambition.test.ts` · msg: `feat(c4): computeClubAmbition (fome de contratar por reputação×divisão)`.

---

## Task 3: `generateManagerOffers` + wrappers (puro, TDD)

**Files:** Modify `src/engine/board/job-offers-engine.ts`, Create `__tests__/engine/board/manager-offers.test.ts`.
**Interfaces:** Consumes: `SeededRng`, `MANAGER_JOB_OFFER_STEP`, `MANAGER_JOB_OFFER_MAX`, `MANAGER_OFFER_AMBITION_WEIGHT`, `computeClubAmbition` (indireto via `ambition` nos candidatos). Produces: `generateManagerOffers`, `OfferBand`, `ManagerOfferCandidate`, `ManagerOffer`. Mantém: `generateJobOffers`/`generateRescueOffers` (W2).

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/board/manager-offers.test.ts`:
```ts
import {
  generateManagerOffers,
  ManagerOfferCandidate,
} from '@/engine/board/job-offers-engine';
import { SeededRng } from '@/engine/rng';
import { MANAGER_JOB_OFFER_MAX } from '@/engine/balance';

const cand = (id: number, reputation: number, ambition: number): ManagerOfferCandidate => ({
  id, reputation, divisionLevel: 1, ambition,
});

describe('generateManagerOffers', () => {
  const pool: ManagerOfferCandidate[] = [
    cand(1, 80, 0.5),  // clube atual
    cand(2, 88, 0.5),  // step_up
    cand(3, 84, 0.9),  // step_up faminto
    cand(4, 70, 0.5),  // rescue (abaixo)
    cand(5, 80, 0.5),  // lateral (igual ao atual)
  ];

  it('banda step_up só clubes ACIMA do atual e dentro do ceiling', () => {
    const offers = generateManagerOffers({
      managerReputation: 90, currentClubId: 1, currentClubReputation: 80,
      candidates: pool, bands: ['step_up'], rng: new SeededRng(1),
    });
    const ids = offers.map((o) => o.offeringClubId);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(4); // abaixo → não step_up
    expect(offers.every((o) => o.band === 'step_up')).toBe(true);
    expect(ids).toContain(2);
  });

  it('banda rescue só clubes ABAIXO do atual', () => {
    const offers = generateManagerOffers({
      managerReputation: 90, currentClubId: 1, currentClubReputation: 80,
      candidates: pool, bands: ['rescue'], rng: new SeededRng(1),
    });
    const ids = offers.map((o) => o.offeringClubId);
    expect(ids).toContain(4);
    expect(ids).not.toContain(2);
    expect(offers.every((o) => o.band === 'rescue')).toBe(true);
  });

  it('respeita o ceiling managerReputation + STEP', () => {
    const offers = generateManagerOffers({
      managerReputation: 75, currentClubId: 1, currentClubReputation: 80, // ceiling 87
      candidates: pool, bands: ['step_up'], rng: new SeededRng(1),
    });
    expect(offers.map((o) => o.offeringClubId)).not.toContain(2); // rep 88 > 87
  });

  it('mesmo seed → mesmo lote (determinístico)', () => {
    const args = {
      managerReputation: 90, currentClubId: 1, currentClubReputation: 80,
      candidates: pool, bands: ['step_up', 'rescue'] as const, rng: new SeededRng(42),
    };
    const a = generateManagerOffers({ ...args, rng: new SeededRng(42) });
    const b = generateManagerOffers({ ...args, rng: new SeededRng(42) });
    expect(a).toEqual(b);
  });

  it('limita ao top MANAGER_JOB_OFFER_MAX', () => {
    const many: ManagerOfferCandidate[] = Array.from({ length: 10 }, (_, i) =>
      cand(i + 2, 70 + i, 0.5),
    );
    const offers = generateManagerOffers({
      managerReputation: 100, currentClubId: 1, currentClubReputation: 50,
      candidates: many, bands: ['step_up'], rng: new SeededRng(7),
    });
    expect(offers.length).toBeLessThanOrEqual(MANAGER_JOB_OFFER_MAX);
  });

  it('currentClubId null (desempregado) qualifica todos ≤ ceiling para rescue', () => {
    const offers = generateManagerOffers({
      managerReputation: 90, currentClubId: null, currentClubReputation: 90,
      candidates: pool, bands: ['rescue'], rng: new SeededRng(3),
    });
    expect(offers.length).toBeGreaterThan(0);
  });

  it('ambição alta aumenta a frequência de seleção ao longo de N seeds', () => {
    const two: ManagerOfferCandidate[] = [
      cand(1, 80, 0.5),         // atual
      cand(2, 82, 0.95),        // faminto
      cand(3, 82, 0.05),        // apático (mesma reputação)
    ];
    let famintoHits = 0, apaticoHits = 0;
    for (let s = 0; s < 60; s++) {
      const offers = generateManagerOffers({
        managerReputation: 85, currentClubId: 1, currentClubReputation: 80,
        candidates: two, bands: ['step_up'], rng: new SeededRng(s),
      });
      const ids = offers.map((o) => o.offeringClubId);
      if (ids.includes(2)) famintoHits++;
      if (ids.includes(3)) apaticoHits++;
    }
    expect(famintoHits).toBeGreaterThan(apaticoHits);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest manager-offers` → `generateManagerOffers is not a function` / export ausente.
- [ ] **Step 3 — implementar** em `src/engine/board/job-offers-engine.ts`. Trocar o import da linha 2 por:
```ts
import { MANAGER_JOB_OFFER_STEP, MANAGER_JOB_OFFER_MAX, MANAGER_OFFER_AMBITION_WEIGHT } from '@/engine/balance';
```
Adicionar ao final do arquivo (mantendo `generateJobOffers`/`generateRescueOffers` intactos acima):
```ts
export type OfferBand = 'step_up' | 'lateral' | 'rescue';

export interface ManagerOfferCandidate extends JobOfferCandidateClub {
  ambition: number; // 0..1 (computeClubAmbition)
}

export interface GenerateManagerOffersInput {
  managerReputation: number;
  currentClubId: number | null;  // null quando desempregado
  currentClubReputation: number; // referência; usar managerReputation quando sem clube
  candidates: ManagerOfferCandidate[];
  bands: OfferBand[];
  rng: SeededRng;
}

export interface ManagerOffer {
  offeringClubId: number;
  band: OfferBand;
}

function inBand(c: ManagerOfferCandidate, band: OfferBand, currentRep: number, currentClubId: number | null): boolean {
  if (currentClubId == null) return band === 'rescue' ? true : c.reputation >= currentRep;
  if (c.id === currentClubId) return false;
  if (band === 'step_up') return c.reputation > currentRep;
  if (band === 'rescue') return c.reputation < currentRep;
  return c.reputation === currentRep; // lateral
}

/**
 * Mercado pleno: filtra por banda + ceiling (managerReputation + STEP), pondera cada candidato
 * por (proximidade de banda × ambição) e SORTEIA até MANAGER_JOB_OFFER_MAX via rng — sem repor
 * (weighted sampling without replacement). Determinístico para o mesmo seed. [] quando ninguém
 * qualifica. Cada oferta carrega a banda para acceptJobOffer derivar o contrato.
 */
export function generateManagerOffers(input: GenerateManagerOffersInput): ManagerOffer[] {
  const { managerReputation, currentClubId, currentClubReputation, candidates, bands, rng } = input;
  const ceiling = managerReputation + MANAGER_JOB_OFFER_STEP;

  type Weighted = { offeringClubId: number; band: OfferBand; weight: number };
  const pool: Weighted[] = [];
  for (const c of candidates) {
    if (c.reputation > ceiling) continue;
    for (const band of bands) {
      if (!inBand(c, band, currentClubReputation, currentClubId)) continue;
      // proximidade: quanto mais perto do ceiling, mais "quente"; em [0,1].
      const proximity = Math.max(0, Math.min(1, c.reputation / Math.max(1, ceiling)));
      const ambition = Math.max(0, Math.min(1, c.ambition));
      const weight =
        (1 - MANAGER_OFFER_AMBITION_WEIGHT) * proximity + MANAGER_OFFER_AMBITION_WEIGHT * ambition;
      pool.push({ offeringClubId: c.id, band, weight: Math.max(0.0001, weight) });
      break; // um candidato qualifica em no máximo uma banda (bandas são mutuamente exclusivas)
    }
  }

  const result: ManagerOffer[] = [];
  const remaining = [...pool];
  while (result.length < MANAGER_JOB_OFFER_MAX && remaining.length > 0) {
    const totalWeight = remaining.reduce((s, w) => s + w.weight, 0);
    let pick = rng.next() * totalWeight;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      pick -= remaining[idx].weight;
      if (pick <= 0) break;
    }
    if (idx >= remaining.length) idx = remaining.length - 1;
    const chosen = remaining.splice(idx, 1)[0];
    result.push({ offeringClubId: chosen.offeringClubId, band: chosen.band });
  }
  return result;
}
```
**Nota:** `SeededRng` expõe `next()` (0..1 float). Confirmar no arquivo `src/engine/rng.ts` antes de implementar; se o nome for `nextFloat()`, ajustar a chamada (uma checagem rápida de leitura, não um placeholder de comportamento).
- [ ] **Step 4 — rodar (passa, sem regressão W2):** `npx jest job-offers-engine manager-offers rescue-offers` → todos verdes (rescue-offers.test.ts continua passando: wrappers intactos).
- [ ] **Step 5 — commit:** `git add src/engine/board/job-offers-engine.ts __tests__/engine/board/manager-offers.test.ts` · msg: `feat(c4): generateManagerOffers ponderado por banda+ambição (rng), wrappers W2 preservados`.

---

## Task 4: `buildManagerContract` + `isContractExpiring` (puro, TDD)

**Files:** Create `src/engine/board/manager-contract-engine.ts`, Create `__tests__/engine/board/manager-contract-engine.test.ts`.
**Interfaces:** Consumes: `SeededRng`, `OfferBand`, `MANAGER_CONTRACT_MIN_SEASONS`/`MAX_SEASONS`. Produces: `ManagerContractTerms`, `buildManagerContract`, `isContractExpiring`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/board/manager-contract-engine.test.ts`:
```ts
import { buildManagerContract, isContractExpiring } from '@/engine/board/manager-contract-engine';
import { MANAGER_CONTRACT_MIN_SEASONS, MANAGER_CONTRACT_MAX_SEASONS } from '@/engine/balance';
import { SeededRng } from '@/engine/rng';

describe('buildManagerContract', () => {
  const base = { managerReputation: 60, band: 'step_up' as const, startSeason: 3 };

  it('duração dentro de [MIN, MAX] e endSeason coerente', () => {
    const c = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(1) });
    const dur = c.endSeason - c.startSeason;
    expect(dur).toBeGreaterThanOrEqual(MANAGER_CONTRACT_MIN_SEASONS);
    expect(dur).toBeLessThanOrEqual(MANAGER_CONTRACT_MAX_SEASONS);
    expect(c.startSeason).toBe(3);
  });

  it('determinístico para o mesmo seed', () => {
    const a = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(9) });
    const b = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(9) });
    expect(a).toEqual(b);
  });

  it('wagePerSeason cresce com a reputação do clube', () => {
    const small = buildManagerContract({ ...base, clubReputation: 30, rng: new SeededRng(2) });
    const big = buildManagerContract({ ...base, clubReputation: 90, rng: new SeededRng(2) });
    expect(big.wagePerSeason).toBeGreaterThan(small.wagePerSeason);
  });

  it('releaseClause é proporcional ao wage (> 0)', () => {
    const c = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(4) });
    expect(c.releaseClause).toBeGreaterThan(0);
    expect(c.releaseClause).toBeLessThanOrEqual(c.wagePerSeason * (c.endSeason - c.startSeason));
  });

  it('expectation é um alvo plausível 1..100', () => {
    const c = buildManagerContract({ ...base, clubReputation: 70, rng: new SeededRng(4) });
    expect(c.expectation).toBeGreaterThanOrEqual(1);
    expect(c.expectation).toBeLessThanOrEqual(100);
  });
});

describe('isContractExpiring', () => {
  it('true só quando currentSeason >= endSeason', () => {
    expect(isContractExpiring(5, 4)).toBe(false);
    expect(isContractExpiring(5, 5)).toBe(true);
    expect(isContractExpiring(5, 6)).toBe(true);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest manager-contract-engine` → `Cannot find module`.
- [ ] **Step 3 — implementar** `src/engine/board/manager-contract-engine.ts`:
```ts
import { SeededRng } from '@/engine/rng';
import { OfferBand } from '@/engine/board/job-offers-engine';
import { MANAGER_CONTRACT_MIN_SEASONS, MANAGER_CONTRACT_MAX_SEASONS } from '@/engine/balance';

export interface ManagerContractInput {
  clubReputation: number;
  managerReputation: number;
  band: OfferBand;
  startSeason: number;
  rng: SeededRng;
}

export interface ManagerContractTerms {
  startSeason: number;
  endSeason: number;     // startSeason + duração (MIN..MAX)
  wagePerSeason: number; // derivado da reputação do clube
  releaseClause: number; // severance pago ao técnico se demitido
  expectation: number;   // alvo macro (reputação a manter)
}

/**
 * Constrói os termos de um contrato de técnico a partir da banda da oferta + reputações.
 * Step-up dá contrato mais longo (clube acredita), rescue mais curto (prova-se primeiro).
 * Puro: toda aleatoriedade vem do rng recebido. Sem Math.random/Date.now.
 */
export function buildManagerContract(input: ManagerContractInput): ManagerContractTerms {
  const { clubReputation, band, startSeason, rng } = input;

  const span = MANAGER_CONTRACT_MAX_SEASONS - MANAGER_CONTRACT_MIN_SEASONS; // 2
  const bandBias = band === 'step_up' ? span : band === 'lateral' ? Math.round(span / 2) : 0;
  const jitter = rng.nextInt(0, span - bandBias < 0 ? 0 : span - bandBias);
  const duration = MANAGER_CONTRACT_MIN_SEASONS + Math.min(span, bandBias + jitter);
  const endSeason = startSeason + duration;

  const wagePerSeason = Math.round((1000 + clubReputation * 120) / 50) * 50;
  const releaseClause = Math.round(wagePerSeason * 0.5);
  const expectation = Math.min(100, Math.max(1, Math.round(clubReputation * 0.9)));

  return { startSeason, endSeason, wagePerSeason, releaseClause, expectation };
}

/** Contrato vence quando a temporada corrente já alcançou (ou passou) o fim do mandato. */
export function isContractExpiring(endSeason: number, currentSeason: number): boolean {
  return currentSeason >= endSeason;
}
```
**Nota:** confirmar `rng.nextInt(min, max)` em `src/engine/rng.ts` (assinatura usada por `staff-market`/`assistant-engine`); se for `nextInt(maxExclusive)` ajustar a chamada — checagem de leitura, não placeholder.
- [ ] **Step 4 — rodar (passa):** `npx jest manager-contract-engine` → verde.
- [ ] **Step 5 — commit:** `git add src/engine/board/manager-contract-engine.ts __tests__/engine/board/manager-contract-engine.test.ts` · msg: `feat(c4): buildManagerContract + isContractExpiring (termos por banda)`.

---

## Task 5: `applyUnemploymentDecay` (puro, TDD)

**Files:** Modify `src/engine/board/manager-reputation-engine.ts`, Create `__tests__/engine/board/manager-reputation-decay.test.ts`.
**Interfaces:** Consumes: `MANAGER_REP_UNEMPLOYED_DECAY`, `MANAGER_REP_FLOOR`. Produces: `applyUnemploymentDecay`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/board/manager-reputation-decay.test.ts`:
```ts
import { applyUnemploymentDecay } from '@/engine/board/manager-reputation-engine';
import { MANAGER_REP_UNEMPLOYED_DECAY, MANAGER_REP_FLOOR } from '@/engine/balance';

describe('applyUnemploymentDecay', () => {
  it('aplica o decaimento por temporada parada', () => {
    const r = applyUnemploymentDecay(50);
    expect(r.next).toBe(50 + MANAGER_REP_UNEMPLOYED_DECAY);
    expect(r.delta).toBe(MANAGER_REP_UNEMPLOYED_DECAY);
  });

  it('clampa no piso MANAGER_REP_FLOOR (nunca abaixo)', () => {
    const r = applyUnemploymentDecay(MANAGER_REP_FLOOR);
    expect(r.next).toBe(MANAGER_REP_FLOOR);
    expect(r.delta).toBe(0);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest manager-reputation-decay` → `applyUnemploymentDecay is not a function`.
- [ ] **Step 3 — implementar** em `src/engine/board/manager-reputation-engine.ts`. No import do topo adicionar `MANAGER_REP_UNEMPLOYED_DECAY, MANAGER_REP_FLOOR`; ao final do arquivo:
```ts
import { MANAGER_REP_UNEMPLOYED_DECAY, MANAGER_REP_FLOOR } from '@/engine/balance';

/**
 * Decaimento de reputação por temporada de desemprego (técnico esquecido pelo mercado).
 * Clampa no piso MANAGER_REP_FLOOR. Puro.
 */
export function applyUnemploymentDecay(current: number): { next: number; delta: number } {
  const next = Math.max(MANAGER_REP_FLOOR, current + MANAGER_REP_UNEMPLOYED_DECAY);
  return { next, delta: next - current };
}
```
(Se já houver `import ... from '@/engine/balance'` no topo, mesclar as duas constantes nele em vez de duplicar a linha de import.)
- [ ] **Step 4 — rodar (passa):** `npx jest manager-reputation-decay reputation-engine` → verde (não regride o teste existente de `computeManagerReputationDelta`).
- [ ] **Step 5 — commit:** `git add src/engine/board/manager-reputation-engine.ts __tests__/engine/board/manager-reputation-decay.test.ts` · msg: `feat(c4): applyUnemploymentDecay (decaimento de reputação no spell)`.

---

## Task 6: Schema + migração espelhada (`manager_contracts`, colunas de spell)

**Files:** Modify `src/database/schema.ts`, Modify `src/store/database-store.ts`.
**Interfaces:** Produces: tabela `manager_contracts`; colunas `unemployed_since_season`, `manager_savings` em `save_games`. Consumes: nada.

- [ ] **Step 1 — schema (DDL canônico):** em `src/database/schema.ts`, no array de nomes de tabelas, após `'job_offers',` (linha 33) adicionar `'manager_contracts',`. No `CREATE TABLE save_games`, após `unemployed INTEGER NOT NULL DEFAULT 0,` (linha 317) adicionar:
```sql
  unemployed_since_season INTEGER,
  manager_savings         INTEGER NOT NULL DEFAULT 0,
```
Após o bloco `CREATE TABLE ... job_offers (...)` (termina na linha 332) adicionar:
```sql
-- C4 manager job market: 1 contrato ativo por save (UNIQUE save_id). save-isolated.
CREATE TABLE IF NOT EXISTS manager_contracts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         INTEGER NOT NULL REFERENCES save_games(id),
  club_id         INTEGER NOT NULL REFERENCES clubs(id),
  start_season    INTEGER NOT NULL,
  end_season      INTEGER NOT NULL,
  wage_per_season INTEGER NOT NULL,
  release_clause  INTEGER NOT NULL,
  expectation     INTEGER NOT NULL,
  UNIQUE(save_id)
);
CREATE INDEX IF NOT EXISTS idx_manager_contracts_save ON manager_contracts(save_id);
```
- [ ] **Step 2 — migração espelhada:** em `src/store/database-store.ts`, após `addColumnIfMissing(db, 'save_games', 'unemployed', ...)` (linha 111) adicionar:
```ts
      // C4 manager job market: spell de desemprego como estado (temporada de início +
      // poupança pessoal) + tabela de contrato do técnico (1 ativo por save).
      await addColumnIfMissing(db, 'save_games', 'unemployed_since_season', 'INTEGER');
      await addColumnIfMissing(db, 'save_games', 'manager_savings', 'INTEGER NOT NULL DEFAULT 0');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS manager_contracts (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id         INTEGER NOT NULL,
          club_id         INTEGER NOT NULL,
          start_season    INTEGER NOT NULL,
          end_season      INTEGER NOT NULL,
          wage_per_season INTEGER NOT NULL,
          release_clause  INTEGER NOT NULL,
          expectation     INTEGER NOT NULL,
          UNIQUE(save_id)
        );
        CREATE INDEX IF NOT EXISTS idx_manager_contracts_save ON manager_contracts(save_id);
      `);
```
- [ ] **Step 3 — rodar (sanidade do schema via suíte de DB existente):** `npx jest __tests__/database/queries/save` → continua verde (schema válido, sem coluna duplicada).
- [ ] **Step 4 — tipos:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5 — commit:** `git add src/database/schema.ts src/store/database-store.ts` · msg: `feat(c4): schema+migração manager_contracts + colunas de spell de desemprego`.

---

## Task 7: Queries `manager-contract.ts` (TDD, SQLite real)

**Files:** Create `src/database/queries/manager-contract.ts`, Create `__tests__/database/queries/manager-contract.test.ts`.
**Interfaces:** Consumes: `DbHandle`, `ManagerContractTerms`. Produces: `ManagerContractRow`, `upsertManagerContract`, `getActiveManagerContract`, `clearManagerContract`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/database/queries/manager-contract.test.ts` (espelhar o setup `seedTestDb`/`TEST_SAVE_ID` dos outros testes de `__tests__/database/queries/`; copiar o cabeçalho de import/seed de `__tests__/database/queries/save.test.ts` se existir, ou de outro arquivo do diretório):
```ts
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '@/database/schema';
import {
  upsertManagerContract,
  getActiveManagerContract,
  clearManagerContract,
} from '@/database/queries/manager-contract';

const SAVE_A = 1;
const SAVE_B = 2;

function makeDb() {
  const raw = new Database(':memory:');
  raw.exec(SCHEMA_SQL);
  // save_games + clubs mínimos para satisfazer FKs (FKs ficam OFF por padrão no better-sqlite3).
  raw.prepare(
    `INSERT INTO save_games (id, name, player_club_id, created_at, updated_at)
     VALUES (?, 'A', 1, '', ''), (?, 'B', 1, '', '')`,
  ).run(SAVE_A, SAVE_B);
  // DbHandle async wrapper mínimo (mesmo padrão dos demais testes de queries):
  const db = {
    prepare: (sql: string) => {
      const st = raw.prepare(sql);
      return {
        get: async (...a: unknown[]) => st.get(...a),
        all: async (...a: unknown[]) => st.all(...a),
        run: async (...a: unknown[]) => st.run(...a),
      };
    },
    execAsync: async (sql: string) => raw.exec(sql),
  } as any;
  return { db, raw };
}

const terms = {
  clubId: 10, startSeason: 3, endSeason: 6,
  wagePerSeason: 5000, releaseClause: 2500, expectation: 70,
};

describe('manager-contract queries', () => {
  it('upsert → get retorna os termos gravados', async () => {
    const { db, raw } = makeDb();
    await upsertManagerContract(db, SAVE_A, terms);
    const got = await getActiveManagerContract(db, SAVE_A);
    expect(got).toMatchObject(terms);
    raw.close();
  });

  it('UNIQUE(save_id): upsert substitui o contrato ativo', async () => {
    const { db, raw } = makeDb();
    await upsertManagerContract(db, SAVE_A, terms);
    await upsertManagerContract(db, SAVE_A, { ...terms, clubId: 99, endSeason: 8 });
    const got = await getActiveManagerContract(db, SAVE_A);
    expect(got?.clubId).toBe(99);
    expect(got?.endSeason).toBe(8);
    const count = raw.prepare('SELECT COUNT(*) n FROM manager_contracts WHERE save_id = ?').get(SAVE_A) as { n: number };
    expect(count.n).toBe(1);
    raw.close();
  });

  it('clearManagerContract → get null', async () => {
    const { db, raw } = makeDb();
    await upsertManagerContract(db, SAVE_A, terms);
    await clearManagerContract(db, SAVE_A);
    expect(await getActiveManagerContract(db, SAVE_A)).toBeNull();
    raw.close();
  });

  it('isolamento por save_id (dois saves não vazam)', async () => {
    const { db, raw } = makeDb();
    await upsertManagerContract(db, SAVE_A, terms);
    expect(await getActiveManagerContract(db, SAVE_B)).toBeNull();
    raw.close();
  });
});
```
**Nota:** se o diretório já tiver um helper `seedTestDb`/`makeTestDb` (ver topo de `__tests__/database/queries/*.test.ts`), usar o helper canônico em vez do `makeDb` acima — manter o padrão da casa.
- [ ] **Step 2 — rodar (falha):** `npx jest manager-contract.test` → `Cannot find module '@/database/queries/manager-contract'`.
- [ ] **Step 3 — implementar** `src/database/queries/manager-contract.ts`:
```ts
import { DbHandle } from './players';
import { ManagerContractTerms } from '@/engine/board/manager-contract-engine';

export interface ManagerContractRow extends ManagerContractTerms {
  clubId: number;
}

interface Row {
  club_id: number;
  start_season: number;
  end_season: number;
  wage_per_season: number;
  release_clause: number;
  expectation: number;
}

/** Grava (ou substitui) o contrato ativo do save. UNIQUE(save_id) garante 1 linha. */
export async function upsertManagerContract(db: DbHandle, saveId: number, c: ManagerContractRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO manager_contracts
         (save_id, club_id, start_season, end_season, wage_per_season, release_clause, expectation)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(save_id) DO UPDATE SET
         club_id = excluded.club_id,
         start_season = excluded.start_season,
         end_season = excluded.end_season,
         wage_per_season = excluded.wage_per_season,
         release_clause = excluded.release_clause,
         expectation = excluded.expectation`,
    )
    .run(saveId, c.clubId, c.startSeason, c.endSeason, c.wagePerSeason, c.releaseClause, c.expectation);
}

export async function getActiveManagerContract(db: DbHandle, saveId: number): Promise<ManagerContractRow | null> {
  const row = (await db
    .prepare(
      `SELECT club_id, start_season, end_season, wage_per_season, release_clause, expectation
         FROM manager_contracts WHERE save_id = ?`,
    )
    .get(saveId)) as Row | undefined;
  if (!row) return null;
  return {
    clubId: row.club_id,
    startSeason: row.start_season,
    endSeason: row.end_season,
    wagePerSeason: row.wage_per_season,
    releaseClause: row.release_clause,
    expectation: row.expectation,
  };
}

export async function clearManagerContract(db: DbHandle, saveId: number): Promise<void> {
  await db.prepare('DELETE FROM manager_contracts WHERE save_id = ?').run(saveId);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest manager-contract.test` → verde.
- [ ] **Step 5 — commit:** `git add src/database/queries/manager-contract.ts __tests__/database/queries/manager-contract.test.ts` · msg: `feat(c4): queries de contrato do técnico (upsert/get/clear, save-isolated)`.

---

## Task 8: Queries de savings + unemployed-since (TDD, SQLite real)

**Files:** Modify `src/database/queries/save.ts`, Create `__tests__/database/queries/manager-savings.test.ts`.
**Interfaces:** Consumes: `DbHandle`. Produces: `getManagerSavings`, `setManagerSavings`, `getUnemployedSince`, `setUnemployedSince`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/database/queries/manager-savings.test.ts` (mesmo `makeDb` da Task 7, ou helper canônico do diretório):
```ts
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '@/database/schema';
import {
  getManagerSavings, setManagerSavings,
  getUnemployedSince, setUnemployedSince,
} from '@/database/queries/save';

const SAVE = 1;
function makeDb() {
  const raw = new Database(':memory:');
  raw.exec(SCHEMA_SQL);
  raw.prepare(`INSERT INTO save_games (id, name, player_club_id, created_at, updated_at) VALUES (?, 'A', 1, '', '')`).run(SAVE);
  const db = {
    prepare: (sql: string) => {
      const st = raw.prepare(sql);
      return {
        get: async (...a: unknown[]) => st.get(...a),
        all: async (...a: unknown[]) => st.all(...a),
        run: async (...a: unknown[]) => st.run(...a),
      };
    },
  } as any;
  return { db, raw };
}

describe('manager savings + unemployed-since', () => {
  it('savings default 0, set/get round-trip', async () => {
    const { db, raw } = makeDb();
    expect(await getManagerSavings(db, SAVE)).toBe(0);
    await setManagerSavings(db, SAVE, 1500);
    expect(await getManagerSavings(db, SAVE)).toBe(1500);
    await setManagerSavings(db, SAVE, -3);
    expect(await getManagerSavings(db, SAVE)).toBe(-3);
    raw.close();
  });

  it('unemployedSince: default null, set número, set null', async () => {
    const { db, raw } = makeDb();
    expect(await getUnemployedSince(db, SAVE)).toBeNull();
    await setUnemployedSince(db, SAVE, 4);
    expect(await getUnemployedSince(db, SAVE)).toBe(4);
    await setUnemployedSince(db, SAVE, null);
    expect(await getUnemployedSince(db, SAVE)).toBeNull();
    raw.close();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest manager-savings` → `getManagerSavings is not a function`.
- [ ] **Step 3 — implementar** ao final de `src/database/queries/save.ts`:
```ts
// ─── C4 manager job market: poupança pessoal + temporada de início do desemprego ──

export async function getManagerSavings(db: DbHandle, saveId: number): Promise<number> {
  const row = (await db
    .prepare('SELECT manager_savings FROM save_games WHERE id = ?')
    .get(saveId)) as { manager_savings: number } | undefined;
  return row?.manager_savings ?? 0;
}

export async function setManagerSavings(db: DbHandle, saveId: number, v: number): Promise<void> {
  await db.prepare('UPDATE save_games SET manager_savings = ? WHERE id = ?').run(v, saveId);
}

export async function getUnemployedSince(db: DbHandle, saveId: number): Promise<number | null> {
  const row = (await db
    .prepare('SELECT unemployed_since_season FROM save_games WHERE id = ?')
    .get(saveId)) as { unemployed_since_season: number | null } | undefined;
  return row?.unemployed_since_season ?? null;
}

export async function setUnemployedSince(db: DbHandle, saveId: number, season: number | null): Promise<void> {
  await db.prepare('UPDATE save_games SET unemployed_since_season = ? WHERE id = ?').run(season, saveId);
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest manager-savings` → verde.
- [ ] **Step 5 — commit:** `git add src/database/queries/save.ts __tests__/database/queries/manager-savings.test.ts` · msg: `feat(c4): queries manager_savings + unemployed_since_season`.

---

## Task 9: `acceptJobOffer` grava contrato (TDD, SQLite real)

**Files:** Modify `src/engine/board/accept-job-offer.ts`, Create `__tests__/engine/board/accept-job-offer-contract.test.ts`.
**Interfaces:** Consumes: `buildManagerContract`, `upsertManagerContract`, `getActiveManagerContract`, `setUnemployedSince`, `OfferBand`. Produces: `acceptJobOffer` agora aceita `band` e grava contrato + zera `unemployed_since_season`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/board/accept-job-offer-contract.test.ts`. Usar o contexto e2e real (`createE2EContext`) — `acceptJobOffer` toca várias tabelas:
```ts
import { createE2EContext, E2EContext } from '../../e2e/test-helpers';
import { acceptJobOffer } from '@/engine/board/accept-job-offer';
import { getActiveManagerContract } from '@/database/queries/manager-contract';
import { getUnemployedSince, setUnemployedSince } from '@/database/queries/save';
import { getAllClubs } from '@/database/queries/clubs';
import { SeededRng } from '@/engine/rng';

describe('acceptJobOffer grava contrato', () => {
  let ctx: E2EContext;
  beforeEach(async () => { ctx = await createE2EContext(); });
  afterEach(() => { ctx.rawDb.close(); });

  it('assinar gera contrato ativo e zera unemployed_since_season', async () => {
    const clubs = await getAllClubs(ctx.db, ctx.saveId);
    const target = clubs.find((c) => c.id !== ctx.playerClubId)!;
    await setUnemployedSince(ctx.db, ctx.saveId, 2); // simula spell ativo

    await acceptJobOffer({
      db: ctx.db, saveId: ctx.saveId, offeringClubId: target.id,
      offerSeason: 1, newSeason: 2, band: 'rescue', rng: new SeededRng(123),
    });

    const contract = await getActiveManagerContract(ctx.db, ctx.saveId);
    expect(contract).not.toBeNull();
    expect(contract!.clubId).toBe(target.id);
    expect(contract!.startSeason).toBe(2);
    expect(contract!.endSeason).toBeGreaterThan(2);
    expect(await getUnemployedSince(ctx.db, ctx.saveId)).toBeNull();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest accept-job-offer-contract` → erro de tipo/`band` ausente ou contrato null.
- [ ] **Step 3 — implementar** em `src/engine/board/accept-job-offer.ts`:
  - Imports novos no topo:
```ts
import { OfferBand } from '@/engine/board/job-offers-engine';
import { buildManagerContract } from '@/engine/board/manager-contract-engine';
import { upsertManagerContract } from '@/database/queries/manager-contract';
import { setUnemployedSince } from '@/database/queries/save';
import { getManagerReputation } from '@/database/queries/save';
```
(mesclar com o import existente de `@/database/queries/save` da linha 10.)
  - No `AcceptJobOfferParams` adicionar `band: OfferBand;` (logo após `rng`).
  - Após o passo 6 atual (`setPreseasonPending(db, saveId, true)`, linha 71) e antes do `getBoardObjective`, inserir:
```ts
  // 7. C4 — gravar o contrato do técnico para o novo clube + sair do spell de desemprego.
  const managerRep = await getManagerReputation(db, saveId);
  const terms = buildManagerContract({
    clubReputation: newClub.reputation,
    managerReputation: managerRep,
    band: p.band,
    startSeason: newSeason,
    rng: new SeededRng(newSeason * 31337 + offeringClubId),
  });
  await upsertManagerContract(db, saveId, { clubId: offeringClubId, ...terms });
  await setUnemployedSince(db, saveId, null);
```
- [ ] **Step 4 — atualizar chamadores (compilação):** todo `acceptJobOffer({...})` existente precisa de `band`. Chamadores conhecidos: `__tests__/e2e/test-helpers.ts:297` (passar `band: 'rescue'`), e `src/screens/career/JobOffersScreen.tsx` (passar a banda da oferta — ver Task 12; se a tela ainda não tiver a banda, passar `'rescue'` quando desempregado e `'step_up'` caso contrário, derivando de `isUnemployed`). Rodar `npx tsc --noEmit` e corrigir cada call site.
- [ ] **Step 5 — rodar (passa):** `npx jest accept-job-offer-contract` → verde; `npx tsc --noEmit` → exit 0.
- [ ] **Step 6 — commit:** `git add src/engine/board/accept-job-offer.ts __tests__/engine/board/accept-job-offer-contract.test.ts __tests__/e2e/test-helpers.ts` · msg: `feat(c4): acceptJobOffer grava contrato do técnico e encerra o spell`.

---

## Task 10: `season-end-eval` usa `generateManagerOffers` com ambição

**Files:** Modify `src/engine/season/season-end-eval.ts`, Create `__tests__/engine/season/season-end-offers-ambition.test.ts`.
**Interfaces:** Consumes: `generateManagerOffers`, `computeClubAmbition`. Produces: candidatos com `ambition`; geração de ofertas via bandas. Mantém `SeasonEndEval.generatedOfferClubIds`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/season/season-end-offers-ambition.test.ts` (e2e real; força reputação alta e confirma que ofertas são geradas e persistidas como hoje):
```ts
import { createE2EContext, playUntilSeasonEnd, E2EContext } from '../../e2e/test-helpers';
import { evaluateSeasonEndBoard } from '@/engine/season/season-end-eval';
import { setManagerReputation } from '@/database/queries/save';
import { getPendingJobOffers } from '@/database/queries/job-offers';
import { getClubById } from '@/database/queries/clubs';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { SeededRng } from '@/engine/rng';

describe('season-end ofertas com ambição (retido)', () => {
  let ctx: E2EContext;
  beforeEach(async () => { ctx = await createE2EContext(); });
  afterEach(() => { ctx.rawDb.close(); });

  it('gera ofertas up-band quando retido com reputação alta (lote determinístico)', async () => {
    await playUntilSeasonEnd(ctx, 4242);
    await setManagerReputation(ctx.db, ctx.saveId, 99);
    const endedSeason = ctx.season - 1;
    const club = (await getClubById(ctx.db, ctx.saveId, ctx.playerClubId))!;
    const comps = (await getCompetitionsBySeason(ctx.db, ctx.saveId, endedSeason)).map((c) => ({ id: c.id, type: c.type }));
    const res = await evaluateSeasonEndBoard(ctx.db, {
      saveId: ctx.saveId, playerClubId: ctx.playerClubId, clubReputation: club.reputation,
      endedSeason, newSeason: ctx.season, competitions: comps,
      offerRng: new SeededRng(ctx.season * 6151 + ctx.saveId),
    });
    const pending = await getPendingJobOffers(ctx.db, ctx.saveId, endedSeason);
    expect(pending.map((p) => p.offeringClubId).sort()).toEqual([...res.generatedOfferClubIds].sort());
  }, 120_000);
});
```
- [ ] **Step 2 — rodar (falha ou frágil):** `npx jest season-end-offers-ambition` → falha enquanto `season-end-eval` ainda usa `generateJobOffers` sem banda/ambição (ou passa por acaso; o objetivo é travar o comportamento antes do refactor).
- [ ] **Step 3 — implementar** no bloco de ofertas de `src/engine/season/season-end-eval.ts:212-244`:
  - Import (linha 15) trocar para incluir o novo motor + ambição:
```ts
import { generateManagerOffers, ManagerOfferCandidate } from '@/engine/board/job-offers-engine';
import { computeClubAmbition } from '@/engine/board/club-ambition';
```
(remover `generateJobOffers, generateRescueOffers, JobOfferCandidateClub` do import se não forem mais usados aqui.)
  - Substituir o bloco `{ const leaguesForDiv ... await setJobOffersPending(db, saveId, true); } }` por:
```ts
  {
    const leaguesForDiv = await getAllLeagues(db);
    const divByLeague = new Map(leaguesForDiv.map((l) => [l.id, l.divisionLevel]));
    const candidates: ManagerOfferCandidate[] = allClubs.map((c) => {
      const divisionLevel = divByLeague.get(c.leagueId) ?? 1;
      return {
        id: c.id,
        reputation: c.reputation,
        divisionLevel,
        ambition: computeClubAmbition({ reputation: c.reputation, divisionLevel }),
      };
    });
    const bands = isManagerDismissed(board.consequence)
      ? (['rescue'] as const)
      : (['step_up', 'lateral'] as const);
    const offers = generateManagerOffers({
      managerReputation: managerRepDelta.next,
      currentClubId: playerClubId,
      currentClubReputation: clubReputation,
      candidates,
      bands: [...bands],
      rng: p.offerRng,
    });
    if (offers.length > 0) {
      for (const o of offers) {
        await insertJobOffer(db, saveId, endedSeason, o.offeringClubId);
        generatedOfferClubIds.push(o.offeringClubId);
      }
      await setJobOffersPending(db, saveId, true);
    }
  }
```
- [ ] **Step 4 — rodar (passa, sem regressão e2e):** `npx jest season-end-offers-ambition career-loop` → verde. (O caso `:41` da career-loop, que aceita oferta com rep 99, continua gerando ofertas e trocando de clube.)
- [ ] **Step 5 — commit:** `git add src/engine/season/season-end-eval.ts __tests__/engine/season/season-end-offers-ambition.test.ts` · msg: `feat(c4): season-end usa generateManagerOffers (bandas + ambição)`.

---

## Task 11: `advanceUnemploymentSeason` (orquestrador, TDD SQLite real)

**Files:** Create `src/engine/season/unemployment-spell.ts`, Create `__tests__/engine/season/unemployment-spell.test.ts`.
**Interfaces:** Consumes: `applyUnemploymentDecay`, `getManagerReputation`/`setManagerReputation`, `getManagerSavings`/`setManagerSavings`, `generateManagerOffers`, `computeClubAmbition`, `insertJobOffer`, `setJobOffersPending`, `getAllClubs`, `getAllLeagues`, `MANAGER_UNEMPLOYED_DRAIN`, `MANAGER_SAVINGS_FLOOR`, `MANAGER_REP_FLOOR`. Produces: `advanceUnemploymentSeason`, `AdvanceUnemploymentResult`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/season/unemployment-spell.test.ts` (e2e real):
```ts
import { createE2EContext, E2EContext } from '../../e2e/test-helpers';
import { advanceUnemploymentSeason } from '@/engine/season/unemployment-spell';
import {
  getManagerReputation, setManagerReputation,
  getManagerSavings, setManagerSavings,
  setUnemployed, setUnemployedSince,
} from '@/database/queries/save';
import { getPendingJobOffers } from '@/database/queries/job-offers';
import { SeededRng } from '@/engine/rng';
import {
  MANAGER_REP_UNEMPLOYED_DECAY, MANAGER_UNEMPLOYED_DRAIN, MANAGER_SAVINGS_FLOOR,
} from '@/engine/balance';

describe('advanceUnemploymentSeason', () => {
  let ctx: E2EContext;
  beforeEach(async () => {
    ctx = await createE2EContext();
    await setUnemployed(ctx.db, ctx.saveId, true);
    await setUnemployedSince(ctx.db, ctx.saveId, 1);
  });
  afterEach(() => { ctx.rawDb.close(); });

  it('decai reputação, drena poupança e gera novo lote', async () => {
    await setManagerReputation(ctx.db, ctx.saveId, 60);
    await setManagerSavings(ctx.db, ctx.saveId, 5);
    const res = await advanceUnemploymentSeason(ctx.db, {
      saveId: ctx.saveId, season: 2, rng: new SeededRng(2 * 6151 + ctx.saveId),
    });
    expect(res.reputationAfter).toBe(60 + MANAGER_REP_UNEMPLOYED_DECAY);
    expect(res.savingsAfter).toBe(5 - MANAGER_UNEMPLOYED_DRAIN);
    expect(await getManagerReputation(ctx.db, ctx.saveId)).toBe(res.reputationAfter);
    expect(await getManagerSavings(ctx.db, ctx.saveId)).toBe(res.savingsAfter);
    expect(res.terminal).toBe(false);
    // ofertas persistidas para a temporada da virada
    const pending = await getPendingJobOffers(ctx.db, ctx.saveId, 2);
    expect(pending.map((p) => p.offeringClubId).sort()).toEqual([...res.generatedOfferClubIds].sort());
  });

  it('terminal quando a poupança cruza o piso', async () => {
    await setManagerReputation(ctx.db, ctx.saveId, 60);
    await setManagerSavings(ctx.db, ctx.saveId, MANAGER_SAVINGS_FLOOR + 1); // 1 dreno cruza o piso
    const res = await advanceUnemploymentSeason(ctx.db, {
      saveId: ctx.saveId, season: 2, rng: new SeededRng(2 * 6151 + ctx.saveId),
    });
    expect(res.savingsAfter).toBeLessThanOrEqual(MANAGER_SAVINGS_FLOOR);
    expect(res.terminal).toBe(true);
  });

  it('idempotente por (saveId, season): rodar 2× não duplica ofertas', async () => {
    await setManagerReputation(ctx.db, ctx.saveId, 80);
    await setManagerSavings(ctx.db, ctx.saveId, 50);
    await advanceUnemploymentSeason(ctx.db, { saveId: ctx.saveId, season: 2, rng: new SeededRng(99) });
    const firstCount = (await getPendingJobOffers(ctx.db, ctx.saveId, 2)).length;
    await advanceUnemploymentSeason(ctx.db, { saveId: ctx.saveId, season: 2, rng: new SeededRng(99) });
    const secondCount = (await getPendingJobOffers(ctx.db, ctx.saveId, 2)).length;
    expect(secondCount).toBe(firstCount); // INSERT OR IGNORE + UNIQUE(save,season,club) protege
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest unemployment-spell` → `Cannot find module`.
- [ ] **Step 3 — implementar** `src/engine/season/unemployment-spell.ts`:
```ts
import { DbHandle } from '@/database/queries/players';
import { SeededRng } from '@/engine/rng';
import { getAllLeagues } from '@/database/queries/leagues';
import { getAllClubs } from '@/database/queries/clubs';
import { insertJobOffer } from '@/database/queries/job-offers';
import {
  getManagerReputation, setManagerReputation,
  getManagerSavings, setManagerSavings,
  setJobOffersPending,
} from '@/database/queries/save';
import { applyUnemploymentDecay } from '@/engine/board/manager-reputation-engine';
import { generateManagerOffers, ManagerOfferCandidate } from '@/engine/board/job-offers-engine';
import { computeClubAmbition } from '@/engine/board/club-ambition';
import { MANAGER_UNEMPLOYED_DRAIN, MANAGER_SAVINGS_FLOOR, MANAGER_REP_FLOOR } from '@/engine/balance';

export interface AdvanceUnemploymentParams {
  saveId: number;
  season: number; // a temporada (nova) à qual o lote de ofertas é chaveado
  rng: SeededRng;
}

export interface AdvanceUnemploymentResult {
  reputationAfter: number;
  savingsAfter: number;
  generatedOfferClubIds: number[];
  terminal: boolean; // reputação/poupança no piso → carreira encerra
}

/**
 * Uma "rodada de mercado" do técnico desempregado: aplica decaimento de reputação e dreno
 * de poupança, gera um novo lote de ofertas-resgate (banda 'rescue', sem clube atual) e
 * decide se a carreira atingiu o piso terminal. Idempotente por (saveId, season): o
 * UNIQUE(save_id, season, offering_club_id) de job_offers impede duplicação ao reexecutar.
 * Toca o DB diretamente, como os demais orquestradores de season/*.
 */
export async function advanceUnemploymentSeason(
  db: DbHandle,
  p: AdvanceUnemploymentParams,
): Promise<AdvanceUnemploymentResult> {
  const { saveId, season, rng } = p;

  // 1. Decaimento de reputação (clampa em MANAGER_REP_FLOOR).
  const repBefore = await getManagerReputation(db, saveId);
  const { next: reputationAfter } = applyUnemploymentDecay(repBefore);
  await setManagerReputation(db, saveId, reputationAfter);

  // 2. Dreno de poupança.
  const savingsBefore = await getManagerSavings(db, saveId);
  const savingsAfter = savingsBefore - MANAGER_UNEMPLOYED_DRAIN;
  await setManagerSavings(db, saveId, savingsAfter);

  // 3. Piso terminal: poupança esgotada OU reputação no chão.
  const terminal = savingsAfter <= MANAGER_SAVINGS_FLOOR || reputationAfter <= MANAGER_REP_FLOOR;

  // 4. Novo lote de ofertas-resgate (sem clube atual; reputação decaída → bandas menores).
  const generatedOfferClubIds: number[] = [];
  if (!terminal) {
    const leagues = await getAllLeagues(db);
    const divByLeague = new Map(leagues.map((l) => [l.id, l.divisionLevel]));
    const allClubs = await getAllClubs(db, saveId);
    const candidates: ManagerOfferCandidate[] = allClubs.map((c) => {
      const divisionLevel = divByLeague.get(c.leagueId) ?? 1;
      return {
        id: c.id,
        reputation: c.reputation,
        divisionLevel,
        ambition: computeClubAmbition({ reputation: c.reputation, divisionLevel }),
      };
    });
    const offers = generateManagerOffers({
      managerReputation: reputationAfter,
      currentClubId: null,
      currentClubReputation: reputationAfter,
      candidates,
      bands: ['rescue'],
      rng,
    });
    for (const o of offers) {
      await insertJobOffer(db, saveId, season, o.offeringClubId);
      generatedOfferClubIds.push(o.offeringClubId);
    }
    if (offers.length > 0) await setJobOffersPending(db, saveId, true);
  }

  return { reputationAfter, savingsAfter, generatedOfferClubIds, terminal };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest unemployment-spell` → verde.
- [ ] **Step 5 — commit:** `git add src/engine/season/unemployment-spell.ts __tests__/engine/season/unemployment-spell.test.ts` · msg: `feat(c4): advanceUnemploymentSeason (decaimento+dreno+novo lote+piso terminal)`.

---

## Task 12: i18n (pt/en) — contrato, perfil e spell

**Files:** Modify `src/i18n/pt.ts`, Modify `src/i18n/en.ts`.
**Interfaces:** Produces: chaves novas em paridade. Consumes: nada.

- [ ] **Step 1 — teste falhando (paridade já cobre):** adicionar as chaves só no `pt.ts` primeiro e rodar `npx jest parity` → o teste de paridade FALHA (chaves faltando no `en.ts`). Isso prova que a paridade está sendo exercitada.
- [ ] **Step 2 — implementar pt:** em `src/i18n/pt.ts`, após `'joboffers.decline_all'` (linha 1009) adicionar:
```ts
  'joboffers.contract_duration': 'Contrato: {seasons} temporadas',
  'joboffers.contract_wage': 'Salário {wage}/temporada',
  'joboffers.contract_clause': 'Cláusula de demissão {clause}',
  'joboffers.band_step_up': 'Promoção de carreira',
  'joboffers.band_lateral': 'Movimento lateral',
  'joboffers.band_rescue': 'Recomeço',
  'unemployed.savings': 'Poupança: {savings}',
  'unemployed.reputation_decay': 'Reputação caindo: {rep}',
  'unemployed.seasons_idle': 'Temporadas sem clube: {seasons}',
  'unemployed.terminal': 'Sem recursos para continuar — carreira encerrada.',
  'managerprofile.title': 'Perfil de carreira',
  'managerprofile.reputation': 'Reputação',
  'managerprofile.savings': 'Poupança',
  'managerprofile.current_contract': 'Contrato atual',
  'managerprofile.no_contract': 'Sem contrato (agente livre)',
  'managerprofile.club_history': 'Histórico de clubes',
```
- [ ] **Step 3 — implementar en:** em `src/i18n/en.ts`, no mesmo ponto, as mesmas chaves traduzidas:
```ts
  'joboffers.contract_duration': 'Contract: {seasons} seasons',
  'joboffers.contract_wage': 'Wage {wage}/season',
  'joboffers.contract_clause': 'Release clause {clause}',
  'joboffers.band_step_up': 'Career step up',
  'joboffers.band_lateral': 'Lateral move',
  'joboffers.band_rescue': 'Fresh start',
  'unemployed.savings': 'Savings: {savings}',
  'unemployed.reputation_decay': 'Reputation falling: {rep}',
  'unemployed.seasons_idle': 'Seasons without a club: {seasons}',
  'unemployed.terminal': 'No resources left — career over.',
  'managerprofile.title': 'Career profile',
  'managerprofile.reputation': 'Reputation',
  'managerprofile.savings': 'Savings',
  'managerprofile.current_contract': 'Current contract',
  'managerprofile.no_contract': 'No contract (free agent)',
  'managerprofile.club_history': 'Club history',
```
- [ ] **Step 4 — rodar (passa):** `npx jest parity` → verde.
- [ ] **Step 5 — commit:** `git add src/i18n/pt.ts src/i18n/en.ts` · msg: `feat(c4): i18n de contrato/perfil/spell (paridade pt-en)`.

---

## Task 13: `JobOffersScreen` exibe contrato + estado do spell; passa `band` ao aceitar

**Files:** Modify `src/screens/career/JobOffersScreen.tsx`.
**Interfaces:** Consumes: `getActiveManagerContract`(não, contrato só após aceitar), `getManagerSavings`, `getUnemployedSince`, `buildManagerContract` (preview por oferta), i18n novas. Produces: UI; chamada `acceptJobOffer({ ..., band })`.

**Pré-leitura obrigatória:** ler `src/screens/career/JobOffersScreen.tsx` inteiro (linhas 1-270) para mapear: como cada oferta vira card (`:206-263`), o modo desempregado (`:84-130`), e a confirmação via `Alert` (`:172`). `Alert.alert` é no-op no web (MEMORY) — substituir a confirmação por `useConfirm` do kit se já existir em `src/components/`; se não existir, manter o fluxo atual mas adicionar um caminho web-safe (botão direto sem `Alert`).

- [ ] **Step 1 — teste falhando (i18n + smoke de tipos):** não há teste de render para esta tela no padrão atual; o "teste que falha" aqui é o `npx tsc --noEmit` após mudar a chamada de `acceptJobOffer` para exigir `band`. Antes de implementar, rodar `npx tsc --noEmit` e confirmar o erro `Property 'band' is missing` na chamada da tela.
- [ ] **Step 2 — implementar:** na `JobOffersScreen`:
  - Derivar a banda por oferta: quando `isUnemployed` → `'rescue'`; caso contrário, comparar `offer.clubReputation` com a reputação do clube atual (acima → `'step_up'`, igual → `'lateral'`). Helper local `bandForOffer(offer): OfferBand`.
  - Em cada card de oferta, exibir um preview de contrato com `buildManagerContract({ clubReputation: offer.clubReputation, managerReputation, band, startSeason: newSeason, rng: new SeededRng(newSeason * 31337 + offer.offeringClubId) })` → mostrar `joboffers.contract_duration` (`endSeason-startSeason`), `joboffers.contract_wage`, `joboffers.contract_clause` e o rótulo da banda (`joboffers.band_*`).
  - No modo desempregado, no header, exibir `unemployed.savings` (via `getManagerSavings`) e `unemployed.seasons_idle` (via `getUnemployedSince` vs. temporada atual).
  - Na confirmação de aceitar, chamar `acceptJobOffer({ ..., band: bandForOffer(offer) })`.
  - Substituir `Alert.alert` por `useConfirm` do kit se disponível (verificar `src/components/`); senão, manter mas garantir caminho web-safe.
  - Usar tokens de `@/theme` (sem hardcode de cor) — espelhar componentes já usados na tela.
- [ ] **Step 3 — rodar (tipos):** `npx tsc --noEmit` → exit 0.
- [ ] **Step 4 — browser (Playwright MCP):** subir web (background do harness, `npm run web` porta 8082, `--clear`); navegar até o gate de ofertas (criar save → forçar fim de temporada com rep alta, ou usar um save de teste). Validar: cards mostram duração/wage/cláusula; aceitar troca de clube sem erro de console; no modo desempregado a poupança aparece. 0 erros no console.
- [ ] **Step 5 — commit:** `git add src/screens/career/JobOffersScreen.tsx` · msg: `feat(c4): JobOffersScreen mostra contrato proposto + estado do spell, passa band ao aceitar`.

---

## Task 14: `ManagerProfileScreen` + rota

**Files:** Create `src/screens/career/ManagerProfileScreen.tsx`, Modify `src/navigation/types.ts` + a stack que registra telas de carreira (ler `src/navigation/` para achar onde `JobOffers` é registrado e espelhar).
**Interfaces:** Consumes: `getManagerReputation`, `getManagerSavings`, `getActiveManagerContract`, `getUnemployedSince`, i18n `managerprofile.*`. Produces: tela + rota `ManagerProfile`.

**Pré-leitura:** achar onde `JobOffers` está no `RootStackParamList`/stack (`src/navigation/types.ts` + stack) e como uma tela simples de leitura é montada (ex.: uma screen de carreira existente) para espelhar o scaffolding e o uso do DbHandle do store.

- [ ] **Step 1 — registrar rota:** em `src/navigation/types.ts` adicionar `ManagerProfile: undefined;` ao param list usado por essas telas; registrar `<Stack.Screen name="ManagerProfile" component={ManagerProfileScreen} />` na stack correspondente.
- [ ] **Step 2 — implementar tela** `src/screens/career/ManagerProfileScreen.tsx`: ler do DbHandle (store) reputação, poupança, contrato ativo (ou `managerprofile.no_contract` quando null), e exibir um histórico simples de clubes se já houver fonte (`season-history`/`save_games`); se não houver fonte trivial, exibir só o clube atual sob `managerprofile.club_history` (sem inventar query nova nesta task). Tokens de `@/theme`; componentes do kit existentes (`SectionCard`/`StatBar`).
- [ ] **Step 3 — rodar (tipos):** `npx tsc --noEmit` → exit 0.
- [ ] **Step 4 — browser (Playwright MCP):** navegar até `ManagerProfile` (adicionar entrada de navegação a partir de um menu de carreira/Home se fizer sentido, ou abrir via deep link de dev); confirmar render de reputação/poupança/contrato. 0 erros de console.
- [ ] **Step 5 — commit:** `git add src/screens/career/ManagerProfileScreen.tsx src/navigation/types.ts <arquivo-da-stack>` · msg: `feat(c4): ManagerProfileScreen (reputação, contrato, poupança) + rota`.

---

## Task 15: E2E — spell multi-temporada, contrato expirado, piso terminal, determinismo

**Files:** Modify `__tests__/e2e/test-helpers.ts`, Modify `__tests__/e2e/career-loop.e2e.test.ts`.
**Interfaces:** Consumes: `advanceUnemploymentSeason`, `getActiveManagerContract`, `clearManagerContract`, `getManagerSavings`, `setUnemployedSince`, `isContractExpiring`. Produces: helper `advanceUnemploymentHeadless`; novos casos e2e.

- [ ] **Step 1 — estender `endSeasonHeadless` (ramo demitido) — teste primeiro:** no `career-loop.e2e.test.ts`, adicionar o caso golden de spell ANTES de mexer no helper, para vê-lo falhar:
```ts
import { advanceUnemploymentHeadless } from './test-helpers';
import { getManagerReputation, setManagerReputation, getManagerSavings } from '@/database/queries/save';

it('demitido → spell de 2+ temporadas → aceita resgate de banda menor → continua', async () => {
  await playUntilSeasonEnd(ctx, 4321);
  ctx.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(ctx.saveId); // força demissão
  const repAtDismissal = await getManagerReputation(ctx.db, ctx.saveId);

  // demitido sem aceitar imediatamente → entra no spell (unemployed=1, since=season)
  const fired = await endSeasonHeadless(ctx, { accept: false, enterSpell: true });
  expect(fired.fired).toBe(true);
  const unemp = ctx.rawDb.prepare('SELECT unemployed, unemployed_since_season FROM save_games WHERE id = ?').get(ctx.saveId) as { unemployed: number; unemployed_since_season: number };
  expect(unemp.unemployed).toBe(1);
  expect(unemp.unemployed_since_season).not.toBeNull();

  // avança 2 rodadas de mercado sem aceitar (decaimento + dreno visíveis)
  await advanceUnemploymentHeadless(ctx, { accept: false });
  const r2 = await advanceUnemploymentHeadless(ctx, { accept: true });
  expect(r2.accepted).toBe(true);

  const repAfter = await getManagerReputation(ctx.db, ctx.saveId);
  expect(repAfter).toBeLessThan(repAtDismissal); // decaimento durante o spell
  // segue jogando uma temporada inteira no novo clube sem crash
  const next = await playUntilSeasonEnd(ctx, 4322);
  expect(next.isSeasonEnd).toBe(true);
}, 180_000);
```
- [ ] **Step 2 — rodar (falha):** `npx jest career-loop -t "spell de 2"` → `enterSpell`/`advanceUnemploymentHeadless` inexistentes.
- [ ] **Step 3 — implementar helpers** em `__tests__/e2e/test-helpers.ts`:
  - Adicionar imports: `advanceUnemploymentSeason`, `getActiveManagerContract`, `clearManagerContract`, `getManagerSavings`, `setManagerSavings`, `setUnemployedSince`, `getManagerReputation`.
  - Estender a opção de `endSeasonHeadless` para `{ accept: boolean; enterSpell?: boolean }`. No ramo demitido (`isManagerDismissed`), antes do `markSaveEnded`: creditar severance do contrato à poupança e limpar contrato:
```ts
    const contract = await getActiveManagerContract(ctx.db, ctx.saveId);
    if (contract) {
      const savings = await getManagerSavings(ctx.db, ctx.saveId);
      await setManagerSavings(ctx.db, ctx.saveId, savings + contract.releaseClause);
      await clearManagerContract(ctx.db, ctx.saveId);
    }
    if (opts.enterSpell) {
      await setUnemployed(ctx.db, ctx.saveId, true);
      await setUnemployedSince(ctx.db, ctx.saveId, endedSeason);
      // roda o mundo com o clube original (igual à UI) para não congelar a simulação
      await runSeasonTransition(ctx.db, {
        saveId: ctx.saveId, playerClubId: ctx.playerClubId, endedSeason,
        newSeason: ctx.season, youthAcademyLevel: club.youthAcademy,
        rng: new SeededRng(ctx.season * 7777),
      });
      return { fired: true, switched: false, newClubId: null };
    }
```
  - Novo helper:
```ts
export async function advanceUnemploymentHeadless(
  ctx: E2EContext,
  opts: { accept: boolean } = { accept: false },
): Promise<{ accepted: boolean; terminal: boolean; newClubId: number | null }> {
  const season = ctx.season; // a virada gera ofertas chaveadas à temporada corrente
  const res = await advanceUnemploymentSeason(ctx.db, {
    saveId: ctx.saveId, season, rng: new SeededRng(season * 6151 + ctx.saveId),
  });
  if (res.terminal) {
    await markSaveEnded(ctx.db, ctx.saveId);
    return { accepted: false, terminal: true, newClubId: null };
  }
  if (opts.accept) {
    const pending = await getPendingJobOffers(ctx.db, ctx.saveId, season);
    if (pending.length > 0) {
      const newClubId = pending[0].offeringClubId;
      await runSeasonTransition(ctx.db, {
        saveId: ctx.saveId, playerClubId: ctx.playerClubId, endedSeason: season,
        newSeason: season + 1,
        youthAcademyLevel: (await getClubById(ctx.db, ctx.saveId, ctx.playerClubId))!.youthAcademy,
        rng: new SeededRng((season + 1) * 7777),
      });
      await acceptJobOffer({
        db: ctx.db, saveId: ctx.saveId, offeringClubId: newClubId,
        offerSeason: season, newSeason: season + 1, band: 'rescue',
        rng: new SeededRng(ctx.saveId * 13 + season),
      });
      await setUnemployed(ctx.db, ctx.saveId, false);
      await setUnemployedSince(ctx.db, ctx.saveId, null);
      ctx.playerClubId = newClubId;
      ctx.season = season + 1;
      return { accepted: true, terminal: false, newClubId };
    }
  }
  ctx.season = season + 1; // nenhuma aceitação → avança a rodada de mercado
  return { accepted: false, terminal: false, newClubId: null };
}
```
**Nota:** verificar como `ctx.season` é mutado pelos helpers existentes (`endSeasonHeadless` não muda; `playUntilSeasonEnd` muda) e alinhar a mutação acima ao padrão real lido no arquivo — não duplicar bump de season.
- [ ] **Step 4 — adicionar casos restantes (edge + determinismo):** ao `career-loop.e2e.test.ts`:
```ts
it('spell até o piso terminal encerra a carreira', async () => {
  await playUntilSeasonEnd(ctx, 8000);
  ctx.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(ctx.saveId);
  await endSeasonHeadless(ctx, { accept: false, enterSpell: true });
  // poupança no chão força terminal já na próxima rodada
  ctx.rawDb.prepare('UPDATE save_games SET manager_savings = ? WHERE id = ?').run(-2, ctx.saveId);
  const r = await advanceUnemploymentHeadless(ctx, { accept: false });
  expect(r.terminal).toBe(true);
  const ended = ctx.rawDb.prepare('SELECT ended FROM save_games WHERE id = ?').get(ctx.saveId) as { ended: number };
  expect(ended.ended).toBe(1);
}, 180_000);

it('spell é reprodutível: dois saves, mesmo seed → estado-chave idêntico', async () => {
  const run = async () => {
    const c = await createE2EContext();
    await playUntilSeasonEnd(c, 9001);
    c.rawDb.prepare('UPDATE save_games SET board_trust = 0 WHERE id = ?').run(c.saveId);
    await endSeasonHeadless(c, { accept: false, enterSpell: true });
    await advanceUnemploymentHeadless(c, { accept: false });
    const snap = c.rawDb.prepare('SELECT manager_reputation, manager_savings, unemployed_since_season FROM save_games WHERE id = ?').get(c.saveId);
    const offers = c.rawDb.prepare('SELECT offering_club_id FROM job_offers WHERE save_id = ? ORDER BY offering_club_id').all(c.saveId);
    c.rawDb.close();
    return JSON.stringify({ snap, offers });
  };
  expect(await run()).toEqual(await run());
}, 180_000);
```
- [ ] **Step 5 — rodar (passa) + anti-flaky:** `npx jest career-loop` 5× seguidas verdes:
```bash
for i in 1 2 3 4 5; do npx jest __tests__/e2e/career-loop.e2e.test.ts || break; done
```
Todas verdes (alinhado ao W2 Task 6 anti-flaky).
- [ ] **Step 6 — commit:** `git add __tests__/e2e/test-helpers.ts __tests__/e2e/career-loop.e2e.test.ts` · msg: `test(c4): e2e do spell de desemprego (multi-temporada, piso terminal, determinismo)`.

---

## Task 16: Verificação final (DoD)

**Files:** nenhum (gate).

- [ ] **Step 1 — suíte completa:** `npx tsc --noEmit && npx jest` → tudo verde (inclui paridade i18n, career-loop, rescue-offers W2 não regredidos).
- [ ] **Step 2 — browser final:** `JobOffersScreen` (cards com contrato + estado de spell) e `ManagerProfileScreen` validadas no Playwright MCP, 0 erros de console.
- [ ] **Step 3 — DoD:** mercado pleno (ambição+banda+rng), contrato persistido, spell navegável com decaimento+dreno+piso terminal, demissão paga severance, e2e estendido 5× verde. Wrappers W2 preservados. i18n em paridade.
- [ ] **Step 4 — finalizar branch:** seguir `superpowers:finishing-a-development-branch` (merge/PR conforme orquestrador decidir).

---

## Self-Review

1. **Cobertura do spec:** §3 ambição (Task 2), `generateManagerOffers` rng+banda (Task 3), contrato (Tasks 4,7,9), decaimento (Task 5), schema/migração (Task 6), savings/unemployed-since (Task 8), season-end com ambição (Task 10), spell orquestrador (Task 11), i18n (Task 12), `JobOffersScreen`+`ManagerProfileScreen` (Tasks 13,14), e2e estendido com 4 casos do §7 (Task 15), DoD (Task 16). Alternativa "técnicos IA rivais" fica fora (§9).
2. **Placeholder scan:** sem TBD/FIXME. As únicas "checagens de leitura" pedidas são confirmações de assinatura (`rng.next()`/`nextInt`, helper de seed de teste, ponto de registro da stack, existência de `useConfirm`) — não placeholders de comportamento; cada uma tem fallback explícito.
3. **Consistência de tipos:** `OfferBand`/`ManagerOfferCandidate`/`ManagerOffer` (Task 3) consumidos por `manager-contract-engine` (Task 4), `season-end-eval` (Task 10), `unemployment-spell` (Task 11) e `acceptJobOffer` (Task 9). `ManagerContractTerms` → `ManagerContractRow` (Task 7) reusado por `acceptJobOffer` e `JobOffersScreen`. `AcceptJobOfferParams.band` propagado a TODOS os call sites (Task 9 Step 4). Wrappers `generateJobOffers`/`generateRescueOffers` mantêm assinatura W2 (sem `rng`) — `rescue-offers.test.ts` não regride. Seeds reusam fórmulas existentes (`*6151+saveId`, `*31337+clubId`, `*7777`).
4. **Riscos conhecidos:** (a) ponderação por ambição é testada por frequência (N=60 seeds), não igualdade exata; (b) `JobOffersScreen` depende de `useConfirm` do kit do Design System — se ausente, manter caminho web-safe sem `Alert` (MEMORY `reference_rn_web_alert`); (c) idempotência do spell apoia-se no `UNIQUE(save_id, season, offering_club_id)` de `job_offers` — coberto em teste (Task 11); (d) `ctx.season` mutation no novo helper precisa alinhar ao padrão real dos helpers existentes (verificado em Task 15 Step 3).
