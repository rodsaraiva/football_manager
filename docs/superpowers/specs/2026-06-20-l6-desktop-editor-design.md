# Design (Épico): Desktop (Steam) + editor de clubes/ligas

**Epic:** l6-desktop-editor · **Data:** 2026-06-20 · **Horizonte:** longo · **Stack:** Expo 54 / RN 0.81 / TS 5.9

**Goal:** Empacotar o jogo como app desktop (web-wrapper/Electron, alvo Steam) com layout/input expandidos para mouse+teclado, e entregar um editor sandbox que cria ligas fictícias e customiza clubes (cores, escudos, elenco) gerando mundos jogáveis e determinísticos.

---

## 1. Visão & valor

A fantasia: o jogador abre o FM num monitor grande, com janela redimensionável e atalhos de teclado, **e** pode esculpir o próprio universo — inventar uma liga regional fictícia, repintar o escudo do clube do coração, montar um elenco dos sonhos — e então iniciar uma carreira nesse mundo customizado. Dois pilares complementares:

- **Desktop (Steam):** o alvo `expo web` já roda (porta 19006 atrás de proxy `8082`, `package.json:9`). Empacotar esse build num shell desktop (Electron/Tauri) dá distribuição via Steam, janela nativa, persistência local robusta e tela cheia — sem reescrever a UI. O ganho de imersão depende de **layout responsivo de verdade** (hoje `orientation: "portrait"`, `app.json:6`) e de **input desktop** (atalhos, hover, foco).
- **Editor sandbox:** transforma o jogo de "mundo fixo seedado" em "mundo autoral". Aproveita que o mundo inteiro já é dado declarativo (`SeedData` em `scripts/generate-seed-data.ts:111`) carregado por `seedReferenceTables`/`seedWorldForSave` (`src/database/seed.ts:59,71`). Um editor é, conceitualmente, uma UI que produz um `SeedData` alternativo + um pipeline de assets (escudos) ligado ao trabalho de imersão da fase 3 (épico D8).

Valor de negócio: longevidade (conteúdo gerado pelo usuário), diferencial de marketing (Steam + editor), e reaproveitamento quase total da engine determinística existente.

---

## 2. Estado atual na base (fundação real)

O que **já existe** e serve de alicerce:

- **Alvo web funcional.** `expo web` sobe e usa `expo-sqlite` (wa-sqlite/WASM) com headers COOP/COEP e `.wasm` resolvido em `metro.config.js:6,9-18`. `react-native-web@^0.21` e `react-dom` já são deps (`package.json:24,29`). Logo, o "port desktop" parte de um app web que **já roda no browser**.
- **Mundo é 100% dado declarativo.** `SeedData` (`scripts/generate-seed-data.ts:111-119`) agrega `countries/leagues/clubs/players/playerAttributes/staff/tactics`. O gerador usa `SeededRng` (`scripts/generate-seed-data.ts:3`) — totalmente determinístico. Um editor é "gerar/editar um `SeedData`".
- **Loader de mundo por save.** `seedReferenceTables(db, data)` insere `countries/leagues` globais; `seedWorldForSave(db, data, saveId)` clona o mundo offsetando ids por `saveOffset(saveId)` (`src/database/seed.ts:71-95`, `constants.ts:7-11`). Há também `generateWorldSeedSQLForSave` para o caminho async do web (`seed.ts:157`).
- **Save-isolation madura.** `SAVE_ID_STRIDE = 100_000_000` (`constants.ts:7`); toda tabela de mundo carrega `save_id` (ex. `clubs.save_id`, `players.save_id`, `schema.ts:59,80`). Migração idempotente em `migration.ts:44` (`migrateSaveIdAsync`/`migrateSaveId`). Um mundo de editor é só mais um save com ids offsetados.
- **Cores já são colunas.** `clubs.primary_color` / `secondary_color` (TEXT, `schema.ts:72-73`) e `SeedClub.primaryColor/secondaryColor` (`generate-seed-data.ts:41-42`). Repintar clube já é um UPDATE de coluna existente — sem migração.
- **Ligas/competições já modeladas.** `leagues` (division_level, num_teams, promotion/relegation, `schema.ts:47-55`) e `competitions`/`competition_entries` (`schema.ts:188-205`). Liga fictícia = nova linha em `leagues` + clubes apontando para ela.
- **Persistência genérica disponível.** `app_settings (key,value)` (`schema.ts:448-451`) serve para guardar metadados de editor (ex. catálogo de mundos customizados) sem nova tabela, se preferível.

