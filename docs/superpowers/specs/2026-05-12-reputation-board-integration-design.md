# Design: Reputação do Clube — Integração Board State

**Data:** 2026-05-12
**Status:** Aprovado
**Escopo:** football-manager v0.1

---

## Contexto

A engine de reputação (1-100), objetivos da diretoria por templates e confiança da diretoria já existem e funcionam corretamente:

- `src/engine/board/reputation-engine.ts` — `computeReputationDelta()`
- `src/engine/board/objective-generator.ts` — `generateObjective()` (templates por faixa)
- `src/engine/board/trust-engine.ts` — `computeTrustDelta()` com outcome + consequence
- DB: tabelas `club_reputation_history`, `board_objectives`, `board_trust_history`, campo `save_games.board_trust`
- `src/screens/EndOfSeasonScreen.tsx` — pipeline completo no fim de temporada
- `src/screens/club/BoardScreen.tsx` — tela com reputação, confiança, objetivo, histórico
- `src/screens/home/HomeScreen.tsx` — widget com objetivo + barra de confiança (5 pips)

## Gaps Identificados

### Gap 1 — Board store vazia ao resumir um save

`loadSave()` em `game-store.ts` chama `useBoardStore.getState().reset()`, mas não recarrega dados do banco. Ao retomar um save existente, `currentObjective` fica `null` e `currentTrust` volta para 50 (default), mesmo que o banco tenha dados persistidos.

### Gap 2 — Sem objetivo para a temporada 1

`NewGameScreen.handleStartGame` cria o save e os assistentes, mas não gera nem persiste objetivo para a 1ª temporada. O player começa o jogo sem objetivo visível.

### Não-escopo

- Consequência "fired" permanece visual apenas (texto no `EndOfSeasonScreen`). Efeito de jogo real é pós-v0.1.
- Reputação não precisa aparecer na HomeScreen — a tela Board (acessível via tap) é suficiente.

---

## Design

### Decisões de produto confirmadas

| Questão | Decisão |
|---|---|
| Reputação na HomeScreen? | Não — só na tela Board (tap) |
| "Fired" tem efeito? | Não em v0.1 — texto visual já existe |

### Abordagem escolhida: A — `useEffect` no HomeScreen

Dois pontos de integração, sem mudança na engine ou no schema.

---

### Fix 1: Objetivo inicial (temporada 1)

**Arquivo:** `src/screens/NewGameScreen.tsx`, função `handleStartGame`

Logo após `createSave()` e `startNewGame()`:

```typescript
const boardRng = new SeededRng(saveId * 999);
const totalTeams = 16; // padrão — standings não existem na T1
const objective = generateObjective({
  clubReputation: selectedClub.reputation,
  currentLeaguePosition: null,
  totalTeams,
  divisionLevel: 1,
  wasRelegated: false,
  wasPromoted: false,
  rng: boardRng,
});
await upsertBoardObjective(dbHandle, {
  clubId: selectedClub.id,
  season: 1,
  type: objective.type,
  target: objective.target,
  description: objective.description,
});
setCurrentObjective({ id: 0, clubId: selectedClub.id, season: 1, ...objective });
// currentTrust = 50 (default do store e do save_games.board_trust)
```

**Imports a adicionar:**
- `generateObjective` de `@/engine/board/objective-generator`
- `upsertBoardObjective` de `@/database/queries/board`
- `setCurrentObjective` de `useBoardStore()`

---

### Fix 2: Carregar board ao resumir save

**Arquivo:** `src/screens/home/HomeScreen.tsx`

Novo `useEffect` após os existentes:

```typescript
useEffect(() => {
  if (!dbHandle || !currentSave || !playerClubId || currentObjective !== null) return;
  (async () => {
    const [obj, trust, history] = await Promise.all([
      getBoardObjective(dbHandle, playerClubId, season),
      getSaveBoardTrust(dbHandle, currentSave.id),
      getReputationHistory(dbHandle, playerClubId),
    ]);
    if (obj) setCurrentObjective(obj);
    setCurrentTrust(trust);
    setReputationHistory(history);
  })();
}, [dbHandle, currentSave, playerClubId, season, currentObjective]);
```

**Lógica da guarda:** `currentObjective !== null` garante que o efeito só roda quando a store está vazia (reset por `loadSave`). Novo jogo popula a store antes de navegar → efeito não dispara.

**Imports a adicionar:**
- `getBoardObjective`, `getSaveBoardTrust`, `getReputationHistory` de `@/database/queries/board`
- `setCurrentObjective`, `setCurrentTrust`, `setReputationHistory` de `useBoardStore()`

---

## Testes

### `NewGameScreen` (integração)

- Após `handleStartGame`, `getBoardObjective(db, clubId, 1)` retorna objetivo não-nulo.
- O tipo do objetivo é consistente com a reputação do clube selecionado (clube rep ≤ 30 → `no_relegation` ou `top_half`).

### `HomeScreen` — efeito de carregamento (integração)

- Simular `loadSave()` (reseta store) → montar HomeScreen → verificar que após o `useEffect` a store tem `currentObjective` e `currentTrust` carregados do banco.

### Engines existentes (não mudar)

- `reputation-engine.test.ts`, `trust-engine.test.ts`, `objective-generator.test.ts` — já passam, não tocar.

---

## Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `src/screens/NewGameScreen.tsx` | Gerar + persistir objetivo para temporada 1 após `createSave` |
| `src/screens/home/HomeScreen.tsx` | Novo `useEffect` para carregar board do banco ao resumir save |
| `__tests__/screens/NewGameScreen.test.ts` | Teste: objetivo da T1 persistido no banco |
| `__tests__/screens/home/HomeScreen.board.test.ts` | Teste: board carregado ao resumir save |

**Não modificar:**
- Engine files (`reputation-engine.ts`, `trust-engine.ts`, `objective-generator.ts`)
- DB schema e queries
- `board-store.ts`
- `EndOfSeasonScreen.tsx`

---

## Spec self-review

- ✅ Sem TBDs ou seções incompletas
- ✅ Arquitetura consistente com feature description
- ✅ Escopo focado — 2 arquivos de produção, 2 de teste
- ✅ Sem ambiguidade: guarda `currentObjective !== null` está explicitamente justificada
