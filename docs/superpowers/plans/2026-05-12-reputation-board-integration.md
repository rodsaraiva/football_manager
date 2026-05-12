# Reputation Board Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os 2 gaps de integração do sistema de reputação/trust/objetivos: gerar objetivo inicial na temporada 1 (NewGameScreen) e carregar o estado do board do banco ao resumir um save (HomeScreen).

**Architecture:** Abordagem A — dois useEffect/lógica localizados. Nenhuma mudança na engine ou schema. (1) `NewGameScreen.handleStartGame` chama `generateObjective` + `upsertBoardObjective` + popula board-store após criar o save. (2) `HomeScreen` adiciona um `useEffect` que carrega `currentObjective`, `currentTrust` e `reputationHistory` do banco quando a store está vazia (guard: `currentObjective === null`).

**Tech Stack:** TypeScript, React Native/Expo, Zustand, expo-sqlite (runtime), better-sqlite3 (testes), Jest/ts-jest.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/screens/NewGameScreen.tsx` | Modificar | Gerar + persistir objetivo T1 após `createSave` |
| `src/screens/home/HomeScreen.tsx` | Modificar | `useEffect` que carrega board do banco quando store vazia |
| `__tests__/database/queries/board.test.ts` | Criar | Integração: queries de board + sequência "new game" |

---

## Task 1: Escrever testes de integração para queries de board

**Files:**
- Create: `__tests__/database/queries/board.test.ts`

Os testes cobrem o contrato das queries usadas pelos dois fixes. Usam `better-sqlite3` in-memory (padrão do projeto). Não testam React — testam a camada de persistência que os componentes vão chamar.

- [ ] **Step 1.1: Criar o arquivo de teste com estrutura e imports**

```typescript
// __tests__/database/queries/board.test.ts
import Database from 'better-sqlite3';
import { createTestDb, createTestDbHandle } from '../test-helpers';
import {
  upsertBoardObjective,
  getBoardObjective,
  getSaveBoardTrust,
  updateSaveBoardTrust,
  insertReputationHistory,
  getReputationHistory,
} from '@/database/queries/board';
import { generateObjective } from '@/engine/board/objective-generator';
import { SeededRng } from '@/engine/rng';
import { DbHandle } from '@/database/queries/players';

