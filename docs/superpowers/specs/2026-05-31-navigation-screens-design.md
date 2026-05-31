# Design: Navigation & Screens — rotas órfãs, crash do PlayerDetail, confirmações nativas

**Data:** 2026-05-31
**Status:** Proposto
**Epic:** `navigation-screens`

**Goal:** Tornar todas as telas implementadas alcançáveis e seguras: registrar a rota `PlayerDetail` (hoje crasha), envolver o navegador num `ErrorBoundary`, plugar as telas órfãs (Squad, Training, Youth Academy, Calendar, Match Report, Cup Bracket, Top Scorers) no grafo de navegação, trocar `window.confirm` por `Alert.alert`, e wirar o game-over de demissão.

---

## 1. Problema / estado atual

Verificado lendo `RootNavigator.tsx`, `TabNavigator.tsx`, `types.ts` e cada tela citada. Achados da auditoria (`docs/audit/2026-05-31-gap-audit.md`) cobertos por este epic:

- **"Tapping a player in any report navigates to an unregistered PlayerDetail route and crashes"** (crítico C5). `RootStackParamList` declara `PlayerDetail: { playerId: number }` (`src/navigation/types.ts:6`) e `MatchResult: { fixtureId: number }` (`types.ts:5`), mas `RootNavigator.tsx:42-76` **não registra** `<Stack.Screen name="PlayerDetail">` nem `MatchResult`. Dez call sites disparam `navigation.navigate('PlayerDetail', { playerId })`: `ReportsTechnicalScreen.tsx:178,193,206,228,244`, `ReportsFinancialScreen.tsx:223`, `ReportsYouthScreen.tsx:165,183,197`, `ReportsFreeAgentScoutScreen.tsx:359`. Pior: `PlayerDetailScreen.tsx:30-33` é um componente por props (`interface PlayerDetailScreenProps { player: PlayerWithAttributes | null; onBack: () => void }`), consumido inline por `SquadListScreen.tsx:98-105` — não lê `route.params`. Não há `ErrorBoundary` em `src/` (grep por `componentDidCatch`/`ErrorBoundary` = nada; `App.tsx` monta `RootNavigator` direto, linha 50).

- **"Nine implemented/stubbed screens are unreachable"** (alto). Grep confirma que `SquadListScreen`, `YouthAcademyScreen`, `TrainingScreen`, `TacticsSettingsScreen`, `CalendarScreen`, `MatchResultScreen`, `CupBracketScreen`, `TopScorersScreen` só aparecem em seus próprios arquivos — nenhum navegador os importa. `TabNavigator.tsx:24-48` tem só 5 tabs (Home/News/Tactics/Club/Reports), sem Squad. `ClubOverviewScreen.tsx:110-184` lista hub cards (TransferMarket, OffersSent/Received, MyListings, FreeAgents, Finances, Staff, Upgrades, Board, Assistants) mas nenhum para Squad/Training/Youth.

- **"Board can fire the manager but the game continues into the same save with no game-over"** (alto). `trust-engine.ts:82` retorna `consequence: 'fired'`; `EndOfSeasonScreen.tsx:663` renderiza "FIRED — you have been dismissed." mas `handleContinue` (linhas 325-530) sempre termina em `navigation.navigate('Game')` (linha 528), independente da consequência. Não há tela/rota de game-over.

- **"Only destructive confirmation (delete save) uses web-only window.confirm — throws on native"** (alto/trivial). `MainMenuScreen.tsx:61`: `const confirmed = window.confirm(...)`. É a única ocorrência no codebase; o resto usa `Alert.alert` (ex.: `StaffScreen.tsx:89`). Em RN nativo `window` é `undefined` → `ReferenceError` ao tocar o X.

- **"CupBracket and TopScorers are placeholder stubs"** (médio). `CupBracketScreen.tsx:5-16` e `TopScorersScreen.tsx:5-17` renderizam só texto estático "coming soon", sem dados.

