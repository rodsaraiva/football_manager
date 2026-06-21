# D5 — Sweep de Aplicação nas 44 Telas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox (`- [ ]`). Cada Step é UMA ação de 2–5 min. Subagents **não** commitam — o passo "commit" descreve o que o orquestrador deve commitar.

**Goal:** Migrar as ~44 telas de `src/screens/` para o kit de componentes (D3) e o motor de imersão de clube (D4), uma tela por commit, eliminando estilos inline crus, emoji-como-ícone e os 29 `Alert.alert` no-op-no-web — protegido pelos snapshots/smoke tests de D0.

**Architecture:** D5 é puramente de *aplicação*: não cria componentes novos nem tokens novos — **consome** o que D1–D4 entregaram (`Card`, `Button`, `Chip`, `Badge`, `Stat`/`Body`/`Title`, `Sheet`, `EmptyState` v2, `Icon`, `useConfirm`, `useClubAccent` com rampa). Cada tela: (1) substitui `StyleSheet` inline + literais por componentes do kit + tokens; (2) troca emoji `<Text>` por `<Icon name=… color=…/>`; (3) troca `Alert.alert` por `await useConfirm()(…)` / `Toast`; (4) valida contra o snapshot D0 + browser; (5) commit isolado. As 2 telas beachhead (TransferMarket, FreeAgents) têm tasks detalhadas; as demais seguem um TEMPLATE repetível e um CHECKLIST ordenado.

**Tech Stack:** Expo 54 / RN 0.81 / React 19.1 / TS 5.9 strict / Jest 29 + ts-jest / better-sqlite3 (testes, **nunca** mock) / Zustand / React Navigation v7 / react-native-svg + react-native-reanimated (já instalados).

**Convenções:**
- **pt-BR** em comunicação e i18n; paridade pt/en obrigatória (`__tests__/i18n/parity.test.ts`).
- Tokens/kit **sempre** de `@/theme` e `@/components` — **zero** literal novo de spacing/radius/fontSize/cor nas telas migradas.
- Engine puro intocado (D5 não toca `src/engine` salvo leitura). `SeededRng` para qualquer aleatório; **zero** `Math.random`/`Date.now` em caminhos de render testados (snapshot determinístico).
- Ação principal usa a **rampa de accent do clube** (regra revisada §8 do spec: "ação = accent", não mais "ação = azul").
- `Alert.alert` é **no-op no web** (MEMORY `reference_rn_web_alert`) — toda confirmação migra para `useConfirm`.
- Branch: `feat/d5-screen-application-sweep`. Mensagens de commit terminam com:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Precedente a espelhar:**
- Spec: `docs/superpowers/specs/2026-06-20-design-system-premium-design.md` (§D5, §3 Contract, §8 regra ação=accent).
- Formato de plano: `docs/superpowers/plans/2026-06-14-w1-staff-hiring.md`.
- Telas-fonte beachhead: `src/screens/club/transfers/TransferMarketScreen.tsx` (255-358 = StyleSheet inline; 110,129,135 = Alert), `src/screens/club/transfers/FreeAgentsScreen.tsx` (305-577 = StyleSheet inline; 126,130 = Alert; 222-300 = Modal/sheet manual; 521-541 = yearChip).
- Kit consumido (entregue por D3/D4): `src/components/Card.tsx`, `Button.tsx`, `Chip.tsx`, `Badge.tsx`, `Sheet.tsx`, `EmptyState.tsx` (v2), `Icon/index.tsx`, `useConfirm.tsx`, `src/components/typography/*`, `src/theme/useClubAccent.ts` (`ClubAccentRamp`).

**Pré-condição dura:** D0 (snapshots/smoke das telas-alvo), D1 (tokens v2), D2 (tipografia), D3 (kit), D4 (imersão) **mergeados e verdes**. D5 não inicia antes. Validar com Task 0.

---

## File Structure

D5 **modifica** telas e **atualiza** snapshots; não cria componentes. Paths exatos por task abaixo.

- **Modify** `src/screens/club/transfers/TransferMarketScreen.tsx` — Card detail + Chip filtro + Button accent + Stat (Task 1)
- **Modify** `src/screens/club/transfers/FreeAgentsScreen.tsx` — EmptyState v2 + Sheet + useConfirm + Chip (Task 2)
- **Modify** (template, Task 3) — cada tela restante (CHECKLIST Task 4), uma por commit
- **Modify** snapshots em `__tests__/screens/**/<Tela>.test.tsx` (criados por D0) — atualizados conscientemente por tela
- **Modify** `src/i18n/pt.ts` + `src/i18n/en.ts` — apenas se a migração introduzir string nova (ex.: rótulo de CTA do EmptyState); paridade obrigatória

**Contract (assinaturas exatas consumidas — produzidas por D3/D4, NÃO por D5):**

