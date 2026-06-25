import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { colors, spacing, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { getPositionColor } from '@/utils/player-colors';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { getSetPieceTakers, setSetPieceTakers } from '@/database/queries/set-piece-takers';
import { SetPieceTakers, CornerRoutine } from '@/engine/simulation/match-engine';
import { calculateOverall } from '@/utils/overall';
import { Player, PlayerAttributes } from '@/types';
import { useTranslation } from '@/i18n';
import { Card, Badge, EmptyState } from '@/components/kit';
import { Body, Label, Caption, Stat } from '@/components/typography';

type PlayerWithOvr = Player & { attributes: PlayerAttributes; overall: number };

type TakerSlot = 'penalty' | 'free_kick' | 'corner';

type TakerIdKey = 'penaltyTakerId' | 'freeKickTakerId' | 'cornerTakerId';
const SLOT_KEY: Record<TakerSlot, TakerIdKey> = {
  penalty: 'penaltyTakerId',
  free_kick: 'freeKickTakerId',
  corner: 'cornerTakerId',
};

export function SetPiecesScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const currentSave = useGameStore((s) => s.currentSave);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const saveId = currentSave?.id;

  const [squad, setSquad] = useState<PlayerWithOvr[]>([]);
  const [takers, setTakers] = useState<SetPieceTakers>({});
  const [loading, setLoading] = useState(true);
  const [openSlot, setOpenSlot] = useState<TakerSlot | null>(null);

  useEffect(() => {
    if (!dbHandle || playerClubId === null || saveId == null) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      try {
        const basePlayers = await getPlayersByClub(dbHandle, saveId, playerClubId);
        const withAttrs: PlayerWithOvr[] = [];
        for (const p of basePlayers) {
          const full = await getPlayerById(dbHandle, saveId, p.id);
          if (full) withAttrs.push({ ...full, overall: calculateOverall(full.attributes, full.position) });
        }
        withAttrs.sort((a, b) => b.overall - a.overall);
        setSquad(withAttrs);

        const saved = await getSetPieceTakers(dbHandle, saveId, playerClubId);
        if (saved) setTakers(saved);
      } finally {
        setLoading(false);
      }
    })();
  }, [dbHandle, saveId, playerClubId]);

  const byId = useMemo(() => new Map(squad.map(p => [p.id, p])), [squad]);

  const persist = useCallback(async (next: SetPieceTakers) => {
    setTakers(next);
    if (!dbHandle || playerClubId === null || saveId == null) return;
    try {
      await setSetPieceTakers(dbHandle, saveId, playerClubId, next);
    } catch { /* ignore */ }
  }, [dbHandle, saveId, playerClubId]);

  const handlePick = useCallback((slot: TakerSlot, playerId: number | null) => {
    setOpenSlot(null);
    persist({ ...takers, [SLOT_KEY[slot]]: playerId });
  }, [persist, takers]);

  const currentName = useCallback((slot: TakerSlot): string => {
    const id = takers[SLOT_KEY[slot]];
    if (id == null) return t('setpieces.automatic');
    const p = byId.get(id);
    return p ? p.name : t('setpieces.automatic');
  }, [takers, byId, t]);

  const slots: { slot: TakerSlot; label: string }[] = [
    { slot: 'penalty', label: t('setpieces.penalty') },
    { slot: 'free_kick', label: t('setpieces.free_kick') },
    { slot: 'corner', label: t('setpieces.corner') },
  ];

  const cornerRoutine: CornerRoutine = takers.cornerRoutine ?? 'auto';
  const routineOptions: { value: CornerRoutine; label: string }[] = [
    { value: 'auto', label: t('setpieces.routine_auto') },
    { value: 'near_post', label: t('setpieces.routine_near_post') },
    { value: 'far_post', label: t('setpieces.routine_far_post') },
    { value: 'short', label: t('setpieces.routine_short') },
  ];

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.scrollContent}>
      <Body color={colors.textSecondary} style={styles.intro}>{t('setpieces.intro')}</Body>

      {squad.length === 0 ? (
        <EmptyState art="squad" title={t('setpieces.empty')} accent={accent.accent} />
      ) : (
        slots.map(({ slot, label }) => {
          const selectedId = takers[SLOT_KEY[slot]] ?? null;
          const isOpen = openSlot === slot;
          return (
            <Card key={slot} variant="detail" accent={accent.accent} style={styles.section}>
              <Label color={colors.textMuted} style={styles.sectionLabel}>{label}</Label>
              <Pressable
                style={styles.selectorBtn}
                onPress={() => setOpenSlot(isOpen ? null : slot)}
                testID={`setpieces-selector-${slot}`}
                accessibilityRole="button"
                accessibilityLabel={label}
              >
                <Body numberOfLines={1}>{currentName(slot)}</Body>
              </Pressable>

              {isOpen && (
                <View style={styles.optionList}>
                  <Pressable
                    style={[styles.optionRow, selectedId === null && { backgroundColor: accent.accent }]}
                    onPress={() => handlePick(slot, null)}
                    testID={`setpieces-${slot}-auto`}
                  >
                    <Body color={selectedId === null ? colors.text : colors.textSecondary}>
                      {t('setpieces.automatic')}
                    </Body>
                  </Pressable>
                  {squad.map((p) => {
                    const active = selectedId === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        style={[styles.optionRow, active && { backgroundColor: accent.accent }]}
                        onPress={() => handlePick(slot, p.id)}
                        testID={`setpieces-${slot}-player-${p.id}`}
                      >
                        <Badge value={p.position} tone="neutral" accent={getPositionColor(p.position)} size="sm" />
                        <Body color={active ? colors.text : colors.textSecondary} numberOfLines={1} style={styles.optionName}>
                          {p.name}
                        </Body>
                        <Stat>{p.overall}</Stat>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Card>
          );
        })
      )}

      {squad.length > 0 && (
        <Card variant="detail" accent={accent.accent} style={styles.section}>
          <Label color={colors.textMuted} style={styles.sectionLabel}>{t('setpieces.corner_routine')}</Label>
          <View style={styles.routineRow}>
            {routineOptions.map((opt) => {
              const active = cornerRoutine === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.routineChip, active && { backgroundColor: accent.accent, borderColor: accent.accent }]}
                  onPress={() => persist({ ...takers, cornerRoutine: opt.value })}
                  testID={`setpieces-routine-${opt.value}`}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: active }}
                >
                  <Caption color={active ? colors.text : colors.textSecondary}>{opt.label}</Caption>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      <Caption color={colors.textMuted} style={styles.hint}>{t('setpieces.hint')}</Caption>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: spacing.xl, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: {
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  section: {
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  selectorBtn: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionList: {
    marginTop: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  optionName: { flex: 1 },
  routineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  routineChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  hint: {
    fontStyle: 'italic',
    marginTop: spacing.md,
    lineHeight: 18,
  },
});
