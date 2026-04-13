# Football Manager Mobile — Design Spec

## Visão Geral

Jogo mobile de gestão de futebol estilo Football Manager / FIFA Carreira / Brasfoot. Modo carreira completo com gestão tática, financeira, de infraestrutura e staff. Futebol internacional com 5 ligas europeias + Champions League. 100% offline, publicação nas lojas (App Store / Google Play).

**Stack:** React Native + Expo + SQLite + Zustand + TypeScript

---

## 1. Arquitetura Geral

```
football-manager/
├── src/
│   ├── database/          # Schema SQLite, migrations, queries
│   │   ├── schema.ts      # Definição das tabelas
│   │   ├── migrations/    # Versionamento do banco
│   │   └── queries/       # Queries organizadas por domínio
│   ├── engine/            # Motor do jogo (TypeScript puro, sem React)
│   │   ├── simulation/    # Simulação de partidas
│   │   ├── transfer/      # Mercado de transferências (IA dos clubes)
│   │   ├── finance/       # Cálculos financeiros
│   │   ├── training/      # Treino e evolução de jogadores
│   │   ├── competition/   # Calendário, rodadas, mata-mata
│   │   └── staff/         # Lógica de staff e infraestrutura
│   ├── data/              # Dados iniciais das ligas (JSON seed)
│   │   ├── leagues/       # Ligas e times
│   │   ├── players/       # Jogadores com atributos
│   │   └── templates/     # Templates de competições
│   ├── store/             # Zustand stores
│   ├── screens/           # Telas do app
│   ├── components/        # Componentes reutilizáveis
│   ├── navigation/        # React Navigation config
│   ├── hooks/             # Custom hooks
│   ├── theme/             # Cores, tipografia, espaçamentos
│   ├── types/             # TypeScript types globais
│   └── utils/             # Utilitários
├── assets/                # Ícones, escudos, fontes
```

**Princípio chave:** O `engine/` é 100% TypeScript puro — sem imports de React ou React Native. Toda a lógica do jogo pode ser testada com Jest unitário, sem mocks de plataforma.

**Fluxo de dados:**
```
SQLite ←→ Engine (lógica pura) ←→ Zustand Store ←→ React Screens
```

---

## 2. Modelo de Dados (Schema SQLite)

### Núcleo
- **save_games:** id, name, current_season, current_week, player_club_id (FK → clubs), difficulty, created_at, updated_at

### Estrutura Competitiva
- **countries:** id, name, code (EN, ES, DE...), continent
- **leagues:** id, name, country_id (FK), division_level, num_teams, promotion_spots, relegation_spots
- **competitions:** id, name, type (league|cup|continental), format (round_robin|knockout|group_knockout), season, league_id (FK nullable)
- **competition_entries:** competition_id (FK), club_id (FK), group_name (nullable), seed

### Clubes e Jogadores
- **clubs:** id, name, short_name, country_id (FK), league_id (FK), reputation (1-100), budget, wage_budget, stadium_name, stadium_capacity, training_facilities (1-5), youth_academy (1-5), primary_color, secondary_color
- **players:** id, name, nationality, age, position, secondary_position (nullable), club_id (FK), wage, contract_end, market_value, base_potential (1-100), effective_potential (1-100), morale, fitness, injury_status, is_free_agent (bool)
- **player_attributes:** player_id (FK), finishing, passing, crossing, dribbling, heading, long_shots, free_kicks (técnicos), vision, composure, decisions, positioning, aggression, leadership (mentais), pace, stamina, strength, agility, jumping (físicos). Todos int 1-99
- **player_stats:** player_id (FK), season, competition_id, appearances, goals, assists, yellow_cards, red_cards, avg_rating, minutes_played

### Staff e Finanças
- **staff:** id, name, role (scout|physio|assistant|youth_coach|fitness_coach), club_id (FK), ability (1-20), wage, contract_end
- **club_finances:** club_id (FK), season, week, type (ticket|tv|sponsor|transfer_in|transfer_out|wages|maintenance|bonus), amount, description

### Partidas e Calendário
- **fixtures:** id, competition_id (FK), season, week, round (nullable), home_club_id (FK), away_club_id (FK), home_goals, away_goals, played (bool), attendance
- **match_events:** fixture_id (FK), minute, type (goal|assist|yellow|red|substitution|injury|penalty_scored|penalty_missed), player_id (FK), secondary_player_id (FK nullable)