```ts
// @/components/Button  (D3)
export function Button(props: {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean; disabled?: boolean;
  onPress: () => void; testID?: string; accessibilityLabel?: string;
}): JSX.Element;

// @/components/Card  (D3) — variantes hero/summary/detail + elevação
export function Card(props: {
  variant?: 'hero' | 'summary' | 'detail';
  children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string;
}): JSX.Element;

// @/components/Chip  (D3) — substitui dropdown/yearChip
export function Chip(props: {
  label: string; active?: boolean; onPress: () => void;
  testID?: string; accessibilityLabel?: string;
}): JSX.Element;

// @/components/Badge  (D3) — fill com tone (substitui overallBadge/positionBadge)
export function Badge(props: {
  label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  color?: string; testID?: string;
}): JSX.Element;

// @/components/Sheet  (D3) — backdrop + bottom-sheet padronizado
export function Sheet(props: {
  visible: boolean; onClose: () => void;
  children: React.ReactNode; testID?: string;
}): JSX.Element;

// @/components/EmptyState  (D3 v2) — ilustração SVG + título + descrição + CTA
export function EmptyState(props: {
  illustration?: IconName; title: string; description?: string;
  cta?: { label: string; onPress: () => void };
  testID?: string;
}): JSX.Element;

// @/components/Icon  (D3) — SVG, aceita color/size (substitui emoji)
export type IconName =
  | 'ball' | 'players' | 'news' | 'clipboard' | 'money' | 'chart'
  | 'search' | 'inbox' | 'whistle' | 'card-yellow' | 'card-red' | string;
export function Icon(props: { name: IconName; color?: string; size?: number }): JSX.Element;

// @/components/useConfirm  (D3) — substitui Alert.alert
export interface ConfirmOptions {
  title: string; message?: string;
  confirmLabel?: string; cancelLabel?: string;
  tone?: 'default' | 'danger';
}
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean>;

// @/components/typography  (D2)
export function Title(props: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }): JSX.Element;
export function Body(props: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }): JSX.Element;
export function Label(props: { children: React.ReactNode; style?: StyleProp<TextStyle> }): JSX.Element;
export function Stat(props: { children: React.ReactNode; color?: string; style?: StyleProp<TextStyle> }): JSX.Element; // tabular-nums

// @/theme/useClubAccent  (D4)
export interface ClubAccentRamp { accent: string; accentDim: string; accentBright: string; onAccent: string; }
export function useClubAccent(): ClubAccentRamp;
```

> **DoD global de D5 (válido para CADA tela migrada):**
> 1. `grep -rn 'Alert.alert' src/screens/<path>` = **0**.
> 2. Nenhum emoji-como-ícone em `<Text>` (grep do bloco de glifos = 0 na tela).
> 3. Nenhum literal novo de spacing/radius/fontSize/cor no `StyleSheet` da tela (só tokens/`@/theme` ou nada — o kit absorve).
> 4. Snapshot D0 da tela atualizado **conscientemente** (diff revisado, não cego).
> 5. Browser validado (Playwright MCP) sem erro de console.
> 6. `npx tsc --noEmit` e `npx jest <test da tela>` verdes.

---

## Task 0: Gate de pré-condição (D0–D4 verdes)

**Files:** nenhum (verificação). **Interfaces:** Consumes: kit + tokens + snapshots existentes · Produces: confirmação de que D5 pode iniciar.

- [ ] **Step 1 — confirmar que o kit existe:** rodar
  `ls src/components/Card.tsx src/components/Button.tsx src/components/Chip.tsx src/components/Badge.tsx src/components/Sheet.tsx src/components/useConfirm.tsx src/components/Icon/index.tsx src/components/typography/index.ts`
  → **esperado:** todos os arquivos listados sem `No such file`. Se algum faltar, **PARAR**: D3 não está mergeado, D5 não pode começar.
- [ ] **Step 2 — confirmar snapshots D0 das beachhead:** rodar
  `ls __tests__/screens/club/transfers/TransferMarketScreen.test.tsx __tests__/screens/club/transfers/FreeAgentsScreen.test.tsx`
  → **esperado:** ambos existem (criados em D0). Se faltarem, **PARAR**.
- [ ] **Step 3 — baseline verde:** `npx tsc --noEmit && npx jest` → **esperado:** exit 0, suíte verde. Esta é a linha de base contra a qual cada migração será diffada.
- [ ] **Step 4 — criar branch:** `git checkout -b feat/d5-screen-application-sweep` (orquestrador). Não commitar nada ainda.

---

## Task 1: Beachhead — TransferMarketScreen → kit

**Files:**
- Modify `src/screens/club/transfers/TransferMarketScreen.tsx`
- Test (existente, D0) `__tests__/screens/club/transfers/TransferMarketScreen.test.tsx`

**Interfaces:** Consumes: `Card`, `Chip`, `Button`, `Badge`, `Stat`, `Body`, `useConfirm`, `useClubAccent`, `Icon` · Produces: tela migrada (mesma API pública — é uma screen de navegação, sem props).

