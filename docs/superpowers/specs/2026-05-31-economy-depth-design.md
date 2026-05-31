# Design: Economy Depth — valor de mercado, contratos, receita, falência

**Data:** 2026-05-31
**Status:** Proposto
**Epic:** `economy-depth`
**Escopo:** football-manager v0.1

---

## 1. Goal

Tornar a economia do jogo viva e com stakes: valor de mercado recalculado periodicamente, contratos que de fato expiram e podem ser renovados, salários de empréstimo corretos com restauração na volta, receita de premiação/bilheteria escalada por competição, e um teto/piso orçamentário com consequências (compra inacessível bloqueada, dívida prolongada vira gancho de demissão da diretoria).

---

## 2. Problem / current state

Sete gaps confirmados na auditoria (`docs/audit/2026-05-31-gap-audit.md`), todos verificados contra o código:

1. **"Market value is frozen at seed forever — calculateMarketValue is dead code"** — `src/engine/transfer/market-value.ts:8-25` implementa `calculateMarketValue` mas grep por `UPDATE players SET market_value` em `src/` retorna nada; o valor só é escrito no seed e em jovens (hardcoded `100000`, `EndOfSeasonScreen.tsx:413`). Idade sobe todo ano (`EndOfSeasonScreen.tsx:338`) e atributos progridem, mas o valor nunca move. A AI ancora ofertas nesse valor estático (`ai-offer-generator.ts`, `transfer-ai.ts:43`).

2. **"Budget can go arbitrarily negative with no consequence; buy offers never check the buyer can afford the fee"** — `executeAcceptedTransfer` (`offer-processor.ts:50-52`) roda `UPDATE clubs SET budget = budget - fee` sem checar saldo; o caminho AI-vendedor-aceita-lance-humano (`processPendingOffers:241-254`) chama `evaluateOffer` (`transfer-ai.ts:39`, sem parâmetro de orçamento do comprador). Salário semanal (`game-loop.ts:659`) faz `budget + income - expenses` sem piso. Não existe falência, embargo nem juros (grep `bankrupt/embargo/administration` → nada).

3. **"Contract expiry flags players free agents while leaving them attached to (and paid by) their club"** — `EndOfSeasonScreen.tsx:362` roda `UPDATE players SET is_free_agent = 1 WHERE contract_end <= ? AND club_id IS NOT NULL` mas nunca seta `club_id = NULL` nem zera `wage`. `getPlayersByClub` (`players.ts:112-114`) não filtra `is_free_agent`, então o clube segue pagando; `getFreeAgents` (`players.ts:201-205`) lista o mesmo jogador no pool de livres. Jogador em dois estados ao mesmo tempo.

4. **"No contract renewal negotiation and contracts never actually expire"** — não há `UPDATE players SET contract_end` em lugar nenhum exceto seed, `retirePlayer` (zera) e `signFreeAgent` (`free-agent-signing.ts:77`). `contract_end` nunca é decrementado; sem `contract_end` decrescente, a regra de desconto por contrato curto em `calculateMarketValue:21-22` é inalcançável na prática. Nenhum fluxo de renovação/extensão existe.

5. **"Loan deals overwrite the player's full wage at the borrowing club and never restore it"** — `executeAcceptedTransfer` (`offer-processor.ts:44-47`) faz `UPDATE players SET wage = ?` com `wageOffered` (a fração do empréstimo) para `offerType === 'loan'` também. `returnExpiredLoans` (`loan-returns.ts:49-52`) move o jogador de volta com comentário explícito "We don't touch wage here" — o salário fica congelado na fração do empréstimo. O salário original do clube-pai nunca é armazenado.

6. **"No prize money, gate-receipt variation by competition, or performance-based revenue"** — `calculateWeeklyIncome` (`finance-engine.ts:41-60`) computa bilheteria/TV/patrocínio só por reputação; não há premiação por posição/título nem variação de bilheteria por competição (liga × copa × CL têm o mesmo cálculo). `archiveLeague`/`archiveKnockout` (`season-archiver.ts:329-357`) gravam campeão mas não distribuem prêmio. `FinanceType` (`types/finance.ts:1`) não tem `'prize'`.

