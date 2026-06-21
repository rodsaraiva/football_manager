# Roadmap Pós-MVP — Design-First → Profundidade de Carreira → Estratégico

> **Data:** 2026-06-20 · **Sucede:** `2026-06-14-strategic-roadmap.md` (que fica como registro histórico).
> **Contexto de partida:** MVP release-ready **concluído** (épico de finalização W0–W7 mergeado; 12/12 épicos do MASTER-ROADMAP + 9/9 pilares; ~1015 testes / 155 suites; determinismo do engine travado).
> **Mandato novo do PO (2026-06-20):** **profissionalizar o design** (hoje "muito padrão") como épico de primeira classe, **antes** de aprofundar a carreira, para que toda feature nova já nasça polida.

Este documento é o **mapa-mestre**. Cada épico tem seu próprio `spec` (em `docs/superpowers/specs/`) e, quando o horizonte é curto/médio, seu `plan` por workstream (em `docs/superpowers/plans/`). Os horizontes de longo prazo têm spec épico com plano faseado embutido (sem plano granular — seria precisão fingida a 6+ meses).

---

## 0. Decisões que fundamentam este roadmap (PO, 2026-06-20)

1. **Sequência = design-first.** A fundação de design (tokens, tipografia, elevação, kit de componentes, motor de imersão de clube) é **pré-requisito** das features de profundidade. Depois, intercala-se profundidade.
2. **Direção visual = "Premium Imersivo" (clube no centro).** Neutros profundos + rampas tint/shade; **a cor do clube guia o chrome** (CTAs, abas, progresso, foco, destaques de card); par tipográfico **UI sans + face condensada para números/stats**; elevação/profundidade; micro-interações. Casual-first como camada padrão, hardcore-friendly a 1 clique (alinhado ao `PRODUCT.md`).
3. **Imersão de clube = faseada (1 → 2 → 3).** (1) accent no chrome [sem assets] → (2) ícones SVG + empty states ilustrados + data-viz → (3) escudos/kits/layouts por clube (assets fictícios gerados — dados reais permanecem fora de escopo).
4. **Profundidade de planejamento = tudo (curto/médio/longo).** Curto e médio com spec **e** plano granular (TDD, executável). Longo com spec épico **detalhado em arquitetura/decomposição/faseamento** (sem TDD step-by-step de software ainda inexistente).
5. **Fontes default:** **Manrope** (UI) + **Saira Condensed** (números/stats), via `expo-font`. Alternativas avaliadas no spec do Design System.
6. **Marca/nome:** mantém **"football-manager"** como placeholder por ora (decisão do PO 2026-06-20). O workstream de marca (D8) entrega o **sistema** (logotipo, ícone, splash, naming guidelines) com o nome a definir depois.
7. **Alvo de plataforma:** inalterado — **mobile (iOS/Android) primário**, web para dev/preview. Os 29 `Alert.alert` (no-op no web) **não** são blocker no alvo mobile; o `useConfirm`/`<Modal>` entra como item do kit (D3) e desbloqueia também o web. Ver [[reference-rn-web-alert]].

---

## 1. Princípio de sequenciamento

```
MÊS 1 ─────────► MÊS 2 ─────────► MÊS 3 ─────────► MÊS 4+ ────────►
┌── CURTO: DESIGN SYSTEM (fundação) ──────────────┐
│ D0 testes → D1 tokens → D2 tipo → D3 kit →       │
│ D4 imersão-clube → D5 sweep telas → D6 motion →  │
│ D7 a11y/Settings → D8 marca                       │
└───────────────────────┬──────────────────────────┘
       a partir do kit (D3) pronto, profundidade já nasce polida:
                         ▼
        ┌── MÉDIO: PROFUNDIDADE DE CARREIRA ───────────────────┐
        │ C1 Dinastia → C2 Base → C3 Scouting → C4 Job market → │
        │ C5 Psicologia → C6 Inbox → C7 In-match → C8 Mini-passes│
        └───────────────────────────────────────────────────────┘
LONGO (paralelo/depois, conforme valor): L1 Seleção · L2 Motor 2D · L3 Saúde do engine ·
   L4 Cloud/Auth · L5 Multiplayer · L6 Desktop/Editor · L7 Áudio · L8 Cross-save · L9 Dados reais
```

