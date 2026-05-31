# Design: i18n — Infra + Telas Core

**Data:** 2026-05-31
**Status:** Aprovado
**Escopo:** football-manager v0.1 — sub-projeto 1 de 2 (i18n; UI imersiva é o sub-projeto 2)

---

## Contexto

O app tem ~250 strings literais espalhadas por 49 telas/componentes, em **idioma misto e inconsistente** (ex.: "ADVANCE WEEK", "CAIXA ATUAL", "Análises da comissão técnica" coexistem). Não há nenhuma infra de internacionalização instalada. O `PRODUCT.md` (v0.1) exige **bilíngue pt-BR / EN**.

Esta entrega cria a infra de i18n e a aplica ao **fluxo principal** (telas core). As demais telas ficam para o sub-projeto seguinte.

## Decisões de produto confirmadas

- **Abordagem**: solução própria leve (sem libs de i18n). Só 2 idiomas, strings simples.
- **Idioma inicial**: default **pt-BR**, sem auto-detect. Toggle manual no MainMenu.
- **Persistência**: via SQLite (tabela `app_settings`), **sem dependências novas**.
- **Escopo**: infra completa + 7 telas core.

## Não-escopo

- Sub-telas: `screens/reports/*`, `screens/club/transfers/*`, `screens/club/*` (exceto ClubOverview), `screens/squad/*`, `screens/league/*`, `screens/history/*`, `screens/home/*` (exceto Home), `EndOfSeasonScreen`.
- Títulos de header do `RootNavigator` (configuração estática de navegação).
- Auto-detect do locale do aparelho (precisaria de `expo-localization`).
- Strings geradas pela engine (ex.: descrições de objetivo, manchetes) — permanecem como estão por ora.

---

## Design

### 1. Módulo `src/i18n/`

Chaves **flat com dot-notation** — type-safety trivial e paridade pt/EN garantida pelo compilador.

```ts
// src/i18n/pt.ts
export const pt = {
  'mainmenu.title': 'FOOTBALL MANAGER',
  'mainmenu.new_game': 'Novo Jogo',
  'home.advance_week': 'Avançar Semana',
  'home.season_week': 'Temporada {season} — Semana {week}',
  // ...
} as const;

// src/i18n/en.ts
import { pt } from './pt';
export const en: Record<keyof typeof pt, string> = {
  'mainmenu.title': 'FOOTBALL MANAGER',
  'mainmenu.new_game': 'New Game',
  'home.advance_week': 'Advance Week',
  'home.season_week': 'Season {season} — Week {week}',
  // ...
};
```

O tipo `Record<keyof typeof pt, string>` faz o compilador **exigir que `en` tenha exatamente as mesmas chaves** que `pt` (chave faltante ou sobrando = erro de build).

```ts
// src/i18n/index.ts
import { pt } from './pt';
import { en } from './en';

export type Language = 'pt' | 'en';
export type TKey = keyof typeof pt;
const DICTS: Record<Language, Record<TKey, string>> = { pt, en };

/** Pura: resolve a chave no idioma e interpola {var}. Fallback = a própria chave. */
export function translate(
  lang: Language,
  key: TKey,
  vars?: Record<string, string | number>,
): string {
  let s: string = DICTS[lang][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
```

```ts
// hook (em src/i18n/index.ts ou src/i18n/useTranslation.ts)
import { useCallback } from 'react';
import { useI18nStore } from '@/store/i18n-store';

export function useTranslation() {
  const lang = useI18nStore((s) => s.language);
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
  return { t, lang };
}
```

### 2. Store de idioma — `src/store/i18n-store.ts` (puro, sem DB)

O store guarda **apenas estado** — nada de DB. Assim é trivial de testar e tem uma única responsabilidade. A persistência fica nas queries (seção 3) e a orquestração em dois helpers (abaixo).

```ts
interface I18nState {
  language: Language;                    // default 'pt'
  setLanguage: (lang: Language) => void; // só estado (reativo)
}
```

