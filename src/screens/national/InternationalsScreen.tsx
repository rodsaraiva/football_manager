import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { Position } from '@/types';
import {
  isInternationalBreak,
  selectCallUps,
  INTERNATIONAL_CALLUP_MIN_OVERALL,
  TRAVEL_FATIGUE_PENALTY,
} from '@/engine/national/international-duty';

interface InternationalPlayer {
  id: number;
  name: string;
  position: Position;
  overall: number;
}

interface NationalityGroup {
  nationality: string;
  players: InternationalPlayer[];
}

export function InternationalsScreen() {
  const { playerClubId, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const saveId = currentSave?.id;

  const [groups, setGroups] = useState<NationalityGroup[]>([]);
  const [calledUpIds, setCalledUpIds] = useState<Set<number>>(new Set());

  const isBreak = isInternationalBreak(week);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId == null || saveId == null) return;
    const squad = await getPlayersWithAttributesByClub(dbHandle, saveId, playerClubId);
    const eligible = squad
      .filter((p) => !p.isFreeAgent)
      .map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        nationality: p.nationality,
        overall: calculateOverall(p.attributes, p.position),
      }))
      .filter((p) => p.overall >= INTERNATIONAL_CALLUP_MIN_OVERALL);

    // Current call-up uses the same deterministic selection the engine runs.
    setCalledUpIds(new Set(selectCallUps(eligible)));

    const byNationality = new Map<string, InternationalPlayer[]>();
    for (const p of eligible) {
      const list = byNationality.get(p.nationality) ?? [];
      list.push({ id: p.id, name: p.name, position: p.position, overall: p.overall });
      byNationality.set(p.nationality, list);
    }
    const ordered: NationalityGroup[] = [...byNationality.entries()]
      .map(([nationality, players]) => ({
        nationality,
        players: players.sort((a, b) => b.overall - a.overall),
      }))
      .sort((a, b) => a.nationality.localeCompare(b.nationality));
    setGroups(ordered);
  }, [dbHandle, playerClubId, saveId]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('internationals.title')}</Text>
        <Text style={styles.headerSub}>{t('internationals.subtitle')}</Text>
      </View>

      {isBreak && (
        <View style={styles.breakBanner}>
          <Text style={styles.breakBannerText}>{t('internationals.break_banner')}</Text>
          <Text style={styles.fatigueNote}>
            {t('internationals.fatigue_note', { penalty: TRAVEL_FATIGUE_PENALTY })}
          </Text>
        </View>
      )}

      {groups.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('internationals.empty')}</Text>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.nationality} style={styles.groupCard}>
            <Text style={styles.groupHeader}>{group.nationality}</Text>
            {group.players.map((p) => {
              const isCalledUp = isBreak && calledUpIds.has(p.id);
              const ovrColor = p.overall >= 85 ? colors.success : p.overall >= 80 ? colors.warning : colors.text;
              return (
                <View key={p.id} style={styles.playerRow}>
                  <Text style={styles.playerPos}>{p.position}</Text>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName} numberOfLines={1}>{p.name}</Text>
                    {isCalledUp && (
                      <Text style={styles.calledUpTag}>🌍 {t('internationals.called_up_tag')}</Text>
                    )}
                  </View>
                  <Text style={[styles.playerOvr, { color: ovrColor }]}>{p.overall}</Text>
                </View>
              );
            })}
          </View>
        ))
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
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  headerSub: {
    color: colors.primary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  breakBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  breakBannerText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  fatigueNote: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupHeader: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  playerPos: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    width: 44,
  },
  playerInfo: { flex: 1 },
  playerName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  calledUpTag: {
    color: colors.warning,
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  playerOvr: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    width: 32,
    textAlign: 'right',
  },
});