**Alvos concretos nesta tela (linhas atuais):**
- Filtro de posição via dropdown manual (`240-299`) → **Chip** horizontais.
- `playerRow`/`positionBadge`/`overallBadge` inline (`303-347`) → **Card variant="detail"** + **Badge**.
- `offerButton` `colors.primary` (`348-358`) → **Button variant="primary"** (accent do clube).
- OVR/valor → **Stat** (tabular-nums).
- `Alert.alert` (`110`, `129`, `135`) → `useConfirm` (erro/sucesso viram confirm/toast; `110` é validação → confirm de aviso; `129` sucesso → `useConfirm` informativo de 1 botão ou `Toast`; `135` erro → confirm de aviso).
- `<Text>… ▾</Text>` (`150`) → remover glifo, o Chip ativo já comunica estado.

- [ ] **Step 1 — ajustar o teste D0 para asserir o kit (vai falhar):** abrir `__tests__/screens/club/transfers/TransferMarketScreen.test.tsx` e adicionar uma asserção que prova a migração. Espelhar o setup já existente no arquivo (render com store/db reais em memória + `NavigationContainer`). Adicionar:
```tsx
it('usa o kit: renderiza Chip de filtro e Button de oferta, sem Alert', () => {
  const tree = renderTransferMarket(); // helper já definido no arquivo D0
  const json = tree.toJSON();
  const flat = JSON.stringify(json);
  // Chips de posição (testID convém vir do kit Chip via accessibilityLabel)
  expect(flat).toContain('chip-filter-All');
  // Button de oferta do kit expõe testID estável
  expect(tree.root.findAll((n) => n.props?.testID === 'offer-button').length).toBeGreaterThan(0);
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/screens/club/transfers/TransferMarketScreen.test.tsx`
  → **esperado:** falha em `chip-filter-All`/`offer-button` (ainda usa dropdown + Pressable cru).
- [ ] **Step 3 — migrar imports e remover StyleSheet inline:** no topo de `TransferMarketScreen.tsx`, trocar
```tsx
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
```
  por
```tsx
import { commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Stat, Body, Label } from '@/components/typography';
import { useConfirm } from '@/components/useConfirm';
```
  e remover `Alert` do import de `react-native` (manter `FlatList`, `View`, `ActivityIndicator`). Remover o `StyleSheet.create({...})` inteiro (linhas `240-368`) ao final do arquivo — o kit absorve. Manter apenas estilos de **layout** sem literais mágicos, derivando de `spacing` se necessário (importar `spacing` só se realmente usado).
- [ ] **Step 4 — substituir o filtro por Chips:** trocar o bloco `filterRow`+`showDropdown` (`143-179`) por uma faixa horizontal de Chips:
```tsx
const accent = useClubAccent();
const confirm = useConfirm();
// ...
<FlatList
  horizontal
  data={POSITION_OPTIONS}
  keyExtractor={(p) => p}
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
  renderItem={({ item: pos }) => (
    <Chip
      label={pos === 'All' ? t('transfer.filter_all') : pos}
      active={positionFilter === pos}
      onPress={() => setPositionFilter(pos)}
      testID={`chip-filter-${pos}`}
    />
  )}
/>
```
  Remover os estados `showDropdown`/`setShowDropdown` e o `<ContextualHint>` reposicionado para dentro do header da rota (mantê-lo, só não dentro do `filterRow` extinto — colocar acima da faixa de Chips num `View` simples).
- [ ] **Step 5 — substituir `playerRow` por Card detail + Badge + Stat:** no `renderItem` da lista (`193-215`):
```tsx
renderItem={({ item }) => {
  const posColor = getPositionColor(item.position);
  const ovrColor = getOverallColor(item.overall);
  return (
    <Card variant="detail">
      <Badge label={item.position} color={posColor} tone="neutral" />
      <View style={{ flex: 1 }}>
        <Body numberOfLines={1}>{item.name}</Body>
        <Label>{t('transfer.age_value', { age: item.age, value: formatCurrency(item.marketValue) })}</Label>
      </View>
      <Stat color={ovrColor}>{item.overall}</Stat>
      <Button
        label={t('transfer.offer_btn')}
        variant="primary"
        onPress={() => handleOpenOffer(item)}
        testID="offer-button"
      />
    </Card>
  );
}}
```
  O `Button variant="primary"` já consome `accent` internamente via `useClubAccent` (D4) — não passar cor manual.
- [ ] **Step 6 — migrar os 3 `Alert.alert` para `useConfirm`:** em `handleSubmitOffer` (`108-139`):
```tsx
if (selectedPlayer.clubId === null) {
  await confirm({ title: t('transfer.error'), message: t('transfer.player_is_free_agent'), confirmLabel: t('common.ok') });
  return;
}
try {
  await createOffer(/* ...inalterado... */);
  setSelectedPlayer(null);
  await confirm({ title: t('transfer.offer_sent_title'), message: t('transfer.offer_sent_msg', { player: selectedPlayer.name }), confirmLabel: t('common.ok') });
} catch (e) {
  await confirm({ title: t('transfer.error'), message: t('transfer.offer_failed', { error: (e as Error).message }), confirmLabel: t('common.ok'), tone: 'danger' });
}
```
  Verificar que `common.ok` existe em pt/en; se não, adicionar nos dois (paridade) — `pt: 'OK'`, `en: 'OK'`.