7. **"wage_budget exists but is never enforced on signings"** — `clubs.wage_budget` existe (`schema.ts:58`) e é lido em `ClubWeekData.wageBudget` (`week-advance.ts:9`), mas grep mostra que nenhuma assinatura (`signFreeAgent`, `executeAcceptedTransfer`) compara o salário oferecido contra o teto salarial restante.

---

## 3. Approach

Centralizar a economia em três passes idempotentes acoplados ao loop/rollover, mantendo `engine/` puro (funções recebem dados, retornam decisões/valores; a escrita SQL fica nas queries/screens):

- **Recálculo de valor** roda no rollover de fim de temporada (não toda semana — barato e suficiente; valor depende de overall/idade/potencial/contrato que só mudam por temporada). Alternativa considerada: recalcular toda semana em swings de rating — rejeitada por custo de full-scan semanal sem ganho de gameplay perceptível.
- **Consequências de orçamento** = piso de gate na compra (engine puro `canAffordTransfer`) + rastreio de semanas em dívida (`debt_weeks`) que `board-stakes` lê para acelerar demissão. Não duplicamos o mecanismo de demissão — só fornecemos o sinal.
- **Contratos** corrigidos no rollover (expiry real: `club_id = NULL`, `wage = 0`; decremento implícito via `contract_end - season`) + um fluxo mínimo de renovação (engine `evaluateRenewal` + UI no detalhe do jogador).

---

## 4. Architecture & components

Tudo em `engine/` é puro (sem React/Expo/SQL); a persistência fica nas queries e nos screens, seguindo a convenção do projeto.

### Novos módulos (engine puro)

| Arquivo | Responsabilidade | Interface |
|---|---|---|
| `src/engine/transfer/contract-renewal.ts` (novo) | Decidir se o jogador aceita uma proposta de renovação e qual contraproposta de salário/anos pede | `evaluateRenewal(input: RenewalInput): RenewalResult` onde `RenewalInput = { playerAge: number; playerOverall: number; effectivePotential: number; currentWage: number; offeredWage: number; offeredYears: number; contractYearsLeft: number; clubReputation: number }` e `RenewalResult = { decision: 'accept' \| 'reject' \| 'counter'; counterWage?: number; counterYears?: number }` |
| `src/engine/finance/affordability.ts` (novo) | Gates puros de acessibilidade reusados por todos os caminhos de compra/assinatura | `canAffordTransfer(buyerBudget: number, fee: number, minFloor?: number): boolean` e `canAffordWage(currentWageBill: number, wageBudget: number, addedWage: number): boolean` |
| `src/engine/finance/prize-money.ts` (novo) | Calcular premiação por desempenho (posição na liga, título/vice de copa/CL) e fator de bilheteria por competição | `calculateLeaguePrize(input: { divisionLevel: number; finalPosition: number; numTeams: number }): number`; `calculateCupPrize(input: { competitionType: 'cup' \| 'champions_league'; result: 'champion' \| 'runner_up' \| 'participant' }): number`; `gateReceiptMultiplier(competitionType: 'league' \| 'cup' \| 'champions_league'): number` |

### Módulos alterados