**Regra dura de dependência:** nenhum épico de carreira (C*) começa a aplicação de UI antes de **D3 (kit de componentes)** estar verde. C* podem ter o **motor/DB** (engine puro + queries) desenvolvido em paralelo a D*, mas a **camada de tela** espera o kit. **D0 (rede de testes de UI) é bloqueante** para o sweep de redesign (D5).

---

## 2. CURTO PRAZO — Épico **D**: Design System "Premium Imersivo"

**Spec:** [`specs/2026-06-20-design-system-premium-design.md`](specs/2026-06-20-design-system-premium-design.md)
**Objetivo:** transformar a "folha de tokens chapada" numa **linguagem de design** profissional e imersiva por clube, sem tocar no engine. Decomposto em 9 workstreams (padrão W0–W7 do MVP: cada um vira branch `feat/<slug>`, TDD onde há lógica, browser quando há UI, merge ff).

| WS | Workstream | Plan | Entrega-núcleo | Risco | Tam |
|---|---|---|---|---|---|
| **D0** | Rede de testes de UI | [d0](plans/2026-06-20-d0-ui-test-safety-net.md) | Snapshot + integração das telas a redesenhar; testes de store (game/database), 6 report-generators faltantes, i18n/theme. **Gate do redesign.** | médio | M-L |
| **D1** | Tokens v2 | [d1](plans/2026-06-20-d1-design-tokens-v2.md) | Rampas tint/shade; **tokens de elevação/sombra**; escala de espaçamento com ritmo; raio; tokens de **motion/duração/easing**. Paleta premium (neutros profundos) substituindo `#4361ee`/`#f72585` como defaults. | baixo | M |
| **D2** | Tipografia | [d2](plans/2026-06-20-d2-typography-system.md) | `expo-font` (Manrope + Saira Condensed); componentes semânticos `<Display/Headline/Title/Body/Label/Caption/Stat>`; line-height/tracking; fallback de sistema. | baixo | M |
| **D3** | Kit de componentes | [d3](plans/2026-06-20-d3-component-kit.md) | Card (hero/summary/detail + elevação), Button (variantes/estados + accent), Chip/Filter, Badge preenchido, StatBar gradiente, Tab indicator, Modal/Sheet, **Skeleton**, **Toast**, **Icon (SVG, fim do emoji)**, EmptyState v2 (ilustrado+CTA), **useConfirm** (substitui Alert). | médio | L |
| **D4** | Motor de imersão de clube (fase 1) | [d4](plans/2026-06-20-d4-club-immersion-engine.md) | `useClubAccent`/Provider levando o accent do clube a CTAs, abas ativas, progresso, foco, destaques — em **todo** o app (hoje só `ClubBanner`). Regra identidade/ação revista. | médio | M |
| **D5** | Sweep de aplicação nas telas | [d5](plans/2026-06-20-d5-screen-application-sweep.md) | Aplicar o sistema nas 44 telas, **beachhead** nas duas comprovadamente fracas (Mercado → ritmo de card; Free Agents → empty state ilustrado), depois Home/Squad/PlayerDetail/Tactics/Reports/Club. Fatiado por aba. | médio | XL |
| **D6** | Motion & polish | [d6](plans/2026-06-20-d6-motion-polish.md) | Press-scale, transições de tela/modal, skeletons em loaders, micro-celebrações (overall↑, troféu, transferência), haptics (substituto de áudio no MVP). | baixo-médio | M |
| **D7** | Acessibilidade + Settings | [d7](plans/2026-06-20-d7-accessibility-settings.md) | `accessibilityLabel`/`testID` nas telas (habilita D0/automação); tela de **Settings global** (idioma, reduce-motion, haptics, tamanho de fonte, dificuldade). | baixo-médio | M |
| **D8** | Marca & identidade | [d8](plans/2026-06-20-d8-brand-identity.md) | Logotipo, ícone do app, splash, guidelines de naming/voz; **nome a definir** (placeholder mantido). Gerador de **escudo fictício** semente do faseamento de imersão (passo 3). | médio | M |

**Sequência recomendada:** D0 → D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8. (D0 cedo para gate de redesign; D1-D3 são a fundação; D4 antes do sweep para o sweep já aplicar accent; D7/D8 fecham polish/identidade.)

**DoD do épico D:** tokens/tipografia/kit cobertos por teste; accent do clube visível em CTAs/abas/progresso em todas as telas; as 44 telas migradas para o kit (zero estilo inline duplicado de card/botão); 0 emoji-como-ícone nas telas principais; Settings funcional; `npx tsc --noEmit` + suíte verdes; passe de browser comparando antes/depois nas telas-chave.

