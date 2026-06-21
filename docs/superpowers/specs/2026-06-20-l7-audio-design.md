# Design (Épico): Áudio (música ambiente + SFX de eventos)
**Epic:** l7-audio · **Data:** 2026-06-20 · **Horizonte:** longo · **Stack:** Expo 54 / RN 0.81 / TS 5.9
**Goal:** Dar voz ao jogo — trilha ambiente discreta e SFX pontuais de eventos (gol, apito, troféu, transferência) — como **camada de feedback puramente de UI, sempre opcional**, sem tocar no determinismo do engine nem na regra "sem progressão offline".

## 1. Visão & valor

O football-manager hoje é mudo: PRODUCT.md o marca explicitamente como **"Sem áudio em v0.1"** (`docs/PRODUCT.md:262,330`) e o lista como item **v0.2 — "Áudio (música + SFX)"** (`docs/PRODUCT.md:267`). A fantasia que o áudio serve é a de **presença**: o casual abre o app, ouve a trilha de menu, escala o time, vê a partida resolver em resumo e — no instante do gol — recebe um SFX que transforma um número (`homeGoals++`) em **emoção**. O apito de início/fim dá ritmo à partida; o jingle de troféu coroa a temporada; o "ka-ching" de transferência fechada premia a negociação. É o mesmo papel que o FIFA Career Mode usa para fazer telas estáticas parecerem vivas.

O épico de Design System já reconheceu essa lacuna e a tampou **provisoriamente com haptics** ("D6 — Motion & polish", `2026-06-20-design-system-premium-design.md:160-173`), declarando áudio **fora de escopo daquela fase** ("Áudio/música — substituído por haptics nesta fase", linha 369). L7 é a continuação natural: os mesmos **pontos de micro-celebração** que o D6 mapeou (overall↑, troféu, transferência — linha 168) e os mesmos **toggles de Settings** que o D7 criou (reduce-motion, haptics — linha 185) são exatamente os ganchos onde o som pluga. Não inventamos pontos novos de feedback; sonorizamos os que já existem.

Princípio inegociável de produto: **áudio nunca é obrigatório**. PRODUCT.md pergunta abertamente "Feedback sem áudio: eventos importantes ganham vibração/haptic?" (`docs/PRODUCT.md:390`) — a resposta de D6 foi haptics; a de L7 é áudio **como camada paralela e opt-out**, jamais a única via de feedback. Acessibilidade e respeito ao contexto do jogador (no ônibus, em reunião) exigem mute trivial, ducking de mídia de fundo e default conservador de volume.

## 2. Estado atual na base (fundação aterrada em código)

**`expo-av` NÃO está instalado.** Não há nenhuma dependência de áudio em `package.json`. O épico introduz a primeira. (Nota técnica: nas versões recentes do SDK, `expo-av` está em descontinuação a favor de `expo-audio`; a decisão de pacote está na §4.)

**Os eventos a sonorizar já existem, tipados e determinísticos.** `MatchEventType` (`src/types/match.ts:1`) tem 14 tipos: `goal | assist | yellow | red | substitution | injury | penalty_scored | penalty_missed | free_kick_scored | free_kick_missed | shot_on_target | shot_off_target | save | penalty_shootout`. `MatchEvent` (`src/types/match.ts:17`) é `{ fixtureId, minute, type, playerId, secondaryPlayerId }`. Esses eventos são **produzidos pelo engine puro** (`simulateMatch` em `src/engine/simulation/match-engine.ts:517`, via `simulateFirstHalf` + `resumeSecondHalf`) e **persistidos somente para a partida do usuário** no `game-loop.ts:316-332` (via `addMatchEvent`). O componente que os renderiza no feed é `src/components/MatchEventItem.tsx` (hoje desenha emoji-glifo por tipo — `MatchEventItem.tsx:13-28`, conforme `2026-06-20-design-system-premium-design.md:19`). **Esse componente e o ponto de revelação de cada evento na timeline são o gancho de SFX in-match.**

