import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { Card, Button, Chip, Badge, Sheet, Toast, useConfirm, ToastTone } from '@/components/kit';
import { Headline, Body, Label, Caption } from '@/components/typography';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getStaffByClub } from '@/database/queries/staff';
import { searchPlayers } from '@/database/queries/players';
import { getClubById } from '@/database/queries/clubs';
import { getNextFixtureForClub } from '@/database/queries/fixtures';
import {
  getActiveMissions,
  createMission,
  cancelMission,
  ScoutMissionDto,
} from '@/database/queries/scout-missions';
import { MISSION_DEFS, MissionType } from '@/engine/scouting/scout-missions';
import type { ScoutArchetype } from '@/engine/scouting/scout-archetypes';
import { Staff, Player } from '@/types';

const TARGET_CAP = 40;

const ARCHETYPE_KEY: Record<ScoutArchetype, TKey> = {
  generalist: 'scouting.archetype_generalist',
  youth: 'scouting.archetype_youth',
  defenders: 'scouting.archetype_defenders',
  regional: 'scouting.archetype_regional',
};

const MISSION_KEY: Record<MissionType, TKey> = {
  short_eval: 'scouting.mission_short_eval',
  long_project: 'scouting.mission_long_project',
  opponent_intel: 'scouting.mission_opponent_intel',
  youth_prospect: 'scouting.mission_youth_prospect',
};

const PLAYER_TARGET_TYPES: ReadonlySet<MissionType> = new Set(['short_eval', 'long_project']);

interface ToastState { title: string; tone: ToastTone; }

function AbilityStars({ ability, max = 20 }: { ability: number; max?: number }) {
  const stars = Math.round((ability / max) * 5);
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={[styles.star, i < stars ? styles.starFilled : styles.starEmpty]}>★</Text>
      ))}
    </View>
  );
}