- [ ] **Step 7 — substituir o ActivityIndicator/empty pelo padrão do kit (opcional p/ esta task):** o estado `loading` mantém `ActivityIndicator` por ora (Skeleton é D6); o estado vazio (`185-188`) migra para `EmptyState`:
```tsx
) : players.length === 0 ? (
  <EmptyState illustration="search" title={t('transfer.no_players_available')} />
) : (
```
  (importar `EmptyState` de `@/components/EmptyState`).
- [ ] **Step 8 — rodar tipos + teste (passa):** `npx tsc --noEmit && npx jest __tests__/screens/club/transfers/TransferMarketScreen.test.tsx`
  → **esperado:** exit 0. O snapshot anterior **vai** quebrar (mudou a árvore) — atualizar conscientemente: `npx jest __tests__/screens/club/transfers/TransferMarketScreen.test.tsx -u`, depois **revisar o diff do `.snap`** (`git diff __tests__`) para confirmar que a mudança bate com a migração (Chip/Card/Badge presentes, dropdown ausente).
- [ ] **Step 9 — DoD grep:** rodar
  `grep -rn 'Alert.alert' src/screens/club/transfers/TransferMarketScreen.tsx` → **0 linhas**;
  `grep -nE '▾|⚽|👥|📰|📋|💰|📈' src/screens/club/transfers/TransferMarketScreen.tsx` → **0 linhas**.
- [ ] **Step 10 — browser:** subir web (`npm run web`, porta 8082), navegar Club → Transferências → Mercado; confirmar Chips filtram, Card renderiza com accent do clube no botão Oferta, e que enviar oferta abre o modal de confirmação (não some silenciosamente). 0 erros de console.
- [ ] **Step 11 — commit (orquestrador):**
  `git add src/screens/club/transfers/TransferMarketScreen.tsx __tests__/screens/club/transfers/TransferMarketScreen.test.tsx __tests__/screens/club/transfers/__snapshots__/ src/i18n/pt.ts src/i18n/en.ts`
  msg: `feat(d5): migrar TransferMarketScreen para o kit (Card/Chip/Button accent/Stat) + useConfirm`

---

## Task 2: Beachhead — FreeAgentsScreen → EmptyState v2 + Sheet + useConfirm

**Files:**
- Modify `src/screens/club/transfers/FreeAgentsScreen.tsx`
- Test (existente, D0) `__tests__/screens/club/transfers/FreeAgentsScreen.test.tsx`

**Interfaces:** Consumes: `Card`, `Chip`, `Button`, `Badge`, `Stat`, `Body`, `Label`, `Sheet`, `EmptyState`, `useConfirm`, `useClubAccent` · Produces: tela migrada.

**Alvos concretos (linhas atuais):**
- Dropdown de filtro (`144-177`, estilos `320-375`) → **Chip** horizontais (igual Task 1).
- `playerRow`/badges/`signButton` (`192-208`, estilos `379-433`) → **Card detail** + **Badge** + **Stat** + **Button variant="primary"**.
- Estado vazio (`179-182`) → **EmptyState v2** com ilustração + CTA "Atualizar lista" (`onPress={load}`).
- Modal manual `backdrop`/`sheet` (`216-300`, estilos `436-451`) → **Sheet**.
- `yearChip`/`yearChipActive` (`263-275`, estilos `521-541`) → **Chip**.
- `btnPrimary`/`btnSecondary` (`281-294`, estilos `553-576`) → **Button** (`primary`/`secondary`).
- `Alert.alert` (`126`, `130`) → `useConfirm`.

- [ ] **Step 1 — ajustar teste D0 (vai falhar):** em `__tests__/screens/club/transfers/FreeAgentsScreen.test.tsx`, adicionar:
```tsx
it('estado vazio usa EmptyState v2 com CTA; sem Alert', () => {
  const tree = renderFreeAgents({ noFreeAgents: true }); // helper D0 que semeia 0 free agents
  const flat = JSON.stringify(tree.toJSON());
  expect(flat).toContain('empty-free-agents');         // testID do EmptyState
  expect(flat).toContain(t('transfer.refresh_list'));   // label do CTA
});
```
- [ ] **Step 2 — rodar (falha):** `npx jest __tests__/screens/club/transfers/FreeAgentsScreen.test.tsx`
  → **esperado:** falha em `empty-free-agents`/`transfer.refresh_list`.
- [ ] **Step 3 — i18n do CTA:** adicionar em `src/i18n/pt.ts` `transfer.refresh_list: 'Atualizar lista'` e em `src/i18n/en.ts` `transfer.refresh_list: 'Refresh list'`. Rodar `npx jest __tests__/i18n/parity.test.ts` → **verde** (paridade mantida).
- [ ] **Step 4 — migrar imports:** trocar
```tsx
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
```
  por
