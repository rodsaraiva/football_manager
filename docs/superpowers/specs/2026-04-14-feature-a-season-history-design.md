# Feature A — Histórico de Temporadas + Troféus

**Data**: 2026-04-14
**Status**: Design aprovado, pronto para plano de implementação
**Escopo**: Primeiro dos três subsistemas aprovados (A → B → C) — B (Regen/aposentadoria) e C (Scouting com fog of war) são specs separadas, futuras.

---

## 1. Objetivo e escopo

Persistir o que aconteceu em cada temporada concluída e expor essa memória em um hub dedicado e em seções dos perfis de clube e jogador.

**Dentro do escopo**
- Por temporada concluída, para **toda competição de toda liga** do jogo: campeão, vice, rebaixados (só ligas), top 5 artilheiros, top 5 assistências, MVP, Revelação (≤21 anos).
- Registro de elenco do clube campeão no momento do título (para títulos de carreira do jogador).
- Hub `HistoryScreen` + vitrine no perfil do clube + seção de carreira no `PlayerDetailScreen`.
- Testes unitários do archiver, testes de queries, um teste de integração no game-loop.

**Fora do escopo**
- Retroatividade: histórico começa em branco. Temporadas concluídas **antes** do merge desta feature não são reconstruídas.
- Nenhuma mudança no engine de simulação, táticas, transferências, finanças ou staff.
- Nenhum troféu ou premiação calculado em tempo real durante a temporada (só no fim).
- Decoração/UI rica da vitrine (ícones customizados etc.) — ficam para iteração posterior; a feature entrega dados e telas funcionais.

**Observação honesta sobre ligas estrangeiras**: hoje o jogo resolve competições que o jogador não disputa via IA simplificada por reputação. O histórico refletirá fielmente isso — campeões estrangeiros podem ser pouco variados até a "IA do meta-mundo" melhorar. Não é bug desta feature.

---

## 2. Arquitetura

Feature passiva. Um único ponto de escrita no fim de temporada; vários pontos de leitura.

```
Fim da temporada (hook existente no game-loop / EndOfSeasonScreen)
   └─> src/engine/history/season-archiver.ts  (novo)
          ├─ lê: fixtures + match_events + player_stats + clubs + players da temporada atual
          ├─ calcula: campeão, vice, rebaixados, top scorers, top assisters, MVP, Revelação
          │           por cada competição concluída de cada liga
          └─ grava (uma transação):
                  season_competition_results
                  season_relegated
                  season_awards
                  season_player_titles
```

Leitura via `src/database/queries/history.ts`. UI em `src/screens/history/` + seções novas em telas existentes.

**Idempotência**: o archiver deve ser seguro para rodar mais de uma vez na mesma temporada (rerun após crash, etc.). Garantido por `UNIQUE` constraints — inserts conflitantes são silenciosamente ignorados via `INSERT OR IGNORE`.

---

## 3. Schema

Quatro tabelas novas. Padrão snake_case, FKs explícitas, campo `season` em todas para consultas diretas.

```sql
CREATE TABLE season_competition_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  champion_club_id INTEGER NOT NULL REFERENCES clubs(id),
  runner_up_club_id INTEGER REFERENCES clubs(id),
  UNIQUE(season, competition_id)
);

CREATE TABLE season_relegated (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  final_position INTEGER NOT NULL,
  UNIQUE(season, league_id, club_id)
);

CREATE TABLE season_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  award_type TEXT NOT NULL CHECK(award_type IN
    ('top_scorer','top_assister','mvp','breakthrough')),
  rank INTEGER NOT NULL DEFAULT 1,
  player_id INTEGER NOT NULL REFERENCES players(id),
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  value REAL NOT NULL,
  UNIQUE(season, competition_id, award_type, rank)
);

CREATE TABLE season_player_titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season INTEGER NOT NULL,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  club_id INTEGER NOT NULL REFERENCES clubs(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  UNIQUE(season, competition_id, player_id)
);

CREATE INDEX idx_awards_player       ON season_awards(player_id);
CREATE INDEX idx_awards_season_comp  ON season_awards(season, competition_id);
CREATE INDEX idx_results_season      ON season_competition_results(season);
CREATE INDEX idx_relegated_season    ON season_relegated(season);
CREATE INDEX idx_player_titles_player ON season_player_titles(player_id);
```