O que **não existe** (lacunas a preencher pelo épico): shell desktop, layout não-portrait, sistema de atalhos/foco, telas de editor, tabela/colunas de assets (escudo), e um caminho de "novo jogo a partir de mundo customizado".

---

## 3. Decomposição em sub-épicos

1. **L6.1 — Shell desktop (Electron/Tauri).** Empacotar o build `expo export --platform web` num shell desktop, com janela, fullscreen e persistência de userData. Entregável Steam-instalável.
2. **L6.2 — Layout responsivo desktop.** Sair de `portrait` fixo para layouts que respondem a largura (sidebar persistente, master-detail, grids multi-coluna) usando breakpoints em `@/theme`.
3. **L6.3 — Input desktop.** Atalhos de teclado globais, navegação por foco, estados de hover, e confirmações via `useConfirm` (kit do Design System) em vez de `Alert.alert` (no-op no web).
4. **L6.4 — Editor: dados (engine puro).** Modelo `EditableWorld` + validadores + conversor `EditableWorld → SeedData`, tudo em `src/engine`, sem React, determinístico.
5. **L6.5 — Editor: UI.** Telas para criar/editar ligas, clubes (cores), e elencos, sobre o kit de componentes do épico `2026-06-20-design-system-premium-design.md`.
6. **L6.6 — Editor: assets de escudo.** Coluna/persistência de escudo (data-URI ou referência), pipeline alinhado ao épico de imersão D8, render via `react-native-svg`/`<Image>`.
7. **L6.7 — Ponte editor → carreira.** "Novo jogo neste mundo customizado": instancia um save a partir de um `EditableWorld` reusando `seedWorldForSave`.

Cada peça é independente: L6.1–L6.3 entregam o "desktop"; L6.4–L6.7 entregam o "editor". Podem ser fatiadas em releases separadas.

---

## 4. Opções de arquitetura

### A. Shell desktop (L6.1)

- **A1 — Electron + `expo export` estático.** Empacota o `dist/` web num BrowserWindow. Maduro, integra Steamworks (greenworks/electron), grande footprint (~150MB), mas é o caminho de menor atrito porque o app já é web. **Requer** servir os headers COOP/COEP (hoje injetados por `metro.config.js:11-18`) também no shell — em Electron, via `session.webRequest.onHeadersReceived` ou protocolo customizado, senão `expo-sqlite` WASM (SharedArrayBuffer) não inicializa.
- **A2 — Tauri (WebView nativa + Rust).** Binário muito menor (~10MB), mas WebView do SO varia e o suporte a SharedArrayBuffer/COOP-COEP é mais frágil — risco direto para `expo-sqlite` web. Steamworks via crate de terceiros.
- **A3 — Sem shell: PWA/atalho de browser.** Zero empacotamento, mas não é "Steam app" e perde janela/fullscreen nativos. Não atende ao goal.

**Recomendação: A1 (Electron).** Único caminho que preserva o stack WASM de SQLite sem reescrever persistência, com Steamworks comprovado. Documentar como bloqueio crítico a replicação dos headers COOP/COEP no shell.

### B. Persistência do mundo customizado (L6.4/L6.7)

- **B1 — `EditableWorld` como `SeedData` estendido, materializado via `seedWorldForSave`.** O editor produz um objeto idêntico a `SeedData` (+ escudo). "Novo jogo" chama `seedReferenceTables` (para a liga fictícia, se nova) e `seedWorldForSave(db, world, saveId)` (`seed.ts:71`). **Reuso máximo** do pipeline existente e da save-isolation; zero engine nova de instanciação.
- **B2 — Tabelas de "template" dedicadas (`editor_leagues`, `editor_clubs`...).** Mundo de editor vive em tabelas próprias e é "compilado" para o save no novo jogo. Mais isolamento conceitual, porém duplica modelo e validação — over-engineering frente ao reuso de `SeedData`.

**Recomendação: B1.** O mundo já é `SeedData`; o editor só precisa produzir/persistir um. Guardar mundos salvos como JSON em `app_settings` (`schema.ts:448`) ou em uma tabela leve `editor_worlds (id, name, json)`.

### C. Escudos (L6.6)

