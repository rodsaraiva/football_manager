# Plan: L3 EH-5 — decompor runBlock em sub-resolvedores

**Epic:** l3-engine-health · **Spec:** [l3](../specs/2026-06-20-l3-engine-health-design.md) §3 (EH-5) · **Data:** 2026-06-27
**Escopo:** SÓ EH-5. EH-6 (agregador de notícias) fica fora — spec marca "só sob demanda" e não há consumidor.

**Invariante-mãe: determinismo byte-a-byte.** `runBlock` consome RNG pesado; a decomposição preserva a ORDEM de
consumo do `rng` EXATAMENTE. Guard: `balance-baselines.e2e` byte-idêntico + `halftime-resume` + `match-engine` +
`live-segment` verdes + golden novo de eventos de partida (capturado contra o código ATUAL, hardcoded). Se qualquer
baseline mudar → stream reordenada → REVERTER e refazer. Sem mudança de balanceamento/probabilidade.

## Estado atual
`runBlock` (`src/engine/simulation/match-engine.ts:572-875`, ~303 ln) resolve, para um time atacando, num só corpo:
momentum, ataque em jogo aberto (xG/conversão/defesa do GK), escanteio, pênalti, cartões (com follow-up de falta/pênalti),
lesão, substituição inteligente. Chamado 2×/bloco (`:422-423`, home-ataca / away-ataca). Já determinístico e bem testado.

## EH-5 — decomposição
- Fatiar o corpo em sub-resolvedores PUROS por tipo de evento, preservando a ordem de RNG: `resolveOpenPlay`,
  `resolveCorner`, `resolvePenalty`, `resolveCards`, `resolveInjury`, `resolveSubstitution` (nomes da spec; ajustar aos
  blocos reais). Cada um recebe o `rng` vivo + estado do bloco e empurra eventos/atualiza stats — chamados por `runBlock`
  na MESMA sequência atual.
- `runBlock` vira orquestrador fino que encadeia os resolvedores. Nenhum `rng.next()` novo, removido ou reordenado.
- Ganho: pontos de extensão nomeados (habilita L2 Fase 6 — eventos de fase — e PassNetwork) + testabilidade por resolvedor.

## Faseamento
1. **Caracterização (gate):** golden de eventos de uma partida (better-sqlite3 não necessário — engine puro) p/ 2-3 seeds
   fixas, capturado contra o código atual e gravado como literal. Mais um teste "mesma seed = mesmo MatchResult".
2. **Extração:** decompor `runBlock`; rodar `balance-baselines` + halftime-resume + match-engine + live-segment + golden
   entre passos. Tudo byte-idêntico, testes inalterados.

## Não-objetivos
EH-6 (agregador de notícias). Mudança de balanceamento/probabilidade/fórmulas. Eventos de fase novos (isso é L2 Fase 6,
que ESTE refactor habilita, mas não implementa aqui). Reescrita de player-rating/team-strength.

## Execução
1 workflow (espelha o Track A do game-loop): caracterização(golden)→extração→verify(baselines byte-idêntico)→debug→
review adversarial de determinismo→fix.

## Gate
`tsc` 0 · `npm test` (node+ui) verde · **balance-baselines byte-idêntico** · golden de eventos idêntico · halftime-resume/
match-engine/live-segment verdes · `runBlock` reduzido a orquestrador.