Notas:
- `runner_up_club_id` nullable: copas/continentais em formatos irregulares podem não ter vice bem definido.
- `club_id` em `season_awards` é snapshot do clube do jogador na data do arquivamento. Necessário porque jogador pode mudar de clube depois.
- `rank` em `season_awards`: 1..5 para `top_scorer`/`top_assister`; sempre 1 para `mvp` e `breakthrough`.
- `value` semântica por tipo: gols (`top_scorer`), assistências (`top_assister`), rating médio na competição (`mvp`, `breakthrough`).
- `season_player_titles`: grava o elenco efetivo do campeão no momento do arquivamento. Crítico para `getPlayerTitles` devolver resultados corretos mesmo após o jogador sair do clube.

---

## 4. Lógica do archiver

**Arquivo**: `src/engine/history/season-archiver.ts`
**Assinatura** (preliminar): `archiveSeason(db, season): void`
**Trigger**: chamada do game-loop quando a temporada acaba, no mesmo ponto em que `EndOfSeasonScreen` é preparada hoje. Roda antes do incremento de `current_season`.

Para cada competição com fixtures `season = S` todas concluídas:

### Títulos / vice / rebaixados

- **`league` (round-robin)**: ordenar clubes por `pontos DESC, GD DESC, GP DESC, H2H`. Top 1 = campeão. Top 2 = vice. Últimos `leagues.relegation_spots` = rebaixados (grava cada um em `season_relegated` com `final_position`).
- **`cup` (knockout)**: vencedor da final = campeão; perdedor da final = vice. Nenhum rebaixado.
- **`continental`**: se tem fase eliminatória, regra da copa. Se só fase de grupos até aqui, campeão = primeiro colocado da última fase disputada; `runner_up_club_id = NULL`.

### Top 5 artilheiros (`award_type='top_scorer'`)

```
SELECT me.player_id, p.club_id, COUNT(*) AS goals
FROM match_events me
JOIN fixtures f ON f.id = me.fixture_id
JOIN players p ON p.id = me.player_id
WHERE f.competition_id = ? AND f.season = ? AND me.type = 'goal'
GROUP BY me.player_id
ORDER BY goals DESC, me.player_id ASC  -- tiebreak determinístico por id
LIMIT 5
```

Grava 1 linha por rank (1..5). `value = goals`. Se houver <5 jogadores com gol, grava só os que existirem. Tiebreak por `player_id` é consciente: determinístico e testável. "Menos minutos jogados" seria mais justo esportivamente, mas exige agregar minutos (função de substituições e cartões vermelhos) — fica para iteração futura se virar demanda.

### Top 5 assistências (`award_type='top_assister'`)

Mesma agregação, filtrando `me.secondary_player_id IS NOT NULL` e agrupando por `me.secondary_player_id`. `value = assists`.

### MVP (`award_type='mvp'`)

Critério: maior **rating médio** de jogo do jogador **naquela competição, naquela temporada**, com mínimo de **50% das partidas possíveis na competição**. Um registro, `rank=1`.

Para ligas: 50% de `(num_clubes - 1) * 2`. Para copa/continental: 50% das partidas que o clube do jogador disputou na competição.

**Pré-validação**: `player_stats` deve expor rating por fixture (ou agregado por competição). Se a tabela não tem esse dado hoje, o plano de implementação cobre adicionar. Sinalizado abaixo em "Riscos e pontos a validar".

### Revelação (`award_type='breakthrough'`)

Mesmo critério do MVP, restrito a jogadores com `age <= 21` na data do arquivamento. Um registro, `rank=1`. Pode não haver registro se ninguém elegível atinge o mínimo — comportamento esperado, não erro.

### Elenco campeão (`season_player_titles`)

Após determinar o campeão de cada competição, gravar um registro por jogador atualmente no elenco daquele clube. Consulta: `SELECT id FROM players WHERE club_id = <champion>` no momento do arquivamento. Snapshot — jogadores que saírem depois ainda aparecerão como campeões daquela temporada.

### Transação e idempotência

Todo o `archiveSeason` roda em uma transação. Todos os `INSERT` usam `INSERT OR IGNORE` + `UNIQUE` para tolerar rerun.

---

## 5. Leituras (queries)

Arquivo: `src/database/queries/history.ts`.

| Função | Retorna |
|---|---|
| `getSeasonSummary(season)` | Todas as competições da temporada com campeão, vice, rebaixados, prêmios (agrupado por competição). |
| `getCompetitionHistory(competitionId)` | Lista cronológica `[{season, champion_club, runner_up_club}]`. |
| `getClubTrophies(clubId)` | Agregado `[{competition, titles: n, runner_ups: m, years: [...]}]`. |
| `getPlayerAwards(playerId)` | Todos os registros de `season_awards` do jogador, em ordem cronológica, com nome da competição. |
| `getPlayerTitles(playerId)` | Todos os registros de `season_player_titles` do jogador, com competição, clube e temporada. |