| Arquivo | Mudança | Mantém pureza? |
|---|---|---|
| `src/engine/transfer/market-value.ts` | Sem mudança de assinatura. Já está correto e puro; passa a ser **chamado** no rollover. | Sim |
| `src/engine/transfer/offer-processor.ts` | `executeAcceptedTransfer`: (a) para `offerType === 'loan'`, **não** sobrescrever `players.wage` — em vez disso gravar `wageOffered` na coluna nova `loan_wage` e preservar `wage` original; (b) gate de acessibilidade antes do `UPDATE clubs SET budget` (rejeita se `fee > buyerBudget` no caminho AI-vendedor-aceita). Em `processPendingOffers`, passar `buyerBudget` ao avaliar o lance humano e pular execução se inacessível (devolve offer a `rejected`). | Não-puro já (faz SQL); só estende |
| `src/engine/transfer/loan-returns.ts` | Ao retornar o empréstimo, restaurar `wage` (já preservado no clube-pai, então nenhuma escrita de wage é necessária além de limpar `loan_wage = NULL`). | Igual |
| `src/engine/transfer/free-agent-signing.ts` | Após checar `budget < wageOffered * 4` (linha 61), adicionar gate `canAffordWage(currentWageBill, wageBudget, wageOffered)` → recusa com motivo "Wage budget exceeded". | Igual |
| `src/engine/finance/finance-engine.ts` | `calculateWeeklyIncome`: aceitar `competitionType` opcional e multiplicar `ticket` por `gateReceiptMultiplier`. Default `'league'` (multiplicador 1.0) preserva saves antigos e o comportamento atual. | Sim |
| `src/engine/history/season-archiver.ts` | `archiveLeague`/`archiveKnockout` passam a **retornar** uma lista de `PrizeAward { clubId; amount; description }` (puro: só calcula via `prize-money.ts`); a escrita de `addFinanceEntry`/`updateClubBudget` é feita pelo chamador no rollover. | Sim (cálculo); escrita no caller |
| `src/database/queries/players.ts` | `getPlayersByClub` ganha guarda defensiva `AND is_free_agent = 0`; novo helper `updatePlayerContract(db, playerId, wage, contractEnd)`; `getPlayersByClub`/row mapper expõem `loanWage`. | N/A (query layer) |
| `src/screens/EndOfSeasonScreen.tsx` | Pipeline de rollover ganha 3 passos: (1) expiry correto (`club_id=NULL, wage=0`); (2) recálculo de `market_value` para **todos** os jogadores em clube; (3) distribuição de premiação (lê retorno do archiver e credita budget + grava `addFinanceEntry` type `'prize'`). | N/A (screen) |
| `src/engine/game-loop.ts` | Passo 4: aplicar piso/rastreio de dívida — após `updateClubBudget`, se `updatedBudget < 0` incrementar `clubs.debt_weeks`, senão zerar; passar `competitionType` do fixture jogado ao `calculateWeeklyIncome`. | N/A (loop) |
| `src/types/finance.ts` | Adicionar `'prize'` ao union `FinanceType`. | Sim |

### Nova UI (mínima)

| Arquivo | Responsabilidade |
|---|---|
| `src/screens/squad/PlayerDetailScreen.tsx` (ou componente irmão) | Botão "Renovar contrato" → modal com sliders de salário/anos → chama `evaluateRenewal`; em `accept`/aceite de counter, persiste via `updatePlayerContract`. Strings via `src/i18n` (`t()`), chaves novas em `pt.ts`/`en.ts`. |

---

## 5. Data flow

**Valor de mercado (rollover):** `EndOfSeasonScreen.handleContinue` → para cada jogador com `club_id IS NOT NULL OR is_free_agent = 1` computa `overall` (média dos atributos, já disponível na recalc de potencial existente nas linhas 367-393), idade já incrementada, `effective_potential` já atualizado, `contractYearsLeft = contract_end - newSeason` → `calculateMarketValue(...)` → `UPDATE players SET market_value = ?`. Acontece **depois** do age++ e da recalc de potencial para usar valores frescos.

**Contrato/expiry (rollover):** o `UPDATE` de expiry vira `UPDATE players SET is_free_agent = 1, club_id = NULL, wage = 0 WHERE contract_end <= ? AND club_id IS NOT NULL`. `returnExpiredLoans` roda **antes** do expiry (loan de jogador com contrato expirando volta e só então pode virar livre). Decremento de contrato é implícito: `contractYearsLeft` é sempre derivado de `contract_end - currentSeason`, então não há coluna a decrementar — apenas garantimos que o expiry de fato libere.