```tsx
import { spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Sheet } from '@/components/Sheet';
import { EmptyState } from '@/components/EmptyState';
import { Stat, Body, Label, Title } from '@/components/typography';
import { useConfirm } from '@/components/useConfirm';
```
  Remover `Alert` e `Modal` do import de `react-native` (Modal vira `Sheet`). Manter `TextInput`, `ScrollView`, `View`, `FlatList`, `ActivityIndicator`, `Pressable`.
- [ ] **Step 5 — filtro por Chips:** substituir `filterRow`+`showDropdown` (`145-177`) pela mesma faixa horizontal de Chips da Task 1 Step 4 (testID `chip-filter-${pos}`). Remover estados `showDropdown`/`setShowDropdown`.
- [ ] **Step 6 — lista com Card/Badge/Stat/Button:** substituir o `renderItem` (`187-209`):
```tsx
renderItem={({ item }) => {
  const pColor = getPositionColor(item.position);
  const oColor = getOverallColor(item.overall);
  const expected = freeAgentExpectedWage(item.overall);
  return (
    <Card variant="detail">
      <Badge label={item.position} color={pColor} tone="neutral" />
      <View style={{ flex: 1 }}>
        <Body numberOfLines={1}>{item.name}</Body>
        <Label>{t('transfer.fa_meta', { age: item.age, wage: formatMoney(expected) })}</Label>
      </View>
      <Stat color={oColor}>{item.overall}</Stat>
      <Button label={t('transfer.sign_btn')} variant="primary" onPress={() => handleOpenSign(item)} testID="sign-button" />
    </Card>
  );
}}
```
- [ ] **Step 7 — estado vazio → EmptyState v2:** substituir `179-182`:
```tsx
filtered.length === 0 ? (
  <EmptyState
    illustration="search"
    title={t('transfer.no_free_agents')}
    cta={{ label: t('transfer.refresh_list'), onPress: load }}
    testID="empty-free-agents"
  />
) : (
```
- [ ] **Step 8 — Modal manual → Sheet:** substituir `<Modal …>…</Modal>` (`216-300`) por `<Sheet visible={selected !== null} onClose={handleCloseSign}>…</Sheet>`. Dentro, manter o `ScrollView`, mas:
  - `<Text style={styles.title}>` → `<Title>`;
  - o `playerCard` inline (`229-242`) → `<Card variant="summary">` com `<Body>`/`<Label>`/`<Stat>`;
  - os `yearChip` (`263-275`) → `<Chip label={…} active={years===y} onPress={() => setYears(y)} testID={`year-${y}`} />`;
  - os botões de ação (`281-294`): `<Button label={t('common.cancel')} variant="secondary" onPress={handleCloseSign} />` e `<Button label={t('transfer.sign_player')} variant="primary" onPress={handleSubmitSigning} testID="confirm-sign" />`.
  - `TextInput` mantém-se, mas com estilo derivado de tokens (não literais; se o kit expuser um `Input`, usar — caso contrário manter `TextInput` com `commonStyles`/tokens existentes).
- [ ] **Step 9 — Alert → useConfirm:** em `handleSubmitSigning` (`113-132`):
```tsx
const confirm = useConfirm();
// ...
if (res.success) {
  handleCloseSign();
  load();
  await confirm({ title: t('transfer.signed_title'), message: t('transfer.signed_msg', { name: selected.name }), confirmLabel: t('common.ok') });
} else {
  await confirm({ title: t('transfer.cannot_sign'), message: res.reason ?? t('transfer.unknown_error'), confirmLabel: t('common.ok'), tone: 'danger' });
}
```
- [ ] **Step 10 — remover StyleSheet inline:** apagar o `StyleSheet.create({...})` (`305-577`). Manter só os poucos estilos de layout que sobrarem (gap/flex), derivados de `spacing` — sem números mágicos (`top:52`, `borderRadius:6/10/20` saem com o Sheet/Chip/Card).
- [ ] **Step 11 — rodar tipos + teste:** `npx tsc --noEmit && npx jest __tests__/screens/club/transfers/FreeAgentsScreen.test.tsx -u` → exit 0. **Revisar o diff do `.snap`** (Sheet/EmptyState/Chip presentes; Modal/backdrop ausentes).
- [ ] **Step 12 — DoD grep:**
  `grep -rn 'Alert.alert' src/screens/club/transfers/FreeAgentsScreen.tsx` → **0**;
  `grep -nE '▾|⚽|👥|📰|📋|💰|📈' src/screens/club/transfers/FreeAgentsScreen.tsx` → **0**.
- [ ] **Step 13 — browser:** Club → Transferências → Agentes Livres; confirmar Chips, Card accent, Sheet de assinatura abre/fecha, anos por Chip, e que assinar mostra confirmação. Forçar lista vazia (filtro de posição sem agentes) e ver o EmptyState com CTA "Atualizar lista". 0 erros de console.
- [ ] **Step 14 — commit (orquestrador):**
  `git add src/screens/club/transfers/FreeAgentsScreen.tsx __tests__/screens/club/transfers/FreeAgentsScreen.test.tsx __tests__/screens/club/transfers/__snapshots__/ src/i18n/pt.ts src/i18n/en.ts`
  msg: `feat(d5): migrar FreeAgentsScreen para o kit (EmptyState v2 + Sheet + Chip + useConfirm)`