**Não há eventos de "apito".** Início/fim de tempo não são `MatchEvent` — são transições de fluxo orquestradas em `src/engine/match-day/halftime.ts` (`halftimeSeed` linha 18, `UserHalftimeContext` linha 22) e na conclusão de `resumeSecondHalf`. O SFX de apito é disparado pela **camada de UI** nessas transições, não por um evento de dados.

**Settings já tem casa, criada pelo Design System.** D7 introduz `src/screens/SettingsScreen.tsx`, um `src/store/settings-store.ts` (Zustand) e persistência via key-value `app_settings` (`schema.ts:448-451`) usando `getSetting`/`setSetting` (`src/database/queries/settings.ts:3-13`) — **sem tabela nova** (`2026-06-20-design-system-premium-design.md:185,312`). `getSetting(db, key)` retorna `string | null`; `setSetting(db, key, value)` faz `INSERT OR REPLACE`. Chaves de áudio são aditivas nesse mesmo store key-value. As chaves de áudio são **globais** (não por `save_id`), espelhando `language` (`src/i18n/persistence.ts:8`) e as chaves de D7 (`reduce_motion`, `haptics`, `font_scale`).

**Haptics como precedente arquitetural.** D6 já resolveu o problema irmão — feedback de celebração que (a) respeita um toggle de Settings, (b) é no-op no web/indisponível, (c) não bloqueia input, (d) não toca no determinismo do engine (`2026-06-20-design-system-premium-design.md:169,171,173,323`). O subsistema de áudio **espelha exatamente** esse contrato: mesmos pontos de disparo, mesmo guard de plataforma, mesmo toggle pattern. Haptics e áudio coexistem (um jogador pode querer só vibração, só som, ambos, ou nada).

**Determinismo é sagrado.** Todo o engine roda em `SeededRng` (`src/engine/rng.ts`), zero `Math.random`/`Date.now` (`2026-06-20-design-system-premium-design.md:23`). **Áudio é 100% camada de apresentação** — não consome RNG, não persiste estado de jogo, não muda resultado. Mesma seed = mesma partida, com ou sem som ligado.

## 3. Decomposição em sub-épicos

- **L7.1 — Infra de áudio (pacote + AudioService).** Adicionar pacote de áudio ao `package.json`/`app.json`; criar `src/audio/audio-service.ts` (singleton de UI, fora de `engine/`) que carrega/descarrega/toca assets. Guard de plataforma e degradação graciosa.
- **L7.2 — Trilha ambiente (music bed) + ciclo de vida.** Loop de menu/gestão; play/pause atrelado a foco do app e à navegação; respeita "sem progressão offline" (música pausa em background, não simula nada).
- **L7.3 — Mixagem & ducking.** Buses separados (música vs SFX) com volumes independentes; ducking automático da música quando um SFX importante toca; respeito ao áudio de outros apps (`InterruptionMode`/mixWithOthers).
- **L7.4 — Biblioteca de SFX por evento.** Mapa `MatchEventType → asset` + SFX de fluxo (apito início/fim) e de celebração (troféu, transferência fechada, overall↑) reusando os ganchos D6.
- **L7.5 — Settings de áudio.** Seção "Áudio" na `SettingsScreen` (mute master, volume música, volume SFX); chaves novas em `app_settings`; integração ao `settings-store`.
- **L7.6 — Cabeamento nos pontos de feedback.** Plugar SFX in-match (revelação de evento em `MatchEventItem`/timeline), apitos (transições de `halftime.ts`/fim de jogo) e celebrações (mesmos call-sites de D6).
- **L7.7 — Acessibilidade & polimento.** Defaults conservadores, mute trivial, sem áudio bloqueante, fallback total quando assets/permissões falham; paridade i18n das strings de Settings.

## 4. Opções de arquitetura

### Decisão A — Pacote de áudio (`expo-audio` vs `expo-av`)
- **Opção A1 — `expo-av`.** É o pacote citado no brief e historicamente o padrão Expo. Trade-off: marcado como em descontinuação nos SDKs recentes; risco de remoção em futuras versões do SDK 54+.
- **Opção A2 — `expo-audio`.** Sucessor moderno do módulo de áudio do `expo-av`, com API de hooks (`useAudioPlayer`) e imperativa. Trade-off: API mais nova, mas alinhada ao roadmap do Expo.
- **Recomendação:** **A2 (`expo-audio`)** para o player de SFX/música, evitando dívida com um pacote em fim de vida. O brief menciona `expo-av` como direção genérica ("infra de áudio (expo-av)"); a verificação no SDK atual deve guiar a escolha final no momento da Fase 1 — checar a doc oficial via Context7 antes de fixar a dependência. **Antes de instalar, confirmar a compatibilidade exata com Expo 54 e React Native 0.81.**

