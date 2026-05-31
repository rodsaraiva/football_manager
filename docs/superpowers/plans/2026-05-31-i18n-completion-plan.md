# i18n Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Levar a cobertura de i18n de 7 telas para 100% das ~40 telas/modais + toda a navegação + todo o texto gerado pela engine (notícias, comentários de assistente, objetivos da diretoria), mantendo `src/engine/**` puro (sem React) via um contrato estruturado `TextDescriptor` (`{ key, vars }`) resolvido no render.

**Architecture:** Estende o dicionário flat type-safe existente (`pt.ts`/`en.ts`, paridade garantida por `Record<keyof typeof pt, string>` + `parity.test.ts`). A infra (`translate`, `useTranslation`, store `i18n-store`, persistência `app_settings`) já existe e **não muda**. Para texto de engine pura, os geradores passam a emitir `TextDescriptor` em vez de `string`; o componente React resolve via `t(d.key, d.vars)` no render. Ordinais (1st/1º) são localizados por um helper puro `ordinal(lang, n)` aplicado **no render** (a engine emite o número cru). Objetivos da diretoria deixam de carregar `description` no struct da engine — o texto é derivado de `type`+`target` por um mapeador puro `objectiveDescriptor`.

**Tech Stack:** TypeScript 5.9 (strict), React Native (Expo 54), Zustand, Jest 29 + ts-jest, better-sqlite3 (testes), SQLite. **Sem dependências novas.**

**Spec:** `docs/superpowers/specs/2026-05-31-i18n-completion-design.md`

---

## File Structure

| Arquivo | Ação | Porquê |
|---|---|---|
| `src/i18n/ordinal.ts` | **Create** | Helper puro de ordinal localizado (EN `1st`, PT `1º`). Substitui o `ordinal()` privado de `news-generator.ts:34`. |
| `src/i18n/board-objective.ts` | **Create** | Mapeador puro `objectiveDescriptor(type, target) → TextDescriptor`. |
| `src/i18n/translate.ts` | **Modify** | Adiciona `export interface TextDescriptor { key: TKey; vars?: ... }`. Sem mudar `translate`. |
| `src/i18n/index.ts` | **Modify** | Re-exporta `TextDescriptor`, `ordinal`, `objectiveDescriptor`. |
| `src/i18n/pt.ts` / `src/i18n/en.ts` | **Modify** | Adiciona ~14 namespaces novos (`objective.*`, `assistant.*`, `news.*` estendido, `nav.*`, `transfer.*`, `finances.*`, `upgrades.*`, `staff.*`, `assistants.*`, `boardui.*`, `squad.*`, `report.*`, `history.*`, `calendar.*`, `matchresult.*`, `standings.*`, `cup.*`, `topscorers.*`, `youth.*`, `training.*`, `tacticssettings.*`, `endofseason.*`). |
| `src/engine/board/objective-generator.ts` | **Modify** | Remove `description` de `GeneratedObjective`/`Template`. |
| `src/engine/assistant/comment-generator.ts` | **Modify** | 41 templates `(ctx) => string` → `(ctx) => TextDescriptor`; `maybeGenerateComment` retorna `comment: TextDescriptor`. |
| `src/engine/news/news-generator.ts` | **Modify** | `NewsItem.title/body: string` → `TextDescriptor`; cada gerador emite chave+vars; remove `ordinal` privado. |
| `src/types/assistant.ts` | **Modify** | `AssistantComment.text: string` → `comment: TextDescriptor`. |
| `src/store/assistant-store.ts` | **Modify** | Apenas type-flow (importa `AssistantComment` atualizado; sem mudança de código). |
| `src/screens/club/BoardScreen.tsx` | **Modify** | Render do objetivo via `objectiveDescriptor` + i18n da UI. |
| `src/screens/home/HomeScreen.tsx` | **Modify** | Objetivo via `objectiveDescriptor`; comentário via `t(comment.key, comment.vars)`. |
| `src/screens/EndOfSeasonScreen.tsx` | **Modify** | Objetivo derivado; `description: ''` no upsert; i18n da UI; namespace `endofseason.*`. |
| `src/screens/NewGameScreen.tsx` | **Modify** | `description: ''` nos 2 upserts (objetivo derivado no render). |
| `src/screens/news/NewsScreen.tsx` | **Modify** | Render `t(item.title.key, item.title.vars)`; `buildResultsHeader`/`buildMatchResult` retornam `TextDescriptor`; aplica `ordinal(lang, n)`. |
| `src/navigation/RootNavigator.tsx` | **Modify** | 24 `title:` literais → `t('nav.*')`. |
| `src/navigation/TabNavigator.tsx` | **Modify** | 5 `title:` literais → `t('nav.*')`. |
| `src/screens/club/transfers/*.tsx` (6) + `OfferModal.tsx` | **Modify** | Extração `transfer.*` + Alerts. |
| `src/screens/club/{FinancesScreen,UpgradesScreen,StaffScreen,AssistantsScreen,AssistantHiringScreen}.tsx` | **Modify** | Extração. |
| `src/screens/squad/{SquadListScreen,PlayerDetailScreen}.tsx` | **Modify** | Reusa `tactics.attr_*`; remove 3 arrays hardcoded. |
| `src/screens/reports/Reports{Technical,Financial,Analytics,Youth,Radar,Opponent,TransferROI,Projection,FreeAgentScout}Screen.tsx` (9) | **Modify** | Extração `report.*`. |
| `src/screens/league/{StandingsScreen,...}`, `history/HistoryScreen`, `home/CalendarScreen`, MatchResult, CupBracket, TopScorers, YouthAcademy, Training, TacticsSettings | **Modify** | Extração. |

**Testes (Create/Modify):**
- Create `__tests__/i18n/ordinal.test.ts`
- Create `__tests__/i18n/board-objective.test.ts`
- Modify `__tests__/engine/board/objective-generator.test.ts` (remove asserts de `description`)
- Modify `__tests__/engine/assistant/comment-generator.test.ts` (`.text` → `.comment.key`)
- Modify `__tests__/engine/news/news-generator.test.ts` + `__tests__/engine/news/retirement-news.test.ts` (`.title`/`.body` viram `TextDescriptor`)
- `__tests__/i18n/parity.test.ts` (existente, **sem mudança** — cobre as novas chaves automaticamente)

---

## Task 0 — Helpers base: `ordinal`, `TextDescriptor`, `objectiveDescriptor`

Desbloqueia toda a engine. Sem mudança de UI.

**Files:**
- Create: `src/i18n/ordinal.ts`, `src/i18n/board-objective.ts`
- Modify: `src/i18n/translate.ts` (append, após linha 22), `src/i18n/index.ts` (append re-exports), `src/i18n/pt.ts` (+7 chaves `objective.*`), `src/i18n/en.ts` (+7 chaves)
- Test: `__tests__/i18n/ordinal.test.ts`, `__tests__/i18n/board-objective.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/i18n/ordinal.test.ts`:

```ts
import { ordinal } from '@/i18n/ordinal';

describe('ordinal', () => {
  it('en: 1st/2nd/3rd/4th', () => {
    expect(ordinal('en', 1)).toBe('1st');
    expect(ordinal('en', 2)).toBe('2nd');
    expect(ordinal('en', 3)).toBe('3rd');
    expect(ordinal('en', 4)).toBe('4th');
  });

  it('en: 11/12/13 are th, not st/nd/rd', () => {
    expect(ordinal('en', 11)).toBe('11th');
    expect(ordinal('en', 12)).toBe('12th');
    expect(ordinal('en', 13)).toBe('13th');
  });

  it('en: 21/22/23 are st/nd/rd', () => {
    expect(ordinal('en', 21)).toBe('21st');
    expect(ordinal('en', 22)).toBe('22nd');
    expect(ordinal('en', 23)).toBe('23rd');
  });

  it('pt: always Nº', () => {
    expect(ordinal('pt', 1)).toBe('1º');
    expect(ordinal('pt', 2)).toBe('2º');
    expect(ordinal('pt', 11)).toBe('11º');
  });
});
```