---

## 3. MÉDIO PRAZO — Épicos **C**: Profundidade de Carreira

Cada um tem **spec + plano**. O **motor/DB** pode adiantar em paralelo ao Design System; a **UI** usa o kit (D3+). Prioridade declarada do PO: profundidade de carreira é o foco pós-design.

| Épico | Tema | Spec | Plan | Por quê (gap) | Tam |
|---|---|---|---|---|---|
| **C1** | Dinastia & Legado | [c1](specs/2026-06-20-c1-dynasty-legacy-design.md) | [c1](plans/2026-06-20-c1-dynasty-legacy.md) | Sem hall da fama, recordes all-time, linha do tempo do técnico, rivalidades/clássicos. É o **retention driver** nº1 de um jogo 1×/dia. Assenta no season-history + manager-reputation. | L |
| **C2** | Base de verdade (Youth Academy) | [c2](specs/2026-06-20-c2-youth-academy-design.md) | [c2](plans/2026-06-20-c2-youth-academy.md) | Tela é **stub** num lugar de destaque; engine gera coortes estáticas. Maior expectativa quebrada + maior loop de dinastia ausente. Níveis de academia, integração jovem→reserva→profissional, empréstimo de desenvolvimento. | L |
| **C3** | Scouting profundo | [c3](specs/2026-06-20-c3-scouting-depth-design.md) | [c3](plans/2026-06-20-c3-scouting-depth.md) | Engine de 74 linhas (só fog-of-war). Arquétipos de olheiro, atribuição por jogador/região, tipos de missão, intel de adversário, alvo de jovens. Alto valor/esforço (UI+DB sobre base existente). | M |
| **C4** | Job market do técnico (P6) | [c4](specs/2026-06-20-c4-manager-job-market-design.md) | [c4](plans/2026-06-20-c4-manager-job-market.md) | Fecha o loop: sobre o W2 (ofertas-resgate), demissão vira **continuação** e não game-over; reputação pessoal→mercado, contrato, spell de desemprego com decaimento de rep. | M-L |
| **C5** | Psicologia do elenco (P2) | [c5](specs/2026-06-20-c5-squad-psychology-design.md) | [c5](plans/2026-06-20-c5-squad-psychology.md) | Moral é valor solto. Drivers explicáveis, arquétipos de personalidade, química/cliques, brigas, histórico de interação. | M |
| **C6** | Inbox / comunicação | [c6](specs/2026-06-20-c6-inbox-comms-design.md) | [c6](plans/2026-06-20-c6-inbox-comms.md) | Superfície FM reconhecível que **organiza** eventos (diretoria/contrato/empréstimo/patrocínio/scout) sobre o `news_items` do W3. | M |
| **C7** | Gestão in-match + conselho tático (P4) | [c7](specs/2026-06-20-c7-in-match-management-design.md) | [c7](plans/2026-06-20-c7-in-match-management.md) | Hoje só halftime. Subs/táticas ao vivo + sugestões do assistente por placar/adversário. | L |
| **C8** | Mini-passes de profundidade | [c8](specs/2026-06-20-c8-depth-mini-passes-design.md) | [c8](plans/2026-06-20-c8-depth-mini-passes.md) | Conjunto de incrementos pequenos e independentes: pré-temporada simulada, congestionamento/rotação de calendário, gravidade de lesão + recuperação, portfólio de empréstimos, curva de forma, bolas paradas (P7), profundidade de mídia (P5). | M (somado) |

**Onda 1 de carreira (recomendada após D):** C1 → C2 → C3 → C4. **Onda 2:** C5 → C6 → C7 → C8 (intercaláveis).

**DoD por épico C:** spec coberto por tasks; motor puro com TDD (better-sqlite3 real, nunca mock); colunas/tabelas em schema.ts **e** database-store.ts; save-isolation `(db, saveId, …)`; zero não-determinismo no engine; UI no kit do Design System; i18n pt/en com paridade; suíte + tsc verdes; e2e de carreira (W0) continua verde.

---

## 4. LONGO PRAZO — Épicos **L**: Estratégico (spec épico + faseamento)

Cada um é um épico próprio; o spec traz **visão, decomposição em sub-épicos, opções de arquitetura, pré-requisitos, sequência faseada, decisões abertas e risco**. Plano granular só quando entrarem na fila ativa.

