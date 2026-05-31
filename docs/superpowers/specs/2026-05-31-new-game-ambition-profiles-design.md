# Design: Perfis de Ambição no New Game

**Data:** 2026-05-31
**Status:** Aprovado
**Escopo:** football-manager v0.1

---

## Contexto

O `NewGameScreen` (`src/screens/NewGameScreen.tsx`) hoje conduz o jogador por três passos:
`league` (acordeão país → liga) → `team` (clubes da liga) → `confirm` (clube + dificuldade → START GAME).

O `PRODUCT.md` (v0.1) prevê um **perfil de ambição** como guia efêmero do onboarding, hoje **inexistente**:

> 1. Perfil de ambição (guia efêmero) — filtra sugestões de clube: Continental / Nacional / Acesso.
> 2. Escolha do clube dentre 3-5 sugestões do perfil.
> O perfil de ambição é **descartado** após a escolha do clube — não persiste no save. A partir daí, quem guia o jogo é a **reputação do clube**.

## Dados de referência (seed real)

- 5 países: EN (5 divisões), ES/IT/DE/FR (3 divisões cada). 330 clubes.
- Reputação por divisão: **div 1** rep 42–95 (mediana 62); **div 2** 18–45; **div 3+** ≤ 30.
- Todos os 5 países têm pelo menos um clube de elite (rep ≥ 88).

## Não-escopo

- **Onboarding/tooltips contextuais** (PRODUCT.md) — fase posterior; aqui só os perfis de ambição.
- **i18n**: os labels já nascem com pt-BR + EN no config dos perfis, mas a infra de tradução geral é outra entrega.
- Nenhuma mudança em schema, save ou engine de jogo — o perfil não persiste.

---

## Design

### Decisões de produto confirmadas

- **Fluxo híbrido**: o perfil é o caminho principal e destacado; um link discreto **"Explorar todas as ligas"** preserva a navegação manual atual (país → liga → clube).
- **Perfil → país → sugestões**: o jogador escolhe o perfil, depois o país, e vê **até 5 clubes** daquele perfil no país.
- O perfil vive em **estado local** do componente e é **descartado** ao confirmar.

### Critérios dos perfis

| Perfil | Regra (dentro do país escolhido) |
|--------|----------------------------------|
| **Continental** | `divisionLevel === 1` **e** `reputation >= 78` |
| **Nacional** | `divisionLevel === 1` **e** `reputation < 78` |
| **Acesso** | `divisionLevel >= 2` |

Em todos: ordenar por `reputation` desc, retornar **no máximo 5**. Se a lista for vazia para um (perfil, país), a tela de sugestões mostra um **empty state** ("Nenhum clube neste perfil") com botão de voltar — evita pré-carregar todos os clubes só para desabilitar países (na prática os 5 países têm os 3 perfis).

### Arquitetura

**1. Função pura + config dos perfis** — `src/engine/newgame/ambition.ts` (engine: sem React, testável isoladamente)

```ts
export type AmbitionProfileId = 'continental' | 'nacional' | 'acesso';

export interface AmbitionProfile {
  id: AmbitionProfileId;
  labelPt: string;
  labelEn: string;
  descriptionPt: string;
  matches: (club: ClubForAmbition) => boolean;
}

export interface ClubForAmbition {
  id: number;
  reputation: number;
  divisionLevel: number;
}

export const AMBITION_PROFILES: AmbitionProfile[];      // ordem: continental, nacional, acesso
export const MAX_SUGGESTIONS = 5;

// Filtra pelo perfil, ordena por reputação desc, corta em MAX_SUGGESTIONS.
// Recebe clubes JÁ de um único país. Preserva o objeto original na saída.
export function suggestClubsForProfile<T extends ClubForAmbition>(
  profileId: AmbitionProfileId,
  clubs: T[],
): T[];
```

**2. Query** — `getClubsByCountry(db, countryId): Promise<Array<Club & { divisionLevel: number }>>` em `src/database/queries/clubs.ts`

```sql
SELECT clubs.*, leagues.division_level AS divisionLevel
FROM clubs JOIN leagues ON clubs.league_id = leagues.id
WHERE leagues.country_id = ?
```
O `Club` atual (de `SELECT *`) não carrega a divisão; o join a anexa. `rowToClub` é reutilizado e a divisão é mesclada no mapeamento.

**3. `NewGameScreen`** — novos steps no `type Step`:
`'ambition' | 'country' | 'suggestions' | 'league' | 'team' | 'confirm'`. Step inicial passa a ser `'ambition'`.

- **`ambition`**: 3 cards (perfil) usando `labelPt`/`descriptionPt` + link "Explorar todas as ligas".
  - Card → guarda `selectedProfile` em estado, vai para `country`.
  - Link → vai para `league` (fluxo manual atual, intacto).
- **`country`**: lista os 5 países (reaproveita `countries` já carregado e os flags `COUNTRY_FLAGS`). Seleção → `getClubsByCountry(countryId)`, aplica `suggestClubsForProfile(selectedProfile, ...)`, vai para `suggestions`.
- **`suggestions`**: renderiza os clubes sugeridos reusando o `clubCard` existente (nome, barra de reputação, estádio). Se vazio, empty state com "← Back". Seleção → `confirm`.
- **`league` / `team` / `confirm`**: inalterados. O `confirm` e o `handleStartGame` não mudam — `selectedClub`/`selectedLeague` continuam alimentando a criação do save.

Observação: no caminho por perfil, `selectedLeague` pode ficar nulo; `handleStartGame` já trata isso com defaults (`selectedLeague?.numTeams ?? 16`, `divisionLevel ?? 1`). Para o objetivo da temporada 1 ficar correto, derivar `numTeams`/`divisionLevel` do clube escolhido (via a divisão anexada) quando `selectedLeague` for nulo.

### Navegação "back"

Cada novo step tem botão "← Back" para o anterior do seu caminho: `country`→`ambition`, `suggestions`→`country`. O caminho manual mantém os backs atuais.

---

## Testes

**TDD na função pura** (`__tests__/engine/newgame/ambition.test.ts`, SQLite não necessário — entrada é array):

1. Continental retorna apenas div1 com rep ≥ 78, ordenado desc, no máx 5.
2. Nacional retorna div1 com rep < 78 e exclui a elite continental.
3. Acesso retorna apenas clubes de divisão ≥ 2.
4. (perfil, país) sem clubes elegíveis → array vazio.
5. Ordenação por reputação desc é respeitada; corte em `MAX_SUGGESTIONS` (entrada com > 5 elegíveis).
6. O objeto original do clube é preservado na saída (não recria).

**Query** (`__tests__/database/queries/clubs.test.ts`, SQLite real em memória): `getClubsByCountry` retorna clubes do país com `divisionLevel` correto, de múltiplas divisões.

**UI**: validar no browser (Playwright MCP) o fluxo perfil → país → sugestões → confirm, o estado desabilitado, e o link "Explorar todas as ligas" caindo no fluxo manual.

---

## Sequência de build

1. `ambition.ts` (config + função pura) + testes → verde.
2. `getClubsByCountry` + teste → verde.
3. `NewGameScreen`: novos steps e navegação.
4. Validação no browser + `tsc` + suíte completa.