- **C1 — `clubs.crest` TEXT com data-URI (PNG/SVG base64) ou string SVG inline.** Sem filesystem, funciona idêntico em web e desktop, viaja junto no JSON do mundo. Limite de tamanho por convenção (escudo pequeno). Render: SVG → `react-native-svg`; PNG → `<Image source={{uri}}>`.
- **C2 — Asset em arquivo + caminho no DB.** Menor DB, mas exige FS (divergente web vs desktop) e quebra a portabilidade do mundo-JSON.

**Recomendação: C1**, alinhado ao pipeline de assets do épico de imersão D8 (que define formato/escala canônicos do escudo).

---

## 5. Pré-requisitos & dependências

- **Épico Design System (`2026-06-20-design-system-premium-design.md`):** a UI do editor (L6.5) e o input desktop (L6.3) devem usar o kit novo — `Card`, `Button`, `StatBar`, `Text` semânticos, `Icon`, `EmptyState`, `Toast`, `useConfirm`. `useConfirm` é pré-requisito direto: `Alert.alert` é no-op no React Native Web (e portanto no desktop), conforme memória `reference_rn_web_alert`.
- **Épico imersão fase 3 (D8 — pipeline de assets):** define formato canônico do escudo (dimensão, SVG vs raster) consumido por L6.6.
- **Breakpoints em `@/theme`:** L6.2 precisa de tokens de breakpoint/spacing responsivo no tema (hoje só há tokens de cor/spacing). Não hardcodar larguras.
- **Determinismo (`src/engine/rng.ts`):** qualquer geração assistida no editor (ex. "gerar elenco aleatório para este clube") usa `SeededRng`, nunca `Math.random`.
- **Não tocar `app.json:6` `orientation: "portrait"` cegamente:** mudar para layout livre afeta mobile; tratar via responsividade, não removendo suporte mobile.

---

## 6. Faseamento

**Fase 1 — Layout responsivo (L6.2).** Tokens de breakpoint em `@/theme`; navegação adapta (tabs no mobile → sidebar no desktop); telas-chave (Elenco, Mercado, Táticas) viram master-detail em telas largas. *Entregável testável:* abrir o app web em 1440px e validar sidebar + grids; testes de utilitário de breakpoint (puro) passando.

**Fase 2 — Input desktop (L6.3).** Hook de atalhos de teclado (avançar semana, abrir telas), estados hover/foco, todas as confirmações migradas para `useConfirm`. *Entregável:* atalhos funcionando no web; teste unit do dispatcher de atalhos; zero `Alert.alert` em fluxos de confirmação.

**Fase 3 — Shell Electron (L6.1).** Empacotar `expo export` em Electron com COOP/COEP replicados; smoke test de boot do SQLite WASM no shell; build instalável + integração Steamworks mínima (overlay/achievements opcional). *Entregável:* binário desktop que cria save e avança semana.

**Fase 4 — Editor: dados (L6.4).** `EditableWorld` + validadores (liga ≥ N times, cores válidas, sem ids duplicados) + `editableWorldToSeedData()` em `src/engine`. *Entregável:* suíte TDD com better-sqlite3 real materializando um mundo via `seedWorldForSave` e abrindo carreira.

**Fase 5 — Editor: UI de ligas/clubes/cores (L6.5).** Telas CRUD sobre o kit; color picker para `primary_color`/`secondary_color`. *Entregável:* criar liga fictícia com 8 clubes pintados, validado no browser.

**Fase 6 — Editor: escudos (L6.6).** Coluna `clubs.crest` (+ `SeedClub.crest`); upload/seleção; render no app. *Entregável:* escudo customizado aparece em Elenco/Mercado/Tabela.

**Fase 7 — Ponte editor → carreira (L6.7).** Persistir mundos (`editor_worlds`/`app_settings`), tela "Novo jogo neste mundo". *Entregável:* salvar mundo, fechar, reabrir, iniciar carreira determinística (mesma seed = mesmo resultado).

---

## 7. Schema/infra changes (alto nível)

Mudanças vão **sempre** em `src/database/schema.ts` E no store de criação de tabelas (atualmente `seedDatabase`/`seedWorldForSave` em `src/database/seed.ts`; toda nova coluna entra também nos INSERTs de `seed.ts:32-49,75-88` e nas variantes `generate*SQL`).

