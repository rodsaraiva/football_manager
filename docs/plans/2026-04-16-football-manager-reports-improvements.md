# Football Manager — Plan: Reports Improvements (8 Features)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the reports hub with 8 new analytical features — from radar charts and opponent scouting to ROI on transfers and squad morale — turning the Reports tab into the core decision-making surface of the game.

**Architecture:** Each feature follows the same two-layer pattern already established: a pure engine module in `src/engine/reports/` (data-in, data-out, no UI) and a screen in `src/screens/reports/`. Shared query helpers go in `src/database/queries/`. Navigation routes are added to `src/navigation/types.ts` and registered in `src/navigation/RootNavigator.tsx`. Hub cards are added to `src/screens/reports/ReportsHubScreen.tsx`.

---

## Meta: Execution Order, Dependencies, and Risks

### Suggested execution order

Start with the three S-sized features (lowest risk, fast wins), then the M-sized ones in dependency order, and leave the L feature for last.

```
Phase 1 — Small, independent (days 1-2)
  Feature 8: Índice de Moral do Elenco
  Feature 3: Alerta de Contratos Vencendo
  Feature 4: Eficiência por Linha

Phase 2 — Medium, data-rich (days 3-5)
  Feature 1: Radar Comparativo de Atributos
  Feature 2: Relatório Pré-Jogo do Adversário
  Feature 5: Histórico de Transferências com ROI
  Feature 6: Projeção de Classificação Final

Phase 3 — Large, complex (day 6+)
  Feature 7: Scouting de Free Agents com Fit Tático
```

### Cross-feature dependencies

| Feature | Depends on |
|---|---|
| F3 Contratos | `players.contract_end`, `players.morale` — shares player loading with F8 |
| F4 Eficiência por Linha | `ratePlayerFromEvents` from `technical-report.ts` (line 176) — already exists |
| F5 ROI de Transferências | `transfers` table, `player_stats`, `calculateOverall` — no new infra |
| F6 Projeção de Classificação | `StandingsEntry` from `standings.ts` + `fixtures` (unplayed) + `calculateOverall` per club |
| F7 Scouting Free Agents | Re-uses `calculateOverall`, position-gap logic from F4, wage filter from F3 |
| F1 Radar | Re-uses `ATTRIBUTE_LABELS` and `PlayerAttributes` from `technical-report.ts` (line 27) |
| F2 Adversário | Re-uses `ratePlayerFromEvents`, `ClubSample` shape from `analytics-report.ts` |

F3 and F8 can share a single `getContractAlerts` query function. F4 and F7 both need a `positionGroup` utility (GK / DEF / MID / ATK) — extract it once into a shared helper.

### Risks and open decisions

1. **Radar chart library.** `react-native-svg` (v15) is installed. The radar will be drawn as a pure SVG polygon — no extra dependency. Risk: polygon math is non-trivial but self-contained.
2. **`transfers` table lacks `arrival_season` column.** The ROI feature needs to know "stats since arrival". The `transfers.season` column records the season of the transfer — use it as the arrival anchor. No migration needed, but the query must aggregate `player_stats` across seasons >= `transfer.season`.
3. **Projected classification (F6) is inherently speculative.** The chosen approach (overall-based win probability per fixture) must be clearly labelled as "estimate" in the UI to avoid confusion with real standings.
4. **Spider chart "compare vs. squad average" mode requires computing per-position averages at render time.** This is pure JS — no DB query needed — but requires the full squad's attributes to be loaded. `getPlayersWithAttributesByClub` (already used in `ReportsTechnicalScreen.tsx` line 44) covers this.
5. **Free-agent scouting (F7) iterates every free agent in the DB.** This could be slow for large saves (1000+ players). Mitigate by loading only `is_free_agent = 1` rows (the `getFreeAgents` query already exists in `src/database/queries/players.ts` line 197) and computing overall lazily.
6. **No `contracts` table exists.** Contract data lives directly in `players.contract_end` (integer, season number) and `players.wage`. No migration needed for F3.

---

## Feature 1 — Radar Comparativo de Atributos

**Size: M | Estimated effort: 5-7 h**

### Objetivo
Visualizar o perfil de atributos de um jogador como spider chart, com opção de sobrepor um segundo jogador ou a média do elenco na posição. Elimina a necessidade de ler 18 números isolados ao comparar perfis.