- **"Staff screen Hire button is a future-update dead end"** (médio). `StaffScreen.tsx:88-90`: `handleHireStaff` só mostra `Alert.alert('Hire Staff', 'Staff hiring will be available in a future update.')`.

---

## 2. Abordagem

Wiring de navegação puro + um `ErrorBoundary` de classe na raiz; **zero mudança em `engine/`**. Para `PlayerDetail` escolho **wrapper navigation-aware** (`PlayerDetailRoute`) que lê `route.params.playerId`, busca via `getPlayerById` e reusa o `PlayerDetailScreen` por props existente — preserva o uso inline em `SquadListScreen` sem refator de risco. Alternativa rejeitada: refatorar `PlayerDetailScreen` para ler `route` diretamente — quebraria o consumidor inline e exigiria dois caminhos de dados no mesmo componente. Telas que dependem de dados de epics irmãos (Cup Bracket, Top Scorers) são wiradas a dados **reais já disponíveis no DB** onde possível (top scorers via `player_stats`), e marcadas como dependentes de `competitions-real` onde não (bracket de rounds ≥2).

---

## 3. Arquitetura & componentes

| Arquivo | Tipo | Responsabilidade / interface |
|---|---|---|
| `src/components/ErrorBoundary.tsx` | **novo** | `class ErrorBoundary extends React.Component<{children: ReactNode}, {error: Error \| null}>` com `componentDidCatch` + `getDerivedStateFromError`. Fallback temado (usa `colors`/`spacing`/`fontSize` de `@/theme`) com botão "Tentar novamente" que limpa o estado de erro. Única peça com `class` no projeto — justificada (só class components capturam erros React). |
| `src/screens/squad/PlayerDetailRoute.tsx` | **novo** | Wrapper navigation-aware. Lê `route.params.playerId` (`useRoute<RouteProp<RootStackParamList,'PlayerDetail'>>()`), carrega via `getPlayerById(dbHandle, playerId)` num `useEffect`, mostra `ActivityIndicator` enquanto carrega, e renderiza `<PlayerDetailScreen player={loaded} onBack={() => navigation.goBack()} />`. Reusa o componente por props sem alterá-lo. |
| `src/screens/GameOverScreen.tsx` | **novo** | Tela de demissão. Lê `lastTrustConsequence`/objetivo do `useBoardStore` (já setado em `EndOfSeasonScreen.tsx:151`). Mostra mensagem temada e um botão "Voltar ao menu" → `clearGame()` (`game-store.ts:110`) + `navigation.reset({ index: 0, routes: [{ name: 'MainMenu' }] })`. |
| `src/screens/home/CalendarScreen.tsx` | edita (mínimo) | Já implementada (`CalendarScreen.tsx:17-115`); só precisa ser registrada e ter strings via `t()` (i18n-completion). Sem mudança de lógica. |
| `src/screens/home/MatchResultScreen.tsx` | edita (mínimo) | Já implementada; lê `lastMatchResult` do store. Registrar como rota e adicionar entry point a partir da HomeScreen (substituir o modal apertado é fora de escopo — só dar acesso). |
| `src/screens/squad/SquadListScreen.tsx` | edita (mínimo) | Já completa; vira componente da nova `SquadTab`. Trocar o embed inline de `PlayerDetailScreen` por `navigation.navigate('PlayerDetail', { playerId })` para unificar o caminho (remove o estado `selectedPlayerId`). |
| `src/screens/tactics/TrainingScreen.tsx` | edita | Wirar o foco selecionado à persistência (`training_focus`) — **depende de progression-wired**; nesta epic só registramos a rota e mantemos o `useState` local se o store ainda não existir (ver Dependências). |
| `src/screens/squad/YouthAcademyScreen.tsx` | registra | Stub atual; só ganha entry point. Dados reais = fora de escopo (depende de progression). |
| `src/screens/league/CupBracketScreen.tsx` | reescreve | Renderiza bracket a partir de `getFixturesByWeek`/competições `type:'cup'` agrupadas por `round`. Mostra "sorteio pendente" se só round 1 existir. Bracket multi-round real depende de `competitions-real`. |
| `src/screens/league/TopScorersScreen.tsx` | reescreve | Lista artilheiros via `getPlayerStatsByCompetition(db, season, competitionId)` (`player-stats.ts:92`) ordenado por `goals` desc, resolvendo nomes via `getPlayerById`. Dados já existem para a liga do jogador. |
| `src/screens/club/StaffScreen.tsx` | edita | Resolver o dead-end do botão Hire: escopar para **mensagem honesta** localizada (efeitos de staff dependem de economy-depth/progression). Botão fica desabilitado visualmente com texto "em breve" via `t()` em vez de Alert enganoso. Hire funcional = fora de escopo. |
| `src/navigation/types.ts` | edita | Adicionar a `RootStackParamList`: `Calendar: undefined`, `CupBracket: undefined`, `TopScorers: undefined`, `Training: undefined`, `YouthAcademy: undefined`, `GameOver: undefined`. `PlayerDetail`/`MatchResult` já declarados. Adicionar `SquadTab: undefined` a `TabParamList`. |
| `src/navigation/RootNavigator.tsx` | edita | Registrar `<Stack.Screen>` para `PlayerDetail` (→ `PlayerDetailRoute`), `MatchResult` (→ `MatchResultScreen`), `Calendar`, `CupBracket`, `TopScorers`, `Training`, `YouthAcademy`, `GameOver`. Títulos via i18n. |
| `src/navigation/TabNavigator.tsx` | edita | Adicionar `SquadTab` (componente `SquadListScreen`, ícone 👥) entre Home e News. |
| `src/screens/MainMenuScreen.tsx` | edita | Trocar `window.confirm` (linha 61) por `Alert.alert(title, message, [{text: t('common.cancel'), style:'cancel'}, {text: t('common.delete'), style:'destructive', onPress: () => doDelete()}])`. Extrair o corpo do delete para `doDelete()`. |
| `App.tsx` | edita | Envolver `<RootNavigator/>` com `<ErrorBoundary>` dentro do `NavigationContainer` (linha 50). |
| `src/screens/home/HomeScreen.tsx` | edita (mínimo) | Adicionar entry points: link "Calendário" e (onde houver bloco de liga) "Artilheiros"/"Copa". Reusa o padrão de `navigation.navigate('LeagueStandings')` já presente (`HomeScreen.tsx:372`). |
| `src/screens/EndOfSeasonScreen.tsx` | edita | Em `handleContinue`, antes de `navigation.navigate('Game')` (linha 528): se `boardEval.consequence === 'fired'`, `navigation.reset({ index:0, routes:[{name:'GameOver'}] })` em vez de continuar a temporada. Bloquear o setup de calendário nesse caminho. |

