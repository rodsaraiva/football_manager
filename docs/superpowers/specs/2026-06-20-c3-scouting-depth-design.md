# Design: Scouting profundo

**Epic:** c3-scouting · **Data:** 2026-06-20 · **Stack:** Expo 54 / RN 0.81 / TS 5.9 strict

**Goal:** Transformar o fog-of-war linear de hoje em um sistema de scouting com arquétipos de olheiro, missões com tipo e duração, intel pré-jogo do adversário e prospecção de jovens pré-academia, com UI de comissão de tarefas (atribuir → monitorar → callback de relatório).

---

## 1. Problema / estado atual

O motor de scouting hoje é uma curva de conhecimento 0–100 sem nenhuma diferenciação de olheiro, alvo ou objetivo.

- **Motor (`src/engine/scouting/scouting-engine.ts:23-26`)**: `weeklyKnowledgeGain(scoutAbility)` devolve `6 + ability*0.7` pontos/semana para QUALQUER olheiro contra QUALQUER jogador. Não existe afinidade por idade, posição ou região; um olheiro de habilidade 12 rende o mesmo revelando um zagueiro veterano ou um ponta de 17 anos.
- **Tiers (`scouting-engine.ts:12-17`, `28-50`)**: `knowledgeTier`/`maskedRange` são puros e bem testados, mas a margem só depende do tier (`TIER_MARGIN`), nunca da precisão do olheiro. `getStaffEffects().scoutAccuracy` existe (`src/engine/staff/staff-effects.ts:21`) mas **não é consumido em lugar nenhum** do scouting — accuracy é dead code aqui.
- **DB (`src/database/queries/scouting.ts`)**: tabela `scouting (save_id, player_id, knowledge, scout_id)` — uma linha por jogador, um olheiro por jogador (`assignScout` em `scouting.ts:39-55` libera qualquer outra linha do mesmo `scout_id`). Não há conceito de missão, tipo de missão, prazo, região ou alvo que não seja um `player_id` já existente.
- **Acúmulo (`src/engine/game-loop.ts:536-562`)**: o passo 3·5 itera `getActiveAssignments`, soma `advanceScouting` e persiste. Ao chegar a 100 dispara um único news genérico (`news.persist_scouting_title`/`_body`, `src/i18n/pt.ts:533-534`) — "Seu olheiro concluiu a avaliação de um alvo", sem dizer **qual** alvo nem o resultado. Esse é o ponto que o brief chama de "TODO(news) de revelação": a notícia existe mas é vazia de conteúdo (sem `titleVars`/`bodyVars`).
- **UI (`src/screens/reports/ScoutingScreen.tsx`)**: lista olheiros + alvos, atribui o **melhor olheiro ocioso** automaticamente (`bestIdleScout`, linha 90-93). Não há escolha de olheiro, de tipo de missão, nem callback de relatório. Estilos são inline crus (`StyleSheet.create`, `colors`/`spacing` de `@/theme`), pré-Design System.
- **Adversário (`src/screens/reports/ReportsOpponentScreen.tsx`)**: `buildOpponentReport` mostra forma/força/top players **sempre completos**, sem gate de conhecimento — qualquer adversário é "scoutado" de graça. Não há missão de intel pré-jogo.
- **Free agents (`src/screens/reports/ReportsFreeAgentScoutScreen.tsx`)**: fit tático puro (`buildFreeAgentScout`), também sem fog-of-war.
- **Jovens**: `generateYouthPlayers` (`src/engine/youth/youth-academy.ts:96`) só roda no intake da própria academia. Não existe alvo de jovem **pré-academia** (prospecto externo a ser recrutado).

Resumo: a base (tier/máscara/acúmulo/persistência) é sólida e determinística, mas é rasa — sem arquétipos, sem missões, sem semântica de relatório. O épico é majoritariamente **UI + DB sobre o motor existente**.

## 2. Approach

Estender, não reescrever. O `scouting-engine.ts` puro continua a fonte de verdade de tier/máscara; adicionamos três módulos puros novos (arquétipos, missões, prospecção) e uma camada de orquestração no game-loop que respeita o padrão de `src/engine/game-loop.ts:536-562`.

Decisões centrais:

1. **Arquétipos como multiplicadores puros.** Um olheiro ganha um `archetype` (especialista jovens / defensores / regional / generalista). O ganho semanal passa a ser `weeklyKnowledgeGain(ability) * archetypeMultiplier(archetype, target)` — função pura, testável, determinística. Accuracy (`getStaffEffects().scoutAccuracy`) finalmente é consumida: aperta `maskedRange`.
2. **Missão como linha de primeira classe.** Nova tabela `scout_missions` (tipo, alvo, prazo). A tabela `scouting` antiga vira o cache de conhecimento por jogador; missão é o "trabalho em andamento". Tipos: `short_eval` (avaliação curta, prazo fixo, boost de ritmo), `long_project` (projeto longo, ganho menor/semana mas atinge `full` + nota de potencial), `opponent_intel` (revela o relatório do próximo adversário), `youth_prospect` (revela um prospecto pré-academia).
3. **Callback de relatório.** Ao concluir, a missão gera um `news_item` **específico** (com `titleVars`/`bodyVars` reais — nome do jogador, veredito), fechando o TODO(news). O motor decide o veredito; o game-loop persiste e notifica.
4. **UI com o novo kit.** A `ScoutingScreen` é reescrita como "Comissão de Scouting" usando o kit do Design System (`2026-06-20-design-system-premium-design.md`): `Card`/`Button`/`StatBar`/`Text` semântico/`Icon`/`EmptyState`/`Toast`/`useConfirm`. Fluxo: escolher olheiro → escolher tipo de missão → atribuir → monitorar barra → receber callback.

**Alternativa descartada — refatorar `scouting` para uma única tabela "missões" e dropar a coluna `knowledge`.** Implicaria migração destrutiva de saves existentes (knowledge acumulado se perde) e quebraria `getPlayerKnowledge` (`scouting.ts:16`), consumido por telas de jogador. Mantemos `scouting` como cache de conhecimento e adicionamos `scout_missions` ao lado — aditivo, sem perda de save, e reaproveita `setKnowledge`/`getActiveAssignments` quase inalterados.

## 3. Architecture & components

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/engine/scouting/scout-archetypes.ts` | Criar | Tipos de arquétipo + `archetypeMultiplier()` + `archetypeAccuracyBonus()`. Puro. |
| `src/engine/scouting/scout-missions.ts` | Criar | Modelo de missão: tipos, progresso, conclusão, veredito. Puro. |
| `src/engine/scouting/youth-prospects.ts` | Criar | Gera prospecto pré-academia determinístico a partir de `(saveId, region, seed)`. Reusa `generateYouthPlayers`-style. Puro. |
| `src/engine/scouting/scouting-engine.ts` | Alterar | `maskedRange` aceita `accuracy` opcional; novo `tighterMargin()`. Sem quebrar assinatura atual (param opcional). |
| `src/engine/staff/staff-market.ts` | Alterar | `generateStaffCandidates` atribui `archetype` a olheiros via `rng` (só `role === 'scout'`). |
| `src/database/schema.ts` | Alterar | DDL de `scout_missions`; coluna `archetype` em `staff`; índices. |
| `src/store/database-store.ts` | Alterar | Espelhar DDL `scout_missions` + `addColumnIfMissing(staff, archetype)` no bloco de migração (padrão `:162-172`). |
| `src/database/queries/scout-missions.ts` | Criar | CRUD de missões, save-isolado `(db, saveId, ...)`. |
| `src/database/queries/scouting.ts` | Alterar | `getActiveAssignments` passa a juntar a missão (tipo/arquétipo) para o game-loop. |
| `src/engine/game-loop.ts` | Alterar | Passo 3·5 reescrito: avança missões por tipo, dispara callbacks com `titleVars`/`bodyVars` reais. |
| `src/screens/reports/ScoutingScreen.tsx` | Reescrever | UI Comissão de Scouting com kit do Design System. |
| `src/screens/reports/ReportsOpponentScreen.tsx` | Alterar | Gate por missão `opponent_intel`: sem intel, mostra `EmptyState` com CTA "Enviar olheiro". |
| `src/i18n/pt.ts` + `src/i18n/en.ts` | Alterar | Chaves novas de arquétipo/missão/veredito + reescrita das chaves `news.persist_scouting_*`. Paridade. |
| `src/types/staff.ts` | Alterar | `Staff.archetype?: ScoutArchetype`. |

**Contract (assinaturas TS exatas):**

```ts
// src/engine/scouting/scout-archetypes.ts
export type ScoutArchetype = 'generalist' | 'youth' | 'defenders' | 'regional';

export interface ArchetypeTarget {
  age: number;
  position: Position;        // de '@/types'
  regionCode: string;       // country/region do alvo
}

export interface ArchetypeContext {
  scoutRegionCode: string;  // região-base do olheiro
}