### Dados envolvidos
- `player_attributes` — todos os 18 atributos via `getPlayerById` (já existe em `src/database/queries/players.ts` linha 132)
- `player_attributes` de todos os jogadores do clube — via `getPlayersWithAttributesByClub` (já existe, linha 115)
- Nenhuma migration necessária

### Arquivos a criar/modificar

| Ação | Arquivo |
|---|---|
| CRIAR | `src/components/RadarChart.tsx` |
| CRIAR | `src/screens/reports/ReportsRadarScreen.tsx` |
| MODIFICAR | `src/navigation/types.ts` |
| MODIFICAR | `src/navigation/RootNavigator.tsx` |
| MODIFICAR | `src/screens/reports/ReportsHubScreen.tsx` |
| MODIFICAR | `src/screens/squad/PlayerDetailScreen.tsx` (botão "Comparar") |

### UI proposta
- Acessível pelo Hub (card "Radar de Atributos") E por um botão "Comparar" na `PlayerDetailScreen`
- Tela: seletor de Jogador A (pré-populado se veio do PlayerDetail), toggle "Comparar com: [Jogador / Média da Posição]", seletor de Jogador B quando "Jogador" selecionado
- Spider chart octogonal de 18 eixos, dois polígonos sobrepostos com transparência (cores `colors.primary` e `colors.accent`)
- Legenda abaixo: nome, overall, posição de cada perfil
- Scroll abaixo do chart: tabela de diferenças por atributo (+/- delta com cor verde/vermelho)

### Etapas de implementação

- [ ] Criar `src/components/RadarChart.tsx`: recebe `profiles: { label: string; color: string; values: number[] }[]` e `axisLabels: string[]`. Implementar com `react-native-svg` (já instalado): computar coordenadas polares para cada eixo (360/18 graus por eixo), converter para cartesianas, desenhar `<Polygon>` para cada perfil com `fillOpacity={0.25}` e `<Polyline>` para a borda. Adicionar labels de eixo como `<Text>` SVG posicionados externamente ao polígono.
- [ ] Criar `src/screens/reports/ReportsRadarScreen.tsx`: carrega squad via `getPlayersWithAttributesByClub`, expõe dois `Picker`/`FlatList` de seleção de jogador, calcula média por posição para o modo "vs. elenco", monta o array `profiles` para `RadarChart`. Usar `ATTRIBUTE_LABELS` de `src/engine/reports/technical-report.ts` (linha 27) para os `axisLabels`.
- [ ] Adicionar rota `ReportsRadar: { playerAId?: number }` em `src/navigation/types.ts` e registrar em `src/navigation/RootNavigator.tsx` com `title: 'Radar de Atributos'`.
- [ ] Adicionar `HubCard` em `src/screens/reports/ReportsHubScreen.tsx` (ícone "🕸️", accent `colors.primaryLight`).
- [ ] Adicionar botão "Comparar atributos" em `src/screens/squad/PlayerDetailScreen.tsx` que navega para `ReportsRadar` passando `playerAId`.

### Critérios de aceite
- Chart renderiza sem crash com 18 eixos e 2 perfis simultâneos
- Modo "vs. média da posição" calcula a média apenas dos jogadores com a mesma posição principal
- Tabela de deltas ordena atributos do maior diferencial positivo ao negativo
- Navegar a partir do PlayerDetail pré-seleciona Jogador A corretamente
- Funciona com jogadores do banco (overall < 60) sem distorção visual

---

## Feature 2 — Relatório Pré-Jogo do Adversário

**Size: M | Estimated effort: 6-8 h**

### Objetivo
Antes de cada jogo, entregar ao usuário um mini-dossiê do próximo oponente: forma recente, overall do elenco, top players, gols marcados e sofridos. Responde "o que devo esperar do adversário?".

### Dados envolvidos
- `fixtures` WHERE `season = ?` AND (`home_club_id = ? OR away_club_id = ?`) AND `played = 0` ORDER BY `week` ASC LIMIT 1 — próximo jogo
- `fixtures` WHERE played — últimos 5 jogos do adversário (forma)
- `match_events` — para calcular rating dos jogadores do adversário nesses jogos
- `players` + `player_attributes` WHERE `club_id = opponentId` — top players por overall
- `clubs` WHERE `id = opponentId` — nome, reputação
- Nenhuma migration necessária

### Arquivos a criar/modificar