`getPlayerById` (`src/database/queries/players.ts:136-156`) retorna `(Player & { attributes }) | null` — exatamente o shape que `PlayerDetailScreen` espera (`PlayerWithAttributes`). Sem nova query.

---

## 4. Data flow

- **PlayerDetail (relatórios → tela):** report tap → `navigate('PlayerDetail', { playerId })` → `PlayerDetailRoute` lê `route.params.playerId` → `getPlayerById(dbHandle, id)` → passa `player` por prop ao `PlayerDetailScreen` → `goBack()` retorna ao relatório. Mesmo caminho usado pela `SquadTab` (substitui o embed inline).
- **Top Scorers:** `TopScorersScreen` → identifica a competição de liga da temporada (`getCompetitionsBySeason` + filtro `type:'league'`, padrão de `StandingsScreen.tsx:41-44`) → `getPlayerStatsByCompetition(db, season, compId)` → ordena por `goals` → resolve nomes com `getPlayerById`.
- **Cup Bracket:** `CupBracketScreen` → competição `type:'cup'` da temporada → varre fixtures por semana coletando os da competição, agrupa por `round` (campo `Fixture.round`, `match.ts:8`) → renderiza confrontos. Rounds ≥2 só aparecem quando `competitions-real` os gerar.
- **Game-over:** demissão setada no engine (`trust-engine`) → `processSeasonEndBoard` grava `lastTrustConsequence` no board store (`EndOfSeasonScreen.tsx:151`) → `handleContinue` ramifica para `GameOver` → `clearGame()` zera o `game-store` (`game-store.ts:110-114`) → `reset` para `MainMenu`.
- **ErrorBoundary:** qualquer throw num render/efeito sob `RootNavigator` é capturado → fallback temado em vez de tela branca. Defesa para o caso de uma futura rota não registrada.

