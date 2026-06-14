# W4 — Onboarding / Tooltips Contextuais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Steps com checkbox (`- [ ]`).

**Goal:** Um componente `ContextualHint` (ícone "?" → tooltip dismissável, persistido globalmente) aplicado a 3 telas (Táticas, Mercado, Relatórios), aparecendo 1× por tela e não reaparecendo após reload.

**Architecture:** Persistência via `app_settings` (k/v global) com chave `hint_seen_<screen>`, encapsulada em `isHintSeen`/`markHintSeen` (queries/settings.ts, TDD). `ContextualHint.tsx` é um componente stateless-ish: lê `isHintSeen` no mount (auto-expande se nunca visto), renderiza um botão "?" sempre presente, e ao dispensar chama `markHintSeen` + colapsa. Tokens de `@/theme`. Distinto do `OnboardingModal` do P8 (camada separada, dismiss por dica).

**Tech Stack:** TypeScript 5.9 strict, React Native, expo-sqlite/better-sqlite3 (testes reais), i18n pt/en paridade, tokens `@/theme`.

**Convenções:** TDD da persistência (better-sqlite3 real, nunca mock); i18n pt/en em paridade; cores/spacing via `@/theme`; YAGNI — sem tour guiado.

---

## Referências (verificadas 2026-06-14)

| Ponto | Arquivo | Nota |
|---|---|---|
| `getSetting`/`setSetting` (app_settings, key-only) | `src/database/queries/settings.ts:3-13` | base dos helpers |
| Padrão de componente + theme | `src/components/OnboardingModal.tsx` | tokens `colors/spacing/fontSize/radius`, `TKey` |
| dbHandle na tela | `useDatabaseStore()` → `{ dbHandle }` | ex. NewsScreen |
| Tela Táticas | `src/screens/tactics/TacticsScreen.tsx` | mount no header |
| Tela Mercado | `src/screens/club/transfers/TransferMarketScreen.tsx` | mount no header |
| Tela Relatórios | `src/screens/reports/ReportsHubScreen.tsx` | mount no header |
| i18n | `src/i18n/pt.ts` / `en.ts` (sem `hints.*` ainda) | adicionar bloco `hints.*` |
| Teste de paridade | `__tests__/i18n/parity.test.ts` | — |

---

## Task 1: Helpers de persistência da flag (TDD)

**Files:**
- Modify: `src/database/queries/settings.ts`
- Test: `__tests__/database/hint-settings.test.ts`

- [ ] **Step 1: Teste falhando**

```typescript
import { createTestDb, createTestDbHandle } from './test-helpers';
import { isHintSeen, markHintSeen } from '@/database/queries/settings';

describe('contextual hint persistence', () => {
  it('começa não-visto, fica visto após marcar', async () => {
    const raw = createTestDb();
    const db = createTestDbHandle(raw);
    expect(await isHintSeen(db, 'tactics')).toBe(false);
    await markHintSeen(db, 'tactics');
    expect(await isHintSeen(db, 'tactics')).toBe(true);
    expect(await isHintSeen(db, 'transfers')).toBe(false); // por tela
    raw.close();
  });
});
```

> Confirmar que `app_settings` está no schema de teste (seedTestDb não é necessário se a tabela existe no schema base — checar; se preciso, usar `seedTestDb(raw)`).

Run: `npx jest hint-settings` → FAIL.

- [ ] **Step 2: Implementar em settings.ts**

```typescript
const HINT_PREFIX = 'hint_seen_';

export async function isHintSeen(db: DbHandle, screen: string): Promise<boolean> {
  return (await getSetting(db, `${HINT_PREFIX}${screen}`)) === '1';
}

export async function markHintSeen(db: DbHandle, screen: string): Promise<void> {
  await setSetting(db, `${HINT_PREFIX}${screen}`, '1');
}
```