### Decisão B — Onde vive o código de áudio
- **Opção B1 — Dentro de `src/engine/`.** **Rejeitada de imediato.** `engine/` é puro, zero React/Expo (CLAUDE.md do subprojeto). Áudio importa módulo nativo Expo → violaria a regra.
- **Opção B2 — `src/audio/audio-service.ts` como singleton de serviço + `src/store/audio-store.ts` (ou estender `settings-store`) para os toggles.** O serviço encapsula o player nativo; o store guarda volumes/mute reativos e hidrata do DB no boot. Componentes/telas chamam `audioService.playEvent(type)` e leem volumes do store.
- **Opção B3 — Hook `useGameAudio()` puro no React.** Tudo via hooks (`useAudioPlayer` do expo-audio) em cada call-site. Trade-off: dispersa carregamento de assets e lógica de ducking por vários componentes; difícil garantir um único music bed.
- **Recomendação:** **B2.** Singleton de serviço para o ciclo de vida do player e do music bed (um lugar só carrega/descarrega assets e faz ducking) + estado reativo no store (espelha como D7 expõe `reduceMotion`/`haptics`/`fontScale`, `2026-06-20-design-system-premium-design.md:288-289`). O `audio-service` é a fronteira: nada do engine o conhece.

### Decisão C — Como o SFX de evento é disparado
- **Opção C1 — O engine emite "som a tocar".** **Rejeitada.** Acopla apresentação ao engine puro e arrisca não-determinismo.
- **Opção C2 — A UI reage aos eventos já existentes.** A timeline da partida do usuário revela `MatchEvent`s um a um; no ponto de revelação de cada um (no `MatchEventItem`/orquestrador da timeline), a UI chama `audioService.playEvent(event.type)`. Apitos disparam nas transições de fluxo (`halftime.ts`, fim de `resumeSecondHalf`) já na camada de tela. Celebrações reusam os call-sites de D6.
- **Recomendação:** **C2.** Áudio é estritamente reativo a estado/eventos que a UI já consome. Um mapa declarativo `EVENT_SFX: Record<MatchEventType, SfxKey | null>` (alguns tipos podem não ter som — ex.: `shot_off_target` silencioso para não poluir) mora no `audio-service`, fácil de calibrar sem tocar engine.

## 5. Pré-requisitos & dependências

- **Design System (`2026-06-20-design-system-premium-design.md`) — dependência dura.** L7 reusa: (a) o `settings-store` e a `SettingsScreen` de D7 (`linha 185,234`); (b) as chaves key-value em `app_settings` de D7 (`linha 312`); (c) os call-sites de micro-celebração de D6 (`linha 168`); (d) o kit de componentes (Card/Button/StatBar/Text/Icon/Toast — a seção de Settings de áudio usa o **kit**, não estilos inline). L7 deve correr **depois** de D6/D7.
- **Padrão de Settings key-value** já em produção: `getSetting`/`setSetting` (`src/database/queries/settings.ts:3-13`) e o precedente de `loadPersistedLanguage` no boot (`App.tsx:18-22`, citado em `2026-06-20-design-system-premium-design.md:325`).
- **Assets de áudio (música + SFX)** — produção/licenciamento de arquivos `.mp3`/`.m4a`/`.ogg`. Bloqueante para entrega final; placeholders silenciosos permitem desenvolver a infra antes.
- **Sem dependência de L2 (match-engine-2d).** L7 sonoriza o feed de eventos do modo resumo atual; se o replay 2D de L2 existir, o mesmo `audioService.playEvent` se pluga na timeline 2D sem retrabalho (sinergia, não pré-requisito).
- **i18n pt/en** — strings novas de Settings com paridade (`src/i18n/pt.ts` + `en.ts`, validado por `parity.test.ts`).