---

## 5. Schema changes

**Nenhuma tabela nova neste epic.** O game-over reusa `lastTrustConsequence` já persistido (`save_games.board_trust` + board store). A persistência de `training_focus` é **owned por `progression-wired`** (citada na coordenação cross-epic); esta epic não a cria.

---

## 6. Error handling & edge cases

- `PlayerDetailRoute`: `playerId` válido mas player deletado/free agent → `getPlayerById` retorna `null` → `PlayerDetailScreen` já trata `player === null` (`PlayerDetailScreen.tsx:134-145`, "Player not found"). `dbHandle` ainda não pronto → `ActivityIndicator`.
- `ErrorBoundary`: o fallback NÃO deve re-throw; o botão de retry reseta `state.error` para `null` e re-renderiza os children.
- `TopScorers`/`CupBracket`: competição inexistente ou sem fixtures → estado vazio temado ("Sem dados ainda"), nunca crash.
- `MatchResult`: `lastMatchResult === null` já tratado (`MatchResultScreen.tsx:131-140`).
- `GameOver` via `navigation.reset`: garante que voltar (back) não reentra no save demitido.
- `Alert.alert` no delete: o botão destrutivo só executa em `onPress`; cancelar não deleta. `dbHandle` nulo → no-op (igual à guarda atual `MainMenuScreen.tsx:62`).

---

## 7. Estratégia de testes

SQLite real (`better-sqlite3`), nunca mock. Telas/wrappers que tocam DB testadas via render + asserts no estado carregado; navegação pura via asserts de configuração.

- **`PlayerDetailRoute`** (integração): seed de 1 player → render com `route.params.playerId` → após efeito, o nome do player aparece (busca real via `getPlayerById`). Edge: `playerId` inexistente → renderiza "Player not found".
- **RootNavigator registration** (unit): asserir que `PlayerDetail`, `MatchResult`, `Calendar`, `CupBracket`, `TopScorers`, `Training`, `YouthAcademy`, `GameOver` estão entre os nomes de `Stack.Screen` (evita regressão do crash original). Pode ser feito inspecionando o array de children renderizado.
- **`TopScorersScreen`** (integração): seed de `player_stats` com goals variados em uma competição → render → primeira linha é o maior artilheiro; ordenação desc verificada.
- **`CupBracketScreen`** (integração): seed de fixtures `type:'cup'` round 1 → render mostra os confrontos do round 1; sem cup → estado vazio.
- **`MainMenuScreen` delete** (integração): substituir `window.confirm` deve eliminar a referência a `window`; teste assegura que após confirmar (`onPress` do botão destrutivo) `deleteSave` roda e o save some da lista; cancelar mantém.
- **Game-over branch** (integração lógica): dado `boardEval.consequence === 'fired'`, `handleContinue` chama `navigation.reset` para `GameOver` e NÃO `navigate('Game')`. Testável extraindo a decisão para uma função pura `resolveSeasonEndRoute(consequence): 'Game' | 'GameOver'` e testando-a isoladamente.
- **Parity i18n**: novas keys em `pt.ts`/`en.ts` passam em `__tests__/i18n/parity.test.ts`.
- **Regressão**: `npx tsc --noEmit` limpo; suíte cheia verde (baseline 62/536).

---

## 8. Dependências & sequenciamento