### Transferências
- **transfers:** id, player_id (FK), season, from_club_id (FK), to_club_id (FK), fee, wage_offered, type (transfer|loan|free|release), loan_end (nullable)
- **transfer_offers:** id, player_id (FK), offering_club_id (FK), selling_club_id (FK), fee_offered, wage_offered, status (pending|accepted|rejected|countered), response_week

### Táticas
- **tactics:** id, club_id (FK), name, is_active (bool), formation (e.g. "4-3-3"), mentality (defensive|balanced|attacking), pressing (low|medium|high), passing_style (short|mixed|direct), tempo (slow|normal|fast), width (narrow|normal|wide)
- **tactic_positions:** tactic_id (FK), slot (1-11), player_id (FK), position_role, instructions (JSON)

---

## 3. Engine de Simulação de Partidas

**Modo:** Resultado direto com resumo (sem simulação em tempo real).

**Fluxo:**
```
Fixture (2 clubs) → Carregar táticas + escalações
    → Calcular força dos times (atributos ponderados por posição)
    → Gerar eventos minuto a minuto (internamente)
    → Aplicar modificadores (moral, fitness, casa/fora, tática)
    → Retornar: resultado final + lista de match_events
```

**Cálculo de força:**
- Cada posição tem pesos diferentes nos atributos. Ex: atacante pesa mais finishing, positioning, pace. Zagueiro pesa mais strength, heading, aggression
- Tática influencia: pressing alto gasta mais stamina, posse curta beneficia times com bom passing
- Modificadores: jogar em casa (+5-10%), moral do elenco, fitness médio, qualidade do staff

**Geração de eventos:**
- Engine itera virtualmente os 90 min em blocos (~5 min simulados)
- Em cada bloco calcula probabilidades de: gol, cartão, lesão, substituição da IA
- Distribuição ponderada: times mais fortes têm mais chances, mas azarões podem ganhar
- Gols atribuídos a jogadores específicos baseado nos atributos
- **Substituições:** apenas no segundo tempo (min 46+) ou por lesão grave

**Resultado entregue:**
- Placar final
- Lista de eventos (min, tipo, jogador)
- Estatísticas: posse, chutes, faltas, escanteios
- Rating individual (1-10)
- Mudanças de fitness e possíveis lesões

---

## 4. Sistema de Transferências

**Janelas:**
- Principal (pré-temporada): ~8 semanas
- Inverno (meio da temporada): ~4 semanas
- Fora de janela: só free agents

**IA dos clubes:**
- Clubes fazem transferências entre si automaticamente a cada semana durante janelas
- Decisões baseadas em: orçamento, posições carentes, reputação vs qualidade
- Clubes grandes buscam jogadores de alta qualidade; menores buscam empréstimos e barganhas
- IA pode fazer propostas pelos seus jogadores

**Negociação (quando você compra):**
1. Você faz oferta (valor + salário)
2. Clube vendedor avalia: titular? Tem substituto? Oferta cobre o valor?
3. Resposta: aceita, rejeita, ou contraproposta
4. Se clube aceita, jogador avalia: salário, reputação do clube, chance de ser titular
5. Jogador aceita ou rejeita

**Valor de mercado:**
- Calculado dinamicamente: idade, atributos, potencial, contrato restante, performance
- Jovens com potencial alto valem mais
- Último ano de contrato reduz valor

---

## 5. Sistema Financeiro

**Receitas (automáticas):**
- Bilheteria: capacidade × ocupação (varia com reputação e fase do campeonato)
- TV: valor fixo por liga + bônus por posição final
- Patrocínios: renovam por temporada, valor proporcional à reputação
- Premiação: classificação na liga, avanço em copas, título Champions
- Vendas de jogadores

**Despesas:**
- Folha salarial (jogadores + staff): debitada semanalmente
- Transferências: pago na hora
- Manutenção: custo fixo semanal (estádio + instalações)
- Upgrades: investimentos pontuais

**Regras:**
- Saldo negativo prolongado: diretoria intervém (corte de orçamento, pressão pra vender)
- Orçamento de transferências separado da folha salarial
- Fim da temporada: relatório financeiro completo

**Upgrades de infraestrutura:**

