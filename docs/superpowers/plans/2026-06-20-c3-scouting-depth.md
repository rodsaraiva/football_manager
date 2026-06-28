# C3 — Scouting Profundo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação de 2–5 min. Código real em cada passo; sem placeholders. **Subagents NÃO commitam** — o orquestrador faz o commit descrito no Step "commit".

**Goal:** Transformar o fog-of-war linear (curva 0–100 sem diferenciação) num sistema com arquétipos de olheiro (multiplicadores puros), missões com tipo e prazo (`scout_missions`), intel pré-jogo do adversário, prospecção determinística de jovens e callback de relatório real (fechando o TODO de news genérico) — culminando numa `ScoutingScreen` reescrita como "Comissão de Scouting".

**Architecture:** Estender, não reescrever. `scouting-engine.ts` puro continua a fonte de verdade de tier/máscara. Adicionamos 3 módulos puros (`scout-archetypes`, `scout-missions`, `youth-prospects`), a tabela `scout_missions` + coluna `staff.archetype`, queries save-isoladas, e reescrevemos o passo 3·5 do game-loop para avançar missões por tipo e disparar news com `titleVars`/`bodyVars` reais. A tabela `scouting` (knowledge por jogador) é mantida como cache — aditivo, sem perda de save.

**Tech Stack:** TS 5.9 strict, Jest+ts-jest, better-sqlite3 REAL em testes, SeededRng (zero Math.random/Date.now), Zustand, React Navigation v7.

**Convenções:** TDD; engine puro (zero React/Expo em `src/engine`); colunas/tabelas novas em `schema.ts` **E** `database-store.ts`; queries `(db, saveId, ...)`; i18n pt/en paridade; tokens de `@/theme`; branch `feat/c3-scouting`; commits terminando `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Precedente a espelhar:**
- Engine puro testável: `src/engine/scouting/scouting-engine.ts` (`knowledgeTier`/`maskedRange`/`advanceScouting`).
- Geração determinística por seed: `src/engine/youth/youth-academy.ts:96` (`generateYouthPlayers`, `generateName`, `NAME_POOLS`).
- Geração com arquétipo via rng: `src/engine/staff/staff-market.ts:22-36`.
- Query save-isolada + upsert: `src/database/queries/scouting.ts:39-95`.
- Migração espelhada (DDL no store): `src/store/database-store.ts:162-185`.
- News com vars: `src/engine/game-loop.ts:524-531` (callup com `bodyVars`), `src/database/queries/news.ts:31-46`.
- Passo de scouting a reescrever: `src/engine/game-loop.ts:536-562`.

**Pré-condição da UI:** a reescrita da `ScoutingScreen` (Task 11) e o gate da `ReportsOpponentScreen` (Task 12) consomem o kit do Design System (`Card`/`Button`/`StatBar`/`Text`/`Icon`/`EmptyState`/`Toast`/`useConfirm`). Hoje só existem `StatBar` e `EmptyState` em `src/components/`. **Tasks 1–10 (motor/DB/game-loop) NÃO dependem do kit e devem ser feitas primeiro.** Se o kit ainda não existir quando chegar nas Tasks 11–12, usar os componentes atuais (`SectionCard`/`EmptyState`/tokens de `@/theme`) — o plano marca explicitamente cada ponto.

---

## File Structure

- **Create** `src/engine/scouting/scout-archetypes.ts` — tipos de arquétipo + `archetypeMultiplier()` + `archetypeAccuracyBonus()`. Puro.
- **Create** `src/engine/scouting/scout-missions.ts` — `MISSION_DEFS`, `advanceMission()`, `missionVerdict()`. Puro.
- **Create** `src/engine/scouting/youth-prospects.ts` — `generateYouthProspect()` determinístico. Puro.
- **Modify** `src/engine/scouting/scouting-engine.ts:39-50` — `maskedRange` ganha param `accuracy?` retrocompatível.
- **Modify** `src/engine/staff/staff-market.ts:22-36` — `generateStaffCandidates` atribui `archetype` quando `role === 'scout'`.
- **Modify** `src/types/staff.ts` — `Staff.archetype?` e `StaffCandidate.archetype?`.
- **Modify** `src/database/schema.ts:175` + `:462` — DDL `scout_missions` + índices; coluna `archetype` em `staff`.
- **Modify** `src/store/database-store.ts:172` — espelhar DDL `scout_missions` + `addColumnIfMissing(staff, archetype)`.
- **Create** `src/database/queries/scout-missions.ts` — CRUD save-isolado.
- **Modify** `src/database/queries/staff.ts:30` — `getStaffByClub` retorna `archetype`.
- **Modify** `src/engine/game-loop.ts:536-562` — passo 3·5 reescrito com missões + news real.
- **Modify** `src/i18n/pt.ts:533` + `src/i18n/en.ts:535` — chaves de arquétipo/missão/veredito + reescrita de `news.persist_scouting_*`.
- **Reescrever** `src/screens/reports/ScoutingScreen.tsx` — Comissão de Scouting.
- **Modify** `src/screens/reports/ReportsOpponentScreen.tsx:40-67` — gate por `opponent_intel`.
- **Test** `__tests__/engine/scouting/scout-archetypes.test.ts`, `scout-missions.test.ts`, `youth-prospects.test.ts`, `scouting-engine.test.ts` (estender), `__tests__/database/queries/scout-missions.test.ts`, `__tests__/engine/game-loop-scouting.test.ts`.

**Contract (assinaturas exatas):**

```ts
// src/engine/scouting/scout-archetypes.ts
import type { Position } from '@/types';
export type ScoutArchetype = 'generalist' | 'youth' | 'defenders' | 'regional';
export const SCOUT_ARCHETYPES: readonly ScoutArchetype[];
export interface ArchetypeTarget { age: number; position: Position; regionCode: string; }
export interface ArchetypeContext { scoutRegionCode: string; }
export function archetypeMultiplier(a: ScoutArchetype, t: ArchetypeTarget, ctx: ArchetypeContext): number; // 0.7–1.6
export function archetypeAccuracyBonus(a: ScoutArchetype, t: ArchetypeTarget, ctx: ArchetypeContext): number; // 0–0.15

// src/engine/scouting/scout-missions.ts
export type MissionType = 'short_eval' | 'long_project' | 'opponent_intel' | 'youth_prospect';
export interface MissionDef { type: MissionType; durationWeeks: number; weeklyPaceMult: number; revealsPotential: boolean; }
export const MISSION_DEFS: Record<MissionType, MissionDef>;
export interface MissionProgressRow { missionId: number; type: MissionType; knowledge: number; weeksElapsed: number; scoutAbility: number; archetypeMult: number; }
export interface MissionProgressResult { missionId: number; knowledge: number; weeksElapsed: number; completed: boolean; expiredEarly: boolean; }
export function advanceMission(row: MissionProgressRow): MissionProgressResult;
export type VerdictKey = 'verdict.bargain' | 'verdict.solid' | 'verdict.risky' | 'verdict.inconclusive';
export function missionVerdict(knowledge: number, maskedOvr: number): { verdictKey: VerdictKey };

// src/engine/scouting/youth-prospects.ts
import { SeededRng } from '@/engine/rng';
import type { Position } from '@/types';
export interface YouthProspect { name: string; age: number; position: Position; regionCode: string; basePotential: number; maskedPotentialLo: number; maskedPotentialHi: number; }
export function generateYouthProspect(saveId: number, regionCode: string, slot: number, rng: SeededRng): YouthProspect;

// src/engine/scouting/scouting-engine.ts  (estendida, retrocompatível)
export function maskedRange(value: number, tier: ScoutingTier, accuracy?: number): { lo: number; hi: number } | null;

// src/database/queries/scout-missions.ts
import { DbHandle } from './players';
import type { MissionType } from '@/engine/scouting/scout-missions';
export interface ScoutMissionDto {
  id: number; scoutId: number; type: MissionType;
  targetPlayerId: number | null; targetClubId: number | null; regionCode: string | null;
  weeksElapsed: number; status: 'active' | 'completed' | 'expired';
}
export async function createMission(db: DbHandle, saveId: number, input: { scoutId: number; type: MissionType; targetPlayerId: number | null; targetClubId: number | null; regionCode: string | null; createdSeason: number; createdWeek: number; }): Promise<number>;
export async function getActiveMissions(db: DbHandle, saveId: number): Promise<ScoutMissionDto[]>;
export async function getMissionsByScout(db: DbHandle, saveId: number, scoutId: number): Promise<ScoutMissionDto[]>;
export async function setMissionWeeks(db: DbHandle, saveId: number, missionId: number, weeksElapsed: number): Promise<void>;
export async function completeMission(db: DbHandle, saveId: number, missionId: number, status: 'completed' | 'expired'): Promise<void>;
export async function cancelMission(db: DbHandle, saveId: number, missionId: number): Promise<void>;
export async function getCompletedIntelForClub(db: DbHandle, saveId: number, clubId: number): Promise<boolean>;
```

---

## Task 1: Tipos de staff — `archetype`

**Files:** Modify `src/types/staff.ts`.
**Interfaces:** Produces: `Staff.archetype?`, `StaffCandidate.archetype?`. Consumes: `ScoutArchetype` (Task 2).

- [ ] **Step 1 — implementar:** em `src/types/staff.ts`, adicionar o import e os campos opcionais (opcionais por retrocompat de saves sem coluna):
```ts
import type { ScoutArchetype } from '@/engine/scouting/scout-archetypes';