- **i18n-completion** (paralelo/depois): todas as telas wiradas e novas (`GameOver`, títulos de stack, botões de delete) precisam de keys novas. Esta epic adiciona as keys que usa; i18n-completion garante paridade e revisão de tradução. Sem bloqueio rígido — keys podem coexistir.
- **board-stakes** (coordena): owner conceitual do game-over de demissão. Esta epic entrega a **tela + roteamento**; se board-stakes definir efeitos adicionais (oferta de novo emprego, reputação do treinador), eles plugam na `GameOverScreen`. Para não duplicar: se board-stakes já criar `GameOverScreen`, esta epic só faz o wiring de `handleContinue`.
- **competitions-real** (bloqueia parcialmente): bracket de copa multi-round (rounds ≥2) e knockout da CL só existem quando esse epic gerar as fixtures. `CupBracketScreen` é construída para renderizar o que existir (graceful), então pode landar antes — mas só mostra round 1 até `competitions-real` landar.
- **progression-wired** (bloqueia parcialmente): `training_focus` persistente e dados reais do Youth Academy. `TrainingScreen`/`YouthAcademyScreen` ficam alcançáveis nesta epic; sua plumagem de dados é desse epic.
- **economy-depth/progression** (bloqueia parcialmente): contratação de staff funcional. Esta epic só remove o dead-end enganoso do botão Hire (mensagem honesta), não implementa hiring.
- **save-isolation / db-hardening**: sem dependência direta (este epic não muda schema). Se landarem antes, nenhuma das telas aqui precisa ajuste além de já lerem por `playerClubId`.

Ordem sugerida: ErrorBoundary + PlayerDetail + window.confirm (independentes, alto valor) → wiring das órfãs + Squad tab → TopScorers/CupBracket (dados) → game-over → Staff stub.

---

## 9. Out of scope

- Geração de fixtures de rounds ≥2 de copa e knockout da CL (**competitions-real**).
- Persistência e efeito real de `training_focus` e geração de prospects de base (**progression-wired**).
- Contratação funcional de staff e efeitos mecânicos (**economy-depth/progression**).
- Substituir o modal de match report da HomeScreen pela `MatchResultScreen` dedicada — apenas damos **acesso** à tela; a migração do modal é refator separado.
- Deduplicar/remover `TacticsSettingsScreen` (duplica controles inline do `TacticsScreen`). Decisão de manter/excluir fica para um cleanup posterior; este epic **não** o registra como rota (evita expor UI redundante).
- Lógica de oferta de novo emprego / unemployment após demissão (board-stakes).
- Tradução completa de todas as strings das telas (i18n-completion); aqui só as keys que estas mudanças introduzem.

---

## 10. Spec self-review

- **Placeholder scan:** sem TBDs; todo path/símbolo citado foi verificado por leitura (`getPlayerById:136`, `Fixture.round:8`, `getPlayerStatsByCompetition:92`, `MainMenuScreen.tsx:61`, `EndOfSeasonScreen.tsx:528`, `clearGame` em `game-store.ts:110`).
- **Consistência interna:** `PlayerDetailRoute` reusa `PlayerDetailScreen` por props sem alterá-lo, então `SquadListScreen` (que passa a navegar) e os relatórios convergem no mesmo wrapper. `TacticsSettingsScreen` é explicitamente excluído da lista de "9 telas" wiradas (só 6 órfãs reais + PlayerDetail + game-over são alcançadas), evitando expor UI duplicada — coerente com a recomendação da auditoria de "deletar ou finalizar duplicatas".
- **Ambiguidade:** o limite com board-stakes está explícito (esta epic faz tela+roteamento; efeitos extras plugam). O limite com competitions-real está explícito (render graceful do que existir).
- **Pureza do engine:** nenhuma mudança em `src/engine/`; toda a lógica é navegação/UI/queries existentes. A única decisão "lógica" testável (`resolveSeasonEndRoute`) é uma função pura em `screens/`, não em `engine/`.
