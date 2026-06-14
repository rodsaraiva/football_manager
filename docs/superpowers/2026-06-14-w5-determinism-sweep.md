# W5 — Hardening de Reprodutibilidade — Sweep de Determinismo

**Data:** 2026-06-14
**Resultado:** ✅ Zero fontes de não-determinismo em caminhos de simulação (engine). Reprodutibilidade travada por teste.

## Por quê

Um release precisa que o motor de simulação seja **determinístico**: mesmo seed → mesmo resultado. Toda aleatoriedade do engine deve passar por `SeededRng` (mulberry32, `src/engine/rng.ts`) — nunca `Math.random`, `Date.now`, `new Date()` ou `ORDER BY RANDOM()` (o PRNG do SQLite não é semeável).

## Sweep

Comando:

```
grep -rnE "Math\.random|Date\.now|new Date\(\)|ORDER BY RANDOM" src/engine src/database src/store
```

Ocorrências (2026-06-14) e classificação:

| Local | Ocorrência | Classe | Justificativa |
|---|---|---|---|
| `src/database/queries/saves.ts:49` | `new Date().toISOString()` | **Benigna** | `created_at` do save (metadado de persistência; não entra na simulação). |
| `src/database/queries/saves.ts:87` | `new Date().toISOString()` | **Benigna** | `updated_at` do save (metadado). |
| `src/store/ui-store.ts:25` | `Date.now().toString()` | **Benigna** | Id de notificação de UI (efêmero, fora do engine). |
| `src/engine/transfer/ai-offer-generator.ts:128` | `ORDER BY RANDOM()` (em **comentário**) | **Benigna** | Comentário explicando por que o código usa `rng.shuffle(...).slice(N)` em vez do `ORDER BY RANDOM()` do SQLite. Não há chamada real. |

**Nenhuma** ocorrência em caminho de simulação. UI/timestamps podem usar `Date.now`/`new Date` — não afetam o determinismo da partida/temporada.

## Micro-fixes (landados no W0)

Os dois sites críticos identificados na auditoria foram corrigidos no início do W0:

- `src/screens/club/AssistantHiringScreen.tsx` — `retirementAge` agora vem de `SeededRng` semeado (`new SeededRng(save.id*131 + clubId*7 + season + age).nextInt(...)`), espelhando `assistant-engine.ts`. Antes usava `Math.random()` e o valor entrava no DB.
- `src/engine/competition/round-progression.ts:139` — a query de `competition_entries` agora tem `ORDER BY group_name, club_id`, tornando a ordem de montagem dos grupos de mata-mata determinística (independente da ordem física de retorno do SQLite). `Object.keys(groups)` herda essa ordem determinística de inserção.

Verificação: ambas presentes no código atual.

## Reprodutibilidade travada por teste

`__tests__/e2e/career-loop.e2e.test.ts` (it "é reprodutível: dois saves, mesmo seed, 2 temporadas → estado-chave idêntico", ~linha 104): roda o loop completo **2× com o mesmo seed** e compara estado-chave (jogadores: `club_id`/`age`/`market_value`; orçamentos dos clubes; `player_club_id`) — exige igualdade byte-a-byte (`expect(a).toEqual(b)`).

Adicionalmente, `__tests__/e2e/week-advance.e2e.test.ts` ("stays deterministic: same seed reproduces the same score") cobre o determinismo a nível de partida.

O `career-loop.e2e` roda **5× sem flake** (verificado em W0/W2/W3).

## DoD do W5 — atendido

- [x] 0 fontes de não-determinismo em caminhos de engine (sweep acima).
- [x] Sweep documentado (este arquivo).
- [x] Reprodutibilidade travada por teste (career-loop e2e, 5× idêntico).
