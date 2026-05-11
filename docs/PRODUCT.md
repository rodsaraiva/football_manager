# PRODUCT.md — football-manager

> **DRAFT v4 — aguardando aprovação do PO humano (atualizado 2026-04-18).**
> Fonte de verdade do produto. Atualizado por perguntas ao usuário. Nunca inventado.
> Rodadas de descoberta concluídas: 5.

## One-liner

**FM Mobile idle** — a sensação de treinar e evoluir um time, sem as partes chatas.

## Visão

Simulador casual de gestão de futebol para mobile, inspirado no **modo Carreira do FIFA**, com sandbox aberto e camada narrativa leve pra imersão. O player é o dono/técnico do clube; **assistentes com personalidade própria delegam as tarefas chatas** pra que o foco fique em **decisões interessantes → rodar a partida → ver progressão**. Fãs hardcore podem mergulhar nos dados; casuais seguem as recomendações dos assistentes e avançam rápido.

## Público-alvo

- **Primário**: jogador casual mobile, abre o jogo em tempo ocioso/espera (transporte, fila, pausa), ~1x/dia por 30-60min.
- **Secundário**: fã hardcore de management (FM-style) que quer um equivalente leve no celular, com opção de ir a fundo quando quiser.

## Pilares (não-negociáveis)

1. **Sem paywall.** Progressão 100% gratuita.
2. **Ads sempre iniciados pelo player.** Nunca interstitial/banner involuntário.
3. **Sem progressão offline.** App fechado = jogo pausado.
4. **Assistentes cuidam das partes chatas, mas só *avisam*.** Decisão é sempre do player.
5. **Casual-first, hardcore-friendly.** Camada padrão é limpa; detalhe técnico fica a 1 clique.
6. **Progressão visível.** Troféus, divisões, overall subindo são óbvios e celebrados.
7. **Determinismo da simulação.** Mesma seed = mesmo resultado.
8. **Alertas diários mínimos.** O essencial na home; resto mora na aba Relatórios.
9. **Objetivos emergem do contexto.** Diretoria cobra coerente com a reputação atual do clube, não metas fixas genéricas.

---

## Onboarding e new game

**Fluxo híbrido** — escolhe rapidinho, aprende fazendo. Sem tutorial longo.

Passos do new game:
1. **Perfil de ambição** (guia efêmero) — filtra sugestões de clube:
   - **Continental** — clubes top de país, candidatos a Champions.
   - **Nacional** — clubes de 1ª divisão que disputam título.
   - **Acesso** — clubes de divisões inferiores lutando pela subida.
2. **Escolha do clube** dentre 3-5 sugestões do perfil.
3. **Primeiras partidas** e acesso a relatórios desde cedo.
4. **Tooltips contextuais** nos primeiros gestos importantes.

O **perfil de ambição é descartado** após a escolha do clube — não persiste no save. A partir daí, quem guia o jogo é a **reputação do clube**.

Identidade do técnico: **anônimo** em v0.1 (sem customização).

---

## Loop principal (casual diário)

1. Abrir app (~1x/dia, 30-60min).
2. Home minimalista: 0-1 alertas essenciais + eventual comentário espontâneo de assistente + atalho para Relatórios.
3. Ler relatórios dos assistentes conforme necessário.
4. Tomar 2-5 decisões (tática, transferência, treino, venda).
5. Rodar a(s) partida(s) da semana — **placar + resumo textual de 5-7 momentos**.
6. Avançar calendário, ver evolução/notícia.

---

## Reputação do clube

Mecânica central do produto. A reputação é o score que **guia os objetivos da diretoria** e afeta a atratividade do clube pra jogadores e staff.

- **Escala**: inteiro **1-100**, visível ao player.
- **Componentes**: saúde financeira e orçamento, qualidade do elenco, qualidade do staff (inclui assistentes), títulos conquistados, desempenho em temporadas.
- **Janela**: **todo o histórico** é considerado, balanceado entre **conquistas antigas e eventos recentes**. Peso exato e curva de decaimento: a calibrar durante implementação.
- **Dinâmica**: sobe com títulos, promoções e finanças sólidas; desce com rebaixamento, crise, quedas consecutivas.
- Times da IA também têm reputação — afeta competitividade e atratividade.