Create `__tests__/i18n/board-objective.test.ts`:

```ts
import { objectiveDescriptor } from '@/i18n/board-objective';

describe('objectiveDescriptor', () => {
  it('maps no_relegation', () => {
    expect(objectiveDescriptor('no_relegation', null)).toEqual({ key: 'objective.no_relegation' });
  });

  it('maps top_half with target var', () => {
    expect(objectiveDescriptor('top_half', 10)).toEqual({ key: 'objective.top_half', vars: { target: 10 } });
  });

  it('league_position target=1 → win_league', () => {
    expect(objectiveDescriptor('league_position', 1)).toEqual({ key: 'objective.win_league' });
  });

  it('league_position target>1 → league_position with var', () => {
    expect(objectiveDescriptor('league_position', 3)).toEqual({ key: 'objective.league_position', vars: { target: 3 } });
  });

  it('maps cup_win / budget_balance / promotion', () => {
    expect(objectiveDescriptor('cup_win', null)).toEqual({ key: 'objective.cup_win' });
    expect(objectiveDescriptor('budget_balance', null)).toEqual({ key: 'objective.budget_balance' });
    expect(objectiveDescriptor('promotion', null)).toEqual({ key: 'objective.promotion' });
  });

  it('league_position with null target falls back to 0 var', () => {
    expect(objectiveDescriptor('league_position', null)).toEqual({ key: 'objective.league_position', vars: { target: 0 } });
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

Run: `npx jest __tests__/i18n/ordinal.test.ts __tests__/i18n/board-objective.test.ts`
Expected: FAIL — `Cannot find module '@/i18n/ordinal'` / `'@/i18n/board-objective'`.

- [ ] **Step 3: Implementation**

Create `src/i18n/ordinal.ts`:

```ts
import { Language } from './types';

/** Ordinal localizado. EN: 1st/2nd/3rd/Nth. PT: Nº (masculino, "lugar"/"posição"). */
export function ordinal(lang: Language, n: number): string {
  if (lang === 'pt') return `${n}º`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}
```

Append to `src/i18n/translate.ts` (after line 22):

```ts
export interface TextDescriptor {
  key: TKey;
  vars?: Record<string, string | number>;
}
```

Create `src/i18n/board-objective.ts`:

```ts
import { BoardObjectiveType } from '@/types/board';
import { TextDescriptor } from './translate';

/** Deriva o descritor de texto do objetivo a partir de type+target (engine não embute string). */
export function objectiveDescriptor(type: BoardObjectiveType, target: number | null): TextDescriptor {
  switch (type) {
    case 'no_relegation':
      return { key: 'objective.no_relegation' };
    case 'top_half':
      return { key: 'objective.top_half', vars: { target: target ?? 0 } };
    case 'league_position':
      return target === 1
        ? { key: 'objective.win_league' }
        : { key: 'objective.league_position', vars: { target: target ?? 0 } };
    case 'cup_win':
      return { key: 'objective.cup_win' };
    case 'budget_balance':
      return { key: 'objective.budget_balance' };
    case 'promotion':
      return { key: 'objective.promotion' };
  }
}
```

Append re-exports to `src/i18n/index.ts`:

```ts
export type { TextDescriptor } from './translate';
export { ordinal } from './ordinal';
export { objectiveDescriptor } from './board-objective';
```

Add the 7 `objective.*` keys to `src/i18n/pt.ts` (mantenha agrupado por namespace, ordenado):

```ts
  'objective.no_relegation': 'Evitar o rebaixamento nesta temporada',
  'objective.top_half': 'Terminar na metade de cima (top {target})',
  'objective.league_position': 'Terminar no top {target}',
  'objective.win_league': 'Vencer o campeonato da liga',
  'objective.cup_win': 'Vencer uma competição de copa nesta temporada',
  'objective.budget_balance': 'Manter as finanças do clube no azul',
  'objective.promotion': 'Conquistar o acesso à divisão superior',
```

And the mirror in `src/i18n/en.ts`:

```ts
  'objective.no_relegation': 'Avoid relegation this season',
  'objective.top_half': 'Finish in the top half (top {target})',
  'objective.league_position': 'Finish in the top {target}',
  'objective.win_league': 'Win the league championship',
  'objective.cup_win': 'Win a cup competition this season',
  'objective.budget_balance': 'Keep the club finances in the black',
  'objective.promotion': 'Earn promotion to the higher division',
```

- [ ] **Step 4: Run tests (expect PASS)**

Run: `npx jest __tests__/i18n/ && npx tsc --noEmit`
Expected: PASS (ordinal + board-objective + parity) + tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/ordinal.ts src/i18n/board-objective.ts src/i18n/translate.ts src/i18n/index.ts src/i18n/pt.ts src/i18n/en.ts __tests__/i18n/ordinal.test.ts __tests__/i18n/board-objective.test.ts
git commit -m "feat(i18n): helpers base — ordinal localizado, TextDescriptor e objectiveDescriptor"
```

---

## Task 1 — Engine: board objective vira derivado de type+target

Menor dos três fluxos de engine. As 7 chaves `objective.*` já existem (Task 0).

**Files:**
- Modify: `src/engine/board/objective-generator.ts` (linhas 14-66: remove `description`)
- Modify: `src/screens/EndOfSeasonScreen.tsx` (linha 142: `description: ''`; linha 162: trocar `objectiveDescription`; render linha ~670)
- Modify: `src/screens/NewGameScreen.tsx` (linhas 182, 190: `description: ''`)
- Modify: `src/screens/club/BoardScreen.tsx` (linha 64: render via descriptor)
- Modify: `src/screens/home/HomeScreen.tsx` (linha 347: render via descriptor)
- Test: `__tests__/engine/board/objective-generator.test.ts` (remove asserts de `description`)

- [ ] **Step 1: Update the failing test**

Em `__tests__/engine/board/objective-generator.test.ts`, remova o teste que asserta `description` (linhas 21-24, `it('returns non-empty description', ...)`), e adicione um teste que afirma que o struct **não** tem mais `description`. O setup do arquivo usa o objeto `base` (`ObjectiveGeneratorInput`, linha 4) — reuse-o:

```ts
  it('does not carry a description string anymore (derived at render)', () => {
    const result = generateObjective({ ...base, clubReputation: 15, rng: new SeededRng(1) });
    expect((result as { description?: unknown }).description).toBeUndefined();
    expect(['no_relegation', 'top_half']).toContain(result.type);
  });
```

(Mantém os demais testes de `type`/`target`/determinismo intactos.)

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npx jest __tests__/engine/board/objective-generator.test.ts`
Expected: FAIL — `result.description` ainda existe (`toBeUndefined` falha).

- [ ] **Step 3: Implementation**

Em `src/engine/board/objective-generator.ts`:
- Remova `description: string;` da interface `GeneratedObjective` (linha 17).
- Remova `description` do type `Template` (linha 20) → `type Template = { type: BoardObjectiveType; target: number | null };`.
- Remova **todos** os campos `description: '...'`/`description: \`...\`` dos 13 objetos de template (linhas 33-63). Ex.: linha 33 vira `{ type: 'no_relegation' as BoardObjectiveType, target: null }`.