---

## Task 3: TEMPLATE de migração por tela (repetível para o CHECKLIST)

Esta task **não** é executada uma vez — é o **procedimento** aplicado a CADA tela do CHECKLIST (Task 4), **uma tela por commit**. Substituir `<Tela>` pelo nome e `<path>` pelo caminho real (ex.: `src/screens/home/HomeScreen.tsx`).

**Files (por tela):** Modify `<path>`; Modify/Create `__tests__/screens/.../<Tela>.test.tsx` (D0 já criou para as core; para telas sem snapshot D0, criar um smoke test mínimo neste passo); Modify `src/i18n/{pt,en}.ts` (só se surgir string nova).

**Interfaces:** Consumes: kit (`Card`/`Button`/`Chip`/`Badge`/`Stat`/`Body`/`Label`/`Title`/`Sheet`/`EmptyState`/`Icon`/`useConfirm`/`useClubAccent`) · Produces: tela migrada, mesma rota/props.

- [ ] **Step 1 — garantir teste de referência (falha se faltar):** se existe snapshot D0 da tela, rodá-lo como baseline: `npx jest __tests__/screens/.../<Tela>.test.tsx` (verde antes de tocar). Se **não** existe (telas fora do conjunto core de D0), criar smoke test mínimo espelhando o padrão D0 (render com store/db reais em memória + `NavigationContainer`, asserir "não throw + contém texto i18n esperado") **antes** de migrar — este é o teste-que-falha-primeiro do TDD da tela:
```tsx
it('<Tela> renderiza sem throw e mostra título', () => {
  const tree = render<Tela>(); // helper local com NavigationContainer + db seed
  expect(tree.toJSON()).toBeTruthy();
  expect(JSON.stringify(tree.toJSON())).toContain(t('<chave i18n do título>'));
});
```
- [ ] **Step 2 — inventário da tela:** rodar nos limites do arquivo:
  `grep -nE 'Alert\.alert|StyleSheet\.create|colors\.|borderRadius:|fontSize:|padding[A-Za-z]*: *[0-9]|margin[A-Za-z]*: *[0-9]|⚽|👥|📰|📋|💰|📈|👟|🟨|🟥|⏭️|🎯|▶️|▾' <path>`
  → mapeia tudo que precisa sair. Cada match é um alvo.
- [ ] **Step 3 — trocar estilos inline pelo kit:** substituir blocos `View`+`Text`+`StyleSheet` por `Card`/`Button`/`Chip`/`Badge` + componentes de tipografia (`Title`/`Body`/`Label`/`Stat`). Remover `StyleSheet.create` quando o kit absorver tudo; o que sobrar de layout usa `spacing`/`radius` de `@/theme` — **zero literal numérico novo**.
- [ ] **Step 4 — remover emoji-ícone:** cada `<Text>…glifo…</Text>` vira `<Icon name="…" color={accent.accent ?? …} size={…} />`. Mapa de ícones (D3): ⚽→`ball`, 👥→`players`, 📰→`news`, 📋→`clipboard`, 💰→`money`, 📈→`chart`, 🔍→`search`, 👟→`boot`, 🟨→`card-yellow`, 🟥→`card-red`. Cor: chrome neutro → token de texto; destaque/ativo → `useClubAccent().accent`.
- [ ] **Step 5 — Alert → useConfirm:** cada `Alert.alert(title, msg)` (informativo) → `await confirm({ title, message, confirmLabel: t('common.ok') })`; cada `Alert.alert(title, msg, [{cancel},{destructive}])` (decisão) → `if (await confirm({ title, message, tone: 'danger', confirmLabel, cancelLabel })) { /* ação */ }`. Adicionar `const confirm = useConfirm();` no corpo do componente. Remover `Alert` do import RN.
- [ ] **Step 6 — validar snapshot + tipos:** `npx tsc --noEmit && npx jest __tests__/screens/.../<Tela>.test.tsx -u`. **Revisar o diff do `.snap`** — confirmar que sumiram os nós inline e entraram os do kit; nenhum texto i18n esperado desapareceu.
- [ ] **Step 7 — DoD grep (zero):**
  `grep -rn 'Alert.alert' <path>` → **0**;
  `grep -nE '⚽|👥|📰|📋|💰|📈|👟|🟨|🟥|⏭️|🎯|▶️|▾' <path>` → **0**;
  `grep -nE 'borderRadius: *[0-9]|fontSize: *[0-9]|padding[A-Za-z]*: *[0-9]+|margin[A-Za-z]*: *[0-9]+' <path>` → **0** (literais novos; tokens passam).
- [ ] **Step 8 — browser (se a tela tem UI navegável):** abrir a tela em `localhost:8082`, exercitar a interação principal (filtro/CTA/sheet/confirm). 0 erros de console. Telas puramente derivadas de relatório (`reports/*`) validar render + dados batendo.
- [ ] **Step 9 — commit (orquestrador), UMA tela por commit:**
  `git add <path> __tests__/screens/.../<Tela>.test.tsx __tests__/screens/.../__snapshots__/ [src/i18n/pt.ts src/i18n/en.ts se mudou]`
  msg: `feat(d5): migrar <Tela> para o kit`

