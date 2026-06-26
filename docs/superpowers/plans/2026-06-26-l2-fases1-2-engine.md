# Plan: L2 Fases 1–2 — motor de partida profundo (engine/dados)

**Epic:** l2-match-2d · **Spec:** [l2](../specs/2026-06-20-l2-match-engine-2d-design.md) §6 · **Data:** 2026-06-26
**Escopo:** SÓ as fases testáveis headless (1–2). **Fases 3–5 (2D/toggle/replay) DEFERIDAS** — visual, precisam de
Playwright (indisponível). Fase 6 (eventos de fase) depende do EH-5 do L3. Sem UI nesta entrega.

**Invariante-mãe (spec §8): determinismo.** Opção B — geometria/xG derivados **fora da stream principal**; o loop de
`simulateMatch` fica **byte-for-byte intacto**. Guarda: `__tests__/e2e/balance-baselines.e2e.test.ts` + os testes de
"mesma seed = mesmo placar" devem ficar idênticos. ZERO novo `rng.next()` no caminho default.

## Fase 1 — xG por chance (L2.1)
- `xgChance` JÁ é computado em `match-engine.ts:569` e descartado. Expor SEM novo `rng.next()`: anexar ao evento de
  chute/gol/defesa via canal lateral (o valor já existe no momento da emissão do evento).
- Estender `MatchEvent` (`src/types/match.ts:17`) com `xg?: number` opcional (backward-compatible; eventos AI sem xg seguem válidos).
- Migration aditiva: coluna `xg REAL` nullable em `match_events` — em `schema.ts` (CREATE TABLE), no path do store
  (database-store.ts, se criar a tabela lá) E em `migration.ts` (`ALTER TABLE match_events ADD COLUMN xg REAL` se faltando,
  padrão `hasColumnAsync`). `addMatchEvent`/`getMatchEvents`/`rowToMatchEvent`/`matchEventRowSchema` estendidos.
- **Teste (better-sqlite3):** `sum(xg)` dos eventos de chance ≈ `stats.homeXG/awayXG` por lado; baseline/placar byte-idêntico.

## Fase 2 — Geometria (L2.3) + persistência (L2.4)
- `deriveMatchGeometry(result, input): GeometricEvent[]` PURO em `src/engine/simulation/` — percorre `result.events`,
  calcula `(x,y)` normalizado `[0,1]×[0,1]` + `phase` por tipo+posição do jogador+`attackFocus`+lado, com **RNG DERIVADO**
  `new SeededRng(<offset primo> + fixtureId*K + eventIndex)` — independente da stream principal. Sem física; posicionamento
  estatístico plausível (gol cai no terço ofensivo correto do lado).
- Migration aditiva: `x REAL`, `y REAL`, `phase TEXT` nullable em `match_events` (mesmos 3 lugares da Fase 1). Persistir a
  geometria dos eventos da **partida do usuário** (igual ao `match_events` hoje — AI fica só com agregados).
- **Teste:** mesma seed → mesmas coordenadas (rodar `derive` 2× = idêntico); coords dentro de `[0,1]`; gols no terço
  ofensivo certo por lado; `deriveMatchGeometry` é puro (sem tocar a stream do `simulateMatch`).

## Não-objetivos (desta entrega)
2D/SVG (Pitch2D/ShotMap/PassNetwork/HeatMap), toggle "Assistir em 2D", replay temporal — **Fases 3–5, deferidas (visual)**.
Eventos de fase granulares (L2.2/Fase 6) — dependem do EH-5. Nenhuma mudança de balanceamento/probabilidade. Geometria de AI.

## Riscos
- Determinismo (§8): mitigado por Opção B + baselines test. Se qualquer baseline mudar, REVERTER e refazer derivado.
- Migration em `match_events` (legacy): saves antigos precisam do `ALTER TABLE ADD COLUMN` (nullable) — senão `SELECT`
  quebra. Espelhar schema.ts + store + migration.ts. `season-archiver` lê `match_events` — confirmar que ignora as colunas novas.

## Execução
1 workflow TDD: implementer(high)→verify(tsc+node+ui, com baselines)→debug→reviewer(determinismo/migração/pureza)→fix.

## Gate
`tsc` 0 · `npm test` (node+ui) verde · **baselines byte-idênticos** · geometria determinística · migração espelhada nos 3 lugares.
