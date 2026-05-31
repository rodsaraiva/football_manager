# Roadmap Mestre — Correção dos 76 Gaps

> Hub de navegação para os 12 épicos de correção gerados a partir de [`docs/audit/2026-05-31-gap-audit.md`](../../audit/2026-05-31-gap-audit.md).
> Cada épico tem um **spec** (`docs/superpowers/specs/2026-05-31-<id>-design.md`) e um **plano TDD** (`docs/superpowers/plans/2026-05-31-<id>-plan.md`).
> Total: **12 épicos · ~118 tasks TDD · ~15k linhas de plano**. Os pilares de produto (features novas) estão no roadmap separado [`2026-05-31-product-pillars-roadmap.md`](./2026-05-31-product-pillars-roadmap.md).

---

## Índice dos épicos

| Épico | Esforço | Tasks | Objetivo (1 linha) | Spec | Plano |
|---|---|---|---|---|---|
| **db-hardening** | medium | 6 | Índices nas FKs quentes, `runInTransaction`, FK=ON nos testes | [spec](../specs/2026-05-31-db-hardening-design.md) | [plano](./2026-05-31-db-hardening-plan.md) |
| **testable-orchestration** | large | 7 | Extrair rollover/advance das telas (874/1352 linhas) para engine puro testado | [spec](../specs/2026-05-31-testable-orchestration-design.md) | [plano](./2026-05-31-testable-orchestration-plan.md) |
| **save-isolation** | xlarge | 11 | `save_id` em todas as tabelas + queries escopadas + seed por save | [spec](../specs/2026-05-31-save-isolation-design.md) | [plano](./2026-05-31-save-isolation-plan.md) |
| **match-consequences** | large | 8 | Vantagem de casa/pressing reais, lesões e suspensões persistem, gols recalibrados | [spec](../specs/2026-05-31-match-consequences-design.md) | [plano](./2026-05-31-match-consequences-plan.md) |
| **competitions-real** | large | 11 | Mata-mata copa/CL até campeão + promoção/rebaixamento físico + calendário sem colisão | [spec](../specs/2026-05-31-competitions-real-design.md) | [plano](./2026-05-31-competitions-real-plan.md) |
| **ai-world-alive** | xlarge | 10 | Todo clube usa o engine real + roda finanças + regenera elenco | [spec](../specs/2026-05-31-ai-world-alive-design.md) | [plano](./2026-05-31-ai-world-alive-plan.md) |
| **progression-wired** | xlarge | 14 | Minutos/desempenho/foco/staff/moral movem desenvolvimento, declínio, aposentadoria | [spec](../specs/2026-05-31-progression-wired-design.md) | [plano](./2026-05-31-progression-wired-plan.md) |
| **economy-depth** | large | 12 | Valor de mercado vivo, contratos expiram/renovam, receitas, falência, wage budget | [spec](../specs/2026-05-31-economy-depth-design.md) | [plano](./2026-05-31-economy-depth-plan.md) |
| **board-stakes** | large | 10 | Objetivos cumpríveis, demissão→game-over, reputação por elenco, assistentes mecânicos | [spec](../specs/2026-05-31-board-stakes-design.md) | [plano](./2026-05-31-board-stakes-plan.md) |
| **navigation-screens** | large | 11 | Fim do crash PlayerDetail, ErrorBoundary, 9 telas órfãs plugadas, `Alert` no nativo | [spec](../specs/2026-05-31-navigation-screens-design.md) | [plano](./2026-05-31-navigation-screens-plan.md) |
| **i18n-completion** | xlarge | 12 | ~33 telas + alerts + títulos de nav + texto de engine (news/assistant/objetivos) | [spec](../specs/2026-05-31-i18n-completion-design.md) | [plano](./2026-05-31-i18n-completion-plan.md) |
| **theme-consistency** | large | 9 | Toda cor/spacing/radius/font em tokens; helpers de rating unificados; alcance do accent | [spec](../specs/2026-05-31-theme-consistency-design.md) | [plano](./2026-05-31-theme-consistency-plan.md) |

---

## Grafo de dependências

```
db-hardening ──┬──> save-isolation ──┬──> match-consequences ──┐
               │                     │                          ├──> ai-world-alive ──> progression-wired
               └──> testable-orch ───┘    competitions-real ────┤                          │
                                          (usa shootout do        └──> economy-depth <──────┘
                                           match-consequences)              │
                                                                            v
                              competitions-real ──> board-stakes <── economy-depth
                                                         │
                              board-stakes + competitions ──> navigation-screens ──> i18n-completion ──> theme-consistency
```

Regra de leitura: A → B significa "A deve aterrissar antes de B". Arestas-chave:
- **Tudo** depende de `save-isolation` reescrever as assinaturas de query para `(db, saveId, …)`. Fazer cedo evita re-tocar todo o código de gameplay.
- `db-hardening` antes de `save-isolation` (ambos editam `schema.ts`; db-hardening primeiro, save-isolation faz rebase) e fornece `runInTransaction` + FK=ON.
- `testable-orchestration` cria o módulo `season-rollover.ts` testado que ai-world/competitions/progression/economy **estendem** em vez de inflar a tela.
- `match-consequences` antes de `ai-world-alive` (consequências valem para a IA também) e fornece o **shootout** que `competitions-real` usa nos mata-matas.
- `competitions-real` fornece `wonCup`/`wasPromoted` reais para `board-stakes` e dados de bracket/artilheiros para `navigation-screens`.
- `board-stakes` fornece a tela de game-over que `navigation-screens` pluga.
- `i18n-completion` precisa das telas órfãs já plugadas (`navigation-screens`) para internacionalizá-las; `theme-consistency` toca as mesmas telas → depois ou em par.

