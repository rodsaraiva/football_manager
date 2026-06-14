# Roadmap Estratégico — Curto / Médio / Longo Prazo

> Planejamento de horizontes centrado em **specs/plans**. Fundamentado num survey de 42 docs + escopo diferido + issues latentes (workflow de 4 agentes, 2026-06-14). Status corrigido com ground-truth de implementação.

## Onde estamos (ground-truth)

- ✅ **12/12 épicos** do MASTER-ROADMAP (correção dos 76 gaps do audit) — mergeados.
- ✅ **9/9 pilares** de produto (P1–P9) — mergeados. (O survey marcou como "pending" porque o doc-roadmap não tem status; **estão feitos**.)
- ✅ **MVP Finalization: W0 + W1** de 8 workstreams — mergeados.
- Suíte **1015 testes / 155 suites**, tsc limpo. Determinismo do engine travado (0 `Math.random`/`Date.now` em caminhos de engine; mercado da IA determinístico).
- **Alvo de produto (PRODUCT.md v4):** FM **mobile** idle/casual (iOS/Android), sessão 1×/dia 30–60min. Web é alvo secundário/dev.

---

## 🟢 CURTO PRAZO — Terminar o MVP release-ready (épico atual)

**Objetivo:** fechar os 8 workstreams da finalização + as issues de QA descobertas no survey. Specs/plans **já existem** (`2026-06-14-mvp-finalization-design.md` + planos por workstream conforme executados).

| # | Workstream | Spec/Plan | Estado |
|---|---|---|---|
| W0 | Career-loop harness | plan W0 | ✅ feito |
| W1 | Staff hiring | plan W1 | ✅ feito |
| **W2** | **Demitido→ofertas-resgate** (CRÍTICO) | spec (a planejar) | **próximo** |
| W3 | Inbox/News persistente (XL, faseado W3a/b/c) | spec | pendente |
| W4 | Onboarding/tooltips contextuais | spec | pendente |
| W5 | Hardening reprodutibilidade (sweep + doc) | spec | parcial (2 micro-fixes já no W0) |
| W6 | Balanceamento leve (baselines) | spec | pendente |
| W7 | Portão de QA | spec | pendente |

**Itens NOVOS do survey a absorver (no W7 ou workstream próprio):**
- **`Alert.alert` no-op no web** (29 chamadas: deleção de save, decisões de transferência, hiring, etc.). ⚠️ **Decisão de alvo:** no **mobile** (alvo primário) Alert **funciona** → não é blocker de release mobile. Se **web** for alvo de shipping → vira blocker e justifica um fix transversal (hook `useConfirm` com `<Modal>`). Ver [[reference-rn-web-alert]].
- **i18n residual** (2 strings): `OffersReceivedScreen:271`, `PlayerDetailScreen:501` → W7.
- **Limpeza de produção:** 7 `console.*` em telas, 3 `.catch(()=>{})` silenciosos → W7 (lint/cleanup).
- **TODO real:** lógica de vencedor de pênaltis em `season-archiver.ts:319-320` → fix pequeno (W6/W7).
- **Sem tela de Settings global** → decisão: criar agora (médio) ou pós-MVP.

**Sequência recomendada:** W2 → W3 → W4 → W5 → W6 → W7 (harness-first já garantido pelo W0). Ao fim: **MVP release-ready** (mobile).

---

## 🟡 MÉDIO PRAZO — Profundidade & polish pós-MVP (specs/plans NOVOS)

Features que aprofundam o jogo existente sem escopo xlarge. **Cada uma precisa de spec+plan novos** (brainstorming → writing-plans).

1. **Expansão geográfica** (mais ligas/países: Brasil, Portugal, Holanda…). Alto valor de replayability, assenta na estrutura competitiva existente. _Spec novo._ **Recomendado como #1 pós-MVP.**
2. **Tela de Settings global** (preferências: idioma, áudio, dificuldade, etc.) — pequena, esperada. _Spec novo (pequeno)._
3. **Acessibilidade & QA-automation** (`testID`/`accessibilityLabel` nas telas) — habilita testes de UI automatizados + a11y. _Plan novo (mecânico)._
4. **Áudio** (música ambiente + SFX de eventos) — PRODUCT.md v0.2. _Spec novo._
5. **Profundidade de carreira/histórico** (hall da fama, recordes, sagas de jogadores) — assenta no season-history existente. _Spec novo._
6. **Incrementos do motor de partida** (mais estatísticas, heat-map simples) — sem reescrita. _Spec novo._
7. **`useConfirm` transversal** (substituir os 29 Alert por modal in-app) — se web virar alvo, sobe pro curto prazo.

---

## 🔴 LONGO PRAZO — Xlarge / estratégico (mudança de arquitetura ou modelo)

Direções de maior escopo (cada uma é um épico/projeto próprio, com spec+plans dedicados).

1. **Gestão de seleção nacional (P9 completo)** — convocações + calendário paralelo + jogos internacionais. (Hoje só a fatia lado-clube existe: `InternationalsScreen` + fadiga de viagem.) _xlarge._
2. **Multiplayer & ligas online** — competições entre saves reais; requer servidor + sincronização de estado. _Mudança arquitetural._
3. **Cloud save + cross-device** — saves na nuvem, continuar no tablet/PC. _Requer auth nativa + resolução de conflito._
4. **Versão desktop (Steam)** — port via Electron/web wrapper; controles expandidos. _Novo alvo de plataforma._
5. **Motor de partida profundo** — posicionamento micro, visão 2D/3D analisável, replay. _Reescrita do motor._
6. **Editor de clubes/ligas (sandbox)** — criar ligas fictícias, customizar assets. _UI de editor + suporte a assets._
7. **Conquistas cross-save** (Play Games / Game Center) + leaderboards globais. _Auth nativa._
8. **Dados reais licenciados** — muda imersão MAS muda modelo de negócio/privacidade. _Decisão de negócio._
9. **Áudio com narração por voz** — síntese/licensing. _Estende o item de áudio do médio prazo._

---

## Decisões estratégicas (RESOLVIDAS 2026-06-14)

1. ✅ **Alvo = só mobile (web é dev/preview).** Consequência: os 29 `Alert.alert` **NÃO** são blocker (funcionam no iOS/Android). O fix transversal `useConfirm`/`<Modal>` desce para **médio/baixo prazo**. Validação no browser (web) que depender de Alert é limitada — usar testes de lógica + validar fluxos Alert-gated no device/emulador, não no web. (No W1 a ação direta foi um bônus que também destrava o dev/web.)
2. ✅ **Direção #1 pós-MVP = Profundidade de carreira** (hall da fama, recordes, sagas/rivalidades, histórico expandido sobre o season-history). Os outros médios (expansão geográfica, settings, áudio, acessibilidade) ficam na fila atrás dela.
3. **Settings global:** pós-MVP (médio), junto do polish.

## Como cada horizonte vira specs/plans

- **Curto:** specs já existem (finalização) → só executar W2–W7 no padrão atual (plan por workstream → workflow → verify → merge).
- **Médio:** cada feature = ciclo `superpowers:brainstorming` (spec) → `writing-plans` (plan) → execução. Começar pela #1 escolhida na decisão (2).
- **Longo:** cada um é um épico; brainstorming de decomposição primeiro (vários sub-specs), como foi o MASTER-ROADMAP.