export function ScoutingScreen() {
  const { playerClubId, season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const accent = useClubAccent();
  const confirm = useConfirm();
  const saveId = currentSave?.id;

  const [scouts, setScouts] = useState<Staff[]>([]);
  const [targets, setTargets] = useState<Player[]>([]);
  const [missions, setMissions] = useState<ScoutMissionDto[]>([]);
  const [nextOpponent, setNextOpponent] = useState<{ id: number; name: string } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [assigning, setAssigning] = useState<Staff | null>(null);
  const [pickType, setPickType] = useState<MissionType | null>(null);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId == null || saveId == null) return;
    const [staff, allPlayers, active] = await Promise.all([
      getStaffByClub(dbHandle, saveId, playerClubId),
      searchPlayers(dbHandle, saveId, {}),
      getActiveMissions(dbHandle, saveId),
    ]);
    setScouts(staff.filter((s) => s.role === 'scout'));
    const pool = allPlayers
      .filter((p) => p.clubId !== playerClubId)
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, TARGET_CAP);
    setTargets(pool);
    setMissions(active);

    const fixture = await getNextFixtureForClub(dbHandle, saveId, playerClubId, season);
    if (fixture) {
      const oppId = fixture.homeClubId === playerClubId ? fixture.awayClubId : fixture.homeClubId;
      const opp = await getClubById(dbHandle, saveId, oppId);
      setNextOpponent(opp ? { id: opp.id, name: opp.name } : null);
    } else {
      setNextOpponent(null);
    }
  }, [dbHandle, playerClubId, saveId, season]);

  useFocusEffect(useCallback(() => { load(); }, [load, week]));

  const missionByScout = new Map(missions.map((m) => [m.scoutId, m]));
  const targetName = (id: number): string => targets.find((p) => p.id === id)?.name ?? `#${id}`;

  function openAssign(scout: Staff) {
    setAssigning(scout);
    setPickType(null);
  }

  async function commitMission(type: MissionType, targetPlayerId: number | null) {
    if (!dbHandle || saveId == null || assigning == null) return;
    const targetClubId = type === 'opponent_intel' ? nextOpponent?.id ?? null : null;
    await createMission(dbHandle, saveId, {
      scoutId: assigning.id, type, targetPlayerId, targetClubId,
      regionCode: null, createdSeason: season, createdWeek: week,
    });
    setAssigning(null);
    setPickType(null);
    setToast({ title: t('scouting.mission_assigned'), tone: 'success' });
    await load();
  }

  async function handleCancel(m: ScoutMissionDto, scoutName: string) {
    if (!dbHandle || saveId == null) return;
    const ok = await confirm({
      title: t('scouting.cancel_mission'),
      message: t('scouting.confirm_cancel', { name: scoutName }),
      tone: 'danger',
    });
    if (!ok) return;
    await cancelMission(dbHandle, saveId, m.id);
    setToast({ title: t('scouting.mission_canceled'), tone: 'info' });
    await load();
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Headline style={styles.headerTitle}>{t('scouting.commission_title')}</Headline>
        <Caption color={colors.reportScout}>{t('scouting.commission_sub')}</Caption>
      </View>

      {scouts.length === 0 && (
        <Card variant="summary" style={styles.emptyCard}>
          <Body color={colors.textMuted}>{t('scouting.no_scouts')}</Body>
        </Card>
      )}

      {scouts.map((s) => {
        const m = missionByScout.get(s.id);
        const def = m ? MISSION_DEFS[m.type] : null;
        const weeksLeft = m && def ? Math.max(0, def.durationWeeks - m.weeksElapsed) : 0;
        const progressPct = def ? Math.min(100, Math.round((m!.weeksElapsed / def.durationWeeks) * 100)) : 0;
        return (
          <Card key={s.id} variant="detail" style={styles.scoutCard}>
            <View style={styles.scoutTop}>
              <View style={styles.scoutInfo}>
                <Body style={styles.scoutName}>{s.name}</Body>
                <AbilityStars ability={s.ability} />
                {s.archetype && (
                  <Badge tone="accent" accent={accent.accent} value={t(ARCHETYPE_KEY[s.archetype])} size="sm" />
                )}
              </View>
              {m == null ? (
                <Button
                  label={t('scouting.assign_mission')}
                  variant="primary"
                  accent={accent.accent}
                  onPress={() => openAssign(s)}
                  testID={`scout-assign-mission-${s.id}`}
                  accessibilityLabel={t('scouting.assign_mission')}
                />
              ) : (
                <Button
                  label={t('scouting.cancel_mission')}
                  variant="secondary"
                  onPress={() => handleCancel(m, s.name)}
                  testID={`scout-cancel-mission-${s.id}`}
                  accessibilityLabel={t('scouting.cancel_mission')}
                />
              )}
            </View>

            {m && def && (
              <View style={styles.missionRow}>
                <Label color={colors.reportScout}>{t(MISSION_KEY[m.type])}</Label>
                <View style={styles.barContainer}>
                  <View style={[styles.barFill, { width: `${progressPct}%` as `${number}%`, backgroundColor: accent.accent }]} />
                </View>
                <Caption color={colors.textSecondary}>{t('scouting.weeks_left', { n: weeksLeft })}</Caption>
              </View>
            )}
          </Card>
        );
      })}

      <Sheet visible={assigning != null} onClose={() => setAssigning(null)} testID="assign-mission-sheet">
        {assigning && (
          <View>
            <Label color={colors.textMuted} style={styles.sheetTitle}>{t('scouting.select_mission_type')}</Label>
            <View style={styles.chipRow}>
              {(Object.keys(MISSION_DEFS) as MissionType[]).map((type) => (
                <Chip
                  key={type}
                  label={t(MISSION_KEY[type])}
                  selected={pickType === type}
                  onPress={() => setPickType(type)}
                  accent={accent.accent}
                  testID={`mission-type-${type}`}
                />
              ))}
            </View>

            {pickType != null && PLAYER_TARGET_TYPES.has(pickType) && (
              <>
                <Label color={colors.textMuted} style={styles.sheetTitle}>{t('scouting.select_target')}</Label>
                <ScrollView style={styles.targetScroll}>
                  {targets.map((p) => (
                    <Pressable
                      key={p.id}
                      style={styles.targetPick}
                      onPress={() => commitMission(pickType, p.id)}
                      testID={`mission-target-${p.id}`}
                    >
                      <Body>{p.name}</Body>
                      <Caption color={colors.textSecondary}>{p.position} · {p.age}</Caption>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {pickType === 'opponent_intel' && (
              <View style={styles.confirmTarget}>
                <Caption color={colors.textSecondary}>{t('scouting.next_opponent')}</Caption>
                <Body style={styles.opponentName}>{nextOpponent?.name ?? t('scouting.no_next_opponent')}</Body>
                <Button
                  label={t('scouting.assign_mission')}
                  variant="primary"
                  accent={accent.accent}
                  disabled={nextOpponent == null}
                  onPress={() => commitMission('opponent_intel', null)}
                  testID="mission-confirm-intel"
                  accessibilityLabel={t('scouting.assign_mission')}
                />
              </View>
            )}

            {pickType === 'youth_prospect' && (
              <View style={styles.confirmTarget}>
                <Button
                  label={t('scouting.assign_mission')}
                  variant="primary"
                  accent={accent.accent}
                  onPress={() => commitMission('youth_prospect', null)}
                  testID="mission-confirm-youth"
                  accessibilityLabel={t('scouting.assign_mission')}
                />
              </View>
            )}
          </View>
        )}
      </Sheet>

      {toast && (
        <Toast title={toast.title} tone={toast.tone} onDismiss={() => setToast(null)} testID="scouting-toast" />
      )}
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
  emptyCard: { alignItems: 'center', marginHorizontal: spacing.md },
  scoutCard: { marginHorizontal: spacing.md, marginBottom: spacing.xs },
  scoutTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoutInfo: { flex: 1, marginRight: spacing.sm, gap: spacing.xxs },
  scoutName: { fontWeight: '600' },
  starsRow: { flexDirection: 'row', gap: spacing.xxs },
  star: { fontSize: fontSize.sm },
  starFilled: { color: colors.gold },
  starEmpty: { color: colors.border },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  barContainer: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radius.sm },
  sheetTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  targetScroll: { maxHeight: 240 },
  targetPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  confirmTarget: { marginTop: spacing.md, gap: spacing.sm },
  opponentName: { fontWeight: '600' },
});