### Objetivos da diretoria

- Derivados da reputação via **templates curados por faixa** (ex: faixa 70-85 escolhe entre 3 metas possíveis compatíveis).
- Apresentados ao player no início de cada temporada.

### Confiança da diretoria

Métrica derivada do cumprimento dos objetivos + variação de reputação na temporada:

- Se player **chegou perto** do objetivo e/ou **ganhou reputação** → confiança sobe.
- Se **ficou longe** do objetivo e/ou **perdeu reputação** → confiança cai.
- **Consequências de confiança baixa**: redução de orçamento ou **demissão do técnico**.
- Escala exata, limiares de consequência e visibilidade ao player: **perguntas abertas**.

---

## Os assistentes

Premissa: **personagens com personalidade**, idade e ciclo de vida próprios. Nomes e arquétipos são **gerados aleatoriamente por save**. Tom do relatório reflete o arquétipo.

### Os 3 de v0.1

| Assistente | Entrega |
|---|---|
| **Elenco** | Recomenda escalação, destaca plantel, aponta potencial de jovens, indica quem vender. |
| **Financeiro** | Estado do orçamento, salários acima/abaixo da curva, alertas de necessidade de venda. **Só avisa — nunca decide.** |
| **Sub-21** | Evolução dos jovens, quem merece rodagem, quem emprestar, quem promover. |

Em v0.1 o player **já começa com os 3 contratados**. Outros assistentes (olheiro, médico, diretor esportivo, coach de goleiros) chegam **pós-v0.1** — e habilitam relatórios técnicos adicionais que hoje não cabem nos 3 iniciais.

### Ciclo de vida

- **Idade**: cada assistente tem idade inicial.
- **Aposentadoria**: aleatória **entre 60 e 70 anos**. Com **aviso antecipado** ao player (ex: "Rogério se aposenta no fim da temporada").
- **Demissão pelo player**: a qualquer momento, **sem custo de rescisão**.
- **Substituição**: depois de aposentadoria ou demissão, player contrata novo no mercado.

### Qualidade

- Escala: **1 a 5 estrelas**.
- **Evolui com tempo de casa** — quanto mais tempo no clube, melhor a qualidade (até o teto de 5★). Curva exata a calibrar.
- Qualidade mais alta afeta o relatório em **todas as dimensões**:
  - Mais **detalhe/profundidade** de dados expostos.
  - Mais **precisão** nas recomendações.
  - **Antecipação** — detecta problemas/oportunidades antes.

### Economia

- **Salário mensal**, integrado ao relatório do financeiro.
- **Sem taxa de transferência** — custo único é o salário.

### Mercado de contratação

Quando o player precisa contratar (aposentadoria, demissão):

- Player vê **todas as informações** do candidato: idade, arquétipo, qualidade (estrelas), salário pedido, histórico de clubes, especialidade.
- **Candidato pode recusar** a oferta — provavelmente por reputação do clube muito baixa ou salário insuficiente (critérios a definir).
- Quantidade de candidatos disponíveis por vez: **pergunta aberta**.

### Personalidade

- **Arquétipos aleatórios** sorteados de um pool curado por save.
- Tom dos relatórios varia com o arquétipo.
- Lista exata de arquétipos, quantos no pool e se afetam conteúdo/viés da recomendação (ou só o texto): **pergunta aberta**.

### Presença na home

Além das abas de Relatórios, um assistente pode **comentar espontaneamente na home** de tempos em tempos (curto, de sabor) — sem interrupção, sem penalidade em ignorar.

---

## Aposentadoria de jogadores

Nova regra explícita em v0.1:

- **Janela**: entre **33 e 40 anos**.
- **Trigger**: **moral baixa** nessa janela → jogador anuncia aposentadoria no **fim da temporada**.
- **Aviso antecipado** ao player.
- Moral alta nessa faixa etária mantém o jogador ativo. Comportamento pós-40 com moral alta (forçado a aposentar? cap em 40?) — **pergunta aberta**.

---

## Tática e escalação

- Time começa com **escalação padrão** sugerida pelo assistente de elenco.
- Player **edita livremente**. Assistentes sugerem **jogadores, formação, tática** e **perfil de substituições**.
- Substituições durante o jogo: motor executa dentro do perfil escolhido pré-jogo.

### Perfil de substituições (sugerido pré-jogo)

- **Dar chances aos jovens** — usa substituições pra rodar elenco novo.
- **Muitas substituições** — testa combinações até achar os 11 ideais.
- **Poucas substituições** — mantém o titular em campo o máximo possível.

---

## Engine de partida

- **Motor rico existente** (xG, pressing, momentum, fadiga, confronto individual, GK real, home advantage) — **escondido por padrão**.
- **Casual vê**: placar + resumo textual de 5-7 momentos-chave.
- **Hardcore vê**: detalhe completo via relatório pós-jogo expandido.

---

## Evolução visível

- **Jogador**: overall sobe com feedback visual (popup/glow). Títulos (promessa → titular → estrela → lenda) — escala exata a definir.
- **Time**: troféus, promoção de divisão, sequências marcantes.
- **Carreira do jogador no clube**: histórico individual, momentos, aposentadoria.

---

## Narrativa (inspiração FIFA CM, tom leve)

- **Objetivos da diretoria** (derivados da reputação via templates curados).
- **Arco de carreira do jogador** (do jovem à aposentadoria).
- **Manchetes automáticas** no feed após eventos relevantes.
- **Comentários espontâneos de assistentes** na home (curtos, raros).
- **Press conferences**: opcionais e raras, só em momentos-chave. Sem penalidade em pular.
- _Nice-to-have_: hall da fama.

---

## Eventos de temporada

- **Pré-temporada**: amistosos escaláveis. Assistentes sugerem testes ousados (jogadores inesperados, formações alternativas) e depois avaliam desempenho.
- **Fim de temporada**: modal curto com números principais (campeão, top scorer, promoções, rebaixamentos).

---

## Relatórios — a aba central

- **Todos os relatórios F1-F7** atuais e futuros são **entregues via assistentes**.
- Alguns cabem nos 3 iniciais; outros só aparecem com assistentes pós-v0.1 (olheiro etc).
- **Organização**: abas por assistente.
- **Home** mostra no máximo 1 alerta essencial + eventual comentário.

---

## Saves

- Até **5 slots** de save por instalação.
- Nomeação, autosave, resumo visual de cada slot: **perguntas abertas**.

---

## Retenção

- **Jogo infinito.** Sem fim definido, sem aposentadoria forçada do técnico, sem prestige/NG+.
- Demissão por confiança baixa da diretoria **pode** ser cenário de perda (a definir se é fim do save ou apenas perda de cargo).
- **Conquistas apenas dentro do save** — sem cross-save; sem Google Play Games / Game Center em v0.1.

---

## Escopo por fase

### v0.1 — Lançamento mobile (~3 meses)

**Manter sem corte** (já implementado):
- Engine completo (UI casual na frente).
- Suite F1-F7 de relatórios (integrados via assistentes).
- Youth / sub-21.
- 5 ligas com divisões inferiores.
- Transfer listings (AI + player).
- Finanças detalhadas.
- News / season recap.
- Facility upgrades.