---

## 6. UI

### 6.1. Hub — `src/screens/history/HistoryScreen.tsx`

Lista de temporadas (mais recente no topo). Tocar uma temporada abre painel com: por competição, campeão + vice + top artilheiro + top assistente + MVP + Revelação. Também lista os rebaixados das ligas daquela temporada. Ponto de entrada da navegação: card no MainMenu **ou** aba em Reports — decisão adiada para o plano de implementação (não impacta o design, só a navegação).

### 6.2. Vitrine do clube — seção nova em tela de perfil do clube

Alimentada por `getClubTrophies`. Layout: lista por competição com contagem e anos dos títulos. Exemplo visual:

```
Premier League     3 títulos — 2027, 2029, 2030   1 vice — 2028
FA Cup             1 título — 2028
Champions League   —
```

A tela-alvo exata deve ser identificada no plano (hoje há telas em `src/screens/club/` e `src/screens/reports/` — decidir onde encaixa sem inflar uma tela existente).

### 6.3. Carreira do jogador — seção nova em `PlayerDetailScreen`

Dois blocos:

- **Títulos**: via `getPlayerTitles`. Lista por competição com contagem e anos.
- **Prêmios individuais**: via `getPlayerAwards`. Ordem cronológica, agrupando por tipo. Exemplo: "Artilheiro da Premier League 2027 (24 gols), 2029 (21 gols)" / "MVP da Copa 2028".

---

## 7. Testes

### Unit — `__tests__/engine/history/season-archiver.test.ts`

- Liga completa: campeão/vice por pontos; tiebreak por saldo de gols; tiebreak por H2H.
- Rebaixamento respeita `leagues.relegation_spots`.
- Copa: vencedor da final = campeão, perdedor = vice, sem rebaixados.
- Continental sem fase eliminatória disputada: `runner_up_club_id IS NULL`.
- Top 5 scorers: ordem, tiebreak por minutos, limite de 5, menos de 5 quando há pouca gente.
- Top 5 assisters: conta `secondary_player_id` em eventos `goal`.
- MVP: respeita mínimo de 50% dos jogos; não grava quando ninguém é elegível.
- Revelação: filtra por `age <= 21` no momento do arquivamento.
- `season_player_titles`: uma linha por jogador do elenco do campeão.
- **Idempotência**: rodar o archiver duas vezes na mesma temporada não duplica.

### Queries — `__tests__/database/queries/history.test.ts`

- `getSeasonSummary` monta estrutura agregada correta a partir de dados semeados.
- `getClubTrophies` conta títulos/vices por competição.
- `getPlayerAwards` devolve ordem cronológica correta.
- `getPlayerTitles` só conta temporadas em que o jogador estava no clube campeão.
- `getCompetitionHistory` lista campeões em ordem cronológica.

### Integração — novo caso em `__tests__/engine/game-loop.test.ts`

- Simular uma temporada completa → avançar ao hook de fim de temporada → verificar que o histórico foi gravado. Garante que o hook real aciona o archiver (não só chamadas diretas em unit).

**Sem testes de UI** (segue padrão do projeto).

---

## 8. Riscos e pontos a validar no plano

1. **`player_stats` expõe rating por fixture ou agregado por competição?** MVP/Revelação dependem disso. Plano deve iniciar validando; se não, estender `player_stats` (ou calcular on-demand a partir de `match_events` + `player_ratings` se existir) é pré-requisito.
2. **Identificação do hook exato de fim de temporada**: `EndOfSeasonScreen` é UI; o gatilho real está no game-loop / `calendar.ts`. Plano precisa localizar o ponto antes do incremento de `current_season`.
3. **Tela-alvo da vitrine do clube**: identificar a tela de perfil do clube existente (ou decidir se é criada uma). Não afeta o design, mas precisa ser resolvido no plano.
4. **Volume**: nenhum. Estimativa: ~20 competições × ~10 linhas/competição/temporada × 100 temporadas = 20k linhas. Desprezível para SQLite.

---

## 9. Fora do escopo (reafirmado)

- Retroatividade para saves existentes.
- Histórico de vínculo do jogador entre clubes (só snapshot no momento do título).
- Troféus individuais "de carreira" estilo Ballon d'Or calculados sobre múltiplas temporadas.
- Mudanças no engine, em táticas, em finanças, ou em transferências.
- Features B (Regen/aposentadoria) e C (Scouting com fog of war) — specs separados.