---

## Sequenciamento recomendado (ondas)

### 🚀 Fast-lane — quick wins independentes (podem ir HOJE, em paralelo à Onda 0)
Tasks de alto valor que **não** dependem da fundação. Ship imediato:
- **navigation-screens**: registrar rota `PlayerDetail` (route-aware) + `ErrorBoundary` no root + `window.confirm`→`Alert.alert`. _Mata o crash crítico C5 e o crash nativo do delete._
- **db-hardening**: os ~10 `CREATE INDEX` (Task 2). _Perf imediata, zero risco._
- **theme-consistency**: tokens semânticos + `alpha()` + módulo único `rating-colors.ts` + migrar os 4 consumidores duplicados (Tasks 1-4). _Independente._

### Onda 0 — Fundação & segurança (sem mudança de gameplay)
1. **db-hardening** (medium) — índices, `runInTransaction`, FK=ON nos testes.
2. **testable-orchestration** (large) — extrai rollover + glue de advance para `engine/season-rollover.ts` testado. _Reduz blast radius de tudo adiante._

### Onda 1 — Arquitetura de save
3. **save-isolation** (xlarge) — `save_id` em todas as tabelas, queries escopadas, seed por save. ⚠️ tsc fica vermelho até o fim (blast radius proposital). Decisões de produto pendentes abaixo.

### Onda 2 — Coração do loop ("mundo vivo")
4. **match-consequences** (large) — casa/pressing/lesões/suspensões/recalibração no engine real.
5. **competitions-real** (large) — mata-matas até campeão, promoção/rebaixamento, calendário, shootout.
6. **ai-world-alive** (xlarge) — engine real para todos os jogos + finanças + regeneração da IA.
7. **progression-wired** (xlarge) — treino/staff/moral reais; declínio; aposentadoria; roda para todos os clubes.
8. **economy-depth** (large) — valor de mercado, contratos, receitas, falência, wage budget.

### Onda 3 — Stakes & superfície
9. **board-stakes** (large) — objetivos cumpríveis, game-over, reputação, assistentes.
10. **navigation-screens** (large, restante) — plugar telas órfãs (Squad, Treino, Base, Bracket, Artilheiros, Match Report), tela de game-over.

### Onda 4 — Polimento (mecânico, paralelizável)
11. **i18n-completion** (xlarge) — todas as telas + alerts + texto de engine.
12. **theme-consistency** (large, restante) — sweep de magic numbers, paleta de relatório, alcance do accent.

---

## Coordenação de mudanças de schema

Ordem de merge importa (vários épicos editam `schema.ts`). **Regra:** `db-hardening` primeiro; `save-isolation` faz rebase dos índices para compostos `(save_id, …)`; cada épico de gameplay adiciona suas colunas **com `save_id`** seguindo o padrão de save-isolation, via `addColumnIfMissing` (mecanismo idempotente co-owned por save-isolation/db-hardening em `database-store.ts`).

| Épico | Adições de schema |
|---|---|
| db-hardening | ~10 `CREATE INDEX IF NOT EXISTS` (sem colunas/tabelas novas) |
| save-isolation | `save_id` em ~20 tabelas de mundo; UNIQUE compostos; índices compostos; ID stride por save (`saveId*1e8`); `countries`/`leagues`/`app_settings` ficam globais |
| match-consequences | `players.suspension_weeks_left INTEGER DEFAULT 0` |
| competitions-real | **nova tabela** `season_promoted`; `MatchEventType += 'penalty_shootout'` (TS-only); `SEASON_END_WEEK 46→58`, `KNOCKOUT_START_WEEK=47` |
| progression-wired | `clubs.training_focus TEXT DEFAULT 'balanced'`; 18 colunas `<attr>_progress REAL DEFAULT 0` em `player_attributes` |
| economy-depth | `players.loan_wage INTEGER NULL`; `clubs.debt_weeks INTEGER DEFAULT 0`; `FinanceType += 'prize'` (TS-only) |
| board-stakes | `save_games.ended INTEGER DEFAULT 0` |

---

## ⚠️ Decisões de produto pendentes (precisam de você)

Coletadas das `open_questions` dos specs — vale decidir antes de executar as ondas correspondentes:

1. **Migração de DBs legados (save-isolation):** o spec adota o mundo global no único save existente quando há exatamente 1 save, e deixa `save_id` NULL (não-migrável) quando há 0 ou ≥2 saves. Alternativa: forçar DB novo / reset de dados. **Confirmar comportamento.**
2. **`SEASON_END_WEEK` 46→58 (competitions-real):** estende a temporada para caber a fase de mata-mata pós-liga. Afeta ritmo do jogo. **OK aumentar?**
3. **`SAVE_ID_STRIDE = 1e8` (save-isolation):** espaço de IDs por save (todos os clubes/jogadores/fixtures de todas as temporadas) deve caber sob o stride. **Confirmar folga.**
4. **Superfície de moral (progression-wired):** moral dinâmica é obrigatória; uma UI de "conversa/elogiar-criticar" é opcional nesta fase. **Incluir agora ou adiar para pilar de produto?**

---

## Como executar um épico

Cada plano declara no topo: **REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`**. Para rodar um épico:
1. Abrir o plano, seguir task-by-task (TDD: teste falha → implementa → teste passa → commit).
2. `npx tsc --noEmit` + `npm test` verdes ao fim de cada task.
3. Telas: validar no browser (Playwright MCP) antes de "pronto".
4. Respeitar o sequenciamento de ondas para não quebrar dependências.

**Definition of done por épico:** todos os gaps do épico cobertos por task · tsc limpo · suíte verde · UI validada (se aplicável) · `git diff` revisado.
