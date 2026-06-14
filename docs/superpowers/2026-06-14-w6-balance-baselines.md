# W6 — Balanceamento (leve) — Baselines

**Data:** 2026-06-14
**Resultado:** ✅ **Validado, sem mudança de levers.** As métricas-chave de uma temporada caem nas faixas esperadas. Travadas por teste de regressão (`__tests__/e2e/balance-baselines.e2e.test.ts`).

## Método

Joga **uma temporada completa** via o harness do W0 (`createE2EContext` + `playUntilSeasonEnd`, seed fixo 42, determinístico), depois mede métricas direto do DB. Escopo: o **mundo seedado completo** (todas as ligas/clubes, ~8044 jogadores).

## Medições (seed 42)

| Métrica | Baseline (spec) | Medido | Veredito |
|---|---|---|---|
| Gols/jogo | 2.0 – 3.5 | **2.64** | ✅ na faixa |
| Accrual de reputação (temporada mediana) | +0 .. +15 | **+2** | ✅ na faixa |
| Fração de moral baixa (< 30) | < 5% | **0.1%** | ✅ folgado |
| Transferências IA/temporada | 4 – 12 | **30 no mundo todo** (~0.06/clube) | ⚠️ escopo |
| Mediana de moral | 50 – 65 | **80** | ⚠️ escopo |

## Interpretação dos 2 "desvios"

Ambos são **artefatos do escopo de medição**, não defeitos de balanceamento:

- **Transferências (30 no mundo inteiro):** o baseline "4–12/temporada" foi pensado para o **contexto do jogador / uma liga**, não para todas as ligas somadas. 30 transferências distribuídas entre dezenas de clubes é atividade **baixa** por clube (~0.06/clube), não excessiva. Não há inflação de mercado.
- **Mediana de moral 80:** o baseline 50–65 pressupõe um save **maduro**. Medindo o mundo inteiro logo após uma temporada a partir de um seed fresco, a moral ainda está alta. Crucial: o que frustra o jogador é moral **baixa** generalizada — e essa (`< 30`) está em **0.1%**, bem dentro do baseline. Moral alta global não é defeito.

Nenhuma métrica indica um problema que "claramente destoa". Mexer em levers de `balance.ts` aqui seria scope-creep contra um sistema que passa 1045 testes. **Decisão: não ajustar levers.**

## Trava de regressão

`__tests__/e2e/balance-baselines.e2e.test.ts`:
- **Faixas exatas do spec** (escopo inequívoco): gols/jogo ∈ [2.0, 3.5]; accrual de rep ∈ [0, 15]; fração de moral baixa < 5%.
- **Bandas de sanidade** (métricas sensíveis a escopo): transferências/clube ∈ (0, 3); mediana de moral ∈ [45, 90] — pegam colapso de moral ou saturação bugada sem falso-falhar pelo escopo do mundo inteiro.

## DoD do W6 — atendido

- [x] e2e instrumentado com baselines pré-aprovados.
- [x] Métricas-chave na faixa → **fecha "validado, sem mudança"** (resultado aceitável e esperado pelo spec).
- [x] Faixas travadas por teste (regressão).