**Helpers de orquestração** — `src/i18n/persistence.ts` (recebem o `db` → testáveis com SQLite real):

```ts
// Lê o idioma salvo e aplica ao store. Sem valor salvo/ inválido → mantém default 'pt'.
export async function loadPersistedLanguage(db: DbHandle): Promise<void> {
  const saved = await getSetting(db, 'language');
  if (saved === 'pt' || saved === 'en') useI18nStore.getState().setLanguage(saved);
}

// Troca o idioma e persiste. Usado pelo toggle.
export async function changeLanguage(db: DbHandle, lang: Language): Promise<void> {
  useI18nStore.getState().setLanguage(lang);
  await setSetting(db, 'language', lang);
}
```

### 3. Persistência — `app_settings`

Tabela key-value no `schema.ts` (`SCHEMA_SQL` + `TABLE_NAMES`) e migração idempotente no `database-store.initialize`:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

`src/database/queries/settings.ts`:

```ts
export async function getSetting(db: DbHandle, key: string): Promise<string | null>;
export async function setSetting(db: DbHandle, key: string, value: string): Promise<void>; // INSERT OR REPLACE
```

Boot (`App.tsx` ou efeito que roda após `isReady`): `await loadPersistedLanguage(dbHandle)`.

### 4. Toggle no MainMenu

Controle compacto **[PT] EN** no `MainMenuScreen` (ex.: dois botões pequenos no topo/rodapé). Idioma ativo destacado; tocar chama `changeLanguage(dbHandle, lang)` (atualiza store + persiste). As telas re-renderizam por reatividade do store.

### 5. Telas core (extração)

Todo texto visível no corpo destas 7 telas passa a usar `t('...')`:
`MainMenuScreen`, `NewGameScreen`, `HomeScreen`, `NewsScreen`, `TacticsScreen`, `ClubOverviewScreen`, `ReportsHubScreen`.

Strings com valores dinâmicos usam interpolação (`t('home.season_week', { season, week })`). Namespacing das chaves por tela (`mainmenu.*`, `newgame.*`, `home.*`, `news.*`, `tactics.*`, `club.*`, `reports.*`, `common.*` para reaproveitáveis como "Voltar"/"Cancelar").

---

## Testes

**TDD — função pura** (`__tests__/i18n/translate.test.ts`, sem SQLite):
1. Resolve uma chave no idioma pt e no en.
2. Interpola `{var}` (1 e múltiplas variáveis).
3. Fallback: chave inexistente retorna a própria chave.

**Paridade dos dicionários** (`__tests__/i18n/parity.test.ts`):
4. `Object.keys(pt)` e `Object.keys(en)` são idênticos (set-equal) — pega divergência em runtime além da garantia de tipo.

**Query** (`__tests__/database/queries/settings.test.ts`, SQLite real em memória):
5. `setSetting` grava e `getSetting` lê; `getSetting` de chave ausente → `null`; `setSetting` sobrescreve (INSERT OR REPLACE).

**Store + orquestração** (`__tests__/i18n/persistence.test.ts`, SQLite real):
6. `setLanguage` muda só o estado do store (sem tocar o DB).
7. `changeLanguage` persiste (lido de volta via `getSetting`) e atualiza o store.
8. `loadPersistedLanguage` aplica o valor salvo; sem valor salvo (ou inválido) → mantém default `pt`.

**UI**: validar no browser (Playwright) — toggle PT/EN troca os textos das 7 telas core ao vivo.

---

## Sequência de build

1. `i18n/` (pt.ts/en.ts seed mínimo + `translate` + tipos) + testes pura/paridade → verde.
2. `app_settings` (schema + migração) + `settings.ts` queries + teste → verde.
3. `i18n-store.ts` + boot load + teste → verde.
4. Toggle no MainMenu + extração das 7 telas core (preenchendo pt.ts/en.ts) → tsc verde.
5. Validação no browser (toggle troca idioma) + suíte completa.
