# Design (Épico): Dados reais licenciados

**Epic:** l9-licensed-data · **Data:** 2026-06-20 · **Horizonte:** longo · **Stack:** Expo 54 / RN 0.81 / TS 5.9

**Goal:** Documentar — sem recomendar implementação — o que mudaria tecnicamente para substituir clubes/jogadores fictícios por dados reais licenciados, e por que isso está **fora de escopo permanente** até deliberação explícita do PO.

> **Status: PARADO POR DECISÃO DE NEGÓCIO.** Este spec **não** propõe um plano de execução. Ele existe para registrar honestamente o custo técnico, o trade-off de imersão vs. licenciamento/privacidade/custo, e a fronteira clara entre o que já é "real-flavored" (nomes plausíveis, cores plausíveis) e o que seria de fato licenciado. Nenhuma fase abaixo deve ser iniciada sem reversão escrita da decisão registrada em `docs/PRODUCT.md`.

---

## 1. Visão & valor

A fantasia do gênero (FIFA Career, Football Manager) se ancora em **reconhecimento**: gerir "o Liverpool de verdade", contratar "o craque de verdade". Dados reais maximizam imersão e marketing (screenshots reconhecíveis, busca orgânica por nomes de clubes).

Contra isso pesa a decisão de produto já tomada e datada: **jogadores/clubes fictícios são permanentes** (`docs/PRODUCT.md:278`, `docs/PRODUCT.md:317`). O jogo é mobile-first casual, monetizado **apenas por ads opt-in, sem IAP** (`docs/PRODUCT.md:284`). Licenciamento de marcas esportivas é caro, recorrente e exige relação jurídica com ligas/clubes/sindicatos de atletas — incompatível com o modelo atual.

O valor real deste documento é **estratégico-defensivo**: dar ao PO uma base honesta para reafirmar a decisão (ou, num cenário futuro de publisher/financiamento, reabri-la com olhos abertos sobre o custo de engenharia).

## 2. Estado atual na base (fundação que já existe)

O mundo é 100% gerado por seed determinístico — não há nada "real", mas a arquitetura já é "data-driven" e separável:

- **Catálogo de clubes/ligas** é dado estático editável em `scripts/data/leagues.ts:21` (`LEAGUES: LeagueDef[]`). Cada `TeamDef` (`scripts/data/leagues.ts:1`) já carrega `name`, `shortName`, `reputation`, `stadiumName`, `stadiumCapacity`, `primaryColor`, `secondaryColor`. Os nomes são **deliberadamente fictícios mas plausíveis** ("Manchester Red", "Liverpool Reds" — `scripts/data/leagues.ts:31-33`). Ou seja: o ponto de injeção de identidade de clube **já existe e é um único arquivo**.
- **Nomes de jogadores/staff** vêm de pools por nacionalidade: `FIRST_NAMES`/`LAST_NAMES`/`NATIONALITIES_BY_COUNTRY` em `scripts/data/names.ts:1,29,62`, combinados em `generatePlayerName` (`scripts/generate-seed-data.ts:363`). Não há identidade de jogador individual real — apenas combinatória aleatória semeada.
- **Atributos/valores/idades** são **derivados proceduralmente** da `reputation` do clube (`targetOverallForClub` — `scripts/generate-seed-data.ts:189`; `generateAttributes` — `:201`; `computeMarketValue` — `:334`; `computeWage` — `:342`; `computePotential` — `:349`). Não existe noção de "rating real" de um jogador específico; tudo é função(reputação, posição, idade, RNG).
- **Determinismo:** toda a geração usa `SeededRng` (`scripts/generate-seed-data.ts:3,374`). Mesma seed → mesmo mundo. Qualquer pipeline de dados reais teria que preservar isso (ver Riscos).
- **Schema das entidades de identidade:** `clubs` (`src/database/schema.ts:57`) e `players` (`src/database/schema.ts:78`) — colunas `name`, `short_name`, `nationality`, `primary_color`, `secondary_color`, `stadium_name`. Não há colunas de "fonte do dado" nem de versão de elenco.
- **Loader save-isolated:** `seedDatabase`/`seedReferenceTables`/`seedWorldForSave` em `src/database/seed.ts:9,59,71`. O mundo é clonado por save com offset de IDs via `saveOffset(saveId)` sobre `SAVE_ID_STRIDE = 100_000_000` (`src/database/constants.ts:7,9`). Consumido em runtime por `src/screens/NewGameScreen.tsx`.

**Conclusão de fundação:** a base já isola "identidade de marca" (nomes/cores/estádios em 2 arquivos de dados) de "simulação" (atributos derivados). Trocar identidade é tecnicamente **localizado**; trocar atributos por ratings reais é que seria invasivo. Isso é exatamente o que torna a decisão de negócio — não a técnica — o gargalo.