Em `src/screens/EndOfSeasonScreen.tsx`:
- Adicione o import no topo (junto aos outros de `@/i18n`): `import { objectiveDescriptor } from '@/i18n';` e garanta `const { t } = useTranslation();` no componente (Task 9 fará a extração completa desta tela; aqui só o objetivo).
- Linha 142: troque `description: objective.description` por `description: ''` (a coluna DB continua, mas não é mais lida — §3.4 do spec).
- Linha 162: remova `objectiveDescription: objective.description` e troque o campo do `setBoardEval` por `objectiveType: objective.type, objectiveTarget: objective.target`. Atualize a interface local `boardEval` (linha ~74 e ~193) trocando `objectiveDescription: string` por `objectiveType: import('@/types/board').BoardObjectiveType; objectiveTarget: number | null;`.
- Linha ~670 (render): troque `{boardEval.objectiveDescription}` por `{t(...spreadDescriptor(objectiveDescriptor(boardEval.objectiveType, boardEval.objectiveTarget)))}`. Como `t(key, vars?)` recebe dois args, use um wrapper local no topo do arquivo:

```ts
function td(t: (k: import('@/i18n').TKey, v?: Record<string, string | number>) => string, d: import('@/i18n').TextDescriptor): string {
  return t(d.key, d.vars);
}
```

e no render: `{td(t, objectiveDescriptor(boardEval.objectiveType, boardEval.objectiveTarget))}`.

Em `src/screens/NewGameScreen.tsx`:
- Linhas 182 e 190: troque `description: s1Objective.description` por `description: ''`.

Em `src/screens/club/BoardScreen.tsx`:
- Adicione `import { useTranslation, objectiveDescriptor } from '@/i18n';`, `const { t } = useTranslation();`.
- Linha 64: troque `{currentObjective.description}` por `{t(objectiveDescriptor(currentObjective.type, currentObjective.target).key, objectiveDescriptor(currentObjective.type, currentObjective.target).vars)}`. (Para evitar dupla chamada, calcule `const objDesc = objectiveDescriptor(currentObjective.type, currentObjective.target);` antes do return e use `{t(objDesc.key, objDesc.vars)}`.)

Em `src/screens/home/HomeScreen.tsx`:
- Adicione `objectiveDescriptor` ao import existente de `@/i18n` (já importa `useTranslation`).
- Linha 347: calcule `const objDesc = currentObjective ? objectiveDescriptor(currentObjective.type, currentObjective.target) : null;` perto do uso e troque `{currentObjective.description}` por `{objDesc && t(objDesc.key, objDesc.vars)}`.

- [ ] **Step 4: Run test (expect PASS) + tsc**

Run: `npx jest __tests__/engine/board/objective-generator.test.ts && npx tsc --noEmit`
Expected: PASS + tsc exit 0 (o `tsc` valida que nenhum outro consumidor lê `.description` do struct da engine).

- [ ] **Step 5: Browser validation (Playwright MCP)**

Suba o web server (CI mode, harness background; navegar `localhost:8082`). Valide em **PT e EN**:
- HomeScreen → widget "Objetivo / Objective" mostra o texto derivado correto.
- ClubTab → Board → objetivo localizado.
- (EndOfSeason só é alcançável ao fim da temporada; validação completa fica na Task 9.)

- [ ] **Step 6: Commit**

```bash
git add src/engine/board/objective-generator.ts src/screens/EndOfSeasonScreen.tsx src/screens/NewGameScreen.tsx src/screens/club/BoardScreen.tsx src/screens/home/HomeScreen.tsx __tests__/engine/board/objective-generator.test.ts
git commit -m "feat(i18n): objetivo da diretoria derivado de type+target (engine pura, texto no render)"
```

---

## Task 2 — Engine: assistant comments viram TextDescriptor

41 templates. `AssistantComment.text: string` → `comment: TextDescriptor`.

**Files:**
- Modify: `src/types/assistant.ts` (linha 44)
- Modify: `src/engine/assistant/comment-generator.ts` (todo: `CommentTemplate`, 41 templates, `maybeGenerateComment`)
- Modify: `src/screens/home/HomeScreen.tsx` (linha 321 render)
- Modify: `src/i18n/pt.ts` / `src/i18n/en.ts` (+41 chaves `assistant.*`)
- Test: `__tests__/engine/assistant/comment-generator.test.ts` (linha 68 `.text` → `.comment.key`)

**Convenção de chave:** `assistant.<role>.<archetype>.<index>` onde `role ∈ {squad,financial,youth}`, `archetype ∈ {old_school,analytics,motivator,tactician,developer,pragmatic}`, `index` = posição no array (0-based). Templates condicionais (que escolhem texto por `ctx`) recebem **uma chave por ramo** — sufixo `_a`/`_b` em vez de só `<index>` (ex.: `assistant.squad.old_school.0_a` para o ramo "≤5" e `..0_b` para o else). Templates simples sem condição usam só `<index>`. O gerador decide o ramo (mantém a lógica na engine) e retorna a chave do ramo + `vars`.

- [ ] **Step 1: Update the failing test**

Em `__tests__/engine/assistant/comment-generator.test.ts`, o setup usa `baseAssistant`/`baseContext` (linhas 5-28) e `maybeGenerateComment` só ativa ~15% das vezes (por isso os testes existentes varrem seeds num loop até obter não-null). Troque a asserção da linha 68 (`comment!.text.length`) por uma que valida o descritor:

```ts
    expect(comment!.comment.key.startsWith('assistant.')).toBe(true);
    expect(typeof comment!.comment.key).toBe('string');
```

Adicione um teste de determinismo de chave (mesma varredura de seed dos testes existentes, dois geradores com o mesmo seed):

```ts
  it('same seed → same comment key (deterministic descriptor)', () => {
    let key: string | null = null;
    let key2: string | null = null;
    for (let seed = 0; seed < 200; seed++) {
      const a = maybeGenerateComment(baseAssistant, baseContext, new SeededRng(seed));
      if (a) {
        key = a.comment.key;
        key2 = maybeGenerateComment(baseAssistant, baseContext, new SeededRng(seed))!.comment.key;
        break;
      }
    }
    expect(key).not.toBeNull();
    expect(key).toBe(key2);
  });
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npx jest __tests__/engine/assistant/comment-generator.test.ts`
Expected: FAIL — `comment.comment` é `undefined` (ainda é `.text`).

- [ ] **Step 3: Implementation**

Em `src/types/assistant.ts`, troque a linha 44:

```ts
export interface AssistantComment {
  assistantId: number;
  assistantName: string;
  archetype: AssistantArchetype;
  role: AssistantRole;
  comment: import('@/i18n/translate').TextDescriptor;
}
```

Em `src/engine/assistant/comment-generator.ts`:
- Import: `import { TextDescriptor } from '@/i18n/translate';`
- Troque `type CommentTemplate = (ctx: CommentContext) => string;` por `type CommentTemplate = (ctx: CommentContext) => TextDescriptor;`
- Converta cada template. Exemplos exatos (transcreva o resto seguindo o mesmo molde, **uma chave por ramo**, mantendo a contagem/lógica na engine):

`SQUAD_TEMPLATES.old_school`:
```ts
  old_school: [
    (ctx) => ctx.leaguePosition && ctx.leaguePosition <= 5
      ? { key: 'assistant.squad.old_school.0_a' }
      : { key: 'assistant.squad.old_school.0_b' },
    (ctx) => ({ key: 'assistant.squad.old_school.1', vars: { week: ctx.week } }),
    () => ({ key: 'assistant.squad.old_school.2' }),
  ],
```

`SQUAD_TEMPLATES.analytics`:
```ts
  analytics: [
    (ctx) => ctx.leaguePosition
      ? { key: 'assistant.squad.analytics.0_a', vars: { pos: ctx.leaguePosition, total: ctx.totalTeams, trend: ctx.leaguePosition <= ctx.totalTeams / 2 ? 'above' : 'below' } }
      : { key: 'assistant.squad.analytics.0_b' },
    (ctx) => ({ key: 'assistant.squad.analytics.1', vars: { state: ctx.budgetBalance > 0 ? 'sustainable' : 'strained' } }),
    () => ({ key: 'assistant.squad.analytics.2' }),
  ],
```