/** Multiplicador 0.7–1.6 sobre o ganho semanal base. 1.0 = neutro. */
export function archetypeMultiplier(
  archetype: ScoutArchetype,
  target: ArchetypeTarget,
  ctx: ArchetypeContext,
): number;

/** Bônus 0–0.15 somado a scoutAccuracy quando o alvo casa com a especialidade. */
export function archetypeAccuracyBonus(
  archetype: ScoutArchetype,
  target: ArchetypeTarget,
  ctx: ArchetypeContext,
): number;

// src/engine/scouting/scout-missions.ts
export type MissionType = 'short_eval' | 'long_project' | 'opponent_intel' | 'youth_prospect';

export interface MissionDef {
  type: MissionType;
  durationWeeks: number;     // prazo nominal (short=3, long=10, intel=1, youth=4)
  weeklyPaceMult: number;    // multiplicador de ritmo do tipo (short>1, long<1)
  revealsPotential: boolean; // só long_project
}

export const MISSION_DEFS: Record<MissionType, MissionDef>;

export interface MissionProgressRow {
  missionId: number;
  type: MissionType;
  knowledge: number;
  weeksElapsed: number;
  scoutAbility: number;
  archetypeMult: number;     // já resolvido pela camada de query
}

export interface MissionProgressResult {
  missionId: number;
  knowledge: number;
  weeksElapsed: number;
  completed: boolean;        // atingiu 100 OU venceu o prazo
  expiredEarly: boolean;     // venceu prazo sem chegar a 100 (parcial)
}

export function advanceMission(row: MissionProgressRow): MissionProgressResult;

/** Veredito textual-chave a partir do conhecimento final + masked overall. */
export function missionVerdict(knowledge: number, maskedOvr: number): {
  verdictKey: 'verdict.bargain' | 'verdict.solid' | 'verdict.risky' | 'verdict.inconclusive';
};

// src/engine/scouting/youth-prospects.ts
export interface YouthProspect {
  name: string;
  age: number;               // 15–17
  position: Position;
  regionCode: string;
  basePotential: number;
  maskedPotentialLo: number;
  maskedPotentialHi: number;
}
/** Determinístico: mesma (saveId, regionCode, slot) → mesmo prospecto. */
export function generateYouthProspect(
  saveId: number, regionCode: string, slot: number, rng: SeededRng,
): YouthProspect;

// src/engine/scouting/scouting-engine.ts  (assinatura estendida, retrocompatível)
export function maskedRange(
  value: number,
  tier: ScoutingTier,
  accuracy?: number,         // 0–1; aperta a margem. omitido = comportamento atual
): { lo: number; hi: number } | null;
```

```ts
// src/database/queries/scout-missions.ts
export interface ScoutMissionDto {
  id: number;
  scoutId: number;
  type: MissionType;
  targetPlayerId: number | null;   // null para opponent_intel/youth_prospect sem player ainda
  targetClubId: number | null;     // opponent_intel
  regionCode: string | null;       // youth_prospect
  weeksElapsed: number;
  status: 'active' | 'completed' | 'expired';
}

export async function createMission(db: DbHandle, saveId: number, input: Omit<ScoutMissionDto, 'id' | 'weeksElapsed' | 'status'>): Promise<number>;
export async function getActiveMissions(db: DbHandle, saveId: number): Promise<ScoutMissionDto[]>;
export async function getMissionsByScout(db: DbHandle, saveId: number, scoutId: number): Promise<ScoutMissionDto[]>;
export async function completeMission(db: DbHandle, saveId: number, missionId: number, status: 'completed' | 'expired'): Promise<void>;
export async function cancelMission(db: DbHandle, saveId: number, missionId: number): Promise<void>;
```

## 4. Data flow

**Atribuição (UI → DB):**
`ScoutingScreen` → usuário escolhe olheiro (com `archetype` exibido) + tipo de missão + alvo → `createMission(db, saveId, {...})` e, para `short_eval`/`long_project`, `assignScout(db, saveId, playerId, scoutId)` (reusa `scouting.ts:39`). `Toast` confirma; `useConfirm` para cancelar missão em andamento.

**Progresso semanal (game-loop, passo 3·5 reescrito — `game-loop.ts:536`):**
1. `getActiveMissions(db, saveId)`.
2. Para cada missão, resolve `archetypeMult` via `archetypeMultiplier(staff.archetype, target, ctx)` (alvo derivado do `player`/`club`/`region`).
3. `advanceMission({...})` → novo `knowledge`/`weeksElapsed`/flags. Persiste em `scouting` via `setKnowledge` (player-based) ou em estado da missão (intel/youth).
4. Se `completed`/`expiredEarly`: `completeMission(...)` + `insertNewsItem` com **`titleVars`/`bodyVars` reais** — `missionVerdict()` decide a chave do veredito; nome do jogador/adversário/prospecto entra nos vars. Fecha o TODO(news).

**Leitura (telas):**
- `PlayerDetail`/`ScoutingScreen`: `getPlayerKnowledge` + `maskedRange(value, tier, scoutAccuracy)` agora apertado por accuracy.
- `ReportsOpponentScreen`: checa missão `opponent_intel` concluída para o `opponentId`; sem ela → `EmptyState` + CTA. Determinismo do report inalterado.

## 5. Schema changes

Aditivo. Ambos `src/database/schema.ts` (DDL canônico) **e** `src/store/database-store.ts` (migração de saves existentes, padrão `:162-185`).

```sql
-- scout_missions: trabalho de scouting em andamento (1 olheiro pode ter 1 missão ativa)
CREATE TABLE IF NOT EXISTS scout_missions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id         INTEGER NOT NULL,
  scout_id        INTEGER NOT NULL,
  type            TEXT    NOT NULL,             -- MissionType
  target_player_id INTEGER,
  target_club_id  INTEGER,
  region_code     TEXT,
  weeks_elapsed   INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'active',
  created_season  INTEGER NOT NULL,
  created_week    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scout_missions_save ON scout_missions(save_id, status);