---

## Task 4: CHECKLIST ordenado das telas restantes (uma por commit, via Task 3)

Aplicar o **TEMPLATE da Task 3** a cada item, na ordem (impacto decrescente). Cada checkbox = 1 commit isolado. Beachhead (Task 1/2) já feita.

**Lote A — Core de alto tráfego (prioridade máxima):**
- [ ] `src/screens/home/HomeScreen.tsx` — hub diário; Card summary/hero + Button accent (continuar partida).
- [ ] `src/screens/squad/SquadListScreen.tsx` — lista do elenco; Card detail por jogador (extrair o ritmo de linha p/ `PlayerCard` se já existir componente).
- [ ] `src/screens/squad/PlayerDetailScreen.tsx` — perfil; Card hero + Stat (atributos) + StatBar (gradiente, já do kit) + Badge.
- [ ] `src/screens/squad/PlayerDetailRoute.tsx` — wrapper de rota; só ajustar loading/empty p/ kit se houver.
- [ ] `src/screens/tactics/TacticsScreen.tsx` — escalação; Chip de formação + Card + accent no slot ativo.
- [ ] `src/screens/tactics/TacticsSettingsScreen.tsx` — sliders/seletores → Chip/Card.
- [ ] `src/screens/tactics/SetPiecesScreen.tsx` — seletores de cobrador → Chip + Card.
- [ ] `src/screens/tactics/TrainingScreen.tsx` — Chip de foco + Card + Button.

**Lote B — Reports (hub + 10; manter paleta `report*` de `tokens.ts:23-33`):**
- [ ] `src/screens/reports/ReportsHubScreen.tsx` — grade de entradas; Card summary + Icon (sem emoji).
- [ ] `src/screens/reports/ReportsTechnicalScreen.tsx`
- [ ] `src/screens/reports/ReportsFinancialScreen.tsx`
- [ ] `src/screens/reports/ReportsYouthScreen.tsx`
- [ ] `src/screens/reports/ReportsAnalyticsScreen.tsx`
- [ ] `src/screens/reports/ReportsProjectionScreen.tsx`
- [ ] `src/screens/reports/ReportsOpponentScreen.tsx`
- [ ] `src/screens/reports/ReportsTransferROIScreen.tsx`
- [ ] `src/screens/reports/ReportsFreeAgentScoutScreen.tsx`
- [ ] `src/screens/reports/ReportsRadarScreen.tsx` — radar é SVG; só migrar chrome (Card/Title/Label), não o gráfico.
- [ ] `src/screens/reports/ScoutingScreen.tsx`

**Lote C — Club + sub-telas:**
- [ ] `src/screens/club/ClubOverviewScreen.tsx` — Card hero + Stat (reputação/saldo) + accent.
- [ ] `src/screens/club/FinancesScreen.tsx` — Card summary + StatBar.
- [ ] `src/screens/club/BoardScreen.tsx` — Card + StatBar (board trust com accent) + useConfirm em ações.
- [ ] `src/screens/club/StaffScreen.tsx` — Card detail + Button + useConfirm (dispensar).
- [ ] `src/screens/club/AssistantsScreen.tsx` — Card detail + Button.
- [ ] `src/screens/club/AssistantHiringScreen.tsx` — Card candidatos + Button + useConfirm.
- [ ] `src/screens/club/UpgradesScreen.tsx` — Card + Button + useConfirm (comprar upgrade).
- [ ] `src/screens/club/transfers/MyListingsScreen.tsx` — Card detail + Button + useConfirm (remover listagem).
- [ ] `src/screens/club/transfers/OffersReceivedScreen.tsx` — Card + Button (aceitar/recusar via useConfirm).
- [ ] `src/screens/club/transfers/OffersSentScreen.tsx` — Card detail + Badge de status.
- [ ] `src/screens/club/transfers/OfferModal.tsx` — Modal manual → Sheet + Button (espelhar Task 2).