| Recurso | Níveis | Efeito |
|---------|--------|--------|
| Estádio | 5k → 10k → 20k → 40k → 60k | Mais bilheteria |
| Centro de treino | 1-5 | Evolução mais rápida |
| Academia de base | 1-5 | Jovens melhores |
| Dept. médico | 1-5 | Recuperação mais rápida |

Cada upgrade tem custo e leva semanas pra concluir.

---

## 6. Progressão e Treino de Jogadores

**Princípio central:** Evolução é dirigida por minutos jogados + performance. Treino é complemento.

**Fórmula de evolução semanal:**
```
evolução = base_por_idade × fator_minutos × fator_performance × fator_treino × fator_potencial
```

**Base por idade:**

| Faixa | Base | Exigência de minutos |
|-------|------|----------------------|
| 16-20 | +0.4 a +0.8 | Baixa — evolui mesmo jogando pouco, muito mais rápido se joga |
| 21-24 | +0.2 a +0.5 | Média — precisa jogar regularmente |
| 25-27 | +0.1 a +0.2 | Alta — só evolui se titular frequente com bom desempenho |
| 28-30 | 0 a +0.1 | Muito alta — estabilidade, evolução rara |
| 31-35 | -0.1 a -0.3 | Declínio padrão, pode ser freado ou revertido (raro) |

**Fator de minutos jogados (últimas 4-6 semanas):**

| % de minutos possíveis | Multiplicador |
|------------------------|---------------|
| 80-100% (titular indiscutível) | 1.5x |
| 50-79% (rotação regular) | 1.0x |
| 20-49% (reserva com chances) | 0.5x |
| 0-19% (sem oportunidades) | 0.1x (jovens) / 0.0x (25+) |

**Fator de performance (rating médio recente):**

| Rating médio | Multiplicador |
|-------------|---------------|
| 7.5+ (destaque) | 1.4x |
| 6.5-7.4 (bom) | 1.0x |
| 5.5-6.4 (mediano) | 0.6x |
| < 5.5 (ruim) | 0.3x |

**Declínio (31-35):**
- Base: -0.1 a -0.3/semana nos físicos
- Jogando 80%+ minutos E rating 7.0+: declínio freado (50-80% menor)
- Performance excepcional + potencial não atingido: micro-evolução rara (+0.05) em mentais/técnicos
- Veterano no banco: declínio acelerado

**Potencial dinâmico:**
- `base_potential`: definido na criação, nunca muda
- `effective_potential`: recalculado no fim de cada temporada (últimas 3)

| Situação | Ajuste |
|----------|--------|
| Performance consistentemente acima do esperado (rating 7.5+ sendo overall 65) | +2 a +5/temporada |
| Performance dentro do esperado | Sem mudança |
| Performance abaixo por 2+ temporadas | -2 a -4/temporada |
| Performance muito abaixo por 3 temporadas | -5 a -8 |

- Pode subir até +15 acima do base (joia escondida)
- Pode cair até -20 abaixo do base (eterna promessa — declínio mais fácil que ascensão)
- Mínimo: nunca cai abaixo do overall atual
- Jogador com <30% minutos na temporada: potencial congela
- Visibilidade: scout mostra estimativa com margem de erro baseada na habilidade dele

**Treino (complemento):**
- Foco semanal: técnico, tático, físico ou balanceado
- Adiciona +10-30% sobre a evolução calculada
- CT alto e bom staff aumentam o bônus

**Academia de base:**
- Início de cada temporada: gera 2-5 jovens (16-18 anos)
- Qualidade baseada no nível da academia (1-5)
- Decisão: promover, emprestar ou dispensar

**Moral e fitness:**
- Moral sobe com vitórias, titularidade, bom salário. Cai com derrotas, banco, salário baixo
- Moral alta = bônus nos atributos. Moral baixa = penalidade
- Fitness cai por partida, recupera na semana. Fitness baixo = risco de lesão

---

## 7. Navegação e Telas

### Bottom Tabs (5)
1. **Partidas** — Hub principal
2. **Elenco** — Jogadores e mercado
3. **Tática** — Formação e treino
4. **Clube** — Finanças e infraestrutura
5. **Liga** — Classificação e competições

### Telas por tab

**Tab 1 — Partidas:**
- HomeScreen: próxima partida, botão "Avançar Semana", resultados recentes, feed de notícias
- MatchResultScreen: placar, eventos, estatísticas, ratings
- CalendarScreen: calendário completo da temporada

