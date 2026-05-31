# Roadmap de Pilares de Produto (Épico 13)

> Estes são **gaps de produto** apontados na auditoria ([`docs/audit/2026-05-31-gap-audit.md`](../../audit/2026-05-31-gap-audit.md), achado "Multiple genre pillars absent") — features **novas** que o jogo não tem, não bugs de algo existente.
> Diferente dos 12 épicos de correção, cada pilar aqui é grande o suficiente para merecer seu **próprio ciclo brainstorming → spec → plan** (design dialogado com o usuário). Este doc é a fila priorizada, não um plano de implementação.
> **Pré-requisito comum:** os 12 épicos de correção (ver [`MASTER-ROADMAP`](./2026-05-31-MASTER-ROADMAP.md)) entregam a fundação (save isolado, loop vivo, economia, competições) sobre a qual estes pilares assentam.

---

## Fila priorizada

### P1 — Pré-temporada & amistosos
**O quê:** janela de pré-temporada com amistosos configuráveis (oponentes por reputação, receita de bilheteria, ganho de fitness/entrosamento), antes da rodada 1.
**Por quê:** porta de entrada do gênero; dá uso real ao fitness e ao engine de partida fora do calendário oficial.
**Depende de:** `competitions-real` (bandas de calendário), `match-consequences` (fitness), `progression-wired` (entrosamento).
**Tamanho estimado:** médio.

### P2 — Interações com jogador (team talk / elogiar / criticar)
**O quê:** superfície de gestão de moral — conversas no vestiário pré/pós-jogo, elogiar/criticar individual, reações encadeadas.
**Por quê:** a auditoria mostrou `updatePlayerMorale` com **zero callers**; `progression-wired` torna a moral dinâmica, este pilar dá ao jogador as **alavancas** sobre ela.
**Depende de:** `progression-wired` (moral dinâmica já existente).
**Tamanho:** médio. _Nota: a decisão pendente #4 do master-roadmap pode antecipar a versão mínima disto._

### P3 — Profundidade de scouting
**O quê:** rede de olheiros, atributos ocultos revelados por scouting, relatórios de alvos, atribuição de olheiros a regiões/jogadores.
**Por quê:** hoje todos os atributos são totalmente visíveis; staff de scout existe mas `scoutAccuracy` é inerte (ver `progression-wired`/`staff-effects`).
**Depende de:** `progression-wired` (efeitos de staff), `economy-depth` (custo de scouting).
**Tamanho:** grande.

### P4 — Gestão in-match (intervalo & ao vivo)
**O quê:** parar a simulação no intervalo (e/ou em eventos), permitir subs/ajuste tático ao vivo, ver momentum/estatísticas parciais.
**Por quê:** o engine já roda por blocos com momentum/fadiga/subs inteligentes — falta só a **interrupção interativa**.
**Depende de:** nada estrutural além do engine atual; é sobretudo UI + pontos de pausa no loop de partida.
**Tamanho:** grande.

### P5 — Imprensa & mídia
**O quê:** coletivas de imprensa, manchetes reativas a resultados/declarações, efeito em moral do elenco e confiança da diretoria.
**Por quê:** `news-generator` já produz manchetes; este pilar adiciona **interação** (responder) e consequência.
**Depende de:** `i18n-completion` (texto gerado já com chave de tradução), `board-stakes` (confiança), `progression-wired` (moral).
**Tamanho:** grande.

### P6 — Reputação do treinador & ofertas de emprego
**O quê:** reputação pessoal do técnico acumulada por resultados/títulos; ofertas de outros clubes; trocar de clube mantendo histórico; mercado de técnicos.
**Por quê:** fecha o loop de carreira; conecta com o game-over de `board-stakes` (ser demitido → procurar emprego).
**Depende de:** `board-stakes` (game-over/unemployment), `save-isolation` (carreira persistida).
**Tamanho:** grande.

### P7 — Bolas paradas & profundidade tática
**O quê:** instruções de escanteio/falta/pênalti, cobradores designados, papéis de jogador mais granulares, rotinas de set-piece no engine.
**Por quê:** o engine já modela faltas/pênaltis genéricos; falta controle do jogador e especialização.
**Depende de:** engine de partida atual.
**Tamanho:** médio.

### P8 — Conquistas & onboarding/tutorial
**O quê:** sistema de conquistas/marcos; tutorial guiado no primeiro jogo; tooltips contextuais.
**Por quê:** retenção e acessibilidade; hoje não há nenhuma introdução ao jogador novo.
**Depende de:** UI estável pós-`navigation-screens`/`i18n-completion`.
**Tamanho:** médio (conquistas) + pequeno (onboarding mínimo).

### P9 — Gestão de seleção nacional (stretch)
**O quê:** convocações, jogos de seleção paralelos à temporada de clube, efeito de fadiga por viagem.
**Por quê:** pilar clássico de end-game; alto custo, baixo prioridade inicial.
**Depende de:** todos os anteriores; calendário multi-competição maduro.
**Tamanho:** xlarge. _Candidato a adiar._

---

## Como proceder com um pilar

Cada um destes **não** tem spec/plan ainda — por design. Quando for a hora:
1. Rodar `superpowers:brainstorming` (design dialogado, decidir escopo/alternativas com o usuário).
2. `superpowers:writing-plans` → plano TDD bite-sized.
3. Executar via `superpowers:subagent-driven-development`.

Recomendação: só iniciar P1 depois que as Ondas 0-2 do master-roadmap estiverem verdes (fundação + loop vivo), senão o pilar assenta sobre sistemas ainda quebrados.
