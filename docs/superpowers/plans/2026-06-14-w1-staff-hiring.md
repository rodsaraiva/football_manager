# W1 — Staff Hiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`).

**Goal:** Habilitar contratação/dispensa de comissão técnica (tabela `staff`: scout/physio/assistant/youth_coach/fitness_coach), fechando o stub `staff.hire_coming_soon`, espelhando o padrão de hiring de `assistants` já existente.

**Architecture:** Há DOIS sistemas: `assistants` (squad/financial/youth, com hiring completo via `AssistantHiringScreen`) e `staff` (scout/physio/etc, hoje só leitura). W1 dá ao `staff` o mesmo loop: motor puro de candidatos → query de hire/fire → UI. Os dois coexistem (sem merge — fora do MVP).

**Tech Stack:** TS, Jest+better-sqlite3, SeededRng, Zustand, React Native.

**Convenções:** TDD; engine puro; `STAFF_*` em balance.ts; i18n pt/en paridade; tokens de `@/theme`; sem Math.random em engine; branch `feat/w1-staff-hiring`; commits terminando `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Subagents NÃO commitam** (orquestrador commita).

**Precedente a espelhar:** `src/engine/assistant/assistant-engine.ts` (`generateAssistant`, pools de nomes), `src/database/queries/assistants.ts` (`insertAssistant`/`dismissAssistant`), `src/screens/club/AssistantHiringScreen.tsx` (fluxo de UI). **Infra do staff já existe (✅):** tabela `staff(id,save_id,name,role,club_id,ability,wage,contract_end)`, `src/types/staff.ts`, `getStaffByClub`/`getStaffByRole`, `getStaffEffects` consumido (game-loop + youth), `clubs.wage_budget`.

---

## File Structure

- **Create** `src/engine/staff/staff-market.ts` — `generateStaffCandidates`, `canHireStaff` (puro).
- **Modify** `src/engine/balance.ts` — `STAFF_ROLE_LIMITS`, bandas de ability/wage por reputação.
- **Modify** `src/database/queries/staff.ts` — `hireStaff`, `fireStaff` (+ `getStaffById` se útil).
- **Modify** `src/screens/club/StaffScreen.tsx` — fluxo de contratar/dispensar (substitui o botão "coming soon").
- **Modify** `src/i18n/pt.ts` + `en.ts` — `staff.hire_*`/`staff.fire_*` (paridade).
- **Test** `__tests__/engine/staff/staff-market.test.ts`, `__tests__/database/queries/staff-hire.test.ts`.

**Contract (assinaturas exatas):**

```ts
// types/staff.ts (adicionar)
export interface StaffCandidate { name: string; role: StaffRole; ability: number; wage: number; }

// engine/staff/staff-market.ts
export function generateStaffCandidates(role: StaffRole, clubReputation: number, rng: SeededRng): StaffCandidate[];
export function canHireStaff(input: { budget: number; wageBudget: number; candidateWage: number; currentCountForRole: number; maxSlots: number }): { ok: boolean; reason?: 'budget' | 'wage_budget' | 'slots' };

// database/queries/staff.ts (adicionar)
export async function hireStaff(db: DbHandle, saveId: number, clubId: number, c: { name: string; role: StaffRole; ability: number; wage: number }): Promise<number>; // retorna id
export async function fireStaff(db: DbHandle, saveId: number, staffId: number): Promise<void>;
```

---

## Task 1: Constantes de balance + tipo StaffCandidate

**Files:** Modify `src/engine/balance.ts`, `src/types/staff.ts`.

- [ ] **Step 1:** Em `balance.ts` adicionar:
```ts
export const STAFF_ROLE_LIMITS: Record<string, number> = { scout: 2, assistant: 2, physio: 1, youth_coach: 1, fitness_coach: 1 };
export const STAFF_CANDIDATE_POOL_SIZE = 6;
export const STAFF_ABILITY_MIN = 4;
export const STAFF_ABILITY_MAX = 20;
export const STAFF_WAGE_PER_ABILITY = 250; // wage semanal ≈ ability * 250 (±)
```
- [ ] **Step 2:** Em `src/types/staff.ts` adicionar `export interface StaffCandidate { name: string; role: StaffRole; ability: number; wage: number; }`.
- [ ] **Step 3:** `npx tsc --noEmit` (exit 0).

---

## Task 2: Motor puro `staff-market.ts` (TDD)

**Files:** Create `src/engine/staff/staff-market.ts`, `__tests__/engine/staff/staff-market.test.ts`.

- [ ] **Step 1 — teste falhando:**
```ts
import { generateStaffCandidates, canHireStaff } from '@/engine/staff/staff-market';
import { SeededRng } from '@/engine/rng';
import { STAFF_CANDIDATE_POOL_SIZE } from '@/engine/balance';

