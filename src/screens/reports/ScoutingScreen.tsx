import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { Card, Button } from '@/components/kit';
import { Headline, Body, Label, Caption } from '@/components/typography';
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
  const accent = useClubAccent();
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
        <Headline style={styles.headerTitle}>{t('scouting.title')}</Headline>
        <Caption color={colors.reportScout}>{t('scouting.subtitle')}</Caption>
      </View>

      {/* Scouts */}
      <Label color={colors.textMuted} style={styles.sectionTitle}>{t('scouting.scouts_section')}</Label>
      {scouts.length === 0 && (
        <Card variant="summary" style={styles.emptyCard}>
          <Body color={colors.textMuted}>{t('scouting.no_scouts')}</Body>
        </Card>
      )}
      {scouts.map((s) => {
        const target = rows.find((r) => r.scoutId === s.id);
        return (
          <Card key={s.id} variant="detail" style={styles.scoutCard}>
            <View style={styles.scoutLeft}>
              <Body style={styles.scoutName}>{s.name}</Body>
              <AbilityStars ability={s.ability} />
            </View>
            <Caption color={colors.textSecondary} style={styles.scoutStatus}>
              {target
                ? t('scouting.watching', { name: targetName(target.playerId) })
                : t('scouting.idle')}
            </Caption>
          </Card>
        );
      })}

      {/* Targets */}
      <Label color={colors.textMuted} style={styles.sectionTitle}>{t('scouting.targets_section')}</Label>
      {targets.length === 0 && (
        <Card variant="summary" style={styles.emptyCard}>
          <Body color={colors.textMuted}>{t('scouting.no_targets')}</Body>
        </Card>
      )}
      {targets.map((p) => {
        const row = rowByPlayer.get(p.id);
        const knowledge = row?.knowledge ?? 0;
        const tier = knowledgeTier(knowledge);
        const isScouted = row?.scoutId != null;
        return (
          <Card key={p.id} variant="detail" style={styles.targetCard}>
            <View style={styles.targetTop}>
              <View style={styles.targetInfo}>
                <Body style={styles.targetName}>{p.name}</Body>
                <Caption color={colors.textSecondary}>
                  {t('scouting.target_meta', { position: p.position, age: p.age })}
                </Caption>
              </View>
              {isScouted ? (
                <Button
                  label={t('scouting.unassign')}
                  variant="secondary"
                  onPress={() => handleUnassign(p.id)}
                  testID={`scout-unassign-${p.id}`}
                  accessibilityLabel={t('scouting.unassign')}
                />
              ) : (
                <Button
                  label={bestIdleScout == null ? t('scouting.no_idle_scout') : t('scouting.assign')}
                  variant="primary"
                  accent={accent.accent}
                  disabled={bestIdleScout == null}
                  onPress={() => handleAssign(p.id)}
                  testID={`scout-assign-${p.id}`}
                  accessibilityLabel={t('scouting.assign')}
                />
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
              <Label color={TIER_COLOR[tier]} style={styles.tierLabel}>
                {t(TIER_KEY[tier])} · {knowledge}%
              </Label>
            </View>
          </Card>
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
  headerTitle: { fontWeight: 'bold' },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyCard: {
    alignItems: 'center',
    marginHorizontal: spacing.md,
  },
  scoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  scoutLeft: { flex: 1 },
  scoutName: { fontWeight: '600', marginBottom: spacing.xxs },
  scoutStatus: { marginLeft: spacing.sm },
  starsRow: { flexDirection: 'row', gap: spacing.xxs },
  star: { fontSize: fontSize.sm },
  starFilled: { color: colors.gold },
  starEmpty: { color: colors.border },
  targetCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  targetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  targetInfo: { flex: 1, marginRight: spacing.sm },
  targetName: { fontWeight: '600' },
  knowledgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barContainer: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.sm },
  tierLabel: { minWidth: 96, textAlign: 'right' },
});