- **`clubs.crest TEXT` (nullable).** Escudo como data-URI/SVG (C1). Migração: `ALTER TABLE clubs ADD COLUMN crest TEXT` no padrão idempotente de `migration.ts:44` (ADD COLUMN nullable em DB legado). Refletir em `SeedClub` (`generate-seed-data.ts:27`) e nos INSERTs de clube (`seed.ts:32-33,75-76`).
- **`editor_worlds (id INTEGER PK AUTOINCREMENT, name TEXT, json TEXT, created_at TEXT)`** *(ou)* reuso de `app_settings` (`schema.ts:448`) com chave `editor:world:<id>`. Não é tabela de mundo (não leva `save_id`): é catálogo de templates, fora de `WORLD_TABLES_FOR_MIGRATION` (`migration.ts:11`).
- **Sem novas FKs no caminho de carreira:** o mundo customizado entra pelo `seedWorldForSave` existente, respeitando `SAVE_ID_STRIDE` e a resolução de ciclo FK `save_games↔clubs` já tratada em `seed.ts:10-19`.
- **Infra desktop (não-DB):** `electron/` (main process, BrowserWindow, headers COOP/COEP), script de build empacotando `expo export --platform web`, e configuração Steamworks. Fora de `src/`.

---

## 8. Riscos & decisões abertas

- **[Crítico] COOP/COEP no Electron.** `expo-sqlite` web depende de SharedArrayBuffer, hoje habilitado só por `metro.config.js:11-18` (dev server). No shell empacotado os headers somem; sem eles o DB não inicializa. Decisão: servir via protocolo customizado/`onHeadersReceived` no main process — validar em smoke test ANTES de investir na Fase 4+.
- **Tamanho do escudo em data-URI.** Imagens grandes incham `clubs.crest` e o JSON do mundo. Decisão aberta: limite de dimensão/peso (definido pelo épico D8) e validação no editor (L6.4).
- **`orientation: "portrait"` (`app.json:6`).** Remover afeta mobile. Decisão: responsividade por breakpoint, mantendo mobile usável.
- **Determinismo de geração assistida.** "Gerar elenco" no editor deve usar `SeededRng` e expor a seed, senão dois jogadores com "o mesmo mundo" divergem. Decisão: toda geração do editor é seedada e a seed é parte do `EditableWorld`.
- **Steamworks no Expo/web build.** Achievements/overlay exigem ponte nativa só no Electron; não vaza para o código web/engine. Decisão: manter integração isolada no main process.
- **Validação de mundo inválido.** Liga com 1 time, FKs órfãs, cores inválidas quebram a engine de fixtures. Decisão: validadores puros (L6.4) bloqueiam materialização antes de criar o save.

## 9. Não-objetivos / fora de escopo

- **Editor de atributos/regras de engine** (mexer em balance/levers) — fora; editor cobre liga/clube/cores/escudo/elenco, não o motor de simulação.
- **Editores em runtime de save existente** (mudar o mundo no meio de uma carreira) — fora; editor produz mundos para *novos* jogos.
- **Multiplayer / sync de mundos na nuvem / workshop Steam** — fora deste épico (possível pós).
- **Builds mobile-store do shell desktop** — fora; mobile continua pelo alvo Expo nativo normal.
- **Geração procedural avançada de escudos** — fora; L6.6 consome o pipeline D8, não cria um novo gerador.
- **Editor de calendário/formato de competição fictício** além de liga simples — fora da primeira entrega.

## 10. Spec self-review

- **Aterrado em código real:** sim — `seedWorldForSave`/`seedReferenceTables` (`seed.ts:71,59`), `SeedData` (`generate-seed-data.ts:111`), `SAVE_ID_STRIDE` (`constants.ts:7`), cores em `clubs` (`schema.ts:72-73`), COOP/COEP (`metro.config.js:11-18`), `orientation` (`app.json:6`), `react-native-web` (`package.json:29`), migração idempotente (`migration.ts:44`).
- **Convenções honradas:** engine puro (L6.4 sem React), TDD com better-sqlite3 real, save-isolation via `saveOffset`, determinismo via `SeededRng`, kit do Design System na UI, `useConfirm` no lugar de `Alert.alert`.
- **Sem invenções:** todas as colunas citadas existem; as novas (`clubs.crest`, `editor_worlds`) estão marcadas como ADIÇÕES com caminho de migração.
- **Risco nº1 explícito:** COOP/COEP no Electron, com gate de smoke test antes das fases pesadas.
- **Aberto que permanece:** limite de tamanho/formado do escudo depende do épico D8; escolha final `editor_worlds` vs `app_settings`; profundidade da integração Steamworks (achievements opcionais).