describe('board queries', () => {
  let rawDb: Database.Database;
  let db: DbHandle;
  let clubId: number;
  let saveId: number;

  beforeAll(() => {
    rawDb = createTestDb();
    db = createTestDbHandle(rawDb);

    // Insert a country, league and club — FK chain required
    rawDb.prepare(`INSERT INTO countries (id, name, code, continent) VALUES (1, 'England', 'EN', 'Europe')`).run();
    rawDb.prepare(`INSERT INTO leagues (id, name, country_id, division_level, num_teams, promotion_spots, relegation_spots) VALUES (1, 'Premier League', 1, 1, 20, 0, 3)`).run();
    rawDb.prepare(
      `INSERT INTO clubs (id, name, short_name, country_id, league_id, reputation, budget, wage_budget, stadium_name, stadium_capacity, training_facilities, youth_academy, medical_department, primary_color, secondary_color)
       VALUES (1, 'Test FC', 'TFC', 1, 1, 25, 1000000, 50000, 'Test Stadium', 20000, 3, 3, 3, '#fff', '#000')`
    ).run();
    const saveRes = rawDb.prepare(
      `INSERT INTO save_games (name, current_season, current_week, player_club_id, difficulty, board_trust, created_at, updated_at) VALUES ('Test Save', 1, 1, 1, 'normal', 50, '2026-01-01', '2026-01-01')`
    ).run();
    clubId = 1;
    saveId = saveRes.lastInsertRowid as number;
  });

  afterAll(() => {
    rawDb.close();
  });
```

- [ ] **Step 1.2: Adicionar testes para `upsertBoardObjective` e `getBoardObjective`**

Continuando dentro do `describe('board queries', ...)`:

```typescript
  describe('upsertBoardObjective + getBoardObjective', () => {
    it('persists and retrieves an objective for a season', async () => {
      await upsertBoardObjective(db, {
        clubId,
        season: 1,
        type: 'no_relegation',
        target: null,
        description: 'Avoid relegation this season',
      });

      const obj = await getBoardObjective(db, clubId, 1);

      expect(obj).not.toBeNull();
      expect(obj!.type).toBe('no_relegation');
      expect(obj!.description).toBe('Avoid relegation this season');
      expect(obj!.target).toBeNull();
      expect(obj!.clubId).toBe(clubId);
      expect(obj!.season).toBe(1);
    });

    it('returns null when no objective exists for a season', async () => {
      const obj = await getBoardObjective(db, clubId, 99);
      expect(obj).toBeNull();
    });

    it('upsert overwrites existing objective for same club+season', async () => {
      await upsertBoardObjective(db, {
        clubId,
        season: 2,
        type: 'top_half',
        target: 10,
        description: 'Finish top half',
      });
      await upsertBoardObjective(db, {
        clubId,
        season: 2,
        type: 'cup_win',
        target: null,
        description: 'Win the cup',
      });

      const obj = await getBoardObjective(db, clubId, 2);
      expect(obj!.type).toBe('cup_win');
      expect(obj!.description).toBe('Win the cup');
    });
  });
```

- [ ] **Step 1.3: Adicionar testes para `getSaveBoardTrust` e `updateSaveBoardTrust`**

```typescript
  describe('getSaveBoardTrust + updateSaveBoardTrust', () => {
    it('returns default trust of 50 for a new save', async () => {
      const trust = await getSaveBoardTrust(db, saveId);
      expect(trust).toBe(50);
    });

    it('returns updated trust after updateSaveBoardTrust', async () => {
      await updateSaveBoardTrust(db, saveId, 75);
      const trust = await getSaveBoardTrust(db, saveId);
      expect(trust).toBe(75);
      // restore
      await updateSaveBoardTrust(db, saveId, 50);
    });
  });
```

- [ ] **Step 1.4: Adicionar teste de integração: sequência "new game" com `generateObjective`**

```typescript
  describe('new game objective sequence', () => {
    it('generateObjective + upsertBoardObjective + getBoardObjective round-trip', async () => {
      const rng = new SeededRng(saveId * 999);
      const objective = generateObjective({
        clubReputation: 25,   // low-rep club → expect survival objective
        currentLeaguePosition: null,
        totalTeams: 16,
        divisionLevel: 1,
        wasRelegated: false,
        wasPromoted: false,
        rng,
      });

      await upsertBoardObjective(db, {
        clubId,
        season: 3,
        type: objective.type,
        target: objective.target,
        description: objective.description,
      });

      const persisted = await getBoardObjective(db, clubId, 3);

      expect(persisted).not.toBeNull();
      expect(['no_relegation', 'top_half']).toContain(persisted!.type);
      expect(persisted!.description.length).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 1.5: Rodar os testes e verificar que falham (RED)**

```bash
cd /root/rodrigo/football-manager
npx jest __tests__/database/queries/board.test.ts --no-coverage
```

Esperado: `FAIL` com `Cannot find module '@/database/queries/board'` ou falha nas queries (o arquivo de queries já existe mas os testes são novos).

> **Nota:** Se as queries já funcionam (PASS imediato), verifique se os testes são realmente novos e não duplicam testes existentes. Se passarem, o Step 1 está completo — pule para Step 1.6.

- [ ] **Step 1.6: Verificar que todos os testes passam (GREEN)**

```bash
npx jest __tests__/database/queries/board.test.ts --no-coverage
```

Esperado: `PASS` com 6 testes verdes.

- [ ] **Step 1.7: Commit**

```bash
git add __tests__/database/queries/board.test.ts
git commit -m "$(cat <<'EOF'
Contrato firmado —
board promete, banco guarda,
teste vê o fit.

test(board): integração de queries board — upsertBoardObjective,
getBoardObjective, getSaveBoardTrust, updateSaveBoardTrust +
round-trip de sequência new game com generateObjective

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: NewGameScreen — gerar objetivo inicial para temporada 1

**Files:**
- Modify: `src/screens/NewGameScreen.tsx`

- [ ] **Step 2.1: Adicionar imports necessários em `NewGameScreen.tsx`**

Localizar o bloco de imports existente (começa na linha 1) e adicionar:

```typescript
import { generateObjective } from '@/engine/board/objective-generator';
import { upsertBoardObjective } from '@/database/queries/board';
import { useBoardStore } from '@/store/board-store';
```

O import de `SeededRng` já existe. O de `useDatabaseStore`, `useGameStore` também.

- [ ] **Step 2.2: Destructurar `setCurrentObjective` do board store**

Dentro da função `NewGameScreen()`, após as declarações existentes de stores:

```typescript
const { setCurrentObjective } = useBoardStore();
```

- [ ] **Step 2.3: Adicionar geração de objetivo logo após `startNewGame(...)` em `handleStartGame`**

Localizar a linha `startNewGame(saveId, selectedClub.id, 1, 1);` dentro de `handleStartGame`. Logo após ela:

```typescript
// Generate season-1 board objective
const boardRng = new SeededRng(saveId * 999);
const s1Objective = generateObjective({
  clubReputation: selectedClub.reputation,
  currentLeaguePosition: null,
  totalTeams: 16,
  divisionLevel: 1,
  wasRelegated: false,
  wasPromoted: false,
  rng: boardRng,
});
await upsertBoardObjective(dbHandle, {
  clubId: selectedClub.id,
  season: 1,
  type: s1Objective.type,
  target: s1Objective.target,
  description: s1Objective.description,
});
setCurrentObjective({
  id: 0,
  clubId: selectedClub.id,
  season: 1,
  type: s1Objective.type,
  target: s1Objective.target,
  description: s1Objective.description,
});
```

- [ ] **Step 2.4: Rodar os testes existentes para garantir que não quebramos nada**

```bash
npx jest --no-coverage --testPathIgnorePatterns="e2e"
```

Esperado: mesmos 3 suites que já falhavam antes continuam falhando (pre-existing), nenhum teste novo falhou.

- [ ] **Step 2.5: Verificar type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "UpgradesScreen\|TacticsScreen" | head -20
```

Esperado: sem erros novos (os erros de `UpgradesScreen` e `TacticsScreen` são pre-existing e devem ser ignorados).

- [ ] **Step 2.6: Commit**

```bash
git add src/screens/NewGameScreen.tsx
git commit -m "$(cat <<'EOF'
Primeira temporada —
a diretoria já espera,
meta posta no mural.

feat(new-game): gera e persiste objetivo da temporada 1 imediatamente
após createSave, popula board-store para que HomeScreen mostre o
objetivo sem precisar passar pelo EndOfSeasonScreen primeiro

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: HomeScreen — carregar board state ao resumir save

**Files:**
- Modify: `src/screens/home/HomeScreen.tsx`

- [ ] **Step 3.1: Adicionar imports de board queries em `HomeScreen.tsx`**

Localizar o bloco de imports. Adicionar:

```typescript
import { getBoardObjective, getSaveBoardTrust, getReputationHistory } from '@/database/queries/board';
```

- [ ] **Step 3.2: Destructurar ações do board-store em HomeScreen**

A linha existente é:
```typescript
const { currentObjective, currentTrust } = useBoardStore();
```

Substituir por:
```typescript
const { currentObjective, currentTrust, setCurrentObjective, setCurrentTrust, setReputationHistory } = useBoardStore();
```

- [ ] **Step 3.3: Adicionar `useEffect` de carregamento do board**

Após o último `useEffect` existente (o que carrega nomes de jogadores após a partida), adicionar:

```typescript
// Load board state from DB when store is empty (e.g. after resuming a save)
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
}, [dbHandle, currentSave, playerClubId, season, currentObjective, setCurrentObjective, setCurrentTrust, setReputationHistory]);
```

**Por que a guarda `currentObjective !== null` funciona:**
- **Novo jogo**: Task 2 popula a store antes de navegar para `Game` → `currentObjective` já não é null → efeito não dispara.
- **Resume de save**: `loadSave()` chama `useBoardStore.getState().reset()` → `currentObjective` volta a `null` → efeito dispara e carrega do banco.
- **Meio de jogo**: EndOfSeasonScreen popula a store → `currentObjective` não é null → efeito não dispara novamente.

- [ ] **Step 3.4: Rodar a suite de testes**

```bash
npx jest --no-coverage --testPathIgnorePatterns="e2e"
```

Esperado: mesmos resultados anteriores — sem regressões novas.

- [ ] **Step 3.5: Verificar type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "UpgradesScreen\|TacticsScreen" | head -20
```

Esperado: sem erros novos.

- [ ] **Step 3.6: Commit**

```bash
git add src/screens/home/HomeScreen.tsx
git commit -m "$(cat <<'EOF'
Save reaberto —
diretoria lembra tudo,
confiança volta.

feat(home): carrega board state (objective/trust/history) do banco ao
resumir um save; guard currentObjective !== null evita carga duplicada
em novo jogo ou entre temporadas

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Validação UI (Playwright)

**Files:** nenhum — apenas verificação visual

- [ ] **Step 4.1: Verificar no browser que novo jogo mostra objetivo**

Abrir `http://localhost:8082` no browser (Playwright MCP).

1. Criar um novo jogo com qualquer clube de reputação baixa (≤ 30).
2. Na HomeScreen, rolar até o widget "Board objective" — deve mostrar uma descrição de objetivo (ex: "Avoid relegation this season").
3. Confirmar que a barra de confiança mostra 50% (5 pips, 2-3 preenchidos).

- [ ] **Step 4.2: Verificar que objective persiste ao reabrir o save**

1. Anotar o objetivo mostrado.
2. Voltar ao menu principal (pressionar "Back" ou navegar manualmente para MainMenu).
3. Carregar o mesmo save.
4. Confirmar que o mesmo objetivo aparece na HomeScreen (não está vazio).

- [ ] **Step 4.3: Verificar BoardScreen**

Na HomeScreen, tocar no widget de objetivo para navegar para a tela Board.
Confirmar:
- Número de reputação (1-100) visível.
- Barra de confiança com valor correto.
- Objetivo da temporada listado.

---

## Task 5: Push final

- [ ] **Step 5.1: Rodar suite completa e type-check**

```bash
npx jest --no-coverage --testPathIgnorePatterns="e2e" && npx tsc --noEmit 2>&1 | grep -v "UpgradesScreen\|TacticsScreen"
```

Esperado: suite passa (com os mesmos 3-4 pre-existing failures), sem erros de type novos.

- [ ] **Step 5.2: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Gap 1 (board store vazia ao resumir save) → Task 3
- ✅ Gap 2 (sem objetivo T1) → Task 2
- ✅ Testes de integração das queries → Task 1
- ✅ "Fired" visual apenas — não requer mudança, já existe no EndOfSeasonScreen

**Placeholder scan:**
- Nenhum TBD, TODO ou "similar a Task N" encontrado
- Todos os code blocks têm código completo
- Comandos têm saída esperada

**Type consistency:**
- `upsertBoardObjective` recebe `Omit<BoardObjective, 'id'>` — o objeto no Task 2 usa `{ id: 0, ... }` no `setCurrentObjective` (para o store, não para o DB)
- `getBoardObjective` retorna `BoardObjective | null` — checado com `if (obj)` antes de `setCurrentObjective`
- `setReputationHistory` recebe `ReputationHistoryEntry[]` — retorno de `getReputationHistory` que já tem esse tipo
- Todos os imports são de módulos existentes verificados durante exploração