| Ação | Arquivo |
|---|---|
| CRIAR | `src/engine/reports/opponent-report.ts` |
| CRIAR | `src/screens/reports/ReportsOpponentScreen.tsx` |
| MODIFICAR | `src/navigation/types.ts` |
| MODIFICAR | `src/navigation/RootNavigator.tsx` |
| MODIFICAR | `src/screens/reports/ReportsHubScreen.tsx` |

### UI proposta
- Card no Hub "Próximo Adversário" (ícone "🔍", accent `colors.warning`) — se não há próximo jogo, card desabilitado com texto "Nenhum jogo agendado"
- Tela: cabeçalho com nome do adversário, reputação, data (semana) do jogo
- Seção "Forma Recente": últimos 5 resultados do adversário (W/D/L chips coloridos + placar)
- Seção "Força do Elenco": overall médio, top 3 jogadores por overall (nome + posição + overall)
- Seção "Ataque vs. Defesa": gols marcados/sofridos por jogo nos últimos 5 jogos
- Seção "Alerta": se adversário está em sequência de vitórias (>= 3) ou de derrotas

### Etapas de implementação

- [ ] Criar `src/engine/reports/opponent-report.ts`: exportar interface `OpponentReport` e função pura `buildOpponentReport({ nextFixture, opponentRecentFixtures, opponentSquad, opponentClub, eventsByFixture, playerClubId })`. A função computa: forma (array de `'W'|'D'|'L'`), `goalsPerGame`, `concededPerGame`, top 3 players por `calculateOverall`, `reputationLabel` (`'Favorito' | 'Equilíbrio' | 'Zebra'` baseado em reputação relativa).
- [ ] Criar `src/screens/reports/ReportsOpponentScreen.tsx`: no `useFocusEffect`, buscar próximo fixture do clube via query em `fixtures` (primeiro `played = 0` ordenado por `week`), identificar `opponentId`, carregar squad do adversário via `getPlayersWithAttributesByClub`, carregar últimos 5 fixtures do adversário filtrados como `played = 1` e seus `match_events`, chamar `buildOpponentReport`.
- [ ] Adicionar `ReportsOpponent: undefined` em `src/navigation/types.ts` e registrar em `src/navigation/RootNavigator.tsx`.
- [ ] Adicionar `HubCard` "🔍 Próximo Adversário" em `src/screens/reports/ReportsHubScreen.tsx`. O card deve exibir o nome do adversário no `subtitle` — o hub carregará o próximo fixture na sua própria `useFocusEffect` para popular esse label dinamicamente.
- [ ] Adicionar query helper `getNextFixtureForClub(db, clubId, season, currentWeek): Promise<Fixture | null>` em `src/database/queries/fixtures.ts` — SELECT com `played = 0 AND season = ? AND week >= ?` ORDER BY `week` ASC LIMIT 1.

### Critérios de aceite
- Quando não há próximo jogo, a tela exibe "Nenhum jogo agendado nesta temporada"
- Forma recente mostra apenas jogos de liga (mesma `competition_id` usada nos standings)
- Top 3 players do adversário exibe overall calculado via `calculateOverall` (não `market_value`)
- O card no hub exibe o nome do adversário no subtitle (não texto fixo)

---

## Feature 3 — Alerta de Contratos Vencendo

**Size: S | Estimated effort: 2-3 h**

### Objetivo
Listar jogadores cujos contratos vencem em até 2 temporadas E com overall > 70, evitando perda gratuita de ativos importantes no fim de contrato.

### Dados envolvidos
- `players.contract_end` — season em que o contrato expira
- `players.morale`, `players.wage`, `players.market_value`
- Nenhuma migration necessária (`contract_end` já é INTEGER = season number)

### Arquivos a criar/modificar

| Ação | Arquivo |
|---|---|
| CRIAR | `src/engine/reports/contract-alerts.ts` |
| MODIFICAR | `src/screens/reports/ReportsTechnicalScreen.tsx` (nova seção) |
| MODIFICAR | `src/screens/reports/ReportsHubScreen.tsx` (badge de alerta no card do Assistente Técnico) |

### UI proposta
- Não cria tela nova: integra como nova seção "⚠️ Contratos Vencendo" dentro de `ReportsTechnicalScreen.tsx`, logo abaixo do cabeçalho existente
- Lista cada jogador em alerta: nome, posição, overall, `contractEnd`, `wage`, badge de urgência (vermelho se `contractEnd === season`, amarelo se `contractEnd === season + 1`, laranja se `contractEnd === season + 2`)
- Badge numérico no card "Assistente Técnico" do hub indicando quantos jogadores em alerta

### Etapas de implementação