## 6. Faseamento

**Fase 1 — Infra + serviço (L7.1).** Adicionar o pacote de áudio; criar `src/audio/audio-service.ts` com `init()`, `playSfx(key)`, `setMusic(track | null)`, `setVolumes({music, sfx})`, `setMuted(bool)`, guard `Platform.OS` e try/catch que degrada para no-op. *Entregável testável:* testes unitários do serviço com o player nativo **mockado na fronteira do serviço** (o engine continua testado com SQLite real; aqui mock do módulo nativo é aceitável por ser I/O de dispositivo, não DB) — verificam que mute zera volume, que falha de carga não lança, que web é no-op.

**Fase 2 — Settings de áudio (L7.5).** Chaves `audio_muted`, `music_volume`, `sfx_volume` em `app_settings`; estender `settings-store` (ou novo `audio-store`) com hidratação no boot ao lado de D7; seção "Áudio" na `SettingsScreen` com o kit. *Entregável testável:* teste de integração com **better-sqlite3 real** — set/get das chaves persiste e reidrata; defaults aplicados quando ausentes (muted=false, music=0.5, sfx=0.7).

**Fase 3 — Biblioteca de SFX + mapa de eventos (L7.4).** `EVENT_SFX: Record<MatchEventType, SfxKey|null>` + SFX de apito e celebração; assets (ou placeholders) registrados. *Entregável testável:* teste de **exaustividade** garantindo que todo `MatchEventType` (`src/types/match.ts:1`) tem entrada no mapa (mesmo que `null`), evitando evento "esquecido" no futuro.

**Fase 4 — Cabeamento (L7.6).** Plugar `playEvent` na revelação de eventos da timeline (`MatchEventItem`/orquestrador), apitos nas transições de `halftime.ts`/fim de jogo, celebrações nos call-sites D6. *Entregável testável + validação no browser (Playwright MCP):* abrir a partida, confirmar que SFX dispara no gol (verificável via spy no serviço em teste de componente) e que mute em Settings silencia tudo.

**Fase 5 — Trilha + mixagem/ducking (L7.2 + L7.3).** Music bed em loop atrelado a foco do app (pausa em background — alinha "sem progressão offline"); buses separados; ducking automático em SFX importante; `mixWithOthers`/interrupção respeitando mídia externa. *Entregável testável:* teste do serviço cobrindo ducking (volume da música cai e restaura ao redor de um SFX) e pausa em background (no-op de simulação — só pausa player).

**Fase 6 — Acessibilidade & polimento (L7.7).** Mute trivial (atalho/toggle visível), defaults conservadores, zero áudio bloqueante, fallback completo quando assets/permissões falham, paridade i18n. *Entregável testável:* `parity.test.ts` verde para as novas strings; teste de degradação (assets ausentes → app funciona mudo, sem crash).

## 7. Schema/infra changes (alto nível)

- **Nenhuma tabela nova.** Settings de áudio reusam `app_settings` (`schema.ts:448-451`) — key-value já existente, **não** exige DDL nem alteração em `src/database/schema.ts` ou `src/database/database-store.ts`. Chaves novas (globais, não por `save_id`): `audio_muted`, `music_volume`, `sfx_volume`, espelhando como `language` e as chaves de D7 já vivem fora do escopo de save (`src/i18n/persistence.ts:8`; `2026-06-20-design-system-premium-design.md:312`).
- **Nenhuma coluna nova em `match_events`.** Os eventos já carregam tudo que o áudio precisa (`type`). Áudio não persiste nada por partida.
- **Pacote/manifesto:** dependência de áudio em `package.json`; possível config em `app.json` (modo de áudio em background — manter desligado para respeitar "sem progressão offline"; o app não toca som nem simula em background). Assets `.mp3`/`.m4a` em `assets/audio/` (ou similar), registrados pelo bundler do Expo.

## 8. Riscos & decisões abertas