**Entregar (faltam pra v0.1)**:
- [ ] **Reputação do clube** (1-100) + objetivos por templates curados + **confiança da diretoria** (com efeitos de orçamento/demissão).
- [ ] Camada dos 3 assistentes com personalidades, idade, salário, qualidade 1-5★ (evolui com tempo de casa), ciclo de vida (aposentadoria 60-70 com aviso).
- [ ] Mercado de contratação de assistentes (info completa + candidato pode recusar).
- [ ] **Aposentadoria de jogadores** (33-40 com moral baixa → fim de temporada + aviso).
- [ ] Arquétipos aleatórios (pool curado).
- [ ] Comentários espontâneos de assistente na home.
- [ ] Perfis de ambição no new game (Continental / Nacional / Acesso) — guia descartável.
- [ ] Onboarding híbrido (escolha rápida + tooltips contextuais).
- [ ] Staff com impacto real no jogo.
- [ ] Evolução clara (UI de overall, troféus, títulos de jogador).
- [ ] UI imersiva (sair do dark-mode padrão).
- [ ] Arco de carreira do jogador.
- [ ] Amistosos de pré-temporada escaláveis + avaliação dos assistentes.
- [ ] Home minimalista com alertas essenciais + aba Relatórios por assistente.
- [ ] Perfis de substituições pré-jogo (jovens / muitas / poucas).
- [ ] Até 5 saves slots.
- [ ] Ads opt-in (moral boost, redução de lesão).
- [ ] Bilíngue pt-BR / EN.
- [ ] Build mobile (Expo → EAS → iOS/Android), orientação **apenas vertical**.
- [ ] **Sem áudio** em v0.1.

### v0.2 — Pós-lançamento

- Novos assistentes (olheiro, médico, diretor esportivo, coach de goleiros) + relatórios destravados.
- Áudio (música + SFX).
- Hall da fama.
- Mais ligas (Brasil, copas internacionais) — a confirmar.
- Notificações push (respeitando "sem progressão offline").
- Cloud save (após abrir GitHub).

### Futuro (não priorizado)

- Multiplayer / ligas entre amigos.
- Desktop (Steam).
- Integração com Google Play Games / Game Center.
- **Fora de escopo permanente**: dados reais (licenciamento). Jogadores/clubes fictícios.

---

## Monetização

- **Sem paywall. Sem IAP.**
- **Apenas ads opt-in**, sempre iniciados pelo player:

| Aceito | Exemplo |
|---|---|
| ✅ | Boost de moral do elenco (+5 geral, ou +30 individual) |
| ✅ | Reduzir 80% do tempo de lesão de um jogador |
| ✅ | (outros no mesmo padrão) |

| Recusado | Motivo |
|---|---|
| ❌ | Ad interstitial entre partidas (involuntário) |
| ❌ | Banner fixo na home |

## Distribuição

- **v0.1**: lojas mobile (iOS App Store + Google Play).
- **Repositório**: privado até v0.1 estabilizar. Depois → GitHub.
- **Cloud save**: pós-v0.1.

## Localização

- **Idiomas**: pt-BR e EN.
- Estado atual: misto/inconsistente. v0.1 resolve.

---

## Decisões tomadas (datadas)

### 2026-04-18 — Rodada 1
- Identidade: **mobile-first idle casual**, inspiração FIFA Career Mode. Descartada direção FM hardcore.
- **Sem progressão offline**. **3 assistentes** como entrada principal em v0.1.
- Engine mantido, escondido por padrão. Nenhuma feature existente cortada.
- **Jogadores/clubes fictícios** permanente. Ads opt-in como único canal.

### 2026-04-18 — Rodada 2
- Sessão-alvo: ~1x/dia, 30-60min. Sandbox aberto com imersão leve.
- Ads aceitos: moral boost, redução de lesão. Recusados: interstitial, banner fixo.

### 2026-04-18 — Rodada 3
- Onboarding híbrido com tooltips + partidas desde cedo.
- Perfis de ambição (Continental / Nacional / Acesso) como guia efêmero.
- Técnico anônimo em v0.1. Assistentes com personalidades (nomes por save).
- Financeiro só avisa. Escalação padrão + sugestões. Home minimalista.
- Press conferences raras e opcionais. Pré-temporada escalável.
- Fim de temporada: modal curto. Jogo infinito, sem prestige.
- Sem conquistas cross-save. Sem áudio em v0.1. Só retrato.