- [ ] Criar `src/engine/reports/contract-alerts.ts`: exportar interface `ContractAlert { player: SquadPlayer; contractEnd: number; urgency: 'critical'|'warning'|'watch' }` e função pura `buildContractAlerts(squad: SquadPlayer[], currentSeason: number, contractEndBySeason: Map<number, number>): ContractAlert[]`. Critério: `contractEnd - currentSeason <= 2` AND `overall > 70`. Ordena por `urgency` desc, depois por `overall` desc.
- [ ] Adicionar campo `contractEnd` e `wage` ao tipo `SquadPlayer` em `src/engine/reports/technical-report.ts` (linha 14) — ou criar tipo separado `ContractSquadPlayer` para não quebrar usos existentes. Optar por estender `SquadPlayer` com campos opcionais: `contractEnd?: number; wage?: number`.
- [ ] Em `src/screens/reports/ReportsTechnicalScreen.tsx`: no bloco de carregamento (linha 44), adicionar `contractEnd` e `wage` ao mapeamento de `fullPlayers` para `squad`. Importar e chamar `buildContractAlerts`, guardar em estado `contractAlerts`. Renderizar nova seção `<Section title="⚠️ Contratos Vencendo">` com linhas exibindo nome, OVR, posição, e badge colorido "Vence T{N}".
- [ ] Em `src/screens/reports/ReportsHubScreen.tsx`: o hub já não carrega dados próprios; adicionar uma chamada mínima ao `useFocusEffect` que conta alertas e renderiza um badge `<Text>` numérico no card do Assistente Técnico quando `count > 0`.

### Critérios de aceite
- Jogadores com `overall <= 70` não aparecem na lista, mesmo com contrato vencendo
- Urgência `critical` (vence na temporada atual) aparece em `colors.danger`
- Badge no hub mostra 0 (sem badge) quando não há alertas
- A seção não quebra quando todos os jogadores têm contratos longos (lista vazia com mensagem)

---

## Feature 4 — Eficiência por Linha do Próprio Time

**Size: S | Estimated effort: 3-4 h**

### Objetivo
Responder "qual setor está performando pior?" cruzando o rating médio dos últimos N jogos por grupo posicional (GK / DEF / MID / ATK), visível no Analista de Dados ou Assistente Técnico.

### Dados envolvidos
- `match_events` + `fixtures` played (já usados em `ReportsTechnicalScreen`)
- `players.position` para agrupar
- Nenhuma migration necessária

### Arquivos a criar/modificar

| Ação | Arquivo |
|---|---|
| CRIAR | `src/engine/reports/line-efficiency.ts` |
| MODIFICAR | `src/screens/reports/ReportsTechnicalScreen.tsx` (nova seção) |

### UI proposta
- Nova seção "📊 Eficiência por Linha" dentro de `ReportsTechnicalScreen.tsx`, abaixo do Resumo do Elenco existente
- Quatro barras horizontais (GK / DEF / MID / ATK) com o rating médio do grupo e número de aparições
- A linha com menor rating recebe destaque vermelho e texto "Setor mais fraco"
- A linha com maior rating recebe destaque verde e texto "Setor mais forte"

### Etapas de implementação

- [ ] Criar `src/engine/reports/line-efficiency.ts`: exportar constante `LINE_GROUPS: Record<'GK'|'DEF'|'MID'|'ATK', Position[]>` mapeando grupos para posições (`DEF: ['CB','LB','RB']`, `MID: ['CDM','CM','CAM','LM','RM']`, `ATK: ['LW','RW','ST']`). Exportar interface `LineEfficiency { group: string; avgRating: number; appearances: number }` e função `buildLineEfficiency(forms: PlayerForm[], squad: SquadPlayer[]): LineEfficiency[]`. Usa `ratePlayerFromEvents` indiretamente via o array `PlayerForm` já computado em `buildTechnicalReport`.
- [ ] Em `src/screens/reports/ReportsTechnicalScreen.tsx`: após chamar `buildTechnicalReport`, derivar `lineEfficiency` chamando `buildLineEfficiency(forms, squad)` onde `forms` é o resultado de `computeForm`. Renderizar nova seção com quatro linhas de rating. **Nota:** `computeForm` já existe em `technical-report.ts` e é chamado internamente por `buildTechnicalReport` — expô-la para uso na screen requer apenas exportar o resultado de `forms` do relatório, o que significa adicionar `forms: PlayerForm[]` ao tipo `TechnicalReport` retornado em `src/engine/reports/technical-report.ts` linha 160.
- [ ] Adicionar `forms` ao objeto retornado por `buildTechnicalReport` em `src/engine/reports/technical-report.ts` (linha 347) — mudança backwards-compatible pois apenas adiciona campo ao objeto retornado.