| Épico | Tema | Spec | Natureza | Pré-requisito |
|---|---|---|---|---|
| **L1** | Seleção nacional (P9 completo) | [l1](specs/2026-06-20-l1-national-team-design.md) | Calendário internacional paralelo, convocações, caps/prestígio, competições | C8 (congestionamento) ajuda |
| **L2** | Motor de partida profundo + visual 2D | [l2](specs/2026-06-20-l2-match-engine-2d-design.md) | Surface da simulação rica (heat/pass/shot maps, replay 2D) | **L3** (decompor match-engine) |
| **L3** | Saúde do engine & arquitetura | [l3](specs/2026-06-20-l3-engine-health-design.md) | Decompor `game-loop.ts`/`match-engine.ts`/`news-generator.ts`; validação Zod na query-layer | — (habilitador; pode antecipar) |
| **L4** | Cloud save + contas/auth | [l4](specs/2026-06-20-l4-cloud-save-auth-design.md) | Sync de save, resolução de conflito, auth nativa | repositório público + backend |
| **L5** | Multiplayer / ligas online | [l5](specs/2026-06-20-l5-multiplayer-design.md) | Competição entre saves; servidor + sync de estado | **L4** |
| **L6** | Desktop (Steam) + editor de clubes/ligas | [l6](specs/2026-06-20-l6-desktop-editor-design.md) | Port web-wrapper + UI de editor + pipeline de assets | linguagem de design madura (D) |
| **L7** | Áudio (música + SFX) | [l7](specs/2026-06-20-l7-audio-design.md) | Trilha ambiente + SFX de eventos; respeita "sem progressão offline" | D6 (eventos de motion já mapeados) |
| **L8** | Conquistas cross-save + leaderboards | [l8](specs/2026-06-20-l8-cross-save-achievements-design.md) | Play Games / Game Center; ranking global | **L4** (auth) |
| **L9** | Dados reais licenciados | [l9](specs/2026-06-20-l9-licensed-data-design.md) | Decisão de **negócio/licenciamento**; muda modelo. Parado por padrão. | decisão de negócio |

**Nota sobre L3:** é habilitador transversal. Recomenda-se **antecipá-lo parcialmente** (decompor `game-loop`/`match-engine`) assim que um épico C exigir tocar essas funções, evitando crescer o monólito.

---

## 5. Rastreabilidade — o que vira spec/plan

- **Curto (D):** 1 spec (Design System) + 9 planos (D0–D8). Execução no padrão MVP (plano por workstream → subagent-driven-development → verify → merge).
- **Médio (C):** 8 specs + 8 planos (C1–C8). Ciclo `brainstorming` (spec) já consolidado aqui → `writing-plans` (plano) → execução.
- **Longo (L):** 9 specs épicos com faseamento embutido. Cada um, ao entrar em foco, ganha brainstorming de decomposição → planos por sub-épico.

## 6. Métricas de sucesso

- **Design:** comparação visual antes/depois nas telas-chave (Home, Squad, PlayerDetail, Mercado, Match); 0 estilo inline duplicado de card/botão; accent do clube perceptível em ≥1 elemento de ação por tela; cobertura de testes de UI saindo de ~3/53 para a maioria das telas redesenhadas.
- **Carreira:** sessões mais longas/recorrentes (proxy: nº de temporadas por save no e2e de longevidade); youth academy deixa de ser stub; loop de demissão→novo-emprego fechado sem game-over forçado.
- **Saúde técnica:** suíte sempre verde; `game-loop.ts`/`match-engine.ts` decompostos antes de receberem features de profundidade; determinismo mantido.

## 7. Decisões abertas (rastrear por épico)

- **D2:** confirmar Manrope+Saira no device (peso de bundle de fontes; fallback). 
- **D8:** nome/marca final (placeholder por ora).
- **D5:** ordem fina das telas no sweep (beachhead Mercado/Free Agents fixo; resto por uso).
- **C4:** demissão = perde cargo e migra (recomendado) vs fim do save — herdar a decisão do W2 e estender.
- **C7:** profundidade do controle ao vivo (subs a qualquer minuto vs janelas) — decidir no spec por custo de UX casual.
- **L3:** antecipar a decomposição do engine ou esperar a primeira feature C que force.
- **L9:** decisão de negócio sobre licenciamento — fora de escopo até deliberação do PO.