> Nota sobre `trend`/`state`: são palavras que mudam por idioma. Em vez de passar `'above'`/`'sustainable'` como var literal (que não traduz), use **chaves por ramo**: `assistant.squad.analytics.0_above` / `..0_below`, e `..1_sustainable` / `..1_strained`. O gerador escolhe a chave; as `vars` ficam só para números/nomes próprios (`pos`, `total`). Aplique esse princípio a **todos** os templates que hoje interpolam palavra-que-traduz (squad.analytics, squad.pragmatic, financial.analytics, financial.tactician, etc.).

`FINANCIAL_TEMPLATES.analytics` (exemplo com número + ramo):
```ts
  analytics: [
    (ctx) => ({
      key: ctx.budgetBalance >= 0 ? 'assistant.financial.analytics.0_pos' : 'assistant.financial.analytics.0_neg',
      vars: { k: Math.round(ctx.budgetBalance / 1000) },
    }),
    () => ({ key: 'assistant.financial.analytics.1' }),
    () => ({ key: 'assistant.financial.analytics.2' }),
  ],
```

`YOUTH_TEMPLATES.developer` (exemplo com number var):
```ts
  developer: [
    (ctx) => ctx.topYouthPotential && ctx.topYouthPotential >= 80
      ? { key: 'assistant.youth.developer.0_a', vars: { pot: ctx.topYouthPotential } }
      : { key: 'assistant.youth.developer.0_b' },
    () => ({ key: 'assistant.youth.developer.1' }),
    () => ({ key: 'assistant.youth.developer.2' }),
  ],
```

- Atualize `maybeGenerateComment` (linhas 132-140): `const comment = template(context);` e retorne `comment` em vez de `text`:

```ts
  const descriptor = template(context);
  return {
    assistantId: assistant.id,
    assistantName: assistant.name,
    archetype: assistant.archetype,
    role: assistant.role,
    comment: descriptor,
  };
```

Em `src/screens/home/HomeScreen.tsx`, linha 321:

```tsx
          <Text style={styles.commentText}>{t(pendingComment.comment.key, pendingComment.comment.vars)}</Text>
```

Adicione **todas as chaves geradas** a `pt.ts` e `en.ts`. Conte exaustivamente: percorra os 3 roles × 6 archetypes do arquivo e crie uma chave por template (com sufixos de ramo onde o template é condicional). Exemplos de pares PT/EN:

`pt.ts`:
```ts
  'assistant.squad.old_school.0_a': 'Boa posição na tabela. Mantenham a disciplina.',
  'assistant.squad.old_school.0_b': 'Precisamos afiar. Sem espaço para acomodação.',
  'assistant.squad.old_school.1': 'Semana {week} — o elenco precisa manter o foco. O caráter se constrói em momentos assim.',
  'assistant.squad.old_school.2': 'Os garotos estão trabalhando duro. Consistência separa times bons de grandes times.',
  'assistant.squad.analytics.0_above': 'Posição {pos}/{total}. Faixa esperada: +/- 2 posições. Acima da mediana.',
  'assistant.squad.analytics.0_below': 'Posição {pos}/{total}. Faixa esperada: +/- 2 posições. Abaixo da mediana.',
  'assistant.squad.analytics.0_b': 'Dados posicionais insuficientes para gerar projeção.',
  'assistant.financial.analytics.0_pos': 'Saldo de orçamento: +{k}K. Dentro da faixa sustentável.',
  'assistant.financial.analytics.0_neg': 'Saldo de orçamento: {k}K. Abaixo de zero — redução de custos necessária.',
  'assistant.youth.developer.0_a': 'Um dos nossos garotos tem potencial de {pot}. Esse moleque pode ser especial.',
  'assistant.youth.developer.0_b': 'O grupo de base progride com firmeza. Paciência é fundamental.',
```

`en.ts` (espelho, textos originais):
```ts
  'assistant.squad.old_school.0_a': 'Good position in the table. Keep the discipline.',
  'assistant.squad.old_school.0_b': 'We need to sharpen up. No room for complacency.',
  'assistant.squad.old_school.1': 'Week {week} — the squad needs to stay focused. Character is built in moments like these.',
  'assistant.squad.old_school.2': 'The lads are working hard. Consistency is what separates good teams from great ones.',
  'assistant.squad.analytics.0_above': 'Position {pos}/{total}. Expected performance range: +/- 2 spots. Trending above median.',
  'assistant.squad.analytics.0_below': 'Position {pos}/{total}. Expected performance range: +/- 2 spots. Trending below median.',
  'assistant.squad.analytics.0_b': 'Insufficient positional data to generate projection.',
  'assistant.financial.analytics.0_pos': 'Budget balance: +{k}K. Within sustainable range.',
  'assistant.financial.analytics.0_neg': 'Budget balance: {k}K. Below zero — cost reduction required.',
  'assistant.youth.developer.0_a': 'One of our youngsters has potential of {pot}. This lad could be something special.',
  'assistant.youth.developer.0_b': 'The youth group is progressing steadily. Patience is key.',
```

> Cubra os 18 grupos (`<role>.<archetype>`) inteiros. Para cada template `() => "..."` simples crie 1 chave; para cada `(ctx) => cond ? "A" : "B"` crie 2 (`_a`/`_b` ou nomes semânticos). O `parity.test` + `tsc` (porque o gerador usa `key: TKey`) garantem que nenhuma chave usada falte.

- [ ] **Step 4: Run test (expect PASS) + tsc + parity**

Run: `npx jest __tests__/engine/assistant/ __tests__/i18n/parity.test.ts && npx tsc --noEmit`
Expected: PASS + tsc exit 0. (Se `tsc` reclamar de `key` inexistente, é chave faltando no dicionário — adicione.)

- [ ] **Step 5: Browser validation (Playwright MCP)**

HomeScreen: avance semanas até aparecer o card de comentário do assistente; confirme texto localizado em **PT e EN** (trocar idioma re-traduz o card guardado na store).

- [ ] **Step 6: Commit**

```bash
git add src/types/assistant.ts src/engine/assistant/comment-generator.ts src/screens/home/HomeScreen.tsx src/i18n/pt.ts src/i18n/en.ts __tests__/engine/assistant/comment-generator.test.ts
git commit -m "feat(i18n): comentários do assistente viram TextDescriptor (engine pura)"
```

---

## Task 3 — Engine: news generator vira TextDescriptor

`NewsItem.title/body: string` → `TextDescriptor`. ~50 chaves `news.*`. Ordinais aplicados no render.

**Files:**
- Modify: `src/engine/news/news-generator.ts` (interface `NewsItem` linha 23-30; remove `ordinal` linhas 34-39; todos os 9 geradores)
- Modify: `src/screens/news/NewsScreen.tsx` (render linhas 393-394; `buildResultsHeader`/`buildMatchResult` linhas 405-433; aplicar `ordinal(lang, n)`)
- Modify: `src/i18n/pt.ts` / `src/i18n/en.ts` (+~50 chaves `news.*`)
- Test: `__tests__/engine/news/news-generator.test.ts` + `__tests__/engine/news/retirement-news.test.ts`

- [ ] **Step 1: Update the failing tests**

Em `__tests__/engine/news/retirement-news.test.ts`, a asserção atual `expect(result[0].title).toContain('João Silva')` (linha 19) quebra — o nome próprio agora é uma `var`. Troque por:

```ts
    expect(result[0].title.key).toBe('news.retire_announced_title');
    expect(result[0].title.vars).toEqual({ name: 'João Silva' });
```