export interface Staff {
  id: number;
  name: string;
  role: StaffRole;
  clubId: number;
  ability: number;
  wage: number;
  contractEnd: number;
  archetype?: ScoutArchetype;
}

export interface StaffCandidate {
  name: string;
  role: StaffRole;
  ability: number;
  wage: number;
  archetype?: ScoutArchetype;
}
```
- [ ] **Step 2 — rodar:** `npx tsc --noEmit` → vai **falhar** com `Cannot find module '@/engine/scouting/scout-archetypes'` (esperado; criado na Task 2). Seguir para Task 2 antes de commitar.

---

## Task 2: Motor puro `scout-archetypes.ts` (TDD)

**Files:** Create `src/engine/scouting/scout-archetypes.ts`, Test `__tests__/engine/scouting/scout-archetypes.test.ts`.
**Interfaces:** Produces: `archetypeMultiplier`, `archetypeAccuracyBonus`, `ScoutArchetype`, `SCOUT_ARCHETYPES`, `ArchetypeTarget`, `ArchetypeContext`. Consumes: `Position` de `@/types`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/scouting/scout-archetypes.test.ts`:
```ts
import {
  archetypeMultiplier,
  archetypeAccuracyBonus,
  SCOUT_ARCHETYPES,
  ArchetypeTarget,
  ArchetypeContext,
} from '@/engine/scouting/scout-archetypes';

const ctx = (region: string): ArchetypeContext => ({ scoutRegionCode: region });
const tgt = (over: Partial<ArchetypeTarget> = {}): ArchetypeTarget => ({
  age: 24, position: 'CM', regionCode: 'BR', ...over,
});

describe('archetypeMultiplier', () => {
  it('generalista é neutro (1.0) para qualquer alvo', () => {
    expect(archetypeMultiplier('generalist', tgt(), ctx('BR'))).toBe(1.0);
    expect(archetypeMultiplier('generalist', tgt({ age: 16, position: 'GK' }), ctx('DE'))).toBe(1.0);
  });

  it('youth specialist rende mais em jovem e menos em veterano', () => {
    const young = archetypeMultiplier('youth', tgt({ age: 16 }), ctx('BR'));
    const old = archetypeMultiplier('youth', tgt({ age: 31 }), ctx('BR'));
    expect(young).toBeGreaterThan(1.0);
    expect(young).toBeGreaterThan(archetypeMultiplier('generalist', tgt({ age: 16 }), ctx('BR')));
    expect(old).toBeLessThan(1.0);
  });

  it('defenders rende mais em defensores e menos em atacantes', () => {
    expect(archetypeMultiplier('defenders', tgt({ position: 'CB' }), ctx('BR'))).toBeGreaterThan(1.0);
    expect(archetypeMultiplier('defenders', tgt({ position: 'ST' }), ctx('BR'))).toBeLessThan(1.0);
  });

  it('regional rende mais quando a região casa e neutro quando difere', () => {
    expect(archetypeMultiplier('regional', tgt({ regionCode: 'BR' }), ctx('BR'))).toBeGreaterThan(1.0);
    expect(archetypeMultiplier('regional', tgt({ regionCode: 'DE' }), ctx('BR'))).toBe(1.0);
  });

  it('mantém o multiplicador na faixa 0.7–1.6', () => {
    for (const a of SCOUT_ARCHETYPES) {
      for (const age of [16, 24, 33]) {
        for (const pos of ['GK', 'CB', 'ST'] as const) {
          const m = archetypeMultiplier(a, tgt({ age, position: pos }), ctx('BR'));
          expect(m).toBeGreaterThanOrEqual(0.7);
          expect(m).toBeLessThanOrEqual(1.6);
        }
      }
    }
  });

  it('região vazia não casa regional (sem crash)', () => {
    expect(archetypeMultiplier('regional', tgt({ regionCode: '' }), ctx(''))).toBe(1.0);
  });
});

describe('archetypeAccuracyBonus', () => {
  it('dá bônus 0–0.15 quando o alvo casa a especialidade, 0 caso contrário', () => {
    expect(archetypeAccuracyBonus('youth', tgt({ age: 16 }), ctx('BR'))).toBeGreaterThan(0);
    expect(archetypeAccuracyBonus('youth', tgt({ age: 30 }), ctx('BR'))).toBe(0);
    expect(archetypeAccuracyBonus('generalist', tgt(), ctx('BR'))).toBe(0);
    expect(archetypeAccuracyBonus('regional', tgt({ regionCode: 'BR' }), ctx('BR'))).toBeLessThanOrEqual(0.15);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/scouting/scout-archetypes.test.ts` → `Cannot find module '@/engine/scouting/scout-archetypes'`.
- [ ] **Step 3 — implementar:** criar `src/engine/scouting/scout-archetypes.ts`:
```ts
// Pure scout-archetype model. No React/Expo/DB. Determinístico (sem rng).
import type { Position } from '@/types';

export type ScoutArchetype = 'generalist' | 'youth' | 'defenders' | 'regional';

export const SCOUT_ARCHETYPES: readonly ScoutArchetype[] = [
  'generalist',
  'youth',
  'defenders',
  'regional',
] as const;

export interface ArchetypeTarget {
  age: number;
  position: Position;
  regionCode: string;
}

export interface ArchetypeContext {
  scoutRegionCode: string;
}

const DEFENSIVE_POSITIONS: ReadonlySet<Position> = new Set(['GK', 'CB', 'LB', 'RB', 'CDM']);
const ATTACKING_POSITIONS: ReadonlySet<Position> = new Set(['LW', 'RW', 'ST', 'CAM']);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Multiplicador 0.7–1.6 sobre o ganho semanal base. 1.0 = neutro. */
export function archetypeMultiplier(
  archetype: ScoutArchetype,
  target: ArchetypeTarget,
  ctx: ArchetypeContext,
): number {
  let m = 1.0;
  switch (archetype) {
    case 'generalist':
      m = 1.0;
      break;
    case 'youth':
      if (target.age <= 19) m = 1.4;
      else if (target.age >= 30) m = 0.8;
      else m = 1.0;
      break;
    case 'defenders':
      if (DEFENSIVE_POSITIONS.has(target.position)) m = 1.4;
      else if (ATTACKING_POSITIONS.has(target.position)) m = 0.8;
      else m = 1.0;
      break;
    case 'regional':
      m = target.regionCode !== '' && target.regionCode === ctx.scoutRegionCode ? 1.4 : 1.0;
      break;
  }
  return clamp(m, 0.7, 1.6);
}

/** Bônus 0–0.15 somado a scoutAccuracy quando o alvo casa com a especialidade. */
export function archetypeAccuracyBonus(
  archetype: ScoutArchetype,
  target: ArchetypeTarget,
  ctx: ArchetypeContext,
): number {
  switch (archetype) {
    case 'youth':
      return target.age <= 19 ? 0.15 : 0;
    case 'defenders':
      return DEFENSIVE_POSITIONS.has(target.position) ? 0.15 : 0;
    case 'regional':
      return target.regionCode !== '' && target.regionCode === ctx.scoutRegionCode ? 0.15 : 0;
    case 'generalist':
    default:
      return 0;
  }
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/scouting/scout-archetypes.test.ts` (verde) + `npx tsc --noEmit` (Task 1 também compila agora).
- [ ] **Step 5 — commit:** `git add src/types/staff.ts src/engine/scouting/scout-archetypes.ts __tests__/engine/scouting/scout-archetypes.test.ts` · msg: `feat(c3): arquétipos de olheiro como multiplicadores puros`.

---

## Task 3: Motor puro `scout-missions.ts` (TDD)

**Files:** Create `src/engine/scouting/scout-missions.ts`, Test `__tests__/engine/scouting/scout-missions.test.ts`.
**Interfaces:** Produces: `MissionType`, `MISSION_DEFS`, `advanceMission`, `missionVerdict`, `MissionProgressRow`, `MissionProgressResult`. Consumes: `weeklyKnowledgeGain` de `scouting-engine.ts`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/scouting/scout-missions.test.ts`:
```ts
import {
  MISSION_DEFS,
  advanceMission,
  missionVerdict,
  MissionProgressRow,
} from '@/engine/scouting/scout-missions';

const row = (over: Partial<MissionProgressRow> = {}): MissionProgressRow => ({
  missionId: 1, type: 'short_eval', knowledge: 0, weeksElapsed: 0,
  scoutAbility: 10, archetypeMult: 1.0, ...over,
});