### Critérios de aceite
- Cada grupo exibe corretamente apenas os jogadores das posições mapeadas
- Se um grupo não tem nenhuma aparição no período, exibe "Sem dados" em vez de NaN
- Setor mais fraco e mais forte são identificados corretamente mesmo com empate (empate = ambos destacados)
- A janela de análise (3/5/10 jogos) do seletor existente na tela afeta a eficiência por linha

---

## Feature 5 — Histórico de Transferências com ROI

**Size: M | Estimated effort: 5-6 h**

### Objetivo
Mostrar o retorno de cada contratação: quanto pagou, quanto vale hoje, quantos gols+assists produziu. Fundamenta decisões de venda ("vale renovar ou vender agora?").

### Dados envolvidos
- `transfers` — `fee`, `wage_offered`, `season` (season de chegada), `to_club_id`, `from_club_id`, `type`
- `players` — `market_value` atual, `morale`, `contractEnd`
- `player_attributes` — para calcular `overall` atual
- `player_stats` — `goals + assists` acumulados desde `transfer.season`
- Nenhuma migration necessária

### Arquivos a criar/modificar

| Ação | Arquivo |
|---|---|
| CRIAR | `src/engine/reports/transfer-roi-report.ts` |
| CRIAR | `src/screens/reports/ReportsTransferROIScreen.tsx` |
| MODIFICAR | `src/navigation/types.ts` |
| MODIFICAR | `src/navigation/RootNavigator.tsx` |
| MODIFICAR | `src/screens/reports/ReportsHubScreen.tsx` |
| MODIFICAR | `src/database/queries/transfers.ts` (nova query) |

### UI proposta
- Card no Hub "💼 ROI de Transferências" (accent `colors.gold`), integrado à seção principal
- Tela: duas abas "Contratações" e "Vendas"
  - **Contratações**: cada jogador que veio ao clube (via `transfers.to_club_id = playerClubId`): linha com nome, posição, temporada de chegada, fee pago, valor atual, delta de valor (verde/vermelho), gols+assists desde a chegada
  - **Vendas**: jogadores vendidos (`transfers.from_club_id = playerClubId`): fee recebido
- Ordenação padrão: maior ROI absoluto (valorMercadoAtual - feePago) descrescente

### Etapas de implementação

- [ ] Adicionar `getTransfersByClub(db, clubId): Promise<Transfer[]>` em `src/database/queries/transfers.ts` — SELECT WHERE `to_club_id = ? OR from_club_id = ?`.
- [ ] Criar `src/engine/reports/transfer-roi-report.ts`: exportar interfaces `TransferROIEntry { transfer: Transfer; playerName: string; position: Position; currentOverall: number; currentMarketValue: number; feePaid: number; valueDelta: number; goalsAndAssists: number; season: number }` e `TransferROIReport { signings: TransferROIEntry[]; sales: TransferROIEntry[] }`. Função pura `buildTransferROIReport(transfers, playerStatsAllSeasons, playersWithAttrs, currentSeason)`. Para cada signing, agrega `player_stats` para `season >= transfer.season` somando `goals + assists`.
- [ ] Criar `src/screens/reports/ReportsTransferROIScreen.tsx`: carrega transferências via `getTransfersByClub`, carrega squad atual via `getPlayersWithAttributesByClub` para valor atual, carrega `player_stats` para cada jogador via `getPlayerStatsForPlayer` (já existe em `player-stats.ts` linha 103), monta e exibe relatório com dois tabs usando `View` + `Pressable` (padrão já visto no seletor de janela da ReportsTechnicalScreen).
- [ ] Registrar rota `ReportsTransferROI: undefined` em `src/navigation/types.ts` e `src/navigation/RootNavigator.tsx`.
- [ ] Adicionar HubCard em `src/screens/reports/ReportsHubScreen.tsx`.

### Critérios de aceite
- Jogadores emprestados (`type = 'loan'`) são exibidos com label "Empréstimo" e sem ROI de valor
- Jogadores que saíram do clube (não estão mais em `players.club_id = playerClubId`) têm `currentMarketValue` exibido como "N/A" com nota "Saiu do clube"
- A aba "Vendas" mostra o fee recebido e o overall do jogador no momento (aproximado pelo valor atual, sem retroativo)
- Contratações gratuitas (`fee = 0`) mostram "Free" no campo de custo