**Renovação (in-season):** tela do jogador → `evaluateRenewal` (puro) → se `accept` ou jogador aceita counter → `updatePlayerContract(db, playerId, agreedWage, newSeason + agreedYears)` → `addFinanceEntry` opcional de bônus de assinatura. Gate `canAffordWage` antes de confirmar.

**Empréstimo (offer→return):** ao executar loan, `wage` original do clube-pai fica intacto na coluna `players.wage`; a fração paga pelo clube tomador vai em `players.loan_wage`. O passe de finanças semanal (`game-loop.ts:577-606`) soma, para cada jogador do clube, `loan_wage` quando presente senão `wage` (jogadores cedidos a outro clube têm `club_id` do tomador, então o tomador paga `loan_wage`; o clube-pai não soma o jogador pois `club_id` mudou). Na volta (`returnExpiredLoans`), `club_id` volta ao pai e `loan_wage = NULL` → o pai volta a pagar `wage` cheio automaticamente.

**Premiação/bilheteria:** no rollover, `archiveSeason` (via `archiveLeague`/`archiveKnockout`) retorna `PrizeAward[]`; `EndOfSeasonScreen` itera creditando `updateClubBudget` + `addFinanceEntry('prize')`. Bilheteria: no loop semanal, o `competitionType` do `playerFixture` jogado escala `income.ticket` (copa/CL pagam mais por jogo em casa).

**Dívida → demissão:** `game-loop` mantém `clubs.debt_weeks`. `board-stakes` (sibling) lê `debt_weeks` no fim de temporada como entrada extra na avaliação de trust/demissão. Este epic **só produz o sinal**; a rota de game-over é de `board-stakes`.

---

## 6. Schema changes

Migração leve e idempotente, seguindo o mecanismo de `save-isolation`/`db-hardening` (este epic **não** cria framework próprio — adiciona `ALTER TABLE ... ADD COLUMN` idempotentes no bloco de migração de `database-store.ts`).

| Tabela | Coluna | Tipo | Default | Justificativa |
|---|---|---|---|---|
| `players` | `loan_wage` | `INTEGER` | `NULL` | Fração paga pelo clube tomador durante empréstimo; preserva `wage` original do clube-pai (corrige gap 5). |
| `clubs` | `debt_weeks` | `INTEGER NOT NULL` | `0` | Semanas consecutivas com `budget < 0`; sinal para `board-stakes` (gap 2). |

`FinanceType` ganha `'prize'` (mudança de tipo TS, não de schema — `club_finances.type` é `TEXT` livre).

**Não** precisamos de coluna de renovação nem de `contract_end` decrementado (derivado). Premiação não precisa de tabela — credita budget + grava `club_finances`.

> Coordenação: se `save-isolation` já estiver adicionando colunas a `players`/`clubs`, estas duas entram no mesmo passe de migração. A ordem de `ALTER` é irrelevante (colunas independentes).

---

## 7. Error handling & edge cases

- **Loan de jogador cujo contrato expira durante o empréstimo:** `returnExpiredLoans` roda antes do expiry; jogador volta ao pai e só então é avaliado para free agency. Se `contract_end <= season` no pai, vira livre com `club_id=NULL, wage=0` (sem `loan_wage` órfão pois foi limpo).
- **Recálculo de valor com `effective_potential < overall`:** `calculateMarketValue` já usa `Math.max(0, potential - overall)`; sem regressão.
- **Compra inacessível no caminho AI-vendedor-aceita:** gate devolve a offer a `rejected` + `blockClubFromPlayer` (evita re-bid imediato), espelhando o caminho de counter já existente (`offer-processor.ts:146-151`).
- **`wage_budget` legado igual a 0:** trate `wageBudget <= 0` como "sem teto" (gate passa) para não travar saves antigos cujo seed não populou o campo de forma sensata; o seed atual popula `wage_budget` (`schema.ts:58` NOT NULL), então em jogos novos o gate é real.
- **Saves antigos sem `loan_wage`/`debt_weeks`:** migração idempotente cria com default; cálculo de wage usa `loan_wage ?? wage`.
- **Premiação dupla (idempotência):** `addFinanceEntry('prize')` no rollover roda uma vez por temporada (gate pela transição `isSeasonEnd`); usar `INSERT OR IGNORE`-equivalente não se aplica a `club_finances` (autoincrement) — a guarda é o ponto único de chamada no rollover, já protegido por `boardProcessed`/transição de temporada existente.
- **`debt_weeks` em clube que volta ao positivo:** zera imediatamente (não acumula histórico) — `board-stakes` quer "dívida prolongada atual", não total histórico.
- **Renovação acima do teto salarial:** `canAffordWage` bloqueia com motivo i18n; UI mostra erro, não persiste.