## 3. Decomposição em sub-épicos (hipotéticos, NÃO a executar)

1. **Camada de fonte de dados (`dataSource`):** marcar cada entidade como `fictional` vs `licensed`, sem misturar pools.
2. **Pipeline de ingestão:** importar dataset externo (clubes, elencos, ratings) → normalizar → validar → emitir `SeedData` compatível com `scripts/generate-seed-data.ts:111`.
3. **Mapa de identidade licenciada:** substituir `LEAGUES`/`names.ts` por catálogo real (clubes, estádios, escudos/cores oficiais, nomes de atletas).
4. **Ratings reais vs. derivados:** decidir se atributos passam a ser *dados* (importados) em vez de *função(reputação)* — mudança profunda no balanceamento.
5. **Atualização de elenco ("squad update"):** mecanismo de versão de dataset (transfer windows reais) e migração de saves existentes.
6. **Conformidade legal/privacidade:** likeness de atletas, dados pessoais (idade/nacionalidade de pessoa real), takedown, expiração de licença.
7. **Build/segregação de release:** variante "licenciada" só publicável sob contrato; CI que impede vazar dataset proprietário.

Cada um é independente, mas (4) e (5) reescrevem o coração do balanceamento e do ciclo de vida do save.

## 4. Opções de arquitetura (com trade-offs)

**Opção A — Status quo (RECOMENDADA): fictício permanente.**
Nada muda. `LEAGUES`/`names.ts` seguem como fonte única, atributos seguem derivados de reputação. Custo zero, risco legal zero, determinismo intacto.
*Trade-off:* menor reconhecimento/imersão. Mitigável com nomes/cores ainda mais plausíveis (já é o caso) — **dentro de** A, sem cruzar a fronteira de licenciamento.

**Opção B — "Identidade real, simulação fictícia" (camada fina, hipotética).**
Trocar **apenas** o catálogo de identidade (nomes/cores/estádios de clubes e nomes de jogadores) por dados reais, mantendo atributos derivados de `reputation`. Toca essencialmente `scripts/data/leagues.ts` + `scripts/data/names.ts` + uma flag `dataSource` no schema.
*Trade-off:* imersão alta com mudança técnica pequena, MAS é exatamente o uso que **mais** atrai disputa de licenciamento (usar nome+escudo de clube/atleta real é o que as ligas cobram). Tecnicamente barato, juridicamente o pior dos mundos sem contrato.

**Opção C — "Dataset real completo + ingestão" (pesada, hipotética).**
Pipeline de importação de clubes + elencos + ratings reais, com versão de dataset e squad updates. Substitui boa parte de `generate-seed-data.ts`.
*Trade-off:* máxima fidelidade; custo de engenharia alto (ingestão, validação, migração de saves, rebalanceamento de toda a economia que hoje deriva de `reputation`), custo recorrente de licença e de manutenção (janelas de transferência), e maior superfície de privacidade.

**Recomendação:** **Opção A.** Reafirma a decisão de `docs/PRODUCT.md`. B e C ficam documentadas apenas como referência caso o contexto de negócio mude (publisher/financiamento). Nada a implementar agora.

## 5. Pré-requisitos & dependências

Nenhum pré-requisito técnico — o bloqueio é **de negócio**. Antes de qualquer linha de código deste épico, exige-se:

- **Reversão escrita** da decisão em `docs/PRODUCT.md:278,317` pelo PO.
- **Contrato de licenciamento** com liga/clubes/sindicato de atletas (likeness), incompatível com o modelo "sem IAP/ads opt-in" — exigiria revisão do modelo de monetização (`docs/PRODUCT.md:284`).
- **Avaliação jurídica de privacidade** (dados de pessoas reais: nome, idade, nacionalidade) e processo de takedown/expiração.
- Só então: dependência técnica do épico de geração de mundo (`generate-seed-data.ts`) e, para UI de "fonte/elenco", do kit do Design System (`docs/superpowers/specs/2026-06-20-design-system-premium-design.md`).

## 6. Faseamento (condicional à reversão; entregáveis hipotéticos)

> Nenhuma fase inicia sem o item de negócio da seção 5. Listado só para dimensionar esforço.

