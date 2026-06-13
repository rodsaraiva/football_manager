import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getStaffByClub } from '@/database/queries/staff';
import { searchPlayers } from '@/database/queries/players';
import {
  getScoutingRows,
  assignScout,
  unassignScout,
  ScoutingRowDto,
} from '@/database/queries/scouting';
import { knowledgeTier, ScoutingTier } from '@/engine/scouting/scouting-engine';
import { Staff, Player } from '@/types';

const TARGET_CAP = 50;

const TIER_KEY: Record<ScoutingTier, TKey> = {
  unknown: 'scouting.tier_unknown',
  vague: 'scouting.tier_vague',
  partial: 'scouting.tier_partial',
  full: 'scouting.tier_full',
};

const TIER_COLOR: Record<ScoutingTier, string> = {
  unknown: colors.textMuted,
  vague: colors.warning,
  partial: colors.reportScout,
  full: colors.success,
};

function AbilityStars({ ability, max = 20 }: { ability: number; max?: number }) {
  const stars = Math.round((ability / max) * 5);
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={[styles.star, i < stars ? styles.starFilled : styles.starEmpty]}>
          ★
        </Text>
      ))}
    </View>
  );
}

export function ScoutingScreen() {
  const { playerClubId, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const saveId = currentSave?.id;

  const [scouts, setScouts] = useState<Staff[]>([]);
  const [targets, setTargets] = useState<Player[]>([]);
  const [rows, setRows] = useState<ScoutingRowDto[]>([]);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId == null || saveId == null) return;
    const [staff, allPlayers, scoutingRows] = await Promise.all([
      getStaffByClub(dbHandle, saveId, playerClubId),
      searchPlayers(dbHandle, saveId, {}),
      getScoutingRows(dbHandle, saveId),
    ]);
    setScouts(staff.filter((s) => s.role === 'scout'));
    // Scoutable pool = players from OTHER clubs + free agents, by market value.
    // Already-scouted players always shown; the rest capped to keep the list tight.
    const scoutedIds = new Set(scoutingRows.map((r) => r.playerId));
    const others = allPlayers
      .filter((p) => p.clubId !== playerClubId)
      .sort((a, b) => b.marketValue - a.marketValue);
    const pool = [
      ...others.filter((p) => scoutedIds.has(p.id)),
      ...others.filter((p) => !scoutedIds.has(p.id)).slice(0, TARGET_CAP),
    ];
    setTargets(pool);
    setRows(scoutingRows);
  }, [dbHandle, playerClubId, saveId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, week]),
  );

  const rowByPlayer = new Map(rows.map((r) => [r.playerId, r]));
  const assignedScoutIds = new Set(rows.filter((r) => r.scoutId != null).map((r) => r.scoutId!));
  const idleScouts = scouts.filter((s) => !assignedScoutIds.has(s.id));
  const bestIdleScout = idleScouts.reduce<Staff | null>(
    (best, s) => (best == null || s.ability > best.ability ? s : best),
    null,
  );

  async function handleAssign(playerId: number) {
    if (!dbHandle || saveId == null || bestIdleScout == null) return;
    await assignScout(dbHandle, saveId, playerId, bestIdleScout.id);
    await load();
  }

  async function handleUnassign(playerId: number) {
    if (!dbHandle || saveId == null) return;
    await unassignScout(dbHandle, saveId, playerId);
    await load();
  }

  const targetName = (playerId: number): string =>
    targets.find((p) => p.id === playerId)?.name ?? `#${playerId}`;

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('scouting.title')}</Text>
        <Text style={styles.headerSub}>{t('scouting.subtitle')}</Text>
      </View>

      {/* Scouts */}
      <Text style={styles.sectionTitle}>{t('scouting.scouts_section')}</Text>
      {scouts.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('scouting.no_scouts')}</Text>
        </View>
      )}
      {scouts.map((s) => {
        const target = rows.find((r) => r.scoutId === s.id);
        return (
          <View key={s.id} style={styles.scoutCard}>
            <View style={styles.scoutLeft}>
              <Text style={styles.scoutName}>{s.name}</Text>
              <AbilityStars ability={s.ability} />
            </View>
            <Text style={styles.scoutStatus}>
              {target
                ? t('scouting.watching', { name: targetName(target.playerId) })
                : t('scouting.idle')}
            </Text>
          </View>
        );
      })}

      {/* Targets */}
      <Text style={styles.sectionTitle}>{t('scouting.targets_section')}</Text>
      {targets.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('scouting.no_targets')}</Text>
        </View>
      )}
      {targets.map((p) => {
        const row = rowByPlayer.get(p.id);
        const knowledge = row?.knowledge ?? 0;
        const tier = knowledgeTier(knowledge);
        const isScouted = row?.scoutId != null;
        return (
          <View key={p.id} style={styles.targetCard}>
            <View style={styles.targetTop}>
              <View style={styles.targetInfo}>
                <Text style={styles.targetName}>{p.name}</Text>
                <Text style={styles.targetMeta}>
                  {t('scouting.target_meta', { position: p.position, age: p.age })}
                </Text>
              </View>
              {isScouted ? (
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, styles.unassignBtn, pressed && styles.btnPressed]}
                  onPress={() => handleUnassign(p.id)}
                >
                  <Text style={styles.unassignText}>{t('scouting.unassign')}</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.assignBtn,
                    bestIdleScout == null && styles.btnDisabled,
                    pressed && styles.btnPressed,
                  ]}
                  disabled={bestIdleScout == null}
                  onPress={() => handleAssign(p.id)}
                >
                  <Text style={styles.assignText}>
                    {bestIdleScout == null ? t('scouting.no_idle_scout') : t('scouting.assign')}
                  </Text>
                </Pressable>
              )}
            </View>
            <View style={styles.knowledgeRow}>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${knowledge}%` as `${number}%`, backgroundColor: TIER_COLOR[tier] },
                  ]}
                />
              </View>
              <Text style={[styles.tierLabel, { color: TIER_COLOR[tier] }]}>
                {t(TIER_KEY[tier])} · {knowledge}%
              </Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: 'bold' },
  headerSub: { color: colors.reportScout, fontSize: fontSize.sm, marginTop: spacing.xxs },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.md,
  },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md },
  scoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoutLeft: { flex: 1 },
  scoutName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginBottom: spacing.xxs },
  scoutStatus: { color: colors.textSecondary, fontSize: fontSize.sm, marginLeft: spacing.sm },
  starsRow: { flexDirection: 'row', gap: spacing.xxs },
  star: { fontSize: fontSize.sm },
  starFilled: { color: colors.gold },
  starEmpty: { color: colors.border },
  targetCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  targetInfo: { flex: 1, marginRight: spacing.sm },
  targetName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  targetMeta: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.xxs },
  actionBtn: { borderRadius: radius.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  assignBtn: { backgroundColor: colors.primary },
  assignText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  unassignBtn: { backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border },
  unassignText: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.7 },
  knowledgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barContainer: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.sm },
  tierLabel: { fontSize: fontSize.xs, fontWeight: '600', minWidth: 96, textAlign: 'right' },
});