---

## 8. Testing strategy

SQLite real em memória (`better-sqlite3`), nunca mock. TDD obrigatório (toca `engine/database`).

### Unit (engine puro)

- `contract-renewal.test.ts`: jovem com alto potencial e salário oferecido baixo → `counter` com `counterWage` maior; veterano com salário generoso → `accept`; salário muito abaixo do esperado → `reject`. Determinístico.
- `affordability.test.ts`: `canAffordTransfer(100, 150)` → false; `canAffordTransfer(150, 100)` → true; `canAffordWage(currentBill, wageBudget, added)` em limites exatos; `wageBudget <= 0` → sempre true.
- `prize-money.test.ts`: campeão da div 1 > vice; campeão de CL > campeão de copa; posição 1 > posição 10 na liga; `gateReceiptMultiplier('champions_league') > gateReceiptMultiplier('league')`.
- `market-value`: teste existente continua verde (sem mudança de assinatura).

### Integração (SQLite real)

- **Recálculo de valor:** seed jogador 19 anos overall 60 pot 90 → roda o passe de rollover → `market_value` sobe vs seed; jogador 34 anos contrato 1 ano → valor cai. Asserir `UPDATE` real na tabela.
- **Expiry de contrato:** jogador com `contract_end = endedSeason` em clube → após rollover: `club_id IS NULL`, `wage = 0`, `is_free_agent = 1`; `getPlayersByClub(parentClub)` **não** o retorna; `getFreeAgents()` o retorna. (Regressão direta do gap 3.)
- **Wage bleed após expiry:** somar wages do clube antes/depois do expiry → cai pelo wage do expirado (não segue pagando).
- **Loan wage split + restore:** clube A empresta jogador (wage 1000) a B com share 0.4 → durante o loan: `players.wage = 1000` intacto, `players.loan_wage = 400`, finanças de B somam 400 e de A somam 0 pelo jogador; após `returnExpiredLoans`: `club_id = A`, `loan_wage = NULL`, finanças de A voltam a somar 1000. (Regressão do gap 5.)
- **Afford gate na compra:** humano com budget 50 lança 100 num jogador AI cujo clube aceitaria → offer termina `rejected`, budget inalterado, clube não recebe. (Regressão do gap 2.)
- **Wage budget enforcement:** `signFreeAgent` com salário que estoura `wage_budget` → `{ success: false, reason: ... }`, jogador não muda de clube. (Regressão do gap 7.)
- **Prize money:** após arquivar uma liga, o campeão tem `+prize` no budget e uma linha `club_finances` type `'prize'`. Vice recebe menos que campeão.
- **Debt tracking:** clube com budget negativo por N semanas → `clubs.debt_weeks === N`; ao voltar positivo → zera.
- **Renovação:** `evaluateRenewal` aceita → `updatePlayerContract` move `contract_end` e `wage`; gate de wage budget barra renovação inacessível.

### Parity / type-check

- `npx tsc --noEmit` limpo; chaves novas de i18n em paridade `pt`/`en` (o `parity.test.ts` existente cobre).

---

## 9. Dependencies & sequencing