describe('MISSION_DEFS', () => {
  it('define os 4 tipos com prazos esperados', () => {
    expect(MISSION_DEFS.short_eval.durationWeeks).toBe(3);
    expect(MISSION_DEFS.long_project.durationWeeks).toBe(10);
    expect(MISSION_DEFS.opponent_intel.durationWeeks).toBe(1);
    expect(MISSION_DEFS.youth_prospect.durationWeeks).toBe(4);
    expect(MISSION_DEFS.long_project.revealsPotential).toBe(true);
    expect(MISSION_DEFS.short_eval.revealsPotential).toBe(false);
    expect(MISSION_DEFS.short_eval.weeklyPaceMult).toBeGreaterThan(MISSION_DEFS.long_project.weeklyPaceMult);
  });
});

describe('advanceMission', () => {
  it('soma conhecimento por ritmo*arquétipo e incrementa semana', () => {
    const r = advanceMission(row({ knowledge: 0 }));
    expect(r.weeksElapsed).toBe(1);
    expect(r.knowledge).toBeGreaterThan(0);
    expect(r.completed).toBe(false);
  });

  it('short_eval acumula mais rápido que long_project', () => {
    const s = advanceMission(row({ type: 'short_eval' }));
    const l = advanceMission(row({ type: 'long_project' }));
    expect(s.knowledge).toBeGreaterThan(l.knowledge);
  });

  it('arquétipo favorável acelera', () => {
    const base = advanceMission(row({ archetypeMult: 1.0 }));
    const boosted = advanceMission(row({ archetypeMult: 1.4 }));
    expect(boosted.knowledge).toBeGreaterThan(base.knowledge);
  });

  it('completa ao atingir 100', () => {
    const r = advanceMission(row({ knowledge: 99, scoutAbility: 20 }));
    expect(r.knowledge).toBe(100);
    expect(r.completed).toBe(true);
    expect(r.expiredEarly).toBe(false);
  });

  it('expira parcial quando vence o prazo sem 100 (knowledge mantido)', () => {
    // short_eval dura 3 semanas; na 3a semana com knowledge baixo expira parcial.
    const r = advanceMission(row({ type: 'short_eval', knowledge: 5, weeksElapsed: 2, scoutAbility: 1, archetypeMult: 0.7 }));
    expect(r.weeksElapsed).toBe(3);
    expect(r.completed).toBe(true);
    expect(r.expiredEarly).toBe(true);
    expect(r.knowledge).toBeGreaterThan(5); // não zera
  });

  it('opponent_intel completa em 1 semana (duração 1)', () => {
    const r = advanceMission(row({ type: 'opponent_intel', knowledge: 0, weeksElapsed: 0, scoutAbility: 1 }));
    expect(r.weeksElapsed).toBe(1);
    expect(r.completed).toBe(true);
  });
});