Em `__tests__/engine/news/news-generator.test.ts`, adicione asserts de descritor aos geradores já testados. Exemplo concreto para leader-streak (use os helpers `mkClub`/`mkFixture`/`calculateStandings` já no arquivo):

```ts
  it('leader streak emits a TextDescriptor with club var and streak count', () => {
    // 3 weeks where club 1 stays top
    const fixtures = [
      mkFixture(1, 1, 1, 2, 3, 0),
      mkFixture(2, 2, 1, 3, 2, 0),
      mkFixture(3, 3, 1, 4, 1, 0),
    ];
    const clubMap = new Map([[1, mkClub(1, 'Arsenal')], [2, mkClub(2)], [3, mkClub(3)], [4, mkClub(4)]]);
    const items = generateHeadlines({
      allPlayedFixtures: fixtures, clubIds: [1, 2, 3, 4], currentWeek: 3, clubMap, playerClubId: 1,
    });
    const streak = items.find((i) => i.id === 'headline-leader-streak');
    expect(streak).toBeDefined();
    expect(streak!.title.key).toBe('news.leader_streak_title');
    expect(streak!.title.vars).toMatchObject({ club: 'Arsenal' });
    expect(streak!.body.key).toBe('news.leader_streak_body_other'); // streak >= 2 → plural
    expect(streak!.body.vars).toMatchObject({ streak: expect.any(Number) });
  });
```

(Ajuste os números de gol/semana conforme `calculateStandings` para garantir que clube 1 lidere — ver fixtures dos testes existentes no mesmo arquivo como referência de magnitude.)

- [ ] **Step 2: Run tests (expect FAIL)**

Run: `npx jest __tests__/engine/news/`
Expected: FAIL — `title` é string (`.key` undefined).

- [ ] **Step 3: Implementation (news-generator)**

Em `src/engine/news/news-generator.ts`:
- Import: `import { TextDescriptor } from '@/i18n/translate';`
- Interface `NewsItem` (linha 23): troque `title: string; body: string;` por `title: TextDescriptor; body: TextDescriptor;`
- **Remova** o `ordinal` privado (linhas 34-39). Onde os geradores usavam `ordinal(n)` na frase, emita o número cru como var (`pos`, `from`, `to`) e deixe o `NewsScreen` aplicar `ordinal(lang, n)` no render.
- Mantenha `clubName`/`clubShort`/`formatMoney` (produzem nomes próprios/moeda = vars, não texto traduzível).
- Converta cada `push({... title: \`...\`, body: \`...\`})`. Mapa de chaves (uma por mensagem; ramos `_one`/`_other` onde havia `${n>1?'s':''}`):

| Local (linha original) | title key | body key |
|---|---|---|
| leader streak (96-99) | `news.leader_streak_title` `{club}` | `news.leader_streak_body_one/_other` `{streak}` |
| new leader (104-108) | `news.new_leader_title` `{club}` | `news.new_leader_body` |
| mover (143-148) | `news.mover_up_title` / `news.mover_down_title` `{club,pos}` | `news.mover_up_body_one/_other` / `news.mover_down_body_one/_other` `{delta,from,you}` |
| high-scoring (180-185) | `news.highscore_title` `{home,hg,ag,away}` | `news.highscore_thrash` / `_goalfest` / `_clash` `{total,you}` |
| comeback away (233-239) | `news.comeback_title` `{club}` | `news.comeback_away_body` `{deficit,hg,ag,home}` |
| comeback home (244-250) | `news.comeback_title` `{club}` | `news.comeback_home_body` `{deficit,hg,ag,away}` |
| equalizer (256-262) | `news.equalizer_title` `{home,away}` | `news.equalizer_body` `{lead,hg,ag}` |
| title race (291-297) | `news.title_race_title` | `news.title_race_body_one/_other` `{leader,chaser,gap}` |
| player relegation (312-318) | `news.relegation_title` | `news.relegation_body_one/_other` `{gap}` |
| near relegation (323-329) | `news.relegation_worries_title` | `news.relegation_worries_body_one/_other` `{pos,gap}` |
| promotion (340-345) | `news.promotion_title` | `news.promotion_body` `{pos}` |
| promo chase (349-355) | `news.promo_chase_title` | `news.promo_chase_body_one/_other` `{pos,gap}` |
| best attack (363-368) | `news.best_attack_title` `{club}` | `news.best_attack_body_one/_other` `{goals,played,avg}` |
| best defense (374-379) | `news.best_defense_title` `{club}` | `news.best_defense_body_one/_other` `{goals,played,avg}` |
| transfer (407-413) | `news.transfer_title` `{player,fee}` | `news.transfer_loan_body` / `news.transfer_major_body` `{from,to}` |
| match star (481-488) | `news.star_hattrick_title` / `news.star_title` `{player}` | `news.star_body` `{contrib,club}` |
| win streak (525-531) | `news.streak_wins_title` `{wins}` | `news.streak_wins_body` `{wins}` |
| unbeaten (542-548) | `news.streak_unbeaten_title` `{n}` | `news.streak_unbeaten_body` `{n}` |
| lose streak (558-564) | `news.streak_losses_title` `{n}` | `news.streak_losses_body` `{n}` |
| drought (576-582) | `news.streak_drought_title` | `news.streak_drought_body` `{n}` |
| clean sheets (594-600) | `news.streak_clean_title` `{n}` | `news.streak_clean_body` `{n}` |
| season recap (640-733) | `news.recap_*` (champion/runnerup/relegated/topscorer/mvp/breakthrough) `{competition,season,player,...}` | idem |
| retirement (756-776) | `news.retire_announced_title` / `news.retire_retired_title` `{name}` | `news.retire_announced_body` / `news.retire_maxage_body` / `news.retire_tough_body` `{age}` |

Para os `_one`/`_other`, o gerador escolhe (mantém a contagem na engine):

```ts
    if (streak >= 2) {
      items.push({
        id: 'headline-leader-streak',
        icon: '👑',
        title: { key: 'news.leader_streak_title', vars: { club: clubName(clubMap, leaderId) } },
        body: { key: streak === 1 ? 'news.leader_streak_body_one' : 'news.leader_streak_body_other', vars: { streak } },
        category: 'headline',
        priority: 100,
      });
    }
```

Para o mover (ordinal vai no render — emite número cru):

```ts
        items.push({
          id: `headline-mover-${m.clubId}`,
          icon: isUp ? '📈' : '📉',
          title: { key: isUp ? 'news.mover_up_title' : 'news.mover_down_title', vars: { club: clubName(clubMap, m.clubId), pos: m.to } },
          body: {
            key: isUp
              ? (Math.abs(m.delta) > 1 ? 'news.mover_up_body_other' : 'news.mover_up_body_one')
              : (Math.abs(m.delta) > 1 ? 'news.mover_down_body_other' : 'news.mover_down_body_one'),
            vars: { delta: Math.abs(m.delta), from: m.from, you: isPlayer ? 1 : 0 },
          },
          category: 'headline',
          priority: isPlayer ? 95 : 85,
        });
```

> O sufixo " — your club" (linha 146) vira ramo: a chave `_other`/`_one` tem duas variantes `..._you`? Mais simples: emita o ramo "você" como chave separada (`news.mover_up_body_you_other` etc.) **ou** deixe o trecho "seu clube" como concatenação no NewsScreen. Decisão: usar chave dedicada por ramo `you` para manter a engine só escolhendo a chave. No render não há concatenação de texto traduzível.

Para retirement:

```ts
  return retiringPlayers.map((r) => {
    const name = playerNames.get(r.playerId) ?? r.playerName;
    const announced = stage === 'announced';
    const title: TextDescriptor = announced
      ? { key: 'news.retire_announced_title', vars: { name } }
      : { key: 'news.retire_retired_title', vars: { name } };
    let body: TextDescriptor;
    if (announced) body = { key: 'news.retire_announced_body', vars: { age: r.age } };
    else if (r.reason === 'max_age') body = { key: 'news.retire_maxage_body', vars: { age: r.age } };
    else body = { key: 'news.retire_tough_body', vars: { age: r.age } };
    return { id: `retirement-${stage}-${r.playerId}`, icon: announced ? '📣' : '👋', title, body, category: 'retirement', priority: announced ? 90 : 93 };
  });
```

> O placar (`${home} ${hg} - ${ag} ${away}`) e a moeda continuam vars: ex. `title: { key: 'news.highscore_title', vars: { home: clubShort(...), hg: f.homeGoals, ag: f.awayGoals, away: clubShort(...) } }` com PT/EN `'{home} {hg} - {ag} {away}'`.

- [ ] **Step 4: Implementation (NewsScreen render)**

Em `src/screens/news/NewsScreen.tsx`:
- Pegue `lang` do hook: `const { t, lang } = useTranslation();`
- Import `ordinal`: `import { ordinal } from '@/i18n';`
- Linhas 393-394 (render): resolva o descritor, aplicando `ordinal` às vars posicionais:

```tsx
              <Text style={styles.cardTitle}>{resolveDescriptor(t, lang, item.title)}</Text>
              <Text style={styles.cardBody}>{resolveDescriptor(t, lang, item.body)}</Text>
```

- Adicione o helper local (perto de `buildResultsHeader`):

```ts
const ORDINAL_VARS = new Set(['pos', 'from']);

function resolveDescriptor(t: TFn, lang: import('@/i18n').Language, d: NewsItem['title']): string {
  if (!d.vars) return t(d.key);
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(d.vars)) {
    out[k] = ORDINAL_VARS.has(k) && typeof v === 'number' ? ordinal(lang, v) : v;
  }
  return t(d.key, out);
}
```

- `buildResultsHeader` (405-413) já retorna `NewsItem`; troque para devolver `TextDescriptor`:

```ts
function buildResultsHeader(week: number, comp: Competition | undefined, t: TFn): NewsItem {
  return {
    id: `results-header-${week}`,
    icon: '📅',
    title: { key: 'news.results_header_title', vars: { week } },
    body: comp ? { key: 'news.results_header_body_comp', vars: { comp: comp.name } } : { key: 'news.results_header_body_fallback' },
    category: 'result',
    priority: 72,
  };
}
```

(Adicione `news.results_header_body_comp` = `'{comp}'` em pt/en — o nome da competição é nome próprio = var.)

- `buildMatchResult` (416-433):

```ts
function buildMatchResult(f: Fixture, clubMap: Map<number, Club>, playerClubId: number | null, t: TFn): NewsItem {
  const home = clubMap.get(f.homeClubId)?.shortName ?? `Club ${f.homeClubId}`;
  const away = clubMap.get(f.awayClubId)?.shortName ?? `Club ${f.awayClubId}`;
  const isPlayerMatch = f.homeClubId === playerClubId || f.awayClubId === playerClubId;
  return {
    id: `result-${f.id}`,
    icon: isPlayerMatch ? '🏟️' : '⚽',
    title: { key: 'news.scoreline', vars: { home, hg: f.homeGoals ?? 0, ag: f.awayGoals ?? 0, away } },
    body: isPlayerMatch ? { key: 'news.match_your' } : { key: 'news.match_result' },
    category: 'result',
    priority: isPlayerMatch ? 71 : 68,
  };
}
```

(`news.scoreline` = `'{home} {hg} - {ag} {away}'`; `t` deixa de ser usado dentro dessas funções mas mantém a assinatura — remova o param `t` se ficar não-usado e `tsc` reclamar.)

- Adicione `import { Language } from '@/i18n';` se necessário para o tipo do helper.

Adicione as ~50 chaves `news.*` a `pt.ts`/`en.ts`. Exemplos (par PT/EN):

`pt.ts`:
```ts
  'news.scoreline': '{home} {hg} - {ag} {away}',
  'news.results_header_body_comp': '{comp}',
  'news.leader_streak_title': '{club} no topo',
  'news.leader_streak_body_one': '{streak} semana consecutiva na liderança da tabela',
  'news.leader_streak_body_other': '{streak} semanas consecutivas na liderança da tabela',
  'news.new_leader_title': '{club} assume a ponta',
  'news.new_leader_body': 'Novo líder no topo da tabela',
  'news.mover_up_title': '{club} sobe para {pos}',
  'news.mover_down_title': '{club} cai para {pos}',
  'news.mover_up_body_one': 'Subiu {delta} posição desde {from}',
  'news.mover_up_body_other': 'Subiu {delta} posições desde {from}',
  'news.highscore_title': '{home} {hg} - {ag} {away}',
  'news.highscore_thrash': 'Goleada — {total} gols',
  'news.highscore_goalfest': 'Festival de gols — {total} gols',
  'news.highscore_clash': 'Jogo movimentado — {total} gols',
  'news.title_race_title': 'A briga pelo título esquenta',
  'news.title_race_body_one': '{leader} lidera {chaser} por apenas {gap} ponto',
  'news.title_race_body_other': '{leader} lidera {chaser} por apenas {gap} pontos',
  'news.retire_announced_title': '{name} vai se aposentar ao fim da temporada',
  'news.retire_retired_title': '{name} se aposenta',
  'news.retire_announced_body': 'Anuncia aposentadoria aos {age} — moral em queda livre',
  'news.retire_maxage_body': 'Pendura as chuteiras aos {age} — uma longa carreira chega ao fim',
  'news.retire_tough_body': 'Encerra a carreira aos {age} após uma temporada difícil',
```

`en.ts` (espelho com os textos originais do gerador, ex.):
```ts
  'news.scoreline': '{home} {hg} - {ag} {away}',
  'news.results_header_body_comp': '{comp}',
  'news.leader_streak_title': '{club} holds top spot',
  'news.leader_streak_body_one': '{streak} consecutive week at the top of the table',
  'news.leader_streak_body_other': '{streak} consecutive weeks at the top of the table',
  'news.new_leader_title': '{club} takes the lead',
  'news.new_leader_body': 'New leader at the top of the table',
  'news.mover_up_title': '{club} climbs to {pos}',
  'news.mover_down_title': '{club} drops to {pos}',
  'news.mover_up_body_one': 'Up {delta} position from {from}',
  'news.mover_up_body_other': 'Up {delta} positions from {from}',
  'news.highscore_title': '{home} {hg} - {ag} {away}',
  'news.highscore_thrash': 'Thrashing — {total} goals',
  'news.highscore_goalfest': 'Goal fest — {total} goals',
  'news.highscore_clash': 'High-scoring clash — {total} goals',
  'news.title_race_title': 'Title race heats up',
  'news.title_race_body_one': '{leader} lead {chaser} by just {gap} point',
  'news.title_race_body_other': '{leader} lead {chaser} by just {gap} points',
  'news.retire_announced_title': "{name} to retire at season's end",
  'news.retire_retired_title': '{name} retires',
  'news.retire_announced_body': 'Announces retirement at {age} — morale in freefall',
  'news.retire_maxage_body': 'Hangs up the boots at {age} — a long career comes to a close',
  'news.retire_tough_body': 'Calls it a career at {age} after a tough season',
```

> Complete as chaves restantes da tabela (best_attack/defense, comeback, equalizer, relegation, promotion, promo_chase, streak_*, recap_*, transfer_*, star_*) seguindo o mesmo molde. `tsc` (geradores usam `key: TKey`) + `parity.test` apanham qualquer faltante.