it('gera N candidatos da função com ability/wage plausíveis e determinístico', () => {
  const a = generateStaffCandidates('scout', 80, new SeededRng(5));
  const b = generateStaffCandidates('scout', 80, new SeededRng(5));
  expect(a).toEqual(b);                          // determinístico
  expect(a).toHaveLength(STAFF_CANDIDATE_POOL_SIZE);
  for (const c of a) {
    expect(c.role).toBe('scout');
    expect(c.ability).toBeGreaterThanOrEqual(1);
    expect(c.ability).toBeLessThanOrEqual(20);
    expect(c.wage).toBeGreaterThan(0);
  }
  // reputação maior tende a melhor ability média
  const lowRep = generateStaffCandidates('scout', 30, new SeededRng(5));
  const avg = (xs: {ability:number}[]) => xs.reduce((s,c)=>s+c.ability,0)/xs.length;
  expect(avg(a)).toBeGreaterThan(avg(lowRep) - 1); // não garante estritamente, mas tendência
});

it('canHireStaff barra por budget, wage_budget e slots', () => {
  expect(canHireStaff({ budget: 100, wageBudget: 100000, candidateWage: 2000, currentCountForRole: 0, maxSlots: 2 }).ok).toBe(true);
  expect(canHireStaff({ budget: 100, wageBudget: 100, candidateWage: 2000, currentCountForRole: 0, maxSlots: 2 })).toMatchObject({ ok: false, reason: 'wage_budget' });
  expect(canHireStaff({ budget: 100, wageBudget: 100000, candidateWage: 2000, currentCountForRole: 2, maxSlots: 2 })).toMatchObject({ ok: false, reason: 'slots' });
});
```
- [ ] **Step 2 — rodar (falha: módulo inexistente).** `npx jest __tests__/engine/staff/staff-market.test.ts`
- [ ] **Step 3 — implementar** `staff-market.ts` (puro, espelhando `assistant-engine.ts`): pool de nomes `STAFF_NAMES` (criar ~24 nomes); `generateStaffCandidates` gera `STAFF_CANDIDATE_POOL_SIZE` candidatos: `ability = clamp(rng.nextInt(STAFF_ABILITY_MIN, STAFF_ABILITY_MAX) escalado pela reputação)` (ex.: base `nextInt(4,20)` + bônus `Math.round((clubReputation-50)/12)` clampado [1,20]); `wage = ability * STAFF_WAGE_PER_ABILITY` arredondado a 50. `canHireStaff`: checa `currentCountForRole < maxSlots` (senão 'slots'), `candidateWage <= wageBudget` (senão 'wage_budget'), `candidateWage <= budget` (senão 'budget'); `ok:true` caso contrário.
- [ ] **Step 4 — rodar (passa).** **Step 5:** (orquestrador commita).

---

## Task 3: Queries `hireStaff`/`fireStaff` (TDD, SQLite real)

**Files:** Modify `src/database/queries/staff.ts`, Create `__tests__/database/queries/staff-hire.test.ts`.

- [ ] **Step 1 — teste falhando** (usar `seedTestDb` + `TEST_SAVE_ID`, padrão de `__tests__/database/queries/`):
```ts
// hire insere staff p/ o clube; getStaffByClub passa a retornar +1; fire remove.
it('hireStaff insere e fireStaff remove', async () => {
  // ... setup db + seed ...
  const id = await hireStaff(db, TEST_SAVE_ID, clubId, { name: 'Test Scout', role: 'scout', ability: 14, wage: 3500 });
  const after = await getStaffByClub(db, TEST_SAVE_ID, clubId);
  expect(after.some(s => s.id === id && s.role === 'scout' && s.ability === 14)).toBe(true);
  await fireStaff(db, TEST_SAVE_ID, id);
  const afterFire = await getStaffByClub(db, TEST_SAVE_ID, clubId);
  expect(afterFire.some(s => s.id === id)).toBe(false);
});
```
- [ ] **Step 2 — rodar (falha).**
- [ ] **Step 3 — implementar** em `staff.ts`: `hireStaff` faz `INSERT INTO staff (save_id,name,role,club_id,ability,wage,contract_end) VALUES (...)` (contract_end = uma temporada à frente; pode receber/derivar a temporada atual — para V1 usar um valor fixo razoável ou aceitar `contractEnd` no candidato; manter simples: `contract_end = 9999` ou passar a temporada — decidir lendo como assistants faz). Retorna o `lastInsertRowid`. `fireStaff`: `DELETE FROM staff WHERE save_id = ? AND id = ?`. **Sem** signing fee/severance na V1.0 (só compromisso de wage).
- [ ] **Step 4 — rodar (passa). Step 5:** (orquestrador commita).

---

## Task 4: UI de contratação na StaffScreen

**Files:** Modify `src/screens/club/StaffScreen.tsx`, `src/i18n/pt.ts`+`en.ts`.

- [ ] **Step 1 — i18n:** substituir `staff.hire_coming_soon` por chaves: `staff.hire_button` ("Contratar"), `staff.fire_button` ("Dispensar"), `staff.hire_title` ("Contratar — {role}"), `staff.candidate_wage` ("{wage}/sem"), `staff.candidate_ability` ("Habilidade {ability}"), `staff.cannot_hire_budget`/`_wage_budget`/`_slots`, `staff.confirm_fire` ("Dispensar {name}?"). Paridade pt/en.
- [ ] **Step 2 — UI:** na `StaffScreen`, substituir o footer "coming soon" por um fluxo: para cada função, um botão "Contratar" que abre uma lista de candidatos (`generateStaffCandidates(role, playerClub.reputation, new SeededRng(<seed estável: saveId*…+role-index+week>))`) mostrando ability/wage; ao escolher, validar `canHireStaff` (usar `getStaffByClub` p/ `currentCountForRole`, `STAFF_ROLE_LIMITS[role]`, `club.budget`, `club.wageBudget`); se ok, `hireStaff` + atualizar a lista; senão exibir o motivo. Cada membro atual ganha botão "Dispensar" → `fireStaff` + refresh. Tokens de `@/theme`; espelhar a estrutura da `AssistantHiringScreen`.
- [ ] **Step 3:** `npx tsc --noEmit` (exit 0). **Step 4:** (orquestrador commita).

---

## Task 5: Verificação (DoD)

- [ ] **Step 1:** `npx tsc --noEmit && npx jest` — tudo verde (incl. career-loop e2e do W0 + paridade i18n).
- [ ] **Step 2 — browser:** abrir Club → Staff, contratar um scout (reflete na lista + valida budget), dispensar um membro. 0 erros de console.
- [ ] **Step 3 — DoD:** hiring/fire funcional; `staff.hire_coming_soon` removido; motor+queries testados; suíte+tsc verdes; UI validada.

---

## Self-Review
1. **Cobertura:** motor (Task 2), queries (Task 3), UI+i18n (Task 4), constantes (Task 1), verificação (Task 5). Reconciliação com assistant-hiring = coexistência (sem merge, documentado).
2. **Placeholders:** Task 3 deixa o `contract_end` a confirmar (ler como assistants/seed fazem) — resolver na execução, não é placeholder de comportamento.
3. **Tipos:** `StaffCandidate`/`generateStaffCandidates`/`canHireStaff`/`hireStaff`/`fireStaff` fixados no contract.