describe('missionVerdict', () => {
  it('mapeia faixas de conhecimento + overall', () => {
    expect(missionVerdict(100, 82).verdictKey).toBe('verdict.bargain');
    expect(missionVerdict(100, 70).verdictKey).toBe('verdict.solid');
    expect(missionVerdict(100, 55).verdictKey).toBe('verdict.risky');
    expect(missionVerdict(40, 70).verdictKey).toBe('verdict.inconclusive');
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/scouting/scout-missions.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar:** criar `src/engine/scouting/scout-missions.ts`:
```ts
// Pure mission model. No React/Expo/DB. Determinístico (sem rng).
import { weeklyKnowledgeGain } from './scouting-engine';

export type MissionType = 'short_eval' | 'long_project' | 'opponent_intel' | 'youth_prospect';

export interface MissionDef {
  type: MissionType;
  durationWeeks: number;
  weeklyPaceMult: number;
  revealsPotential: boolean;
}

export const MISSION_DEFS: Record<MissionType, MissionDef> = {
  short_eval: { type: 'short_eval', durationWeeks: 3, weeklyPaceMult: 1.5, revealsPotential: false },
  long_project: { type: 'long_project', durationWeeks: 10, weeklyPaceMult: 0.8, revealsPotential: true },
  opponent_intel: { type: 'opponent_intel', durationWeeks: 1, weeklyPaceMult: 2.0, revealsPotential: false },
  youth_prospect: { type: 'youth_prospect', durationWeeks: 4, weeklyPaceMult: 1.2, revealsPotential: false },
};

export interface MissionProgressRow {
  missionId: number;
  type: MissionType;
  knowledge: number;
  weeksElapsed: number;
  scoutAbility: number;
  archetypeMult: number;
}

export interface MissionProgressResult {
  missionId: number;
  knowledge: number;
  weeksElapsed: number;
  completed: boolean;
  expiredEarly: boolean;
}

export function advanceMission(row: MissionProgressRow): MissionProgressResult {
  const def = MISSION_DEFS[row.type];
  const gain = weeklyKnowledgeGain(row.scoutAbility) * def.weeklyPaceMult * row.archetypeMult;
  const knowledge = Math.min(100, Math.round(row.knowledge + gain));
  const weeksElapsed = row.weeksElapsed + 1;
  const reachedFull = knowledge >= 100;
  const deadlineHit = weeksElapsed >= def.durationWeeks;
  const completed = reachedFull || deadlineHit;
  return {
    missionId: row.missionId,
    knowledge,
    weeksElapsed,
    completed,
    expiredEarly: completed && !reachedFull,
  };
}

export type VerdictKey =
  | 'verdict.bargain'
  | 'verdict.solid'
  | 'verdict.risky'
  | 'verdict.inconclusive';

/** Veredito textual-chave a partir do conhecimento final + masked overall. */
export function missionVerdict(knowledge: number, maskedOvr: number): { verdictKey: VerdictKey } {
  if (knowledge < 60) return { verdictKey: 'verdict.inconclusive' };
  if (maskedOvr >= 78) return { verdictKey: 'verdict.bargain' };
  if (maskedOvr >= 65) return { verdictKey: 'verdict.solid' };
  return { verdictKey: 'verdict.risky' };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/scouting/scout-missions.test.ts` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/scouting/scout-missions.ts __tests__/engine/scouting/scout-missions.test.ts` · msg: `feat(c3): modelo puro de missões de scouting (tipo, prazo, veredito)`.

---

## Task 4: `maskedRange` apertado por accuracy (TDD, retrocompat)

**Files:** Modify `src/engine/scouting/scouting-engine.ts:39-50`, Test `__tests__/engine/scouting/scouting-engine.test.ts` (estender se existir; senão criar).
**Interfaces:** Produces: `maskedRange(value, tier, accuracy?)`. Consumes: nada novo.

- [ ] **Step 1 — verificar teste existente:** `ls __tests__/engine/scouting/scouting-engine.test.ts` (se não existir, criar com os casos abaixo; se existir, **acrescentar** o bloco `describe('maskedRange accuracy', ...)`).
- [ ] **Step 2 — teste falhando:** adicionar a `__tests__/engine/scouting/scouting-engine.test.ts`:
```ts
import { maskedRange } from '@/engine/scouting/scouting-engine';

describe('maskedRange accuracy (C3)', () => {
  it('accuracy undefined = comportamento atual (margem cheia)', () => {
    expect(maskedRange(50, 'vague')).toEqual({ lo: 40, hi: 60 });
    expect(maskedRange(50, 'partial')).toEqual({ lo: 46, hi: 54 });
  });

  it('accuracy alta aperta a margem', () => {
    const full = maskedRange(50, 'vague', 0)!;
    const tight = maskedRange(50, 'vague', 0.9)!;
    expect(tight.hi - tight.lo).toBeLessThan(full.hi - full.lo);
  });

  it('accuracy clampa fora de [0,1]', () => {
    expect(maskedRange(50, 'vague', 5)).toEqual(maskedRange(50, 'vague', 1));
    expect(maskedRange(50, 'vague', -3)).toEqual(maskedRange(50, 'vague', 0));
  });

  it('full e unknown ignoram accuracy', () => {
    expect(maskedRange(50, 'full', 0.5)).toEqual({ lo: 50, hi: 50 });
    expect(maskedRange(50, 'unknown', 0.9)).toBeNull();
  });
});
```
- [ ] **Step 3 — rodar (falha):** `npx jest __tests__/engine/scouting/scouting-engine.test.ts` → os novos casos de accuracy falham (param ignorado).
- [ ] **Step 4 — implementar:** substituir `maskedRange` em `src/engine/scouting/scouting-engine.ts:39-50`:
```ts
export function maskedRange(
  value: number,
  tier: ScoutingTier,
  accuracy?: number,
): { lo: number; hi: number } | null {
  if (tier === 'unknown') return null;
  if (tier === 'full') return { lo: value, hi: value };
  const baseMargin = TIER_MARGIN[tier];
  // accuracy 0–1 aperta a margem em até 50%. undefined = sem ajuste (retrocompat).
  const acc = accuracy === undefined ? 0 : clamp(accuracy, 0, 1);
  const margin = Math.round(baseMargin * (1 - acc * 0.5));
  return {
    lo: clamp(value - margin, 1, 99),
    hi: clamp(value + margin, 1, 99),
  };
}
```
- [ ] **Step 5 — rodar (passa):** `npx jest __tests__/engine/scouting/scouting-engine.test.ts` (todos, incl. testes antigos) + `npx tsc --noEmit`.
- [ ] **Step 6 — commit:** `git add src/engine/scouting/scouting-engine.ts __tests__/engine/scouting/scouting-engine.test.ts` · msg: `feat(c3): maskedRange aperta margem por scoutAccuracy (retrocompatível)`.

---

## Task 5: Prospecção de jovens determinística (TDD)

**Files:** Create `src/engine/scouting/youth-prospects.ts`, Test `__tests__/engine/scouting/youth-prospects.test.ts`.
**Interfaces:** Produces: `generateYouthProspect`, `YouthProspect`. Consumes: `SeededRng`, `Position`.

- [ ] **Step 1 — teste falhando:** criar `__tests__/engine/scouting/youth-prospects.test.ts`:
```ts
import { generateYouthProspect } from '@/engine/scouting/youth-prospects';
import { SeededRng } from '@/engine/rng';

describe('generateYouthProspect', () => {
  it('determinístico: mesma seed/região/slot ⇒ prospecto idêntico', () => {
    const a = generateYouthProspect(1, 'BR', 0, new SeededRng(42));
    const b = generateYouthProspect(1, 'BR', 0, new SeededRng(42));
    expect(a).toEqual(b);
  });

  it('seeds diferentes ⇒ variam', () => {
    const a = generateYouthProspect(1, 'BR', 0, new SeededRng(1));
    const b = generateYouthProspect(1, 'BR', 0, new SeededRng(2));
    expect(a).not.toEqual(b);
  });

  it('respeita faixas: idade 15–17, potencial e máscara coerente', () => {
    const p = generateYouthProspect(7, 'DE', 3, new SeededRng(99));
    expect(p.age).toBeGreaterThanOrEqual(15);
    expect(p.age).toBeLessThanOrEqual(17);
    expect(p.regionCode).toBe('DE');
    expect(p.maskedPotentialLo).toBeLessThanOrEqual(p.basePotential);
    expect(p.maskedPotentialHi).toBeGreaterThanOrEqual(p.basePotential);
    expect(p.name.length).toBeGreaterThan(0);
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/scouting/youth-prospects.test.ts` → módulo inexistente.
- [ ] **Step 3 — implementar:** criar `src/engine/scouting/youth-prospects.ts`. Pool de nomes local (espelha o estilo de `youth-academy.ts`, sem importar internals privados):
```ts
// Pure youth-prospect generator. Determinístico por (saveId, regionCode, slot, seed).
// No React/Expo/DB. Espelha o estilo de generateYouthPlayers (youth-academy.ts:96).
import { SeededRng } from '@/engine/rng';
import type { Position } from '@/types';

export interface YouthProspect {
  name: string;
  age: number; // 15–17
  position: Position;
  regionCode: string;
  basePotential: number;
  maskedPotentialLo: number;
  maskedPotentialHi: number;
}

const FIRST_NAMES = [
  'Luca', 'Mateo', 'Noah', 'Liam', 'Enzo', 'Gael', 'Theo', 'Aron',
  'Nico', 'Ravi', 'Yusuf', 'Kai', 'Diego', 'Bruno', 'Iker', 'Milan',
];
const LAST_NAMES = [
  'Silva', 'Costa', 'Moreau', 'Bauer', 'Rossi', 'Novak', 'Haas', 'Vidal',
  'Sousa', 'Klein', 'Lopes', 'Tavares', 'Fischer', 'Mendez', 'Cruz', 'Berg',
];
const POSITIONS: readonly Position[] = [
  'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST',
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function generateYouthProspect(
  saveId: number,
  regionCode: string,
  slot: number,
  rng: SeededRng,
): YouthProspect {
  // saveId/regionCode/slot apenas modulam o stream do rng já semeado pelo caller,
  // garantindo prospectos distintos por slot sem rng global.
  const salt = saveId * 31 + slot * 7 + (regionCode.charCodeAt(0) || 0);
  for (let i = 0; i < salt % 5; i++) rng.next();

  const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
  const age = rng.nextInt(15, 17);
  const position = rng.pick(POSITIONS);
  const basePotential = clamp(50 + rng.nextInt(-5, 35), 45, 90);
  // Máscara: jovem pré-academia é muito incerto → janela larga ±12, clamp 1–99.
  const margin = 12;
  return {
    name,
    age,
    position,
    regionCode,
    basePotential,
    maskedPotentialLo: clamp(basePotential - margin, 1, 99),
    maskedPotentialHi: clamp(basePotential + margin, 1, 99),
  };
}
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/scouting/youth-prospects.test.ts` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/scouting/youth-prospects.ts __tests__/engine/scouting/youth-prospects.test.ts` · msg: `feat(c3): prospecto de jovem pré-academia determinístico`.

---

## Task 6: `staff-market` atribui arquétipo a olheiros (TDD)

**Files:** Modify `src/engine/staff/staff-market.ts:22-36`, Test `__tests__/engine/staff/staff-market.test.ts` (estender).
**Interfaces:** Produces: `StaffCandidate.archetype` populado quando `role==='scout'`. Consumes: `SCOUT_ARCHETYPES`, `SeededRng`.

- [ ] **Step 1 — teste falhando:** adicionar a `__tests__/engine/staff/staff-market.test.ts`:
```ts
import { SCOUT_ARCHETYPES } from '@/engine/scouting/scout-archetypes';

describe('staff-market archetype (C3)', () => {
  it('atribui archetype válido só a scouts e é determinístico', () => {
    const a = generateStaffCandidates('scout', 70, new SeededRng(11));
    const b = generateStaffCandidates('scout', 70, new SeededRng(11));
    expect(a).toEqual(b);
    for (const c of a) {
      expect(c.archetype).toBeDefined();
      expect(SCOUT_ARCHETYPES).toContain(c.archetype!);
    }
  });

  it('não atribui archetype a não-scouts', () => {
    const physios = generateStaffCandidates('physio', 70, new SeededRng(11));
    for (const c of physios) expect(c.archetype).toBeUndefined();
  });
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/engine/staff/staff-market.test.ts` → `archetype` undefined nos scouts.
- [ ] **Step 3 — implementar:** em `src/engine/staff/staff-market.ts`, adicionar import e atribuir archetype dentro do `.map`:
```ts
import { SCOUT_ARCHETYPES } from '@/engine/scouting/scout-archetypes';
```
E no corpo do `return names.map((name) => { ... })`:
```ts
  return names.map((name) => {
    const base = rng.nextInt(STAFF_ABILITY_MIN, STAFF_ABILITY_MAX);
    const ability = clamp(base + reputationBonus, 1, 20);
    const archetype = role === 'scout' ? rng.pick(SCOUT_ARCHETYPES) : undefined;
    return { name, role, ability, wage: ability * STAFF_WAGE_PER_ABILITY, archetype };
  });
```
- [ ] **Step 4 — rodar (passa):** `npx jest __tests__/engine/staff/staff-market.test.ts` + `npx tsc --noEmit`.
- [ ] **Step 5 — commit:** `git add src/engine/staff/staff-market.ts __tests__/engine/staff/staff-market.test.ts` · msg: `feat(c3): olheiro recebe arquétipo na geração de candidatos`.

---

## Task 7: Schema + migração — `scout_missions` e `staff.archetype`

**Files:** Modify `src/database/schema.ts` (após `:462`/`:484`), Modify `src/store/database-store.ts` (após `:172`).
**Interfaces:** Produces: tabela `scout_missions`, índices, coluna `staff.archetype`. Consumes: nada.

- [ ] **Step 1 — schema canônico:** em `src/database/schema.ts`, logo após o bloco `CREATE TABLE IF NOT EXISTS scouting (...)` (`:462`), inserir:
```sql
-- C3 scout_missions: trabalho de scouting em andamento (1 olheiro = 1 missão ativa).
CREATE TABLE IF NOT EXISTS scout_missions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id          INTEGER NOT NULL REFERENCES save_games(id),
  scout_id         INTEGER NOT NULL,
  type             TEXT    NOT NULL,
  target_player_id INTEGER,
  target_club_id   INTEGER,
  region_code      TEXT,
  weeks_elapsed    INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'active',
  created_season   INTEGER NOT NULL,
  created_week     INTEGER NOT NULL
);
```
E na seção de índices (junto a `idx_scouting_save`, `:484`):
```sql
CREATE INDEX IF NOT EXISTS idx_scout_missions_save  ON scout_missions(save_id, status);
CREATE INDEX IF NOT EXISTS idx_scout_missions_scout ON scout_missions(save_id, scout_id);
```
- [ ] **Step 2 — coluna staff no schema canônico:** ainda em `schema.ts`, na DDL de `CREATE TABLE IF NOT EXISTS staff (...)` (`:166-175`), adicionar a coluna após `contract_end`:
```sql
  contract_end INTEGER NOT NULL,
  archetype    TEXT
);
```
- [ ] **Step 3 — migração espelhada:** em `src/store/database-store.ts`, logo após o bloco `CREATE TABLE IF NOT EXISTS scouting (...)` (`:163-172`), adicionar:
```ts
      // C3 scout_missions + staff.archetype (added post-initial-schema).
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS scout_missions (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          save_id          INTEGER NOT NULL,
          scout_id         INTEGER NOT NULL,
          type             TEXT    NOT NULL,
          target_player_id INTEGER,
          target_club_id   INTEGER,
          region_code      TEXT,
          weeks_elapsed    INTEGER NOT NULL DEFAULT 0,
          status           TEXT    NOT NULL DEFAULT 'active',
          created_season   INTEGER NOT NULL,
          created_week     INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scout_missions_save  ON scout_missions(save_id, status);
        CREATE INDEX IF NOT EXISTS idx_scout_missions_scout ON scout_missions(save_id, scout_id);
      `);
      await addColumnIfMissing(db, 'staff', 'archetype', 'TEXT');
```
- [ ] **Step 4 — rodar:** `npx tsc --noEmit` (exit 0; DDL é string).
- [ ] **Step 5 — commit:** `git add src/database/schema.ts src/store/database-store.ts` · msg: `feat(c3): schema scout_missions + coluna staff.archetype (canônico + migração)`.

---

## Task 8: Queries `scout-missions.ts` (TDD, SQLite real)

**Files:** Create `src/database/queries/scout-missions.ts`, Test `__tests__/database/queries/scout-missions.test.ts`.
**Interfaces:** Produces: `createMission`/`getActiveMissions`/`getMissionsByScout`/`setMissionWeeks`/`completeMission`/`cancelMission`/`getCompletedIntelForClub`, `ScoutMissionDto`. Consumes: `DbHandle`, `MissionType`.

- [ ] **Step 1 — checar helper de teste:** `ls __tests__/database/queries/` e abrir um teste existente (ex.: `scouting`-relacionado ou `staff-hire.test.ts`) para copiar o setup de `better-sqlite3` real + `TEST_SAVE_ID`/`seedTestDb`. **Usar o mesmo helper** (nunca mock).
- [ ] **Step 2 — teste falhando:** criar `__tests__/database/queries/scout-missions.test.ts` (ajustar imports do helper ao padrão observado no Step 1):
```ts
import {
  createMission,
  getActiveMissions,
  getMissionsByScout,
  setMissionWeeks,
  completeMission,
  cancelMission,
  getCompletedIntelForClub,
} from '@/database/queries/scout-missions';
// import { createTestDb, TEST_SAVE_ID } from '<helper observado no Step 1>';

let db: any;
const SAVE = 0; // alinhar a TEST_SAVE_ID do helper

beforeEach(async () => {
  // db = await createTestDb();  // helper real do projeto, executa schema.ts
});

it('create → getActive → complete', async () => {
  const id = await createMission(db, SAVE, {
    scoutId: 10, type: 'short_eval', targetPlayerId: 200,
    targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 3,
  });
  expect(id).toBeGreaterThan(0);
  const active = await getActiveMissions(db, SAVE);
  expect(active.some((m) => m.id === id && m.type === 'short_eval' && m.targetPlayerId === 200)).toBe(true);
  await completeMission(db, SAVE, id, 'completed');
  const after = await getActiveMissions(db, SAVE);
  expect(after.some((m) => m.id === id)).toBe(false);
});

it('save-isolation: missão do save A não aparece no save B', async () => {
  const id = await createMission(db, 0, {
    scoutId: 1, type: 'long_project', targetPlayerId: 5,
    targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1,
  });
  const otherSave = await getActiveMissions(db, 1);
  expect(otherSave.some((m) => m.id === id)).toBe(false);
});

it('getMissionsByScout filtra por olheiro', async () => {
  await createMission(db, SAVE, { scoutId: 7, type: 'short_eval', targetPlayerId: 1, targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1 });
  await createMission(db, SAVE, { scoutId: 8, type: 'short_eval', targetPlayerId: 2, targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1 });
  const m7 = await getMissionsByScout(db, SAVE, 7);
  expect(m7).toHaveLength(1);
  expect(m7[0].scoutId).toBe(7);
});

it('setMissionWeeks atualiza progresso; cancel marca expired e some do active', async () => {
  const id = await createMission(db, SAVE, { scoutId: 3, type: 'long_project', targetPlayerId: 9, targetClubId: null, regionCode: null, createdSeason: 1, createdWeek: 1 });
  await setMissionWeeks(db, SAVE, id, 4);
  const active = await getActiveMissions(db, SAVE);
  expect(active.find((m) => m.id === id)?.weeksElapsed).toBe(4);
  await cancelMission(db, SAVE, id);
  expect((await getActiveMissions(db, SAVE)).some((m) => m.id === id)).toBe(false);
});

it('getCompletedIntelForClub true só após opponent_intel concluído', async () => {
  expect(await getCompletedIntelForClub(db, SAVE, 99)).toBe(false);
  const id = await createMission(db, SAVE, { scoutId: 2, type: 'opponent_intel', targetPlayerId: null, targetClubId: 99, regionCode: null, createdSeason: 1, createdWeek: 1 });
  await completeMission(db, SAVE, id, 'completed');
  expect(await getCompletedIntelForClub(db, SAVE, 99)).toBe(true);
});
```
- [ ] **Step 3 — rodar (falha):** `npx jest __tests__/database/queries/scout-missions.test.ts` → módulo inexistente.
- [ ] **Step 4 — implementar:** criar `src/database/queries/scout-missions.ts`:
```ts
import { DbHandle } from './players';
import type { MissionType } from '@/engine/scouting/scout-missions';

export interface ScoutMissionDto {
  id: number;
  scoutId: number;
  type: MissionType;
  targetPlayerId: number | null;
  targetClubId: number | null;
  regionCode: string | null;
  weeksElapsed: number;
  status: 'active' | 'completed' | 'expired';
}

interface ScoutMissionRow {
  id: number;
  scout_id: number;
  type: MissionType;
  target_player_id: number | null;
  target_club_id: number | null;
  region_code: string | null;
  weeks_elapsed: number;
  status: 'active' | 'completed' | 'expired';
}

function toDto(r: ScoutMissionRow): ScoutMissionDto {
  return {
    id: r.id,
    scoutId: r.scout_id,
    type: r.type,
    targetPlayerId: r.target_player_id,
    targetClubId: r.target_club_id,
    regionCode: r.region_code,
    weeksElapsed: r.weeks_elapsed,
    status: r.status,
  };
}

export async function createMission(
  db: DbHandle,
  saveId: number,
  input: {
    scoutId: number;
    type: MissionType;
    targetPlayerId: number | null;
    targetClubId: number | null;
    regionCode: string | null;
    createdSeason: number;
    createdWeek: number;
  },
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO scout_missions
         (save_id, scout_id, type, target_player_id, target_club_id, region_code,
          weeks_elapsed, status, created_season, created_week)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?)`,
    )
    .run(
      saveId,
      input.scoutId,
      input.type,
      input.targetPlayerId,
      input.targetClubId,
      input.regionCode,
      input.createdSeason,
      input.createdWeek,
    );
  return Number(res.lastInsertRowid);
}

export async function getActiveMissions(db: DbHandle, saveId: number): Promise<ScoutMissionDto[]> {
  const rows = (await db
    .prepare(`SELECT * FROM scout_missions WHERE save_id = ? AND status = 'active'`)
    .all(saveId)) as ScoutMissionRow[];
  return rows.map(toDto);
}

export async function getMissionsByScout(
  db: DbHandle,
  saveId: number,
  scoutId: number,
): Promise<ScoutMissionDto[]> {
  const rows = (await db
    .prepare(`SELECT * FROM scout_missions WHERE save_id = ? AND scout_id = ? AND status = 'active'`)
    .all(saveId, scoutId)) as ScoutMissionRow[];
  return rows.map(toDto);
}

export async function setMissionWeeks(
  db: DbHandle,
  saveId: number,
  missionId: number,
  weeksElapsed: number,
): Promise<void> {
  await db
    .prepare('UPDATE scout_missions SET weeks_elapsed = ? WHERE save_id = ? AND id = ?')
    .run(weeksElapsed, saveId, missionId);
}

export async function completeMission(
  db: DbHandle,
  saveId: number,
  missionId: number,
  status: 'completed' | 'expired',
): Promise<void> {
  await db
    .prepare('UPDATE scout_missions SET status = ? WHERE save_id = ? AND id = ?')
    .run(status, saveId, missionId);
}

export async function cancelMission(db: DbHandle, saveId: number, missionId: number): Promise<void> {
  await completeMission(db, saveId, missionId, 'expired');
}

export async function getCompletedIntelForClub(
  db: DbHandle,
  saveId: number,
  clubId: number,
): Promise<boolean> {
  const row = (await db
    .prepare(
      `SELECT 1 FROM scout_missions
        WHERE save_id = ? AND type = 'opponent_intel' AND target_club_id = ? AND status = 'completed'
        LIMIT 1`,
    )
    .get(saveId, clubId)) as { 1: number } | undefined;
  return row !== undefined;
}
```
- [ ] **Step 5 — rodar (passa):** completar o setup `db`/`SAVE` do teste com o helper real (Step 1), `npx jest __tests__/database/queries/scout-missions.test.ts` (verde) + `npx tsc --noEmit`.
- [ ] **Step 6 — commit:** `git add src/database/queries/scout-missions.ts __tests__/database/queries/scout-missions.test.ts` · msg: `feat(c3): CRUD save-isolado de scout_missions com SQLite real`.

---

## Task 9: `getStaffByClub` retorna `archetype`

**Files:** Modify `src/database/queries/staff.ts:30`, Test `__tests__/database/queries/staff-hire.test.ts` (estender se aplicável) ou novo caso.
**Interfaces:** Produces: `Staff.archetype` populado na leitura. Consumes: coluna `staff.archetype` (Task 7).

- [ ] **Step 1 — ler a query atual:** abrir `src/database/queries/staff.ts` e localizar o `SELECT` de `getStaffByClub` (`:30`) e o mapper para `Staff`.
- [ ] **Step 2 — teste falhando:** num teste de queries de staff existente (ou novo `staff-archetype.test.ts`), inserir um scout com archetype e assertar a leitura:
```ts
it('getStaffByClub lê archetype quando presente', async () => {
  await db.prepare(
    `INSERT INTO staff (id, save_id, name, role, club_id, ability, wage, contract_end, archetype)
     VALUES (501, ?, 'Olheiro Teste', 'scout', ?, 14, 3000, 9999, 'youth')`,
  ).run(SAVE, CLUB_ID);
  const staff = await getStaffByClub(db, SAVE, CLUB_ID);
  expect(staff.find((s) => s.id === 501)?.archetype).toBe('youth');
});
```
- [ ] **Step 3 — rodar (falha):** `npx jest <arquivo>` → `archetype` undefined no DTO.
- [ ] **Step 4 — implementar:** no `SELECT` de `getStaffByClub` (e em qualquer outro getter de staff que retorne `Staff`, ex. `getStaffByRole`), incluir `archetype` na coluna e no mapper:
```ts
// SELECT ... incluir a coluna:
//   SELECT id, name, role, club_id, ability, wage, contract_end, archetype FROM staff WHERE ...
// mapper:
//   archetype: (row.archetype ?? undefined) as Staff['archetype'],
```
(usar `??` para `NULL → undefined`, consistente com `Staff.archetype?`).
- [ ] **Step 5 — rodar (passa):** `npx jest <arquivo>` + `npx tsc --noEmit`.
- [ ] **Step 6 — commit:** `git add src/database/queries/staff.ts __tests__/database/queries/<arquivo>` · msg: `feat(c3): getStaffByClub expõe archetype do olheiro`.

---

## Task 10: Game-loop passo 3·5 reescrito + news real (TDD integração)

**Files:** Modify `src/engine/game-loop.ts:536-562`, Modify `src/i18n/pt.ts:533-534` + `src/i18n/en.ts:535-536`, Test `__tests__/engine/game-loop-scouting.test.ts`.
**Interfaces:** Consumes: `getActiveMissions`/`completeMission`/`setMissionWeeks`, `getStaffByClub` (com archetype), `advanceMission`/`missionVerdict`, `archetypeMultiplier`, `setKnowledge`/`getPlayerKnowledge`, `insertNewsItem`. Produces: news com `titleVars`/`bodyVars` reais.

- [ ] **Step 1 — i18n primeiro (reescrita das chaves + novas):** em `src/i18n/pt.ts` substituir `:533-534` e adicionar as chaves de veredito/missão/arquétipo:
```ts
  'news.persist_scouting_title': 'Relatório: {name}',
  'news.persist_scouting_body': 'Seu olheiro concluiu a avaliação de {name} ({position}, {age} anos). Veredito: {verdict}.',
  'news.scouting_interrupted_title': 'Missão de scouting interrompida',
  'news.scouting_interrupted_body': 'A missão sobre {name} foi interrompida (olheiro indisponível).',
  'news.scouting_intel_title': 'Intel pronta: {club}',
  'news.scouting_intel_body': 'Seu olheiro mapeou o próximo adversário, {club}. Relatório pré-jogo liberado.',
  'news.scouting_youth_title': 'Promessa encontrada: {name}',
  'news.scouting_youth_body': 'Olheiro localizou {name} ({position}, {age} anos), potencial estimado {potLo}–{potHi}.',
  'verdict.bargain': 'oportunidade',
  'verdict.solid': 'reforço sólido',
  'verdict.risky': 'aposta arriscada',
  'verdict.inconclusive': 'inconclusivo',
```
E em `src/i18n/en.ts` (paridade, mesmas chaves):
```ts
  'news.persist_scouting_title': 'Report: {name}',
  'news.persist_scouting_body': 'Your scout finished assessing {name} ({position}, age {age}). Verdict: {verdict}.',
  'news.scouting_interrupted_title': 'Scouting mission interrupted',
  'news.scouting_interrupted_body': 'The mission on {name} was interrupted (scout unavailable).',
  'news.scouting_intel_title': 'Intel ready: {club}',
  'news.scouting_intel_body': 'Your scout mapped the next opponent, {club}. Pre-match report unlocked.',
  'news.scouting_youth_title': 'Prospect found: {name}',
  'news.scouting_youth_body': 'Scout located {name} ({position}, age {age}), estimated potential {potLo}–{potHi}.',
  'verdict.bargain': 'bargain',
  'verdict.solid': 'solid signing',
  'verdict.risky': 'risky bet',
  'verdict.inconclusive': 'inconclusive',
```
- [ ] **Step 2 — teste falhando (integração, SQLite real):** criar `__tests__/engine/game-loop-scouting.test.ts`. Reusar o helper de DB real + o runner de semana usado em testes de game-loop existentes (procurar com `grep -rl "game-loop" __tests__` e copiar o setup). Casos mínimos:
```ts
// 1. short_eval contra um player real: após N semanas, scouting.knowledge sobe
//    e ao completar dispara news com bodyVars.name == nome real do player.
// 2. olheiro removido mid-missão ⇒ missão vira 'expired' + news interrupted.
// 3. determinismo: mesma seed ⇒ mesmo knowledge e mesma news após K semanas.
//
// Esqueleto (ajustar imports do helper):
it('short_eval revela jogador e gera news com nome real', async () => {
  // seed: 1 scout (ability 14, archetype 'generalist') no clube do user;
  // 1 player alvo de outro clube com nome conhecido (ex.: getName).
  // createMission(short_eval, targetPlayerId=alvo).
  // rodar advanceWeek até a missão completar (≤3 semanas).
  // assert: getPlayerKnowledge(alvo) subiu; existe news category 'scouting'
  //         cujo body_vars JSON contém { name: <nome do alvo> }.
});
```
> Implementação concreta do teste: ler `__tests__` para o utilitário de avançar semana (provável `runWeek`/`advanceWeek` que chama `game-loop`). Assertar lendo `news_items` via `db.prepare("SELECT body_vars FROM news_items WHERE category='scouting' ...").all()` e `JSON.parse`.
- [ ] **Step 3 — rodar (falha):** `npx jest __tests__/engine/game-loop-scouting.test.ts` → news ainda genérica (sem vars) / missões não avançam.
- [ ] **Step 4 — implementar:** substituir o bloco `// 3·5 Scouting progression` (`game-loop.ts:536-562`) por orquestração de missões. Adicionar os imports no topo do arquivo:
```ts
import { getActiveMissions, completeMission, setMissionWeeks } from '@/database/queries/scout-missions';
import { advanceMission, missionVerdict, MISSION_DEFS } from '@/engine/scouting/scout-missions';
import { archetypeMultiplier } from '@/engine/scouting/scout-archetypes';
import { knowledgeTier, maskedRange } from '@/engine/scouting/scouting-engine';
import { getStaffEffects } from '@/engine/staff/staff-effects';
```
Novo bloco (substitui `:536-562`):
```ts
  // 3·5 Scouting missions: each active mission for the human club advances by its
  // type/pace/archetype. Completing a mission frees the scout and fires a news item
  // with REAL titleVars/bodyVars (player name + verdict). Orphan missions (scout
  // gone) expire with an interruption notice.
  if (saveId >= 0) {
    const missions = await getActiveMissions(db, saveId);
    if (missions.length > 0) {
      const scoutStaff = (await getStaffByClub(db, saveId, playerClubId)).filter((s) => s.role === 'scout');
      const staffById = new Map(scoutStaff.map((s) => [s.id, s]));
      // region-base do olheiro: país do clube do usuário (proxy estável; sem coluna própria).
      const userClub = clubById.get(playerClubId);
      const scoutRegionCode = userClub ? String(userClub.id) : '';

      for (const m of missions) {
        const scout = staffById.get(m.scoutId);
        if (scout == null) {
          // olheiro saiu do clube → missão órfã expira + news de interrupção.
          await completeMission(db, saveId, m.id, 'expired');
          let orphanName = '';
          if (m.targetPlayerId != null) {
            const p = (await db.prepare('SELECT name FROM players WHERE save_id = ? AND id = ?')
              .get(saveId, m.targetPlayerId)) as { name: string } | undefined;
            orphanName = p?.name ?? '';
          }
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 70,
            titleKey: 'news.scouting_interrupted_title',
            bodyKey: 'news.scouting_interrupted_body',
            bodyVars: { name: orphanName },
          });
          continue;
        }

        // alvo → ArchetypeTarget (player real, ou neutro p/ intel/youth).
        let target = { age: 24, position: 'CM' as const, regionCode: '' };
        let playerKnowledgeBefore = 0;
        if (m.targetPlayerId != null) {
          const p = (await db.prepare(
            'SELECT name, age, position, nationality FROM players WHERE save_id = ? AND id = ?',
          ).get(saveId, m.targetPlayerId)) as
            { name: string; age: number; position: typeof target.position; nationality: string } | undefined;
          if (p == null) {
            // alvo deixou de existir → expira a missão sem news (edge case sec.6).
            await completeMission(db, saveId, m.id, 'expired');
            continue;
          }
          target = { age: p.age, position: p.position, regionCode: p.nationality };
          playerKnowledgeBefore = await getPlayerKnowledge(db, saveId, m.targetPlayerId);
        }

        const archetypeMult = archetypeMultiplier(
          scout.archetype ?? 'generalist',
          target,
          { scoutRegionCode },
        );
        const result = advanceMission({
          missionId: m.id,
          type: m.type,
          knowledge: playerKnowledgeBefore,
          weeksElapsed: m.weeksElapsed,
          scoutAbility: scout.ability,
          archetypeMult,
        });

        // persistência por tipo
        if (m.targetPlayerId != null) {
          await setKnowledge(db, saveId, m.targetPlayerId, result.knowledge);
        }
        await setMissionWeeks(db, saveId, m.id, result.weeksElapsed);

        if (!result.completed) continue;
        await completeMission(db, saveId, m.id, result.expiredEarly ? 'expired' : 'completed');

        // callback de relatório por tipo (news com vars reais)
        if (m.type === 'opponent_intel' && m.targetClubId != null) {
          const club = (await db.prepare('SELECT name FROM clubs WHERE save_id = ? AND id = ?')
            .get(saveId, m.targetClubId)) as { name: string } | undefined;
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.scouting_intel_title', titleVars: { club: club?.name ?? '' },
            bodyKey: 'news.scouting_intel_body', bodyVars: { club: club?.name ?? '' },
          });
        } else if (m.type === 'youth_prospect') {
          // o relatório de jovem é gerado/exibido na UI (Out of scope: recrutar de fato).
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.scouting_youth_title', titleVars: { name: '' },
            bodyKey: 'news.scouting_youth_body',
            bodyVars: { name: '', position: '', age: 0, potLo: 0, potHi: 0 },
          });
        } else if (m.targetPlayerId != null) {
          // short_eval / long_project: veredito sobre o jogador real.
          const p = (await db.prepare(
            'SELECT name, position, age FROM players WHERE save_id = ? AND id = ?',
          ).get(saveId, m.targetPlayerId)) as { name: string; position: string; age: number } | undefined;
          // overall mascarado para o veredito (usa accuracy do olheiro).
          const ovrRow = (await db.prepare(
            'SELECT overall FROM players WHERE save_id = ? AND id = ?',
          ).get(saveId, m.targetPlayerId)) as { overall: number } | undefined;
          const acc = getStaffEffects({
            fitnessCoachAbility: 0, physioAbility: 0, scoutAbility: scout.ability,
            youthCoachAbility: 0, assistantAbility: 0,
          }).scoutAccuracy;
          const masked = maskedRange(ovrRow?.overall ?? 0, knowledgeTier(result.knowledge), acc);
          const maskedOvr = masked ? Math.round((masked.lo + masked.hi) / 2) : (ovrRow?.overall ?? 0);
          const { verdictKey } = missionVerdict(result.knowledge, maskedOvr);
          await insertNewsItem(db, saveId, {
            season, week, category: 'scouting', icon: '🔎', priority: 80,
            titleKey: 'news.persist_scouting_title', titleVars: { name: p?.name ?? '' },
            bodyKey: 'news.persist_scouting_body',
            bodyVars: { name: p?.name ?? '', position: p?.position ?? '', age: p?.age ?? 0, verdict: t(verdictKey) },
          });
        }
      }
    }
  }
```
> **Notas de aterramento que o implementador resolve lendo o arquivo:**
> - O game-loop NÃO importa `t` (i18n) hoje. **Veredito vai como CHAVE, não traduzido**: passar `verdict: verdictKey` em `bodyVars` (string) e ajustar a renderização da news para `t(verdict)` na UI — OU, se as news já são traduzidas no insert em outros pontos, seguir o padrão observado. Verificar como `news.persist_callup_*` resolve vars antes de decidir. Default seguro: `bodyVars: { ..., verdict: verdictKey }` (a camada de news traduz no render). Remover o `t(verdictKey)` acima nesse caso.
> - Confirmar o nome real da coluna de overall em `players` (pode ser computada via `player_attributes` + `calculateOverall`, não coluna direta). Se não houver coluna `overall`, derivar via `getPlayersWithAttributesByClub`/`calculateOverall` como `ReportsOpponentScreen` faz, ou simplificar o veredito usando só `result.knowledge` quando overall não estiver acessível barato. **Não inventar coluna.**
> - `clubById` já existe no escopo do game-loop (`:599`)? Confirmar a ordem: o bloco 3·5 roda **antes** de `clubById` ser montado (`:592`). Mover a leitura de `userClub` para um `SELECT` direto, ou usar `''` como `scoutRegionCode` (regional vira neutro). Default seguro: `scoutRegionCode = ''`.
- [ ] **Step 5 — rodar (passa):** `npx jest __tests__/engine/game-loop-scouting.test.ts` + suíte de game-loop existente (`npx jest game-loop`) — garantir que nada quebrou. `npx tsc --noEmit`.
- [ ] **Step 6 — commit (separar i18n do engine):**
  - `git add src/i18n/pt.ts src/i18n/en.ts` · msg: `feat(c3): chaves i18n de veredito/missão + reescrita de persist_scouting (pt/en)`.
  - `git add src/engine/game-loop.ts __tests__/engine/game-loop-scouting.test.ts` · msg: `feat(c3): passo 3·5 avança missões e dispara news com nome+veredito reais`.

---

## Task 11: `ScoutingScreen` reescrita — Comissão de Scouting

**Files:** Reescrever `src/screens/reports/ScoutingScreen.tsx`, Modify `src/i18n/pt.ts`/`en.ts` (chaves de UI).
**Interfaces:** Consumes: `getStaffByClub`, `searchPlayers`, `getActiveMissions`/`createMission`/`cancelMission`/`getMissionsByScout`, `assignScout`, `MISSION_DEFS`, `SCOUT_ARCHETYPES`, `knowledgeTier`/`maskedRange`. Produces: nova UI.
**Pré-condição:** kit do Design System. **Se ainda não existir** (`ls src/components/kit` falha), usar `SectionCard`/`EmptyState`/tokens de `@/theme` e `Pressable` (como a tela atual) — manter o fluxo, trocar só estética no épico de DS depois.

- [ ] **Step 1 — i18n de UI:** adicionar a `pt.ts` (e paridade em `en.ts`):
```ts
  'scouting.commission_title': 'Comissão de Scouting',
  'scouting.commission_sub': 'Atribua missões aos seus olheiros e acompanhe os relatórios',
  'scouting.archetype_generalist': 'Generalista',
  'scouting.archetype_youth': 'Especialista em jovens',
  'scouting.archetype_defenders': 'Especialista em defensores',
  'scouting.archetype_regional': 'Especialista regional',
  'scouting.mission_short_eval': 'Avaliação curta',
  'scouting.mission_long_project': 'Projeto de longo prazo',
  'scouting.mission_opponent_intel': 'Intel do adversário',
  'scouting.mission_youth_prospect': 'Caça-talentos',
  'scouting.assign_mission': 'Atribuir missão',
  'scouting.cancel_mission': 'Cancelar missão',
  'scouting.confirm_cancel': 'Cancelar a missão de {name}?',
  'scouting.weeks_left': '{n} sem. restantes',
  'scouting.no_idle_scout': 'Nenhum olheiro livre',
```
- [ ] **Step 2 — reescrever a tela:** `src/screens/reports/ScoutingScreen.tsx` — fluxo: lista de olheiros (nome + estrelas + **arquétipo** + estado: livre / em missão com barra de progresso e semanas restantes); para olheiro livre, botão "Atribuir missão" abre seleção de **tipo** (`MISSION_DEFS`) → seleção de **alvo** (player da pool p/ short/long; próximo adversário p/ intel; região p/ youth) → `createMission(...)` (+ `assignScout` para short/long). `Toast` confirma. Missão ativa ganha "Cancelar missão" via `useConfirm` (NUNCA `Alert.alert` — no-op no web, ref. `reference_rn_web_alert`). Mapas de label:
```ts
import { MISSION_DEFS, MissionType } from '@/engine/scouting/scout-missions';
import type { ScoutArchetype } from '@/engine/scouting/scout-archetypes';
import type { TKey } from '@/i18n/translate';

const ARCHETYPE_KEY: Record<ScoutArchetype, TKey> = {
  generalist: 'scouting.archetype_generalist',
  youth: 'scouting.archetype_youth',
  defenders: 'scouting.archetype_defenders',
  regional: 'scouting.archetype_regional',
};
const MISSION_KEY: Record<MissionType, TKey> = {
  short_eval: 'scouting.mission_short_eval',
  long_project: 'scouting.mission_long_project',
  opponent_intel: 'scouting.mission_opponent_intel',
  youth_prospect: 'scouting.mission_youth_prospect',
};
```
Semanas restantes na barra: `MISSION_DEFS[m.type].durationWeeks - m.weeksElapsed`. Carregar via `getActiveMissions` no `load()` (espelhar o `useFocusEffect`/`load` atual `:59-85`).
- [ ] **Step 3 — type-check:** `npx tsc --noEmit` (exit 0).
- [ ] **Step 4 — browser (Playwright MCP, porta 8082):** subir `npm run web` em background; abrir Relatórios → Scouting; atribuir uma `short_eval`, ver barra/arquétipo; cancelar via confirm; 0 erros de console. Screenshot.
- [ ] **Step 5 — commit:** `git add src/screens/reports/ScoutingScreen.tsx src/i18n/pt.ts src/i18n/en.ts` · msg: `feat(c3): ScoutingScreen vira Comissão de Scouting (missões + arquétipos)`.

---

## Task 12: Gate de intel na `ReportsOpponentScreen`

**Files:** Modify `src/screens/reports/ReportsOpponentScreen.tsx:40-90`, Modify `src/i18n/pt.ts`/`en.ts`.
**Interfaces:** Consumes: `getCompletedIntelForClub(db, saveId, opponentId)`, `createMission`, `getStaffByClub`. Produces: gate + CTA.

- [ ] **Step 1 — i18n:** adicionar (paridade pt/en):
```ts
  'opponent.no_intel_title': 'Adversário não mapeado',
  'opponent.no_intel_body': 'Envie um olheiro para revelar a forma e os jogadores de {club}.',
  'opponent.send_scout': 'Enviar olheiro',
  'opponent.scout_dispatched': 'Olheiro a caminho de {club}',
  'opponent.no_scout_available': 'Sem olheiro livre para enviar',
```
- [ ] **Step 2 — teste/tipo:** não há teste de UI; garantir que `getCompletedIntelForClub` é importável e tipado. (a verificação real é no browser, Step 4.)
- [ ] **Step 3 — implementar gate:** em `load()` (`:40-67`), após obter `opponentId`, checar intel; sem intel, setar um estado `needsIntel` e renderizar `EmptyState` com CTA "Enviar olheiro" que cria uma `opponent_intel` (escolhendo o olheiro livre de maior ability via `getStaffByClub` + `getActiveMissions` para saber quem está livre) e mostra `Toast`. Com intel concluída, segue o fluxo atual (`buildOpponentReport`). Esboço do trecho novo no `load()`:
```ts
import { getCompletedIntelForClub, createMission, getActiveMissions } from '@/database/queries/scout-missions';
// ...
const hasIntel = await getCompletedIntelForClub(dbHandle, saveId, opponentId);
if (!hasIntel) {
  setNeedsIntel({ opponentId, opponentName: opponentClub.name });
  setReport(null);
  return;
}
```
CTA handler:
```ts
async function dispatchScout(opponentId: number, season: number, week: number) {
  if (!dbHandle || saveId == null || playerClubId == null) return;
  const scouts = (await getStaffByClub(dbHandle, saveId, playerClubId)).filter((s) => s.role === 'scout');
  const active = await getActiveMissions(dbHandle, saveId);
  const busy = new Set(active.map((m) => m.scoutId));
  const idle = scouts.filter((s) => !busy.has(s.id)).sort((a, b) => b.ability - a.ability)[0];
  if (!idle) { /* Toast: opponent.no_scout_available */ return; }
  await createMission(dbHandle, saveId, {
    scoutId: idle.id, type: 'opponent_intel',
    targetPlayerId: null, targetClubId: opponentId, regionCode: null,
    createdSeason: season, createdWeek: week,
  });
  // Toast: opponent.scout_dispatched ; recarregar load()
}
```
> Nota: `season`/`week` vêm de `useGameStore()` (a tela já consome `season`; adicionar `week`). A intel completa na próxima passagem do game-loop (duração 1), então a tela mostra "olheiro a caminho" até virar a semana.
- [ ] **Step 4 — browser (Playwright MCP):** Relatórios → Adversário sem intel → ver `EmptyState` + "Enviar olheiro"; clicar; avançar 1 semana; voltar e ver o relatório completo. 0 erros de console. Screenshot antes/depois.
- [ ] **Step 5 — commit:** `git add src/screens/reports/ReportsOpponentScreen.tsx src/i18n/pt.ts src/i18n/en.ts` · msg: `feat(c3): relatório do adversário exige missão de intel (gate + CTA)`.

---

## Task 13: Verificação final (DoD)

**Files:** nenhuma (gate de qualidade).

- [ ] **Step 1 — suíte completa:** `npx jest` — tudo verde (engine puro, queries SQLite real, game-loop e2e, paridade i18n se houver teste de chaves).
- [ ] **Step 2 — type-check:** `npx tsc --noEmit` (exit 0).
- [ ] **Step 3 — paridade i18n:** conferir que toda chave nova existe em `pt.ts` E `en.ts` (se houver script/teste de paridade, rodar; senão `diff` das chaves novas).
- [ ] **Step 4 — browser smoke (Playwright MCP, 8082):** atribuir cada tipo de missão; avançar semanas; ver news com nome real no feed; abrir relatório do adversário com/sem intel. 0 erros de console.
- [ ] **Step 5 — DoD:** arquétipos consumidos; `scout_missions` persistido (canônico+migração); accuracy aperta máscara; news `persist_scouting_*` carregam `titleVars`/`bodyVars` reais (TODO fechado); UI Comissão + gate de intel funcionais; suíte+tsc verdes; determinismo preservado (zero Math.random/Date.now nos caminhos novos).

---

## Self-Review

1. **Cobertura do spec:** arquétipos (Task 2, 6), missões+veredito (Task 3), accuracy em maskedRange (Task 4), youth-prospect determinístico (Task 5), schema+migração espelhada (Task 7), queries save-isoladas (Task 8), leitura de archetype (Task 9), game-loop 3·5 + news real fechando o TODO (Task 10), UI Comissão (Task 11), gate de intel (Task 12), DoD (Task 13). Cada edge case da sec. 6 do spec tem trato: olheiro demitido (Task 10 órfão→expired+news), alvo inexistente (Task 10), `expiredEarly` (Task 3), dois olheiros mesmo alvo (`setKnowledge` upsert), intel adversário muda (gate por `target_club_id` na Task 12), accuracy fora de [0,1] (Task 4 clamp), RN Web Alert (Task 11 usa `useConfirm`).
2. **Placeholder scan:** sem "TBD"/"FIXME". Os únicos pontos "resolver lendo o arquivo" são aterramentos honestos (helper de teste de DB; coluna `overall` real vs `calculateOverall`; presença de `clubById` antes do bloco 3·5; `t` indisponível no game-loop → veredito como chave) — cada um com **default seguro explícito**, não comportamento em aberto.
3. **Consistência de tipos:** `ScoutArchetype`/`MissionType` idênticos em engine, query (`ScoutMissionDto`) e schema; `Staff.archetype?`/`StaffCandidate.archetype?` opcionais batem com `addColumnIfMissing(staff, archetype TEXT NULL)`; `maskedRange(value, tier, accuracy?)` retrocompatível (testes antigos passam); `generateYouthProspect` só usa `SeededRng` (determinismo). Contract no header espelha 1:1 as assinaturas produzidas pelas tasks.