CREATE INDEX IF NOT EXISTS idx_scout_missions_scout ON scout_missions(save_id, scout_id);
```

Coluna em `staff` (via `addColumnIfMissing` no store, mesmo helper de `:155`):
```sql
ALTER TABLE staff ADD COLUMN archetype TEXT;   -- NULL = 'generalist' por compat
```

`save_id` em todas as queries (padrão `SAVE_ID_STRIDE`/`saveOffset`, `src/database/constants.ts`). IDs de `players`/`clubs` já vivem no espaço do save; missão referencia por id existente. Conhecimento de jogador continua na tabela `scouting` (sem mudança de schema lá).

## 6. Error handling & edge cases

- **Olheiro demitido com missão ativa**: game-loop pula assignment órfão hoje (`game-loop.ts:544-545`). Espelhar: `getActiveMissions` filtra por `scout_id` ainda em `staff`; missão órfã → `completeMission(status='expired')` + news de "missão interrompida".
- **Alvo deixou de existir** (jogador aposentou/transferiu para clube do usuário): `target_player_id` sem `players` → expira a missão. Jogador que vira do próprio clube = conhecimento implícito 100 (schema comment `scouting`).
- **Prazo vencido sem 100** (`expiredEarly`): relatório parcial — veredito `verdict.inconclusive`, knowledge mantido (não zera).
- **Dois olheiros no mesmo alvo**: permitido (somam conhecimento); `setKnowledge` faz upsert idempotente.
- **`opponent_intel` mas adversário muda** (knockout redraw): missão amarrada a `target_club_id`; se o próximo fixture for outro clube, intel vira histórico (não some), e a tela mostra `EmptyState` para o novo adversário.
- **Determinismo**: `generateYouthProspect` só usa `SeededRng` semeado por `(saveId, regionCode, slot)`. ZERO `Math.random`/`Date.now`/`new Date()`/`ORDER BY RANDOM`. `archetypeMultiplier` é determinístico (sem rng).
- **`maskedRange` accuracy fora de [0,1]**: clamp interno; `undefined` → comportamento atual (retrocompat dos testes existentes).
- **RN Web**: confirmação de cancelamento via `useConfirm` do kit (não `Alert.alert`, que é no-op no web — ver memória `reference_rn_web_alert`).

## 7. Testing strategy

TDD. Motor puro com unit; queries e game-loop com `better-sqlite3` REAL em memória (NUNCA mock), conforme `.claude/rules/testing.md`.

**Motor (unit, puro):**
- `scout-archetypes.test.ts`: golden — youth specialist em alvo 16 anos > generalista; regional casa região = bônus; defenders em ST = penalidade. Edge — região vazia, posição GK.
- `scout-missions.test.ts`: `advanceMission` golden — `short_eval` chega a 100 mais rápido que `long_project`; `expiredEarly` quando `weeksElapsed >= durationWeeks` e knowledge<100. `missionVerdict` mapeia faixas. Edge — duração 1 (intel) completa em 1 semana.
- `scouting-engine.test.ts` (estender): `maskedRange(v, 'vague', 0.9)` aperta a margem vs `accuracy=0`; `undefined` = baseline atual (não quebrar testes existentes).
- `youth-prospects.test.ts`: determinismo — mesma seed/region/slot ⇒ prospecto idêntico; seeds diferentes ⇒ variam.

**Queries (better-sqlite3 real):**
- `scout-missions.test.ts`: create→getActive→complete; save-isolation (missão do save A não aparece no save B); índices não impedem upsert.

**Integração game-loop:**
- Avançar N semanas com missão `short_eval` ⇒ `scouting.knowledge` sobe e dispara news com `bodyVars` contendo nome real do jogador (assert no `body_vars` JSON). 
- `long_project` ⇒ `revealsPotential` reflete no veredito.
- Olheiro demitido mid-missão ⇒ missão expira + news de interrupção.
- Determinismo: mesma seed ⇒ mesmo `knowledge` e mesma news após K semanas.

## 8. Dependencies & sequencing

- **Precede:** o épico Design System (`2026-06-20-design-system-premium-design.md`) deve entregar o kit (`Card`/`Button`/`StatBar`/`Text`/`Icon`/`EmptyState`/`Toast`/`useConfirm`) antes da reescrita da `ScoutingScreen` e do gate da `ReportsOpponentScreen`. O motor/DB (seções 3-5) **não** depende do Design System e pode ser implementado em paralelo (TDD primeiro).
- **Reusa:** `assignScout`/`setKnowledge`/`getActiveAssignments` (`scouting.ts`), `getStaffByClub` (`staff.ts`), `getStaffEffects().scoutAccuracy` (`staff-effects.ts:21`), `insertNewsItem` + `NewsCategory='scouting'` (`news-generator.ts:26`), `generateYouthPlayers` (estilo de geração, `youth-academy.ts:96`), `SeededRng` (`engine/rng.ts`).
- **Sequência sugerida:** (1) archetypes+missions+youth-prospects puros (TDD) → (2) schema+store+queries → (3) game-loop passo 3·5 + news reais → (4) UI sob o kit do Design System → (5) Playwright MCP no browser (porta 8082).
- **Relação com outros épicos:** alimenta a profundidade de carreira (pós-MVP #1, memória `project_mvp_finalization`). Não conflita com mercado de transferências (consome conhecimento, não o escreve).

## 9. Out of scope

- Olheiros viajando fisicamente / custo de viagem por país.
- Rede de contatos / "knowledge" sobre técnicos ou diretivas de tabela.
- Scouting automático da IA para clubes não-humanos (mantém o modelo atual da IA).
- Recrutar o `youth_prospect` para a academia (gera o relatório/alvo; a contratação efetiva é trabalho do épico de academia/jovens).
- Reescrita de `ReportsFreeAgentScoutScreen` (fica fit tático; só ganha o kit visual no épico de Design System, não aqui).
- Migração que apague `knowledge` existente.

## 10. Spec self-review

- **Placeholder scan:** sem "TBD"/"FIXME"/"???". Todas as assinaturas TS são concretas.
- **Consistência interna:** `scout_missions` (sec. 3/5) tem CRUD correspondente (sec. 3 Contract) e fluxo (sec. 4); `MissionType` aparece idêntico em engine, query e schema. Edge cases (sec. 6) cobrem cada tipo de missão. Testes (sec. 7) cobrem cada módulo novo + game-loop.
- **Refs de código verificadas (lidas neste épico):** `scouting-engine.ts:12-50`, `database/queries/scouting.ts:16-95`, `staff-effects.ts:21` (scoutAccuracy não consumido — confirmado), `staff-market.ts:22-36`, `game-loop.ts:536-562` (passo 3·5 + news genérico), `ScoutingScreen.tsx` (auto-pick bestIdleScout, estilos inline), `ReportsOpponentScreen.tsx` (sem gate de conhecimento), `schema.ts:453-484` + `database-store.ts:162-185` (DDL scouting espelhado), `constants.ts` (SAVE_ID_STRIDE), `types/staff.ts`, `news.ts:31-46` (insertNewsItem com titleVars/bodyVars), `news-generator.ts:9-26` (NewsCategory inclui 'scouting'), `youth-academy.ts:96`, `navigation/types.ts:34-38` (rotas existentes).
- **Determinismo:** verificado — única fonte de aleatoriedade nova é `SeededRng` em `generateYouthProspect` e na atribuição de arquétipo em `staff-market`.
- **i18n:** chaves novas listadas com paridade pt/en exigida; reescrita de `news.persist_scouting_*` para usar vars.
