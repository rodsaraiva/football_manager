import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  Platform,
} from 'react-native';
import StatBar from '@/components/StatBar';
import { ContextualHint } from '@/components/ContextualHint';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { getPositionColor } from '@/utils/player-colors';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import {
  getActiveTactic,
  updateTactic,
  setTacticLineup,
  getTacticLineup,
} from '@/database/queries/tactics';
import { getPlayersByClub, getPlayerById, setTransferListing, setLoanListing } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { Formation, Tactic, AttackFocus, SubstitutionStrategy } from '@/types';
import { Player, PlayerAttributes, Position } from '@/types';
import { FORMATION_ROWS } from '@/engine/formations';
import { useTranslation } from '@/i18n';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';
import { Card, Chip, Button, Badge, Sheet, Icon } from '@/components/kit';
import { Title, Body, Label, Caption, Stat } from '@/components/typography';

const ATTACK_FOCUS_VALUES: AttackFocus[] = [
  'balanced',
  'through_middle',
  'down_the_flanks',
  'counter_attack',
  'possession',
];

const SUB_STRATEGY_VALUES: SubstitutionStrategy[] = [
  'balanced',
  'minimal',
  'heavy_rotation',
  'youth_chances',
  'chase_the_game',
];

type PlayerWithOvr = Player & { attributes: PlayerAttributes; overall: number };

const FORMATIONS: Formation[] = [
  '4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3',
  '4-5-1', '4-1-4-1', '5-3-2', '5-4-1',
  '4-4-1-1', '4-1-2-1-2', '4-2-2-2', '3-4-2-1',
  '4-3-1-2', '3-4-1-2', '4-2-4',
];

const POSITION_GROUP: Record<string, string> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
  LW: 'FWD', RW: 'FWD', ST: 'FWD',
};

const POS_ORDER: Record<string, number> = {
  GK:0, CB:1, LB:2, RB:3, CDM:4, CM:5, CAM:6, LM:7, RM:8, LW:9, RW:10, ST:11,
};

interface SlotAssignment {
  positionRole: string;
  player: PlayerWithOvr | null;
}

function bestPlayerForPosition(
  position: Position,
  squad: PlayerWithOvr[],
  usedIds: Set<number>,
): PlayerWithOvr | null {
  const targetGroup = POSITION_GROUP[position] ?? 'MID';
  const candidates = squad
    .filter((p) => !usedIds.has(p.id))
    .map((p) => {
      const base = calculateOverall(p.attributes, position);
      let bonus = 0;
      if (p.position === position) bonus = 15;
      else if (p.secondaryPosition === position) bonus = 8;
      else if (POSITION_GROUP[p.position] === targetGroup) bonus = 3;
      else if (position === 'GK' && p.position !== 'GK') bonus = -30;
      else if (p.position === 'GK' && position !== 'GK') bonus = -30;
      else bonus = -10;
      return { player: p, score: base + bonus };
    })
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.player ?? null;
}

function buildLineup(formation: string, squad: PlayerWithOvr[]): SlotAssignment[][] {
  const rows = FORMATION_ROWS[formation as Formation] ?? FORMATION_ROWS['4-4-2'];
  const usedIds = new Set<number>();
  return rows.map((row) =>
    row.map((role) => {
      const player = bestPlayerForPosition(role as Position, squad, usedIds);
      if (player) usedIds.add(player.id);
      return { positionRole: role, player };
    }),
  );
}

function buildBench(squad: PlayerWithOvr[], startingIds: Set<number>): PlayerWithOvr[] {
  const available = squad.filter(p => !startingIds.has(p.id));
  const bench: PlayerWithOvr[] = [];
  // 1 GK
  const gk = available.find(p => p.position === 'GK');
  if (gk) bench.push(gk);
  // 6 best outfield
  const outfield = available.filter(p => p.position !== 'GK' && !bench.includes(p));
  outfield.sort((a, b) => b.overall - a.overall);
  for (const p of outfield) {
    if (bench.length >= 8) break;
    bench.push(p);
  }
  return bench;
}