**Tab 2 — Elenco:**
- SquadListScreen: lista com filtros (posição, overall, idade)
- PlayerDetailScreen: atributos (radar chart), stats, contrato, moral, fitness
- TransferMarketScreen: busca, propostas, ofertas recebidas, empréstimos
- YouthAcademyScreen: jovens da base

**Tab 3 — Tática:**
- TacticsScreen: campo visual com formação, drag & drop
- TacticsSettingsScreen: mentalidade, pressing, estilo, instruções individuais
- TrainingScreen: foco semanal, progresso do elenco

**Tab 4 — Clube:**
- ClubOverviewScreen: resumo geral
- FinancesScreen: balanço, receitas x despesas, gráfico
- StaffScreen: contratar/demitir, habilidades, salários
- UpgradesScreen: melhorias de infraestrutura

**Tab 5 — Liga:**
- StandingsScreen: classificação, alternar competições
- TopScorersScreen: artilheiros, assistências, melhores ratings
- CupBracketScreen: chaveamento de copas e Champions
- OtherClubScreen: info de qualquer clube

**Globais (fora das tabs):**
- MainMenuScreen: novo jogo, carregar, configurações
- NewGameScreen: escolher liga, time, dificuldade
- EndOfSeasonScreen: resumo, prêmios, promoção/rebaixamento, renovações, jovens

---

## 8. Dados Iniciais

**5 ligas:**

| Liga | País | Times | Jogadores |
|------|------|-------|-----------|
| Premier League | Inglaterra | 20 | ~500 |
| La Liga | Espanha | 20 | ~500 |
| Serie A | Itália | 20 | ~500 |
| Bundesliga | Alemanha | 18 | ~450 |
| Ligue 1 | França | 18 | ~450 |

**Total: ~96 times, ~2400 jogadores**

**Competições:** 5 ligas nacionais + 5 copas nacionais + Champions League (32 times, fase de grupos + mata-mata)

**Geração dos dados:**
- Times com nomes fictícios (evita licenciamento)
- Jogadores 100% fictícios gerados proceduralmente: nomes por nacionalidade, atributos baseados na reputação do clube
- Seed em JSON importado pro SQLite no primeiro boot
- Script gerador em TypeScript

**Balanceamento:**
- Top (rep 85-100): 3-4 jogadores 80+, elenco médio 72-78
- Médios (rep 60-84): 1-2 jogadores 75+, elenco médio 65-72
- Fracos (rep 40-59): elenco médio 58-66, jovens com potencial alto
- Distribuição realista por posição: 3 GK, 6-8 DEF, 6-8 MID, 3-5 FWD

---

## 9. Ciclo do Jogo

**Temporada:** ~46 semanas. Jogador avança uma semana por vez.

**Ciclo semanal (ao "Avançar Semana"):**
1. Treino aplicado (evolução/declínio)
2. Fitness recuperado (quem não jogou)
3. Lesões: tempo de recuperação -1 semana
4. Finanças: salários debitados, receitas creditadas
5. Transferências da IA processadas (se em janela)
6. Ofertas recebidas notificadas
7. Upgrades de infraestrutura: progresso +1 semana
8. Partidas da semana simuladas (todas as ligas/copas)
9. Notícias geradas
10. Tela de resultado da sua partida (se teve jogo)

**Fases da temporada:**

| Período | Semanas | Eventos |
|---------|---------|---------|
| Pré-temporada | 1-6 | Janela de transferências, sem jogos oficiais |
| Início | 7-12 | Liga começa, copa rodada 1 |
| Primeiro terço | 13-22 | Liga + copa + Champions grupos |
| Janela inverno | 23-26 | Transferências abertas |
| Segundo terço | 27-36 | Liga + Champions mata-mata |
| Reta final | 37-42 | Decisões, finais |
| Fim de temporada | 43-46 | Resumo, prêmios, renovações, base, novo orçamento |

---

## 10. Stack Técnico

**Core:** React Native 0.81+ / Expo SDK 54 / TypeScript 5.9+

**Dados e estado:** expo-sqlite / zustand

**Navegação:** @react-navigation/native + bottom-tabs + native-stack

**UI:** react-native-reanimated / react-native-svg / react-native-gesture-handler

**Testes:** jest + ts-jest (engine) / @testing-library/react-native (componentes)

Engine é TypeScript puro sem libs externas. Random com seed próprio pra reprodutibilidade.