---

## Feature 6 — Projeção de Classificação Final

**Size: M | Estimated effort: 6-7 h**

### Objetivo
Simular onde o clube do usuário terminará na tabela ao fim da temporada, usando os pontos atuais e uma projeção de aproveitamento nos jogos restantes baseada na comparação de overalls. Responde "posso ser rebaixado?" ou "serei campeão?".

### Dados envolvidos
- `fixtures` WHERE `played = 0 AND season = ?` — jogos restantes
- `fixtures` WHERE `played = 1 AND season = ?` — standings atuais (já computados via `calculateStandings`)
- `players` + `player_attributes` — overall de cada clube para os jogos restantes
- `clubs` — nome para exibição
- Nenhuma migration necessária

### Arquivos a criar/modificar

| Ação | Arquivo |
|---|---|
| CRIAR | `src/engine/reports/classification-projection.ts` |
| CRIAR | `src/screens/reports/ReportsProjectionScreen.tsx` |
| MODIFICAR | `src/navigation/types.ts` |
| MODIFICAR | `src/navigation/RootNavigator.tsx` |
| MODIFICAR | `src/screens/reports/ReportsHubScreen.tsx` |

### UI proposta
- Card no Hub "📈 Projeção de Classificação" (accent `colors.primary`)
- Tela: tabela com classificação projetada ao fim da temporada, colunas: Pos, Clube, Pts Atuais, Pts Projetados, Jogos Restantes
- Linha do clube do usuário destacada com `borderLeftColor: colors.primary`
- Badge de status: "Zona de Título", "Zona de Classificação", "Zona de Rebaixamento"
- Disclaimer no rodapé: "Projeção baseada em overall comparativo — não inclui fator sorte."
- Seção "Próximos 5 Jogos": dificuldade estimada (fácil/médio/difícil) baseada no overall relativo do adversário

### Etapas de implementação

- [ ] Criar `src/engine/reports/classification-projection.ts`: exportar função `projectClassification({ currentStandings: StandingsEntry[], remainingFixtures: Fixture[], overallByClub: Map<number, number>, leagueSize: number }): ProjectedStanding[]` onde `ProjectedStanding extends StandingsEntry` com campos `projectedPoints: number` e `projectedPosition: number`. Para cada jogo não-disputado, calcular probabilidade de vitória do clube A como `overallA / (overallA + overallB)`, com probabilidade de empate de 20% fixo. Usar valor esperado (não aleatorizar) para produzir resultado determinístico.
- [ ] Criar `src/screens/reports/ReportsProjectionScreen.tsx`: carrega standings atuais (mesmo padrão de `ReportsAnalyticsScreen.tsx` linhas 42-61), carrega todos os fixtures da temporada, separa jogados/não-jogados, carrega `getPlayersWithAttributesByClub` para todos os clubes da liga para computar `overallByClub` (pode re-usar o loop já presente em `ReportsAnalyticsScreen` como utilitário — considerar extração para query compartilhada futura).
- [ ] Registrar rota `ReportsProjection: undefined` em `src/navigation/types.ts` e `src/navigation/RootNavigator.tsx`.
- [ ] Adicionar HubCard em `src/screens/reports/ReportsHubScreen.tsx`.

### Critérios de aceite
- Tabela projetada tem exatamente `leagueSize` entradas
- A posição projetada do clube do usuário está destacada visualmente
- Quando todos os jogos já foram disputados, a projeção é idêntica à classificação real
- Dificuldade dos próximos 5 jogos classifica corretamente: "Fácil" se `overallAdversário < overallMeu - 10`, "Difícil" se `> overallMeu + 10`

---

## Feature 7 — Scouting de Free Agents com Fit Tático

**Size: L | Estimated effort: 8-10 h**

### Objetivo
Filtrar free agents e rankeá-los por "quanto tapam o gap" na posição mais fraca do elenco do usuário (cruzando overall por posição com a eficiência por linha de F4), dentro de uma faixa salarial viável.

### Dados envolvidos
- `players WHERE is_free_agent = 1` — via `getFreeAgents` já existente em `players.ts` linha 197
- `player_attributes WHERE player_id IN (...)` — para calcular overall de cada free agent
- `players WHERE club_id = playerClubId` — elenco atual para calcular gaps por posição
- `clubs.wage_budget` e soma atual de `players.wage WHERE club_id = ?` — espaço salarial disponível
- Nenhuma migration necessária