Run: `npx jest hint-settings` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/database/queries/settings.ts __tests__/database/hint-settings.test.ts
git commit -m "feat(hints): persistência hint_seen_<screen> em app_settings (TDD)"
```

## Task 2: Componente ContextualHint

**Files:**
- Create: `src/components/ContextualHint.tsx`

- [ ] **Step 1: Implementar o componente**

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useDatabaseStore } from '@/store/database-store';
import { isHintSeen, markHintSeen } from '@/database/queries/settings';

interface Props {
  screen: string;       // id estável p/ a chave (ex.: 'tactics')
  titleKey: TKey;
  bodyKey: TKey;
}

/** Tooltip contextual dismissável; auto-aparece 1× por tela, persistido em app_settings. */
export function ContextualHint({ screen, titleKey, bodyKey }: Props) {
  const { t } = useTranslation();
  const { dbHandle } = useDatabaseStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!dbHandle) return;
      const seen = await isHintSeen(dbHandle, screen);
      if (alive && !seen) setOpen(true);
    })();
    return () => { alive = false; };
  }, [dbHandle, screen]);

  const dismiss = async () => {
    setOpen(false);
    if (dbHandle) await markHintSeen(dbHandle, screen);
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.badge}
        onPress={() => setOpen((v) => !v)}
        accessibilitylabel={t('hints.toggle')}
        activeOpacity={0.8}
      >
        <Text style={styles.badgeText}>?</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.tooltip}>
          <Text style={styles.title}>{t(titleKey)}</Text>
          <Text style={styles.body}>{t(bodyKey)}</Text>
          <TouchableOpacity style={styles.dismiss} onPress={dismiss} activeOpacity={0.8}>
            <Text style={styles.dismissText}>{t('hints.dismiss')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  badge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary,
  },
  badgeText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: 'bold' },
  tooltip: {
    position: 'absolute', top: 28, right: 0, width: 260, zIndex: 10,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.primary,
  },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.xxs },
  body: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 18 },
  dismiss: { marginTop: spacing.sm, alignSelf: 'flex-end' },
  dismissText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
});
```

> Confirmar que `colors.surfaceLight`/`radius.lg` existem em `@/theme` (OnboardingModal usa `radius.lg`). Ajustar tokens se preciso.

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` → sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/ContextualHint.tsx
git commit -m "feat(hints): componente ContextualHint (tooltip dismissável)"
```

## Task 3: Chaves i18n

**Files:**
- Modify: `src/i18n/pt.ts`, `src/i18n/en.ts`

- [ ] **Step 1: Adicionar bloco `hints.*` (pt primeiro, espelhar em en)**

```
'hints.toggle': 'Ajuda',
'hints.dismiss': 'Entendi',
'hints.tactics_title': 'Montando a tática',
'hints.tactics_body': 'Escolha a formação e a mentalidade. Jogadores fora de posição rendem menos.',
'hints.transfers_title': 'Mercado de transferências',
'hints.transfers_body': 'Filtre alvos, faça uma proposta e negocie. Fique de olho no orçamento e na folha salarial.',
'hints.reports_title': 'Central de relatórios',
'hints.reports_body': 'Acompanhe métricas, projeções de classificação e o desempenho do elenco.',
```

- [ ] **Step 2: Paridade + tsc**

Run: `npx jest __tests__/i18n/parity.test.ts && npx tsc --noEmit` → verde.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/pt.ts src/i18n/en.ts
git commit -m "feat(hints): chaves i18n das 3 dicas contextuais"
```

## Task 4: Aplicar nas 3 telas

**Files:**
- Modify: `src/screens/tactics/TacticsScreen.tsx`
- Modify: `src/screens/club/transfers/TransferMarketScreen.tsx`
- Modify: `src/screens/reports/ReportsHubScreen.tsx`

- [ ] **Step 1: Montar o hint no header de cada tela**

Em cada tela, importar `ContextualHint` e posicioná-lo no canto do header (alinhado à direita do título). Exemplos de props:
- Táticas: `<ContextualHint screen="tactics" titleKey="hints.tactics_title" bodyKey="hints.tactics_body" />`
- Mercado: `<ContextualHint screen="transfers" titleKey="hints.transfers_title" bodyKey="hints.transfers_body" />`
- Relatórios: `<ContextualHint screen="reports" titleKey="hints.reports_title" bodyKey="hints.reports_body" />`

Ler o header existente de cada tela e encaixar o componente sem quebrar o layout (envolver o título + hint num `View` row com `justifyContent: 'space-between'` se necessário). Não hardcodar cores/spacing.

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` → sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/screens/tactics/TacticsScreen.tsx src/screens/club/transfers/TransferMarketScreen.tsx src/screens/reports/ReportsHubScreen.tsx
git commit -m "feat(hints): aplicar ContextualHint em Táticas/Mercado/Relatórios"
```

---

## DoD
- `npx jest hint-settings` verde; suíte completa + tsc limpos.
- Browser: em cada tela a dica aparece 1×, dismissável; após reload **não** reaparece; "?" reabre manualmente. 0 erros de console.

## Self-Review
- Cobertura: persistência (Task 1) ✓, componente (Task 2) ✓, i18n (Task 3) ✓, 3 telas (Task 4) ✓.
- Tipos: `ContextualHint` props `screen/titleKey/bodyKey`; helpers `isHintSeen/markHintSeen(db, screen)` consistentes.
- Riscos: `app_settings` é global (dica vista vale p/ todos os saves) — decisão do spec. Tokens `surfaceLight`/`radius.lg` — confirmar no theme.