function ovrColorFor(ovr: number): string {
  return ovr >= 75 ? colors.success : ovr >= 60 ? colors.warning : colors.danger;
}

// ─── Selected player indicator ───────────────────────────────────────────────
type SelectedPlayer = {
  source: 'pitch';
  row: number;
  slot: number;
  player: PlayerWithOvr;
} | {
  source: 'bench';
  index: number;
  player: PlayerWithOvr;
} | {
  source: 'unlisted';
  player: PlayerWithOvr;
} | null;

export function TacticsScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const currentSave = useGameStore((s) => s.currentSave);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const saveId = currentSave?.id;

  const [tactic, setTactic] = useState<Tactic | null>(null);
  const [squad, setSquad] = useState<PlayerWithOvr[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFormation, setSelectedFormation] = useState<Formation>('4-4-2');
  const [attackFocus, setAttackFocus] = useState<AttackFocus>('balanced');
  const [subStrategy, setSubStrategy] = useState<SubstitutionStrategy>('balanced');
  const [lineup, setLineup] = useState<SlotAssignment[][] | null>(null);
  const [bench, setBench] = useState<PlayerWithOvr[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [detailPlayer, setDetailPlayer] = useState<PlayerWithOvr | null>(null);

  // Transfer listing state for modal
  const [isTransferListed, setIsTransferListedLocal] = useState<boolean>(false);
  const [askingPriceText, setAskingPriceText] = useState<string>('');
  const [isLoanListed, setIsLoanListedLocal] = useState<boolean>(false);
  const [loanShareText, setLoanShareText] = useState<string>('50');

  useEffect(() => {
    setIsTransferListedLocal(detailPlayer?.isTransferListed ?? false);
    setAskingPriceText(detailPlayer?.askingPrice != null ? String(detailPlayer.askingPrice) : '');
    setIsLoanListedLocal(detailPlayer?.isLoanListed ?? false);
    setLoanShareText(detailPlayer?.loanWageShare != null ? String(Math.round(detailPlayer.loanWageShare * 100)) : '50');
  }, [detailPlayer?.id]);

  async function handleToggleTransferListing(next: boolean) {
    setIsTransferListedLocal(next);
    if (!dbHandle || !detailPlayer || saveId == null) return;
    const price = askingPriceText.trim() ? parseInt(askingPriceText.replace(/\D/g, ''), 10) : null;
    await setTransferListing(dbHandle, saveId, detailPlayer.id, next, Number.isFinite(price) ? price : null);
    const updated = await getPlayerById(dbHandle, saveId, detailPlayer.id);
    if (updated) setDetailPlayer({ ...updated, overall: calculateOverall(updated.attributes, updated.position) });
  }

  async function handleBlurAskingPrice() {
    if (!dbHandle || !detailPlayer || !isTransferListed || saveId == null) return;
    const price = askingPriceText.trim() ? parseInt(askingPriceText.replace(/\D/g, ''), 10) : null;
    await setTransferListing(dbHandle, saveId, detailPlayer.id, true, Number.isFinite(price) ? price : null);
  }

  async function handleToggleLoanListing(next: boolean) {
    setIsLoanListedLocal(next);
    if (!dbHandle || !detailPlayer || saveId == null) return;
    const sharePct = loanShareText.trim() ? parseInt(loanShareText.replace(/\D/g, ''), 10) : 50;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(sharePct) ? sharePct : 50));
    await setLoanListing(dbHandle, saveId, detailPlayer.id, next, next ? clamped / 100 : null);
    const updated = await getPlayerById(dbHandle, saveId, detailPlayer.id);
    if (updated) setDetailPlayer({ ...updated, overall: calculateOverall(updated.attributes, updated.position) });
  }

  async function handleBlurLoanShare() {
    if (!dbHandle || !detailPlayer || !isLoanListed || saveId == null) return;
    const sharePct = loanShareText.trim() ? parseInt(loanShareText.replace(/\D/g, ''), 10) : 50;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(sharePct) ? sharePct : 50));
    await setLoanListing(dbHandle, saveId, detailPlayer.id, true, clamped / 100);
  }

  // Refs for latest state (needed by DOM drag event handlers to avoid stale closures)
  const lineupRef = useRef(lineup);
  const benchRef = useRef(bench);
  const squadRef = useRef(squad);
  const formationRef = useRef(selectedFormation);
  useEffect(() => { lineupRef.current = lineup; }, [lineup]);
  useEffect(() => { benchRef.current = bench; }, [bench]);
  useEffect(() => { squadRef.current = squad; }, [squad]);
  useEffect(() => { formationRef.current = selectedFormation; }, [selectedFormation]);

  // ─── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dbHandle || playerClubId === null || saveId == null) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      try {
        const activeTactic = await getActiveTactic(dbHandle, saveId, playerClubId);
        setTactic(activeTactic);
        if (activeTactic) {
          setSelectedFormation(activeTactic.formation);
          setAttackFocus(activeTactic.attackFocus);
          setSubStrategy(activeTactic.subStrategy);
        }

        const basePlayers = await getPlayersByClub(dbHandle, saveId, playerClubId);
        const withAttrs: PlayerWithOvr[] = [];
        for (const p of basePlayers) {
          const full = await getPlayerById(dbHandle, saveId, p.id);
          if (full) withAttrs.push({ ...full, overall: calculateOverall(full.attributes, full.position) });
        }
        setSquad(withAttrs);

        // Load saved lineup if available
        if (activeTactic) {
          const savedLineup = await getTacticLineup(dbHandle, saveId, activeTactic.id);
          if (savedLineup) {
            const byId = new Map(withAttrs.map(p => [p.id, p]));
            const formation = activeTactic.formation;
            const rows = FORMATION_ROWS[formation as Formation] ?? FORMATION_ROWS['4-4-2'];
            let slotIdx = 0;
            const builtLineup: SlotAssignment[][] = rows.map(row =>
              row.map(role => {
                const pid = savedLineup.starterIds[slotIdx++];
                return { positionRole: role, player: pid != null ? (byId.get(pid) ?? null) : null };
              }),
            );
            setLineup(builtLineup);
            const benchPlayers = savedLineup.benchIds
              .map(id => byId.get(id))
              .filter((p): p is PlayerWithOvr => p != null);
            setBench(benchPlayers);
          }
        }
      } finally { setLoading(false); }
    })();
  }, [dbHandle, saveId, playerClubId]);

  // ─── Derived state ─────────────────────────────────────────────────────────
  const displayLineup = useMemo(
    () => lineup ?? buildLineup(selectedFormation, squad),
    [lineup, selectedFormation, squad],
  );

  const startingIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of displayLineup) for (const s of row) if (s.player) ids.add(s.player.id);
    return ids;
  }, [displayLineup]);

  const benchIds = useMemo(() => new Set(bench.map(p => p.id)), [bench]);

  const unlisted = useMemo(() =>
    squad
      .filter(p => !startingIds.has(p.id) && !benchIds.has(p.id))
      .sort((a, b) => (POS_ORDER[a.position] ?? 99) - (POS_ORDER[b.position] ?? 99) || b.overall - a.overall),
    [squad, startingIds, benchIds],
  );

  // Rebuild bench from squad when lineup changes AND no bench is set yet
  // (bench is managed manually after initial load)
  const benchInitialized = useRef(false);
  useEffect(() => {
    if (!benchInitialized.current && squad.length > 0) {
      benchInitialized.current = true;
      // only auto-build if no saved lineup was loaded (lineup === null means fallback)
      if (lineup === null) {
        setBench(buildBench(squad, startingIds));
      }
    }
  }, [squad]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist lineup to DB whenever it changes
  const tacticRef = useRef(tactic);
  useEffect(() => { tacticRef.current = tactic; }, [tactic]);
  useEffect(() => {
    const tacticVal = tacticRef.current;
    if (!dbHandle || !tacticVal || lineup === null) return;
    const starterIds: number[] = [];
    for (const row of lineup) for (const s of row) if (s.player) starterIds.push(s.player.id);
    // Guard: only persist if lineup is complete (11 starters). A partial lineup
    // (e.g. loaded from saved data where some players were transferred away) must
    // not overwrite a previously-complete lineup with an incomplete one, and must
    // not feed the engine a squad smaller than required.
    if (starterIds.length < 11) return;
    if (saveId == null) return;
    const benchIdList = bench.map(p => p.id);
    setTacticLineup(dbHandle, saveId, tacticVal.id, starterIds, benchIdList).catch(() => {});
  }, [lineup, bench, dbHandle]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleFormationChange = useCallback(async (formation: Formation) => {
    setSelectedFormation(formation);
    setLineup(null);
    benchInitialized.current = false; // allow bench to rebuild
    if (!dbHandle || !tactic || saveId == null) return;
    try {
      await updateTactic(dbHandle, saveId, tactic.id, { formation });
      setTactic(prev => prev ? { ...prev, formation } : prev);
    } catch { /* ignore */ }
  }, [dbHandle, saveId, tactic]);

  const handleAttackFocusChange = useCallback(async (value: AttackFocus) => {
    setAttackFocus(value);
    if (!dbHandle || !tactic || saveId == null) return;
    try {
      await updateTactic(dbHandle, saveId, tactic.id, { attackFocus: value });
      setTactic(prev => prev ? { ...prev, attackFocus: value } : prev);
    } catch { /* ignore */ }
  }, [dbHandle, saveId, tactic]);

  const handleSubStrategyChange = useCallback(async (value: SubstitutionStrategy) => {
    setSubStrategy(value);
    if (!dbHandle || !tactic || saveId == null) return;
    try {
      await updateTactic(dbHandle, saveId, tactic.id, { subStrategy: value });
      setTactic(prev => prev ? { ...prev, subStrategy: value } : prev);
    } catch { /* ignore */ }
  }, [dbHandle, tactic]);

  // No more tap-to-swap. Tap opens player detail modal. Swaps are done via drag and drop only.

  // ─── Drag & Drop (web only, via DOM refs) ───────────────────────────────────
  const dragDataRef = useRef<{ key: string; src: NonNullable<SelectedPlayer> } | null>(null);

  const setupDrag = useCallback((el: any, key: string, src: NonNullable<SelectedPlayer>) => {
    if (Platform.OS !== 'web' || !el) return;
    // Access underlying DOM node
    const node = el as HTMLElement;
    node.draggable = true;
    node.style.cursor = 'grab';
    node.ondragstart = (e: DragEvent) => {
      dragDataRef.current = { key, src };
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
      }
      node.style.opacity = '0.5';
    };
    node.ondragend = () => {
      dragDataRef.current = null;
      node.style.opacity = '1';
      setDropTarget(null);
    };
  }, []);

  const setupDrop = useCallback((el: any, key: string) => {
    if (Platform.OS !== 'web' || !el) return;
    const node = el as HTMLElement;
    node.ondragover = (e: DragEvent) => { e.preventDefault(); setDropTarget(key); };
    node.ondragleave = () => setDropTarget(null);
    node.ondrop = (e: DragEvent) => {
      e.preventDefault();
      setDropTarget(null);
      if (dragDataRef.current) {
        performSwap(dragDataRef.current.src, key);
        dragDataRef.current = null;
      }
    };
  }, []);

  const performSwap = useCallback((src: NonNullable<SelectedPlayer>, tgtKey: string) => {
    const pitchMatch = tgtKey.match(/^pitch-(\d+)-(\d+)$/);
    const benchMatch = tgtKey.match(/^bench-(\d+)$/);

    // Use refs to get current state (avoids stale closures in DOM event handlers)
    const curLineup = lineupRef.current ?? buildLineup(formationRef.current, squadRef.current);
    const curBench = benchRef.current;

    if (src.source === 'pitch' && pitchMatch) {
      const tRow = +pitchMatch[1], tSlot = +pitchMatch[2];
      const tPlayer = curLineup[tRow]?.[tSlot]?.player;
      setLineup(curLineup.map((r, ri) => r.map((s, si) => {
        if (ri === src.row && si === src.slot) return { ...s, player: tPlayer ?? null };
        if (ri === tRow && si === tSlot) return { ...s, player: src.player };
        return s;
      })));
    } else if (src.source === 'bench' && pitchMatch) {
      const tRow = +pitchMatch[1], tSlot = +pitchMatch[2];
      const tPlayer = curLineup[tRow]?.[tSlot]?.player;
      setLineup(curLineup.map((r, ri) => r.map((s, si) => {
        if (ri === tRow && si === tSlot) return { ...s, player: src.player };
        return s;
      })));
      if (tPlayer) setBench(curBench.map((p, i) => i === src.index ? tPlayer : p));
    } else if (src.source === 'pitch' && benchMatch) {
      const tIdx = +benchMatch[1];
      const tPlayer = curBench[tIdx];
      setLineup(curLineup.map((r, ri) => r.map((s, si) => {
        if (ri === src.row && si === src.slot) return { ...s, player: tPlayer ?? null };
        return s;
      })));
      setBench(curBench.map((p, i) => i === tIdx ? src.player : p));
    } else if (src.source === 'unlisted' && pitchMatch) {
      const tRow = +pitchMatch[1], tSlot = +pitchMatch[2];
      setLineup(curLineup.map((r, ri) => r.map((s, si) => {
        if (ri === tRow && si === tSlot) return { ...s, player: src.player };
        return s;
      })));
    } else if (src.source === 'unlisted' && benchMatch) {
      const tIdx = +benchMatch[1];
      setBench(curBench.map((p, i) => i === tIdx ? src.player : p));
    } else if (src.source === 'bench' && benchMatch) {
      const tIdx = +benchMatch[1];
      const next = [...curBench];
      const tmp = next[src.index];
      next[src.index] = next[tIdx];
      next[tIdx] = tmp;
      setBench(next);
    }
  }, []);

  // Combined ref setup for drag + drop
  const dragDropRef = useCallback((el: any, key: string, src: NonNullable<SelectedPlayer> | null) => {
    if (!el) return;
    if (src) setupDrag(el, key, src);
    setupDrop(el, key);
  }, [setupDrag, setupDrop]);

  // ─── i18n helpers ──────────────────────────────────────────────────────────
  const attackFocusLabel = useCallback((value: AttackFocus): string => {
    const keyMap: Record<AttackFocus, Parameters<typeof t>[0]> = {
      balanced: 'tactics.attack_focus_balanced',
      through_middle: 'tactics.attack_focus_through_middle',
      down_the_flanks: 'tactics.attack_focus_down_the_flanks',
      counter_attack: 'tactics.attack_focus_counter_attack',
      possession: 'tactics.attack_focus_possession',
    };
    return t(keyMap[value]);
  }, [t]);

  const subStrategyLabel = useCallback((value: SubstitutionStrategy): string => {
    const keyMap: Record<SubstitutionStrategy, Parameters<typeof t>[0]> = {
      balanced: 'tactics.sub_strategy_balanced',
      minimal: 'tactics.sub_strategy_minimal',
      heavy_rotation: 'tactics.sub_strategy_heavy_rotation',
      youth_chances: 'tactics.sub_strategy_youth_chances',
      chase_the_game: 'tactics.sub_strategy_chase_the_game',
    };
    return t(keyMap[value]);
  }, [t]);

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.scrollContent}>
      {/* Formation selector */}
      <View style={styles.selectorBlock}>
        <Label color={colors.textMuted} style={styles.selectorLabel}>{t('tactics.formation_label')}</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {FORMATIONS.map(f => (
            <Chip
              key={f}
              label={f}
              selected={f === selectedFormation}
              accent={accent.accent}
              onPress={() => handleFormationChange(f)}
              testID={`tactics-formation-${f}`}
            />
          ))}
        </ScrollView>
      </View>

      {/* Attack focus selector */}
      <View style={styles.selectorBlock}>
        <Label color={colors.textMuted} style={styles.selectorLabel}>{t('tactics.attack_focus_label')}</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {ATTACK_FOCUS_VALUES.map(value => (
            <Chip
              key={value}
              label={attackFocusLabel(value)}
              selected={value === attackFocus}
              accent={accent.accent}
              onPress={() => handleAttackFocusChange(value)}
              testID={`tactics-attackfocus-${value}`}
            />
          ))}
        </ScrollView>
      </View>

      {/* Substitution strategy selector */}
      <View style={styles.selectorBlock}>
        <Label color={colors.textMuted} style={styles.selectorLabel}>{t('tactics.substitutions_label')}</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SUB_STRATEGY_VALUES.map(value => (
            <Chip
              key={value}
              label={subStrategyLabel(value)}
              selected={value === subStrategy}
              accent={accent.accent}
              onPress={() => handleSubStrategyChange(value)}
              testID={`tactics-substrategy-${value}`}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.dragHintRow}>
        <Caption color={colors.textMuted} style={styles.dragHintText}>{t('tactics.drag_hint')}</Caption>
        <ContextualHint screen="tactics" titleKey="hints.tactics_title" bodyKey="hints.tactics_body" />
      </View>

      {/* Set pieces sub-screen link */}
      <Pressable
        style={styles.setPiecesLink}
        onPress={() => navigation.navigate('SetPieces')}
        testID="tactics-setpieces-link"
        accessibilityRole="button"
        accessibilityLabel={t('tactics.set_pieces_link')}
      >
        <Label color={accent.accent}>{t('tactics.set_pieces_link')}</Label>
        <Icon name="arrowRight" color={accent.accent} size={16} />
      </Pressable>

      {/* Pitch */}
      <Card variant="detail" accent={accent.accent} style={styles.pitchView}>
        {displayLineup.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.pitchRow}>
            {row.map((slot, slotIdx) => {
              const p = slot.player;
              const ovr = p?.overall ?? 0;
              const key = `pitch-${rowIdx}-${slotIdx}`;
              const isDropHover = dropTarget === key;
              return (
                <Pressable
                  key={slotIdx}
                  ref={(el: any) => dragDropRef(el, key, p ? { source: 'pitch', row: rowIdx, slot: slotIdx, player: p } : null)}
                  style={[styles.pitchSlot, isDropHover && styles.dropHover]}
                  onPress={() => p && setDetailPlayer(p)}
                >
                  <Caption color={getPositionColor(slot.positionRole)} style={styles.pitchRole}>{slot.positionRole}</Caption>
                  <Caption numberOfLines={1} style={styles.pitchName}>
                    {p ? p.name.split(' ').pop() : '—'}
                  </Caption>
                  {p && <Stat color={ovrColorFor(ovr)} style={styles.pitchOvr}>{ovr}</Stat>}
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>

      {/* Bench */}
      <Card variant="detail" accent={accent.accent} style={styles.section}>
        <Label color={colors.textMuted} style={styles.sectionLabel}>{t('tactics.bench_label', { count: bench.length })}</Label>
        <View style={styles.benchGrid}>
          {bench.map((p, idx) => {
            const key = `bench-${idx}`;
            const isDropHover = dropTarget === key;
            return (
              <Pressable
                key={p.id}
                ref={(el: any) => dragDropRef(el, key, { source: 'bench', index: idx, player: p })}
                style={[styles.benchCard, isDropHover && styles.dropHover]}
                onPress={() => setDetailPlayer(p)}
              >
                <Caption color={getPositionColor(p.position)} style={styles.benchPos}>{p.position}</Caption>
                <Caption numberOfLines={1} style={styles.benchName}>{p.name.split(' ').pop()}</Caption>
                <Stat color={ovrColorFor(p.overall)} style={styles.benchOvr}>{p.overall}</Stat>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Unlisted */}
      {unlisted.length > 0 && (
        <Card variant="detail" accent={accent.accent} style={styles.section}>
          <Label color={colors.textMuted} style={styles.sectionLabel}>{t('tactics.unlisted_label', { count: unlisted.length })}</Label>
          {unlisted.map((p, idx) => {
            const key = `unlisted-${idx}`;
            return (
              <Pressable
                key={p.id}
                ref={(el: any) => { if (el) setupDrag(el, key, { source: 'unlisted', player: p }); }}
                style={styles.unlistedRow}
                onPress={() => setDetailPlayer(p)}
              >
                <Badge value={p.position} tone="neutral" accent={getPositionColor(p.position)} size="sm" />
                <Body color={colors.textSecondary} numberOfLines={1} style={styles.unlistedName}>{p.name}</Body>
                <Stat color={ovrColorFor(p.overall)}>{p.overall}</Stat>
              </Pressable>
            );
          })}
        </Card>
      )}

      {/* Player Detail Sheet */}
      <Sheet visible={detailPlayer !== null} onClose={() => setDetailPlayer(null)} testID="tactics-detail">
        {detailPlayer && (() => {
          const p = detailPlayer;
          const ovr = calculateOverall(p.attributes, p.position);
          const a = p.attributes;
          const techAttrs = [
            { label: t('tactics.attr_finishing'), val: a.finishing },
            { label: t('tactics.attr_passing'), val: a.passing },
            { label: t('tactics.attr_crossing'), val: a.crossing },
            { label: t('tactics.attr_dribbling'), val: a.dribbling },
            { label: t('tactics.attr_heading'), val: a.heading },
            { label: t('tactics.attr_long_shots'), val: a.longShots },
            { label: t('tactics.attr_free_kicks'), val: a.freeKicks },
          ];
          const mentalAttrs = [
            { label: t('tactics.attr_vision'), val: a.vision },
            { label: t('tactics.attr_composure'), val: a.composure },
            { label: t('tactics.attr_decisions'), val: a.decisions },
            { label: t('tactics.attr_positioning'), val: a.positioning },
            { label: t('tactics.attr_aggression'), val: a.aggression },
            { label: t('tactics.attr_leadership'), val: a.leadership },
          ];
          const physAttrs = [
            { label: t('tactics.attr_pace'), val: a.pace },
            { label: t('tactics.attr_stamina'), val: a.stamina },
            { label: t('tactics.attr_strength'), val: a.strength },
            { label: t('tactics.attr_agility'), val: a.agility },
            { label: t('tactics.attr_jumping'), val: a.jumping },
          ];
          return (
            <ScrollView nestedScrollEnabled>
              <View style={styles.detailHeader}>
                <Title>{p.name}</Title>
                <View style={styles.detailMeta}>
                  <Badge value={p.position} tone="accent" accent={accent.accent} size="sm" />
                  <Caption>{t('tactics.detail_age', { age: p.age })}</Caption>
                  <Stat color={ovrColorFor(ovr)} style={styles.detailOvr}>{ovr}</Stat>
                </View>
              </View>
              <View style={styles.detailStatsRow}>
                <View style={styles.detailStatItem}>
                  <Stat>{p.morale}</Stat>
                  <Caption color={colors.textMuted}>{t('tactics.detail_morale')}</Caption>
                </View>
                <View style={styles.detailStatItem}>
                  <Stat>{p.fitness}</Stat>
                  <Caption color={colors.textMuted}>{t('tactics.detail_fitness')}</Caption>
                </View>
                <View style={styles.detailStatItem}>
                  <Body>
                    {p.preferredFoot === 'left' ? t('tactics.detail_foot_left') : t('tactics.detail_foot_right')}
                  </Body>
                  <Caption color={colors.textMuted}>{t('tactics.detail_foot')}</Caption>
                </View>
                <View style={styles.detailStatItem}>
                  <Body color={colors.gold}>{'★'.repeat(p.weakFootAbility)}{'☆'.repeat(5 - p.weakFootAbility)}</Body>
                  <Caption color={colors.textMuted}>{t('tactics.detail_weak_foot')}</Caption>
                </View>
              </View>
              <Label color={colors.textMuted} style={styles.detailSectionTitle}>{t('tactics.section_technical')}</Label>
              {techAttrs.map(attr => <StatBar key={attr.label} label={attr.label} value={attr.val} />)}
              <Label color={colors.textMuted} style={styles.detailSectionTitle}>{t('tactics.section_mental')}</Label>
              {mentalAttrs.map(attr => <StatBar key={attr.label} label={attr.label} value={attr.val} />)}
              <Label color={colors.textMuted} style={styles.detailSectionTitle}>{t('tactics.section_physical')}</Label>
              {physAttrs.map(attr => <StatBar key={attr.label} label={attr.label} value={attr.val} />)}
              {p.clubId === playerClubId && (
                <>
                  <Label color={colors.textMuted} style={styles.detailSectionTitle}>{t('tactics.transfer_status_title')}</Label>
                  <View style={styles.listingRow}>
                    <Body style={styles.listingLabel}>{t('tactics.list_for_sale')}</Body>
                    <Switch value={isTransferListed} onValueChange={handleToggleTransferListing} />
                  </View>
                  {isTransferListed && (
                    <View style={styles.listingRow}>
                      <Body style={styles.listingLabel}>{t('tactics.asking_price')}</Body>
                      <TextInput
                        style={styles.listingInput}
                        value={askingPriceText}
                        onChangeText={setAskingPriceText}
                        onBlur={handleBlurAskingPrice}
                        keyboardType="numeric"
                        placeholder={t('tactics.asking_price_placeholder')}
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  )}
                  <View style={styles.listingRow}>
                    <Body style={styles.listingLabel}>{t('tactics.list_for_loan')}</Body>
                    <Switch value={isLoanListed} onValueChange={handleToggleLoanListing} />
                  </View>
                  {isLoanListed && (
                    <View style={styles.listingRow}>
                      <Body style={styles.listingLabel}>{t('tactics.loan_wage_share')}</Body>
                      <TextInput
                        style={styles.listingInput}
                        value={loanShareText}
                        onChangeText={setLoanShareText}
                        onBlur={handleBlurLoanShare}
                        keyboardType="numeric"
                        placeholder="50"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  )}
                </>
              )}
              <View style={styles.detailClose}>
                <Button
                  label={t('tactics.close')}
                  variant="primary"
                  onPress={() => setDetailPlayer(null)}
                  testID="tactics-detail-close"
                  accessibilityLabel={t('tactics.close')}
                />
              </View>
            </ScrollView>
          );
        })()}
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Selectors
  selectorBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  selectorLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  chipRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  dragHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  dragHintText: {
    fontStyle: 'italic',
    flex: 1,
    textAlign: 'right',
  },
  setPiecesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },

  // Pitch
  pitchView: {
    marginHorizontal: spacing.md,
    gap: spacing.sm,
  },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-around' },
  pitchSlot: {
    alignItems: 'center',
    minWidth: 58,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.xs,
    borderWidth: 2,
    borderColor: 'transparent',
    cursor: 'grab',
  } as any,
  dropHover: {
    borderColor: colors.success,
    backgroundColor: `${colors.success}22`,
  },
  pitchRole: { letterSpacing: 0.5 },
  pitchName: { marginTop: 1, textAlign: 'center' },
  pitchOvr: { marginTop: 1 },

  // Sections
  section: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },

  // Bench grid
  benchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  benchCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.xs,
    alignItems: 'center',
    minWidth: 70,
    flex: 1,
    maxWidth: '25%',
    borderWidth: 2,
    borderColor: 'transparent',
    cursor: 'grab',
  } as any,
  benchPos: {},
  benchName: { marginTop: 1, textAlign: 'center' },
  benchOvr: { marginTop: 1 },

  // Unlisted
  unlistedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 2,
    borderColor: 'transparent',
    cursor: 'grab',
  } as any,
  unlistedName: { flex: 1 },

  // Detail
  detailHeader: { marginBottom: spacing.md },
  detailMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  detailOvr: { fontSize: fontSize.xl },
  detailStatsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  detailStatItem: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  detailSectionTitle: { letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.sm },
  detailClose: { marginTop: spacing.sm },

  // Listing toggles in modal
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  listingLabel: {
    flex: 1,
  },
  listingInput: {
    color: colors.text,
    fontSize: fontSize.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 120,
    textAlign: 'right',
  },
});