### Arquivos a criar/modificar

| Ação | Arquivo |
|---|---|
| CRIAR | `src/engine/reports/free-agent-scout.ts` |
| CRIAR | `src/screens/reports/ReportsFreeAgentScoutScreen.tsx` |
| MODIFICAR | `src/navigation/types.ts` |
| MODIFICAR | `src/navigation/RootNavigator.tsx` |
| MODIFICAR | `src/screens/reports/ReportsHubScreen.tsx` |
| MODIFICAR | `src/database/queries/players.ts` (nova query com atributos para free agents) |

### UI proposta
- Card no Hub "🎯 Scouting de Free Agents" (accent `colors.success`)
- Tela: filtros no topo (posição, faixa de overall, faixa salarial), lista de free agents ordenada por "fit score"
- Cada item: nome, idade, posição, overall, wage, "Fit Score" (0-100) com barra colorida
- Tap em jogador abre `PlayerDetail` (rota já existe)
- Seção fixa no topo: "Lacunas no elenco" — lista as posições mais fracas com o overall médio atual

### Etapas de implementação

- [ ] Adicionar `getFreeAgentsWithAttributes(db): Promise<(Player & { attributes: PlayerAttributes })[]>` em `src/database/queries/players.ts` — SELECT JOIN com `player_attributes` usando IN clause (padrão de `getPlayersWithAttributesByClub` linha 115).
- [ ] Criar `src/engine/reports/free-agent-scout.ts`: exportar `LINE_GROUPS` (ou importar de `line-efficiency.ts` quando F4 estiver feito), exportar interface `FreeAgentFit { player: Player; overall: number; fitScore: number; coversPosition: Position; gapCovered: number }` e função `buildFreeAgentScout({ freeAgents, freeAgentAttrs, squadOverallByPosition, wageBudgetRemaining })`. Algoritmo de `fitScore`: para a posição principal do free agent, calcular `gap = targetOverall - agentOverall` onde `targetOverall` é o overall médio do elenco na posição mais forte (baseline de qualidade desejada). `fitScore = 100 * Math.max(0, agentOverall - squadAvgForPosition) / 50`. Filtrar por `player.wage <= wageBudgetRemaining * 0.3` (não comprometer mais de 30% do orçamento restante).
- [ ] Criar `src/screens/reports/ReportsFreeAgentScoutScreen.tsx`: carrega free agents com atributos, carrega elenco do clube para mapear `squadOverallByPosition`, calcula `wageBudgetRemaining = club.wageBudget - sum(squad.wage)`. Implementar filtros locais (sem re-query) com `useState` para posição e faixas. Renderizar lista com `FlatList` para performance (lista pode ser longa).
- [ ] Registrar rota `ReportsFreeAgentScout: undefined` em `src/navigation/types.ts` e `src/navigation/RootNavigator.tsx`.
- [ ] Adicionar HubCard em `src/screens/reports/ReportsHubScreen.tsx`.

### Critérios de aceite
- Free agents lesionados (`injuryWeeksLeft > 0`) aparecem com badge "Lesionado" mas não são excluídos da lista
- Filtro de posição funciona com posição secundária: um ST com `secondaryPosition = LW` aparece em ambos os filtros
- `wageBudgetRemaining` é sempre >= 0 (não pode ser negativo)
- Lista vazia quando não há free agents disponíveis exibe mensagem encorajadora
- FlatList com 200+ itens não causa jank (testar com save de liga grande)

---

## Feature 8 — Índice de Moral do Elenco

**Size: S | Estimated effort: 2-3 h**

### Objetivo
Agregar o campo `morale` de todos os jogadores em um índice coletivo, identificar os de moral mais baixa e disparar alertas quando a média cai abaixo de 50.

### Dados envolvidos
- `players.morale` (INTEGER 1-100, já existe no schema linha 76)
- `players.name`, `players.position`, `players.overall`
- Nenhuma migration necessária

### Arquivos a criar/modificar

| Ação | Arquivo |
|---|---|
| CRIAR | `src/engine/reports/morale-report.ts` |
| MODIFICAR | `src/screens/reports/ReportsTechnicalScreen.tsx` (nova seção) |

