# Plan: L2 Fase 6 (L2.2) — eventos de fase granulares

**Epic:** l2-match-2d · **Spec:** [l2](../specs/2026-06-20-l2-match-engine-2d-design.md) §3 (L2.2)/§4 (Opção C)/§6 (Fase 6)
**Data:** 2026-06-27 · **Pré-requisito:** EH-5 (`089d923`) — `runBlock` já decomposto em 6 resolvedores (pontos de emissão).

**Invariante-mãe (spec §4 Opção C): flag default-OFF, e OFF == legado byte-a-byte.** Os eventos de fase
(desarme/passe-chave/recuperação/troca-de-posse) são emitidos pelos resolvedores SÓ quando a flag está ligada, usando um
**RNG SEPARADO** (derivado de fixtureId/block/team) — o stream principal do `rng` (gols/cartões/placar) NÃO é tocado, on OU
off. Logo: flag-OFF = nenhum evento de fase, zero consumo extra, baselines/golden byte-idênticos; flag-ON = eventos de fase
determinísticos, **placar idêntico ao flag-OFF**. Guard: `balance-baselines` + `match-engine-golden` + `halftime-resume`
byte-idênticos com a flag OFF (default).

## Capacidade (dormente por padrão)
Entrega ENGINE: a flag liga eventos descritivos novos sem mudar resultado. É dormente até alguém ligá-la (futuro: toggle 2D
/ setting). Habilita a **PassNetwork** real (pares passador→recebedor via `key_pass`) e mapas mais ricos — esses (visuais)
ficam para um passe futuro com QA no browser.

## Escopo
- **MatchEventType** += `tackle` | `key_pass` | `recovery` | `possession_change` (src/types/match.ts).
- **MatchInput** += `emitPhaseEvents?: boolean` (padrão ausente/false ⇒ legado, igual a derbyBonus/formModifiers).
- **runBlock**: quando `emitPhaseEvents`, cria `phaseRng = new SeededRng(<offset primo + fixtureId + block + lado>)` e o
  passa aos resolvedores p/ os rolls de fase. O `rng` principal só faz o que já fazia.
- **Resolvedores** (resolveOpenPlay/Corner/...): emitem os eventos de fase plausíveis ao seu contexto, via `phaseRng`,
  sem alterar nenhuma rolagem existente. Sem mudança de probabilidade de gol/cartão.
- **Stats novas** (opcional, aditivas): tackles/keyPasses por lado em MatchStats, derivadas dos eventos. Não perturbam o legado.
- **Persistência**: eventos de fase entram em match_events (coluna `phase` já existe), só na partida do usuário, quando ligados.

## Não-objetivos
PassNetwork e qualquer componente visual (Fase 3 family — precisa QA browser). Wiring da flag a um setting/UI (follow-up
trivial). Mudança de balanceamento. EH-6.

## Determinismo / riscos
- **Hard:** flag-OFF byte-idêntico ao legado (baselines + golden). É a condição de aceite.
- phaseRng separado garante placar idêntico mesmo flag-ON.
- Nota: flag-ON interleava eventos novos em result.events → `deriveMatchGeometry` (seeded por eventIndex) daria geometria
  diferente aos marcadores quando ligada. Aceitável (modo novo/dormente; flag-OFF intocado). Preferir, se barato, manter a
  geometria dos marcadores estável; não é bloqueante.

## Faseamento
1. Tipos + flag + phaseRng + emissão nos resolvedores (TDD).
2. Testes: paridade flag-OFF == golden/baseline byte-a-byte; flag-ON determinístico (mesma seed = mesmos eventos de fase) +
   placar idêntico ao flag-OFF + eventos de fase presentes; persistência (flag-ON grava eventos de fase na partida do usuário).

## Gate
`tsc` 0 · `npm test` (node+ui) verde · **flag-OFF: balance-baselines + golden byte-idênticos** · flag-ON determinístico.