- **`save-isolation` (deve aterrissar antes ou junto):** dono do mecanismo de migração idempotente em `database-store.ts` e do `save_id` nas world tables. As colunas `players.loan_wage` e `clubs.debt_weeks` entram no mesmo passe. Se o recálculo de valor / premiação precisar escopar por `save_id`, segue o padrão de escopo que `save-isolation` definir nas queries — **não** inventamos escopo próprio.
- **`db-hardening` (paralelo/depois):** dono de índices, wrapping transacional e FK on em teste. O rollover deste epic (expiry + valor + premiação) é um bom candidato a ser envolvido na transação de rollover que `db-hardening` provê; aqui assumimos que a escrita em lote roda dentro dessa transação quando existir.
- **`board-stakes` (consumidor, depois):** lê `clubs.debt_weeks` como input extra na avaliação de trust/demissão e implementa a rota de game-over por dívida prolongada. Este epic só **produz** `debt_weeks`; não implementa demissão nem tela de game-over.
- **`ai-world-alive` (coordena):** dono de aplicar finanças a **todos** os clubes (hoje `advanceWeek` é código morto). Nosso recálculo de valor e premiação já rodam para todos os clubes no rollover; a cobrança de salário semanal multi-clube é de `ai-world-alive`. A premiação que distribuímos credita o budget dos clubes AI — coordenar para não dupla-contar.
- **`competitions-real` (coordena):** dono da progressão de mata-mata (rounds ≥2, final real da copa/CL). A premiação de copa/CL deste epic depende de `archiveKnockout` identificar um **campeão real** — enquanto `competitions-real` não aterrissar, a premiação de copa usa o "campeão" disponível (round mais alto existente) e fica subdimensionada, mas o cálculo de liga já é correto. Sequenciar premiação de copa **depois** de `competitions-real` para valor pleno.

---

## 10. Out of scope

- **Demissão / game-over por dívida** — pertence a `board-stakes`; aqui só o sinal `debt_weeks`.
- **Finanças semanais multi-clube (salários da AI)** — pertence a `ai-world-alive`; este epic adiciona apenas valor/contrato/empréstimo/premiação.
- **Progressão de mata-mata e campeão real de copa/CL** — `competitions-real`; consumimos o resultado.
- **Juros sobre dívida / overdraft modelado / venda forçada automática** — fora de v0.1; só piso + sinal de dívida.
- **Cláusulas de contrato avançadas** (bônus de gol, cláusula de rescisão, sell-on) — pós-v0.1; renovação cobre só salário + anos.
- **Recálculo de valor intra-temporada por swing de rating** — adiado; rollover é suficiente.
- **UI rica de negociação de contrato** (agentes, demandas múltiplas) — só modal mínimo de salário/anos.

---

## 11. Spec self-review

- Placeholder scan: sem "TBD"/"TODO"/"???"; toda função/arquivo citado foi verificado no código (caminhos e linhas conferidos via Read/grep nesta sessão).
- Consistência interna: o fix de empréstimo usa `loan_wage` (coluna nova) em vez de sobrescrever `wage` — consistente entre §4 (offer-processor/loan-returns), §5 (data flow), §6 (schema) e §8 (teste de restore). Decremento de contrato é tratado como derivado (`contract_end - season`), explicitado em §5 para evitar ambiguidade com o título do gap "contract_end never decremented".
- Ambiguidade resolvida: `wage_budget` legado `<= 0` tratado como "sem teto" (§7) para não travar saves antigos; premiação idempotente via ponto único de chamada no rollover (§7).
- Pureza de engine: cálculos (`market-value`, `prize-money`, `affordability`, `contract-renewal`) são puros; escrita SQL fica em queries/screens/loop — conforme convenção. Confirmado que `archiver` retorna `PrizeAward[]` (puro) e o caller persiste.
- Dependências honestas: premiação de copa explicitamente subdimensionada até `competitions-real`; `debt_weeks` é só sinal para `board-stakes`; colunas entram no passe de `save-isolation`.