### 2026-04-18 — Rodada 4
- **Apenas 3 assistentes em v0.1.** Outros pós-v0.1.
- Arquétipos aleatórios (pool curado). Assistente tem idade e pode se aposentar.
- Salário mensal no financeiro. Qualidade afeta relatório. Demissão sem custo.
- Perfil de ambição descartável após new game.
- **Reputação do clube** como motor dos objetivos da diretoria.
- F1-F7 todos integrados aos assistentes (nenhum em aba hardcore separada).
- Comentários espontâneos de assistente na home.
- Aba Relatórios por assistente.
- Perfil de substituições pré-jogo (jovens / muitas / poucas).
- Até 5 saves por instalação.

### 2026-04-18 — Rodada 5
- **Reputação**: inteiro 1-100, visível ao player.
- **Objetivos da diretoria**: templates curados por faixa.
- **Janela**: todo o histórico, balanceado recente vs antigo.
- **Confiança da diretoria**: métrica derivada (proximidade do objetivo + variação de reputação) com efeito em **orçamento** e **demissão**.
- **Aposentadoria de jogadores**: 33-40 anos com **moral baixa** → fim da temporada + aviso antecipado.
- **Aposentadoria de assistentes**: aleatório entre **60 e 70** + aviso antecipado.
- **Qualidade do assistente**: 1-5 estrelas, **evolui com tempo de casa**, afeta **detalhe + precisão + antecipação**.
- **Mercado de contratação**: player vê todas as infos; assistente pode recusar; **sem taxa de transferência**, só salário.

---

## Perguntas abertas

### Reputação e diretoria (detalhes de calibração)
1. **Peso relativo** dos componentes (budget, elenco, staff, títulos, desempenho).
2. **Curva de decaimento** de eventos antigos (quanto pesa um título de 10 temporadas atrás vs um recente).
3. **Inicialização** da reputação em clubes fictícios no começo do save.
4. **Confiança da diretoria**: escala visível ao player? Limiares exatos pra redução de orçamento vs demissão?
5. **Demissão do técnico**: fim do save ou apenas perde o cargo e migra pra outro clube?

### Assistentes (detalhes)
6. **Tempo de casa para subir estrela** — quantas temporadas por estrela? Tem teto?
7. **Aviso antecipado** de aposentadoria: com quanto tempo? (fim da temporada anterior? X partidas?)
8. **Arquétipos**: quantos no pool? Afetam **só o tom** ou também **viés da recomendação**?
9. **Mercado**: quantos candidatos disponíveis por vez? Rotação? Gera sob demanda?
10. **Critérios de recusa** do candidato (reputação mínima? multiplicador de salário?).

### Aposentadoria de jogadores
11. **Threshold de moral baixa** que dispara aposentadoria entre 33-40.
12. **Pós-40 com moral alta**: forçado a aposentar? Cap em 40/42?
13. **Aviso antecipado** ao player: quanto antes?

### Saves
14. Player pode **nomear** o save?
15. Autosave ao avançar semana, ou save manual?
16. Resumo visual de cada slot (clube, temporada, troféu recente)?

### Produto (menores)
17. **F1-F7**: mapeamento explícito por assistente (quais cabem em quem).
18. **Perfis de substituição**: esses 3 são finais ou abrir mais?
19. **Comentário na home**: frequência média? Pode silenciar?

### UX e identidade
20. **Nome/branding** (hoje "football-manager" provisório).
21. **Referências visuais** para a UI imersiva.
22. **Feedback sem áudio**: eventos importantes ganham vibração/haptic?
23. **Troca de idioma**: settings, auto-detect, modal inicial?
24. **Catálogo completo de ads opt-in** — além de moral/lesão.
25. **Escala de títulos do jogador** (promessa → titular → estrela → lenda ou outra).

### Técnica
26. **Notificações push** em v0.2: alertas sem progressão ou nada?