- **Áudio no web.** O player nativo pode comportar-se diferente no alvo web (autoplay bloqueado por política do browser até interação do usuário). *Mitigação:* só iniciar music bed após primeira interação; SFX sob gesto do usuário já é permitido. Degradar para silêncio onde indisponível (espelha o guard de haptics de D6, `2026-06-20-design-system-premium-design.md:323`).
- **Latência de SFX vs. revelação visual.** O som do gol deve coincidir com o highlight visual. *Mitigação:* pré-carregar (preload) os SFX curtos no `init()`; tocar do mesmo call-site que revela o evento.
- **Respeito à mídia de fundo.** Tocar música por cima do Spotify do jogador é hostil. *Mitigação:* `mixWithOthers`/ducking respeitoso; default de música em volume baixo e fácil de desligar.
- **"Sem progressão offline" + áudio em background.** Garantir que pausar/retomar áudio nunca aciona simulação; o áudio é puramente reativo a foco, sem efeitos colaterais de jogo.
- **Pacote correto (decisão A).** Confirmar `expo-audio` vs `expo-av` contra Expo 54/RN 0.81 antes de fixar (verificar doc oficial via Context7 na Fase 1).
- **Decisões abertas:** (1) Música também na partida (modo resumo) ou só em menus? (2) SFX para eventos "menores" (`shot_off_target`, `yellow`) ou só marcos (gol, vermelho, apito)? (3) Volume default exato de cada bus. (4) Há jingle de fim-de-temporada além do troféu? (5) Mute master é por sessão ou persistido (proposta: persistido em `audio_muted`).

## 9. Não-objetivos / fora de escopo

- **Narração/comentário falado** (TTS ou locução gravada de eventos). Fora de escopo permanente desta fase.
- **Áudio dinâmico/adaptativo** (camadas musicais que mudam com a tensão do jogo). Possível futuro, não aqui.
- **Substituir haptics.** Haptics de D6 permanece; áudio é camada paralela, coexistente.
- **Som dependente de dados reais** (cânticos de torcida licenciados, hinos de clube). PRODUCT.md veta dados reais permanentemente (`docs/PRODUCT.md:278`) — só sons genéricos/fictícios.
- **Qualquer mudança no engine ou no resultado da simulação.** Áudio jamais consome RNG nem altera estado de jogo.
- **Notificações push sonoras.** Push é épico separado de v0.2 (`docs/PRODUCT.md:270`).
- **Mixagem profissional/mastering de assets** — produção de conteúdo de áudio é trilha de assets, não de engenharia.

## 10. Spec self-review

- **Aterrado em código real?** Sim — `match.ts:1,17` (tipos de evento), `match-engine.ts:517` + `halftime.ts:18,22` (produção de eventos/fluxo), `game-loop.ts:316-332` (persistência só do usuário), `MatchEventItem.tsx` (render do feed), `settings.ts:3-13` + `schema.ts:448-451` (key-value), `i18n/persistence.ts:8` (chave global), e o spec de Design System (`2026-06-20-design-system-premium-design.md:160-173,185,288-289,312,323,369`). `package.json` confirmado **sem** pacote de áudio.
- **Determinismo preservado?** Sim — áudio é camada de apresentação, zero RNG/`Date.now`, reativo a eventos já existentes (Opção C2).
- **Sem invenção de API?** As funções `getSetting/setSetting` e os tipos de evento foram lidos no código; o `settings-store`/`SettingsScreen` são entregáveis de D7 (dependência declarada), não inventados aqui. O pacote de áudio é decisão explícita da §4, não assumido.
- **Save-isolation respeitada?** Chaves de áudio são globais por design (como `language`), não por `save_id` — coerente com o padrão existente.
- **i18n/kit/tema?** Strings de Settings com paridade pt/en; seção de Settings usa o **kit** de componentes e tokens de `@/theme`, não estilos inline.
- **Acessibilidade/produto?** Áudio **nunca obrigatório**, mute trivial, defaults conservadores, fallback mudo — alinhado a `docs/PRODUCT.md:390` e ao contrato de D6.
- **Lacuna conhecida:** assets de áudio reais dependem de produção/licenciamento externos; as Fases 1-6 são desenvolvíveis com placeholders silenciosos, mas a entrega final de UX depende dos arquivos.