- [ ] **Step 5: Run tests (expect PASS) + tsc + parity**

Run: `npx jest __tests__/engine/news/ __tests__/i18n/parity.test.ts && npx tsc --noEmit`
Expected: PASS + tsc exit 0.

- [ ] **Step 6: Browser validation (Playwright MCP)**

NewsTab em **PT e EN**: avance semanas, gere manchetes/resultados; confirme títulos/corpos localizados, ordinais corretos (`2º` vs `2nd`), plural correto (1 semana vs 2 semanas). Trocar idioma re-traduz o feed (montado on-demand, não persistido).

- [ ] **Step 7: Commit**

```bash
git add src/engine/news/news-generator.ts src/screens/news/NewsScreen.tsx src/i18n/pt.ts src/i18n/en.ts __tests__/engine/news/news-generator.test.ts __tests__/engine/news/retirement-news.test.ts
git commit -m "feat(i18n): news generator emite TextDescriptor (engine pura, ordinal no render)"
```

---

## Task 4 — Navegação: títulos de header + tab labels

`nav.*`. 24 titles no stack + 5 tabs.

**Files:**
- Modify: `src/navigation/RootNavigator.tsx` (linhas 43-76)
- Modify: `src/navigation/TabNavigator.tsx` (linhas 27-47)
- Modify: `src/i18n/pt.ts` / `src/i18n/en.ts` (+~24 chaves `nav.*`)

No unit test (UI/config). Validado por `tsc` + browser.

- [ ] **Step 1: Add nav.* keys**

`pt.ts`:
```ts
  'nav.new_game': 'Novo Jogo',
  'nav.end_of_season': 'Fim de Temporada',
  'nav.finances': 'Finanças',
  'nav.staff': 'Comissão',
  'nav.upgrades': 'Melhorias',
  'nav.board': 'Diretoria',
  'nav.assistants': 'Assistentes',
  'nav.hire_assistant': 'Contratar Assistente',
  'nav.transfer_market': 'Mercado de Transferências',
  'nav.offers_sent': 'Propostas Enviadas',
  'nav.offers_received': 'Propostas Recebidas',
  'nav.free_agents': 'Jogadores Livres',
  'nav.my_listings': 'Minhas Listagens',
  'nav.league_table': 'Tabela da Liga',
  'nav.reports_technical': 'Assistente Técnico',
  'nav.reports_financial': 'Assistente Financeiro',
  'nav.reports_analytics': 'Analista de Dados',
  'nav.reports_youth': 'Analista Sub-21',
  'nav.reports_radar': 'Radar de Atributos',
  'nav.reports_opponent': 'Próximo Adversário',
  'nav.reports_transfer_roi': 'ROI de Transferências',
  'nav.reports_projection': 'Projeção de Classificação',
  'nav.reports_free_agent_scout': 'Scouting de Jogadores Livres',
  'nav.history': 'Histórico',
  'nav.tab_matches': 'Partidas',
  'nav.tab_news': 'Notícias',
  'nav.tab_tactics': 'Táticas',
  'nav.tab_club': 'Clube',
  'nav.tab_reports': 'Relatórios',
```

`en.ts` (espelho):
```ts
  'nav.new_game': 'New Game',
  'nav.end_of_season': 'End of Season',
  'nav.finances': 'Finances',
  'nav.staff': 'Staff',
  'nav.upgrades': 'Upgrades',
  'nav.board': 'Board',
  'nav.assistants': 'Assistants',
  'nav.hire_assistant': 'Hire Assistant',
  'nav.transfer_market': 'Transfer Market',
  'nav.offers_sent': 'Offers Sent',
  'nav.offers_received': 'Offers Received',
  'nav.free_agents': 'Free Agents',
  'nav.my_listings': 'My Listings',
  'nav.league_table': 'League Table',
  'nav.reports_technical': 'Technical Assistant',
  'nav.reports_financial': 'Financial Assistant',
  'nav.reports_analytics': 'Data Analyst',
  'nav.reports_youth': 'U-21 Analyst',
  'nav.reports_radar': 'Attribute Radar',
  'nav.reports_opponent': 'Next Opponent',
  'nav.reports_transfer_roi': 'Transfer ROI',
  'nav.reports_projection': 'Standings Projection',
  'nav.reports_free_agent_scout': 'Free Agent Scouting',
  'nav.history': 'History',
  'nav.tab_matches': 'Matches',
  'nav.tab_news': 'News',
  'nav.tab_tactics': 'Tactics',
  'nav.tab_club': 'Club',
  'nav.tab_reports': 'Reports',
```

- [ ] **Step 2: Wire useTranslation in both navigators**

Em `RootNavigator.tsx`: add `import { useTranslation } from '@/i18n';`, e dentro de `RootNavigator()`: `const { t } = useTranslation();`. Troque cada `options={{ title: 'New Game' }}` por `options={{ title: t('nav.new_game') }}`, etc., para os 24 screens (EndOfSeason mantém `headerShown: false` + `title: t('nav.end_of_season')`).

Em `TabNavigator.tsx`: add `import { useTranslation } from '@/i18n';`, `const { t } = useTranslation();`. Troque `title: 'Matches'` → `title: t('nav.tab_matches')`, etc. (mantém `tabBarIcon`).

- [ ] **Step 3: tsc + parity**

Run: `npx tsc --noEmit && npx jest __tests__/i18n/parity.test.ts`
Expected: exit 0 + PASS.

- [ ] **Step 4: Browser validation (Playwright MCP)**

Trocar idioma no MainMenu, entrar no jogo: confirme tab labels e títulos de header trocando entre PT/EN (os navigators re-renderizam via store Zustand).

- [ ] **Step 5: Commit**

```bash
git add src/navigation/RootNavigator.tsx src/navigation/TabNavigator.tsx src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(i18n): títulos de navegação (stack + tabs) via nav.*"
```

---

## Tasks 5–10: Extração mecânica de telas

Cada task abaixo é **extração mecânica de strings** seguindo o padrão das 7 telas core já feitas (ver `MainMenuScreen.tsx` como referência). Procedimento por arquivo:

1. Abra a tela; encontre **toda** literal visível ao usuário (`<Text>`, `Alert.alert`/`window.confirm`, `placeholder=`, labels de seção, botões).
2. Para cada uma, adicione a chave no namespace da tela em **`pt.ts` e `en.ts`** (pt = português correto, en = inglês correto — escolha o significado independente do idioma da literal atual). Use `{var}` para dinâmicos.
3. Troque a literal por `t('<namespace>.<key>', vars?)`. Add `import { useTranslation } from '@/i18n';` + `const { t } = useTranslation();` se faltar.
4. Deixe nomes próprios (clubes, jogadores, competições, nacionalidades) e moeda (`formatMoney`) como estão (fora de escopo).
5. Rode `npx tsc --noEmit` (exit 0) **e** `npx jest __tests__/i18n/parity.test.ts` (PASS) antes de cada commit.

Reuse `common.*` para palavras compartilhadas e as 18 `tactics.attr_*` para atributos.

**Cada task termina com:** tsc verde + parity verde + browser validation (PT/EN) + commit.

> **Nota de validação (telas órfãs):** SquadList, YouthAcademy, Training, TacticsSettings, CupBracket, TopScorers, Calendar, MatchResult só ficam **navegáveis** quando o epic `navigation-screens` as registrar. A extração de chaves pode prosseguir por arquivo agora (texto fica localizado); a **validação em browser** dessas telas específicas depende do `navigation-screens`. Telas alcançáveis hoje (transfers, finances, upgrades, staff, assistants, board, reports detail) validam normalmente.

