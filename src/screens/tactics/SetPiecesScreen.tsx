import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { getPositionColor } from '@/utils/player-colors';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { getSetPieceTakers, setSetPieceTakers } from '@/database/queries/set-piece-takers';
import { SetPieceTakers } from '@/engine/simulation/match-engine';
import { calculateOverall } from '@/utils/overall';
import { Player, PlayerAttributes } from '@/types';
import { useTranslation } from '@/i18n';

type PlayerWithOvr = Player & { attributes: PlayerAttributes; overall: number };

type TakerSlot = 'penalty' | 'free_kick' | 'corner';

const SLOT_KEY: Record<TakerSlot, keyof SetPieceTakers> = {
  penalty: 'penaltyTakerId',
  free_kick: 'freeKickTakerId',
  corner: 'cornerTakerId',
};

export function SetPiecesScreen() {
  const { t } = useTranslation();
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

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.intro}>{t('setpieces.intro')}</Text>

      {squad.length === 0 ? (
        <Text style={styles.empty}>{t('setpieces.empty')}</Text>
      ) : (
        slots.map(({ slot, label }) => {
          const selectedId = takers[SLOT_KEY[slot]] ?? null;
          const isOpen = openSlot === slot;
          return (
            <View key={slot} style={styles.section}>
              <Text style={styles.sectionLabel}>{label}</Text>
              <Pressable
                style={styles.selectorBtn}
                onPress={() => setOpenSlot(isOpen ? null : slot)}
              >
                <Text style={styles.selectorText} numberOfLines={1}>{currentName(slot)} ▾</Text>
              </Pressable>

              {isOpen && (
                <View style={styles.optionList}>
                  <Pressable
                    style={[styles.optionRow, selectedId === null && styles.optionRowActive]}
                    onPress={() => handlePick(slot, null)}
                  >
                    <Text style={[styles.optionName, selectedId === null && styles.optionNameActive]}>
                      {t('setpieces.automatic')}
                    </Text>
                  </Pressable>
                  {squad.map((p) => {
                    const active = selectedId === p.id;
                    return (
                      <Pressable
                        key={p.id}
                        style={[styles.optionRow, active && styles.optionRowActive]}
                        onPress={() => handlePick(slot, p.id)}
                      >
                        <Text style={[styles.optionPos, { color: getPositionColor(p.position) }]}>{p.position}</Text>
                        <Text style={[styles.optionName, active && styles.optionNameActive]} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.optionOvr}>{p.overall}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })
      )}

      <Text style={styles.hint}>{t('setpieces.hint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: spacing.xl, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
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
  selectorText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
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
  optionRowActive: { backgroundColor: colors.primary },
  optionPos: { fontSize: fontSize.xs, fontWeight: 'bold', width: 36 },
  optionName: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },
  optionNameActive: { color: colors.text, fontWeight: '700' },
  optionOvr: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: 'bold', width: 30, textAlign: 'right' },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    marginTop: spacing.md,
    lineHeight: 18,
  },
});
