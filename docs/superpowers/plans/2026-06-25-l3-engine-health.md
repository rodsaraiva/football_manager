# Plan: L3 — Saúde do engine & arquitetura

**Epic:** l3-engine-health · **Spec:** [l3](../specs/2026-06-20-l3-engine-health-design.md) · **Data:** 2026-06-25
**Escopo aprovado:** Fases 1–4 (núcleo + rollout Zod completo). EH-5/EH-6 fora.

**Invariante absoluta:** refator byte-equivalente. Zero mudança de comportamento/determinismo.
Guarda: suite atual verde + teste de determinismo (mesma seed → estado de DB idêntico).

Estado real (medido 2026-06-25): `game-loop.ts` = **1014 linhas**, `advanceGameWeek` ≈ 660 linhas
(`:298`→fim). Query-layer = **28 arquivos com cast**, ~140 sites. `zod` ainda não é dependência.

Duas trilhas tocam arquivos **disjuntos** → executadas em sequência (working-tree compartilhado),
com fan-out paralelo dentro da Track B.

---

## Track A — Refactor de `advanceGameWeek` (determinismo-crítico)

### Fase 1 — Caracterização + baseline de determinismo (EH-2) [gate]
Novo `__tests__/engine/game-loop-phases.test.ts` (better-sqlite3 real), verde contra o código **atual sem mudá-lo**:
- Por fase (12 blocos do §2.1): resultados+stats persistidos; progressão acumulando `*_progress`;
  ordem decrementa-antes-aplica de lesões/suspensões; finanças + debt-weeks; fim de temporada.
- **Golden de determinismo:** seed fixa, avança N semanas, asserta um digest determinístico
  (estado de DB relevante + sequência de `AdvanceWeekResult`). Esse snapshot é a guarda da Fase 2.

### Fase 2 — Extração de fases (EH-1)
- `src/engine/game-loop/` vira diretório: `index.ts` reexporta `advanceGameWeek`/`loadClubMatchData`
  (preserva `@/engine/game-loop`), `week-context.ts` (tipo `WeekContext` readonly), 1 arquivo por fase:
  `simulate-and-persist`, `human-match-consequences`, `international-duty`, `scouting-phase`,
  `transfer-market`, `weekly-finances`, `retirement-phase`, `advance-calendar`.
- Cada fase: `async function phase(ctx: WeekContext): Promise<PhaseDelta>`, recebe o **mesmo** `rng`,
  consome na **mesma ordem**. `advanceGameWeek` vira sequenciador <120 linhas.
- Preservar literalmente: `commentRng` derivado, exclusão da fixture do usuário do stream de RNG.
- Gate: Fase 1 + todos os e2e/integration existentes verdes **sem alteração** + golden idêntico.

**Commit Track A**, revisão (determinismo + contagem de linhas), antes da Track B.

---

## Track B — Blindagem Zod da query-layer (EH-3/EH-4)

### Fase 3 — Helper + piloto (EH-3)
- `npm install zod` (local). Validar bundle web depois.
- `src/database/parse-rows.ts`: `parseRows(schema, rows, queryName)` / `parseRow(...)` →
  em falha, erro nomeado com `queryName` + zodError. Teste: linha boa passa, coluna faltando/tipo errado lança.
- Migrar piloto `season-archiver.ts` (casts delimitados). Suite de history verde.

### Fase 4 — Rollout + sincronia (EH-3 + EH-4)
- Fan-out: 1 agente por arquivo de query restante (~27). Schemas Zod co-localizados, validando
  **só campos consumidos** (`.passthrough()`). Escape-hatch documentado nos hot paths de finanças
  (`weekly-finances`, bulk-load ~40 clubes/semana).
- `__tests__/database/schema-zod-sync.test.ts` (EH-4): detecta divergência coluna↔schema vs. `schema.ts`.
- Medir custo Zod numa semana cheia (antes/depois); se degradar web, aplicar escape-hatch.

**Commit Track B** (PRs pequenos por arquivo/contexto), revisão final.

---

## Não-objetivos
Sem mudança de schema SQL, balanceamento, ORM, validação de escrita, EH-5 (`runBlock`), EH-6 (agregador de notícias). UI intocada.

## Gate final
`npx tsc --noEmit` 0 · `npm test` (node) verde · UI suite verde · golden de determinismo idêntico · bundle web compila.