- [ ] **Task 5 — Transfer economy** (namespace `transfer.*`).
  Files: `src/screens/club/transfers/{TransferMarketScreen,OffersSentScreen,OffersReceivedScreen,FreeAgentsScreen,MyListingsScreen}.tsx` + `src/screens/club/transfers/OfferModal.tsx`.
  Inclui os 3 Alerts de `OfferModal.tsx:98-106` (`Insufficient budget`/`Invalid fee`/`Invalid wage` + mensagens), título `Make an Offer` (:126), abas `Transfer`/`Loan` (:135/:143), labels `Loan Fee`/`Transfer Fee` (:167), `Weekly Wage` (:193), placeholders `Fee`/`Wage / week` (:177/:199), `Market Value`/`Current Wage` (:156/:160), `% of market value` (:183), `Exceeds your budget` (:188). Use vars para valores: `t('transfer.insufficient_budget_msg', { budget: formatMoney(buyerBudget), offer: formatMoney(fee) })`.
  Commit: `feat(i18n): extrai strings da economia de transferências (transfer.*)`.

- [ ] **Task 6 — Club management** (namespaces `finances.*`, `upgrades.*`, `staff.*`, `assistants.*`, `boardui.*`).
  Files: `src/screens/club/{FinancesScreen,UpgradesScreen,StaffScreen,AssistantsScreen,AssistantHiringScreen}.tsx` + UI labels restantes de `src/screens/club/BoardScreen.tsx` (o objetivo já foi na Task 1; aqui o chrome: títulos de seção, trust label, histórico).
  Commit: `feat(i18n): extrai strings de gestão do clube (finances/upgrades/staff/assistants/board)`.

- [ ] **Task 7 — Squad / Player** (namespace `squad.*`).
  Files: `src/screens/squad/SquadListScreen.tsx`, `src/screens/squad/PlayerDetailScreen.tsx`.
  **Remova** os 3 arrays hardcoded `TECHNICAL_ATTRS`/`MENTAL_ATTRS`/`PHYSICAL_ATTRS` (`PlayerDetailScreen.tsx:42-67`) e reuse as chaves `tactics.attr_*` já existentes (`pt.ts:124-141`) — elas cobrem exatamente os 18 campos de `PlayerAttributes`. Substitua o `label` por `t('tactics.attr_<key>')` mapeando `key: keyof PlayerAttributes` → sufixo snake_case (`longShots` → `attr_long_shots`, `freeKicks` → `attr_free_kicks`; os demais já batem). Defina os arrays só com `key` e derive o label no render. `awardLabel` (`:69`) e demais labels da tela → `squad.*`.
  Commit: `feat(i18n): PlayerDetail reusa tactics.attr_* + extrai SquadList (squad.*)`.

- [ ] **Task 8 — Reports detail (9 telas)** (namespace `report.*`).
  Files: `src/screens/reports/Reports{Technical,Financial,Analytics,Youth,Radar,Opponent,TransferROI,Projection,FreeAgentScout}Screen.tsx`.
  Hoje hardcoded em **português**; extraia para `report.*` com PT correto e EN correto (o toggle passa a funcionar). Reuse `tactics.attr_*` onde houver atributos (Radar).
  Commit: `feat(i18n): extrai strings dos 9 reports de detalhe (report.*)`.

- [ ] **Task 9 — Liga / Histórico / Temporada** (namespaces `standings.*`, `cup.*`, `topscorers.*`, `calendar.*`, `matchresult.*`, `history.*`, `youth.*`, `training.*`, `tacticssettings.*`, `endofseason.*`).
  Files: `src/screens/league/StandingsScreen.tsx` + telas de liga (CupBracket, TopScorers), `src/screens/history/HistoryScreen.tsx`, calendar/match-result screens, YouthAcademy, Training, TacticsSettings, e `src/screens/EndOfSeasonScreen.tsx` (o resto da tela: `FIRED — you have been dismissed.` :663, `MET`/`CLOSE`/`FAILED` :658, `Next season objective:` :669 — o objetivo já é derivado da Task 1).
  Commit: `feat(i18n): extrai liga/histórico/temporada (standings/cup/topscorers/calendar/matchresult/history/youth/training/tacticssettings/endofseason)`.

---

## Task 11 — Verificação final

- [ ] **Step 1: Suíte completa + type-check**

Run: `npx jest --no-cache 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: tudo verde — baseline 62 suites/536 testes + os novos (ordinal, board-objective) + os atualizados (objective/comment/news/retirement). Nenhuma regressão.

Run: `npx tsc --noEmit`
Expected: exit 0 (garante que toda `key` usada existe, pois `TKey = keyof typeof pt`).

- [ ] **Step 2: Browser validation final (Playwright MCP)**

Suba o web server (CI mode, harness background; `localhost:8082`). Percorra em **PT e EN**:
- MainMenu → toggle PT/EN persiste após reload.
- Home: objetivo + comentário do assistente localizados.
- News: manchetes/resultados/ordinais/plurais corretos.
- Navegação: tab labels + títulos de header.
- Transfers (OfferModal + Alerts), Finances, Upgrades, Staff, Assistants, Board, Reports detail — sem string hardcoded sobrando, sem chave crua aparecendo (fallback).
- Telas órfãs (Squad/Youth/Training/etc.): validar quando `navigation-screens` as tornar alcançáveis.

- [ ] **Step 3: Push (com autorização do usuário)**

```bash
git push origin main
```

---

## Sequencing & dependencies

- **Task 0 é obrigatoriamente primeira** (helpers desbloqueiam toda a engine).
- **Tasks 1→2→3** (engine) são independentes entre si após a Task 0, mas cada uma atualiza seus testes de contrato no **mesmo commit** (mudança de contrato `string`→`TextDescriptor`, não regressão). Podem ser feitas em qualquer ordem; a ordem 1→2→3 segue do menor para o maior.
- **Tasks 4-10** (extração mecânica) são independentes entre si e da engine; podem rodar em paralelo por arquivo. Só dependem da Task 0 (para `TextDescriptor`/`objectiveDescriptor` onde aplicável) e da infra `i18n-infra-core` já presente.
- **Dependência externa de código:** apenas `i18n-infra-core` (sibling) — já aterrissado (`src/i18n/{translate,types,index,useTranslation}.ts`, `__tests__/i18n/{parity,translate,persistence}.test.ts` confirmados).
- **Dependência externa de validação (não de código):** `navigation-screens` para tornar telas órfãs (Squad, Youth, Training, TacticsSettings, CupBracket, TopScorers, Calendar, MatchResult) navegáveis — afeta só o passo de browser das Tasks 7-9, não o código de extração.
- **Independente de `save-isolation` e `db-hardening`:** este epic **não muda schema**. A coluna `board_objectives.description` permanece (drop é escopo de `db-hardening`); este epic apenas deixa de **ler** `description` (grava `''` no upsert) e deriva o texto de `type`+`target`. Saves antigos exibem objetivo localizado sem migration.
- **Coordenação leve com `competitions-real`/`match-consequences`:** a chave `objective.promotion` já existe (Task 0) para quando `competitions-real` ligar o acesso; se esses epics adicionarem **novo** texto de UI, devem criar as próprias chaves no mesmo padrão.

## Definition of done

1. `npx tsc --noEmit` exit 0 (prova estática de que toda chave usada existe).
2. `npx jest --no-cache` verde — baseline 62/536 + novos/atualizados, zero regressão; `parity.test` cobre todas as chaves novas.
3. `engine/**` permanece **sem import de React** nos três fluxos (objetivo/assistente/news emitem `TextDescriptor`, nunca chamam `t`).
4. Browser validado (Playwright MCP) em **PT e EN** para todas as telas alcançáveis; telas órfãs validadas quando `navigation-screens` as registrar.
5. Nenhuma literal hardcoded de UI sobrando nas telas tocadas; nenhum nome próprio traduzido.