**Lote D — Restante (menu/match/league/news/national/history/career/squad-extra):**
- [ ] `src/screens/MainMenuScreen.tsx` — Button accent + Card; remover emoji se houver.
- [ ] `src/screens/NewGameScreen.tsx` — Chip de seleção de clube + Button + Card; accent reage ao clube escolhido.
- [ ] `src/screens/EndOfSeasonScreen.tsx` — Card hero + Stat (resumo de temporada).
- [ ] `src/screens/GameOverScreen.tsx` — Card + Button.
- [ ] `src/screens/home/CalendarScreen.tsx` — Card por jornada + Badge de resultado.
- [ ] `src/screens/home/MatchResultScreen.tsx` — Card hero placar + Stat; `MatchEventItem` emoji → Icon (`ball`/`card-yellow`/`card-red`/`boot`).
- [ ] `src/screens/home/MatchHalftimeScreen.tsx` — Card + Button (instruções).
- [ ] `src/screens/home/PreSeasonScreen.tsx` — Card + Button.
- [ ] `src/screens/match/PressConferenceScreen.tsx` — Card pergunta + Chip de resposta.
- [ ] `src/screens/squad/TeamTalkScreen.tsx` — Chip de tom + Card.
- [ ] `src/screens/squad/YouthAcademyScreen.tsx` — Card detail + Button + useConfirm (promover).
- [ ] `src/screens/league/StandingsScreen.tsx` — tabela em Card + Badge de posição; accent na linha do clube do jogador.
- [ ] `src/screens/league/TopScorersScreen.tsx` — Card detail + Stat.
- [ ] `src/screens/league/CupBracketScreen.tsx` — Card por confronto; só chrome (bracket é layout).
- [ ] `src/screens/news/NewsScreen.tsx` — Card por notícia + Icon (categoria) + EmptyState v2 (sem notícias).
- [ ] `src/screens/national/InternationalsScreen.tsx` — Card detail + Badge.
- [ ] `src/screens/history/HistoryScreen.tsx` — Card por temporada + Stat.
- [ ] `src/screens/career/AchievementsScreen.tsx` — Card + Icon (troféu) + Badge desbloqueado/bloqueado.
- [ ] `src/screens/career/JobOffersScreen.tsx` — Card oferta + Button + useConfirm (aceitar).

> Observação: `OfferModal.tsx` e `MatchEventItem` (componente) não são "telas" puras mas estão no fluxo das telas acima — migram junto com a tela que os hospeda (OfferModal com a Task 4 Lote C; MatchEventItem com `MatchResultScreen`). Após o último item, rodar a verificação final (Task 5).

---

## Task 5: Verificação final do sweep (DoD do épico-D5)

**Files:** nenhum (verificação global). **Interfaces:** Consumes: todas as telas migradas · Produces: confirmação de DoD.

- [ ] **Step 1 — zero Alert global:** `grep -rn 'Alert.alert' src/screens src/components` → **0 linhas** (29 → 0). Se restar, é uma tela não migrada — voltar à Task 3 para ela.
- [ ] **Step 2 — zero emoji-ícone:** `grep -rnE '⚽|👥|📰|📋|💰|📈|👟|🟨|🟥|⏭️|🎯|▶️|▾' src/screens src/components` → **0 linhas**.
- [ ] **Step 3 — zero import de `Alert` em telas:** `grep -rn "Alert" src/screens | grep -v 'AlertProvider\|useConfirm'` → **0** (nenhum import residual de `Alert` do RN).
- [ ] **Step 4 — suíte completa verde:** `npx tsc --noEmit && npx jest` → exit 0, incluindo todos os snapshots de tela atualizados e `parity.test.ts`.
- [ ] **Step 5 — varredura de literais nas telas migradas (amostragem):**
  `grep -rnE 'borderRadius: *[0-9]|fontSize: *[0-9]|^\s*(padding|margin)[A-Za-z]*: *[0-9]+' src/screens` → idealmente **0**; qualquer match é literal cru que escapou — corrigir.
- [ ] **Step 6 — browser final:** percorrer os fluxos críticos (Home → Partida → Resultado; Transferências; Reports hub; Club). Trocar de clube (cor diferente) e confirmar que CTAs/abas/destaques re-tingem (D4 ativo). 0 erros de console.
- [ ] **Step 7 — DoD:** 0 `Alert.alert`, 0 emoji-ícone, 0 literal novo nas telas; todos os snapshots D0 atualizados e revisados; browser validado; suíte+tsc verdes. **Pronto para merge** (`superpowers:finishing-a-development-branch`).

---

## Self-Review

1. **Cobertura do spec (§D5):** beachhead TransferMarket (Task 1) e FreeAgents (Task 2) detalhadas; Core/Reports/Club/Restante cobertos pelo CHECKLIST (Task 4) via TEMPLATE (Task 3); DoD do spec (0 Alert, 0 emoji, 0 literal, snapshot+browser) refletido no DoD global e na Task 5. Regra "ação=accent" aplicada (Button primary consome `useClubAccent`).
2. **Placeholder scan:** sem "TBD". `<Tela>`/`<path>` são marcadores de template explicitamente substituíveis, não placeholders de comportamento. Strings i18n novas (`transfer.refresh_list`, `common.ok`) têm valor pt/en definido e passo de paridade.
3. **Consistência de tipos:** todas as assinaturas consumidas (`Button`/`Card`/`Chip`/`Badge`/`Sheet`/`EmptyState`/`Icon`/`useConfirm`/`useClubAccent`/typography) estão no Contract e batem com §3 do spec; D5 só consome, não define — Task 0 é o gate que garante que existem antes de iniciar.
4. **Determinismo/escopo:** D5 não introduz `Math.random`/`Date.now`; snapshots dependem dos inputs determinísticos de D0 (SeededRng). Engine não é tocado. Um commit por tela (≈44) conforme spec "XG fatiado".