- **Fase 0 — Decisão de PO + jurídico.** Entregável: decisão datada revertendo `docs/PRODUCT.md` + parecer de licenciamento/privacidade. Sem código.
- **Fase 1 — Flag `dataSource` + segregação.** Coluna `data_source TEXT NOT NULL DEFAULT 'fictional'` em `clubs`/`players` (schema + loader). Entregável testável: teste de integração (better-sqlite3 real) garantindo que um mundo segue 100% `fictional` por padrão e que `SeededRng` produz o mesmo mundo de antes (determinismo preservado).
- **Fase 2 — Camada de catálogo licenciado (Opção B).** Fonte alternativa de `LEAGUES`/nomes atrás da flag, sem tocar atributos. Entregável: gerar `SeedData` "licenciado" com identidade real e atributos ainda derivados; teste de paridade de schema com `seed.ts`.
- **Fase 3 — Pipeline de ingestão + ratings reais (Opção C).** Importador externo → normalização → validação → `SeedData`. Entregável: dataset versionado + rebalanceamento da economia que hoje deriva de `reputation` (`computeWage`/`computeMarketValue`), com baselines de balanceamento revalidadas.
- **Fase 4 — Squad updates + migração de saves.** Versão de dataset e migração de saves antigos (`SAVE_ID_STRIDE`). Entregável: migração idempotente testada.
- **Fase 5 — Build segregado + compliance.** Variante de release condicionada a contrato; CI impedindo vazamento do dataset proprietário.

## 7. Schema/infra changes (alto nível)

- **`clubs`/`players`** (`src/database/schema.ts:57,78`): adicionar `data_source TEXT NOT NULL DEFAULT 'fictional'` (+ opcional `external_ref TEXT` para id da fonte e `dataset_version`). Toda nova coluna entra em `schema.ts` **e** nos `INSERT` correspondentes de `src/database/seed.ts` (`seedDatabase`, `seedWorldForSave`, `generateSeedSQL`), preservando o padrão save-isolated com `saveOffset(saveId)` / `SAVE_ID_STRIDE`.
- **Migração:** entrada em `src/database/migration.ts` para saves existentes (default `'fictional'`).
- **Fonte de dados:** novo módulo de ingestão fora de `src/engine` (engine permanece puro). Dataset licenciado **nunca** versionado no repo aberto (segregar via `.gitignore` + build privado).
- **Determinismo:** ingestão deve ser pura/idempotente; zero `Math.random`/`Date.now`/`new Date()`/`ORDER BY RANDOM`. Onde houver escolha aleatória, usar `SeededRng` (`src/engine/rng`).

## 8. Riscos & decisões abertas

- **Legal/likeness (crítico):** usar nome+escudo de clube e nome de atleta reais sem contrato é o caminho de disputa mais provável; é o ponto exato que ligas monetizam. Bloqueante.
- **Privacidade (LGPD/GDPR):** dados de pessoas reais (atletas, inclusive de base/menores de idade) exigem base legal, retenção e takedown.
- **Custo recorrente:** licença + manutenção de squad updates é despesa contínua, sem receita compatível no modelo atual (sem IAP).
- **Rebalanceamento:** hoje a economia inteira deriva de `reputation` (`generate-seed-data.ts:189,334,342`). Importar ratings reais quebra esses pressupostos e exige revalidar as baselines de balanceamento.
- **Determinismo de saves:** trocar a fonte muda o mundo de toda seed; saves antigos referenciam IDs do mundo fictício — migração não-trivial.
- **Decisões abertas (todas para o PO):** B vs C? ratings reais ou só identidade? como segregar o build licenciado? Nenhuma é técnica — todas dependem da Fase 0.

## 9. Não-objetivos / fora de escopo

- **Não implementar nada** deste épico enquanto a decisão de `docs/PRODUCT.md:278,317` não for revertida por escrito pelo PO.
- Não negociar/assumir licenças. Não importar datasets de terceiros (mesmo "gratuitos") sem parecer jurídico.
- Não confundir "nomes/cores plausíveis" (já existentes e permitidos) com "dados licenciados" (proibidos sem contrato).
- Não tocar no balanceamento atual nem no determinismo de seed por conta deste épico.
- Não criar UI de "selecionar elenco real" — não há fonte legal para alimentá-la.

## 10. Spec self-review

- **Honesto sobre o status:** sim — documento abre e fecha reafirmando "parado por decisão de negócio"; recomendação explícita é Opção A (status quo).
- **Aterrado em código real:** sim — `leagues.ts:1,21,31`, `names.ts:1,29,62`, `generate-seed-data.ts:189,201,334,342,349,363`, `schema.ts:57,78`, `seed.ts:9,59,71`, `constants.ts:7`, `PRODUCT.md:278,317,284`. Sem APIs inventadas.
- **Convenções respeitadas:** schema+seed em conjunto, save-isolation via `SAVE_ID_STRIDE`, determinismo `SeededRng`, engine puro, kit do Design System referenciado pelo nome de arquivo correto.
- **Sem placeholder/TBD:** confirmado.
- **Coerente com o brief:** curto e honesto; cobre pipeline, separação licenciado vs fictício, squad updates e o trade-off imersão × custo/privacidade/licenciamento; não recomenda implementar.
