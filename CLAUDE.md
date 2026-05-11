# CLAUDE.md — football-manager

Instruções do subprojeto. Complementa `/root/rodrigo/CLAUDE.md` (monorepo) e `/root/.claude/CLAUDE.md` (VPS global). Sempre **pt-BR**.

## Escopo: NUNCA sair deste diretório

**Regra absoluta**: nesta sessão, alterações de arquivo ficam **estritamente** dentro de `/root/rodrigo/football-manager/`.

Proibido sem autorização explícita do usuário:

- Editar/criar/deletar arquivos em qualquer outro projeto (`idle_rpg/`, `projeto_alana/`, `hope_saude/`, `arquimedes/`, `mxservices/`, `raylook/`, etc.).
- Editar `/root/rodrigo/CLAUDE.md`, `/root/.claude/CLAUDE.md` ou qualquer config fora deste subprojeto.
- Rodar `git`/`docker`/`pkill`/`rm`/`mv` em paths fora deste subprojeto.
- Derrubar ou alterar containers compartilhados (Traefik, Postgres, N8N, Evolution).
- Instalar pacotes globais (`npm i -g`, `pip install -g`, `apt install`).

Se uma tarefa parecer exigir mudança fora deste diretório, **pare e pergunte** antes de fazer.

Buscas/leituras read-only fora do diretório são permitidas (`grep`, `find`, `cat`) — só não escrever.

## Stack

- Expo 54 + React Native 0.81 + React 19.1
- TypeScript 5.9 (strict)
- Jest 29 + ts-jest (`jest.config.js`)
- `expo-sqlite` em runtime, `better-sqlite3` em testes
- Zustand (store), React Navigation v7

## Estrutura (`src/`)

| Módulo | Responsabilidade |
|---|---|
| `components/` | UI reutilizável (stateless quando possível) |
| `database/` | Schema SQLite + queries tipadas |
| `engine/` | Simulação, regras do jogo. **Não** importa React |
| `navigation/` | React Navigation (stacks, tabs) |
| `screens/` | Telas (1 componente por arquivo) |
| `store/` | Zustand (estado global) |
| `theme/` | Tokens de design (cores, spacing) |
| `types/` | Tipos globais compartilhados |
| `utils/` | Helpers puros |

## Dev server

```
npm run web           # porta 8082 (proxy) → expo em 19006
npm test              # Jest
npm run test:watch
npm run generate-data # regenera seed via scripts/
```

Rodar web server em background: `nohup npm run web >/tmp/fm-web.log 2>&1 & disown` e guardar PID.
Antes de subir outro: `pkill -f "expo start"`.

## Squad — modo padrão deste subprojeto

**Regra**: toda tarefa de código neste subprojeto roda como se tivesse sido invocada via `/squad`, a menos que seja trivial ou o usuário pule explicitamente.

Ou seja: o Claude na sessão principal **assume o papel de Diretor Técnico** (`.claude/commands/squad.md`) por padrão. O usuário não precisa digitar `/squad` — só descreve a tarefa em linguagem natural.

### O que o Diretor Técnico faz automaticamente

1. **Classifica** a tarefa (trivial / pequena / não-trivial).
2. Se **não-trivial**: invoca `planner` → **checkpoint de aprovação do plano**.
3. Ativa skill `superpowers:test-driven-development` se tocar `engine/database/store`.
4. Invoca `ts-developer` → `test-runner` → Playwright MCP (se UI) → `code-reviewer`.
5. **Checkpoint** antes de commit/push (`/commit-smart`).

Agents disponíveis: `planner`, `ts-developer`, `test-runner`, `code-reviewer`, `debugger`.

### Quando pular a squad

Pular se o usuário disser **"direto"**, **"rápido"**, **"sem squad"**, **"só faz"**, ou quando a tarefa é obviamente trivial (typo, rename de 1 símbolo, ajuste de 1 linha). Aí resolve na sessão principal sem pipeline.

### Quando forçar a squad

Usar `/squad <tarefa>` explicitamente quando quer garantir a pipeline completa mesmo que pareça trivial (ex: mudança pequena mas em código crítico de `engine/` ou `database/`).

### Classificação rápida

| Tipo | Critério | Pipeline |
|---|---|---|
| Trivial | 1 arquivo, 1-3 linhas, sem lógica | Direto |
| Pequena | Bugfix com causa clara, feature mínima | ts-developer → test-runner → code-reviewer |
| Não-trivial | ≥3 arquivos, lógica nova, toca engine/database/store, nova tela | Pipeline completa com plan |

Na dúvida entre pequena e não-trivial → **assume não-trivial**.

## Convenções específicas

- **Telas**: PascalCase, um componente por arquivo em `src/screens/`.
- **Queries SQLite**: em `src/database/`, sempre com tipos retornados explícitos.
- **Engine puro**: zero dependência de React/Expo. Testável isoladamente.
- **Tema**: cores e spacing **sempre** via `src/theme/`, nunca hardcode.
- **Seed data**: `npm run generate-data` regenera via `scripts/generate-seed-data.ts`.

## Testes

- SQLite real em memória com `better-sqlite3` — **nunca** mock.
- Integração > unit quando envolve DB ou store.
- TDD obrigatório em `engine/`, `database/`, `store/`.

## Antes de declarar pronto

1. `npm test` passou.
2. `npx tsc --noEmit` passou.
3. UI validada no browser (Playwright MCP) se mexeu em tela/componente.
4. `git diff` revisado.