### UI proposta
- Nova seção "💬 Moral do Elenco" no início de `ReportsTechnicalScreen.tsx`, antes do Resumo do Elenco
- Gauge circular simples (ou barra larga) com a média de moral do elenco: verde >= 70, amarelo 50-69, vermelho < 50
- "Top 3 Moral Alta" e "Top 3 Moral Baixa" — nome, posição, moral com bolinha colorida
- Alerta banner vermelho quando média < 50: "Atenção: moral coletiva crítica"

### Etapas de implementação

- [ ] Criar `src/engine/reports/morale-report.ts`: exportar interface `MoraleReport { avgMorale: number; topMorale: MoraleEntry[]; bottomMorale: MoraleEntry[]; alertLevel: 'ok'|'warning'|'critical' }` e `MoraleEntry { playerId: number; playerName: string; position: Position; morale: number }`. Função pura `buildMoraleReport(squad: SquadPlayer[]): MoraleReport`. Requer que `SquadPlayer` tenha campo `morale` — adicionar como campo opcional (mesma extensão feita em F3 para `contractEnd`).
- [ ] Em `src/screens/reports/ReportsTechnicalScreen.tsx`: adicionar `morale` ao mapeamento `fullPlayers -> SquadPlayer` (linha 45-56). Chamar `buildMoraleReport(squad)`, guardar em estado. Renderizar seção antes do `SquadSummarySection`. Implementar gauge como `View` com `backgroundColor` condicional e `width: ${avg}%` (barra horizontal simples, sem SVG extra).
- [ ] Nenhuma alteração de navegação necessária — tudo fica dentro da tela existente.

### Critérios de aceite
- Média calculada sobre todos os jogadores do clube (não apenas relacionados)
- Alert banner aparece apenas quando `avgMorale < 50`
- `bottomMorale` mostra corretamente os 3 com menor morale; em empate, ordena por posição alfabética
- Seção renderiza sem crash quando o elenco tem 0 jogadores

---

## Resumo de Arquivos por Feature

```
src/
├── components/
│   └── RadarChart.tsx                              NEW (F1)
├── engine/reports/
│   ├── technical-report.ts                         MODIFY (F3, F4, F8 — extend SquadPlayer, add forms to TechnicalReport)
│   ├── opponent-report.ts                          NEW (F2)
│   ├── contract-alerts.ts                          NEW (F3)
│   ├── line-efficiency.ts                          NEW (F4)
│   ├── transfer-roi-report.ts                      NEW (F5)
│   ├── classification-projection.ts                NEW (F6)
│   ├── free-agent-scout.ts                         NEW (F7)
│   └── morale-report.ts                            NEW (F8)
├── database/queries/
│   ├── fixtures.ts                                 MODIFY (F2 — add getNextFixtureForClub)
│   ├── transfers.ts                                MODIFY (F5 — add getTransfersByClub)
│   └── players.ts                                  MODIFY (F7 — add getFreeAgentsWithAttributes)
├── screens/reports/
│   ├── ReportsHubScreen.tsx                        MODIFY (all — new cards + badge)
│   ├── ReportsTechnicalScreen.tsx                  MODIFY (F3, F4, F8 — new sections)
│   ├── ReportsRadarScreen.tsx                      NEW (F1)
│   ├── ReportsOpponentScreen.tsx                   NEW (F2)
│   ├── ReportsTransferROIScreen.tsx                NEW (F5)
│   ├── ReportsProjectionScreen.tsx                 NEW (F6)
│   └── ReportsFreeAgentScoutScreen.tsx             NEW (F7)
└── navigation/
    ├── types.ts                                    MODIFY (F1, F2, F5, F6, F7 — new routes)
    └── RootNavigator.tsx                           MODIFY (F1, F2, F5, F6, F7 — register screens)
```

**Total: 8 engine modules (7 new + 1 modified), 5 new screens, 3 query file changes, 2 navigation files, 1 new component.**

---

## Estimativas de Esforço Consolidadas

| Feature | Tamanho | Horas |
|---|---|---|
| F8 — Moral do Elenco | S | 2-3 h |
| F3 — Alerta de Contratos | S | 2-3 h |
| F4 — Eficiência por Linha | S | 3-4 h |
| F1 — Radar Comparativo | M | 5-7 h |
| F2 — Relatório Pré-Jogo | M | 6-8 h |
| F5 — ROI de Transferências | M | 5-6 h |
| F6 — Projeção de Classificação | M | 6-7 h |
| F7 — Scouting de Free Agents | L | 8-10 h |
| **Total** | | **37-48 h** |
