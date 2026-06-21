import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, commonStyles } from '@/theme';
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
import { Card, Badge, EmptyState } from '@/components/kit';
import { Headline, Body, Label, Caption, Stat } from '@/components/typography';

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
        <Headline>{t('internationals.title')}</Headline>
        <Body color={colors.primary}>{t('internationals.subtitle')}</Body>
      </View>

      {isBreak && (
        <Card variant="detail" accent={colors.primary} selected style={styles.breakBanner}>
          <Body>{t('internationals.break_banner')}</Body>
          <Caption color={colors.textSecondary}>
            {t('internationals.fatigue_note', { penalty: TRAVEL_FATIGUE_PENALTY })}
          </Caption>
        </Card>
      )}

      {groups.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState art="squad" title={t('internationals.empty')} />
        </View>
      ) : (
        groups.map((group) => (
          <Card key={group.nationality} variant="detail" style={styles.groupCard}>
            <Label>{group.nationality}</Label>
            {group.players.map((p) => {
              const isCalledUp = isBreak && calledUpIds.has(p.id);
              const ovrColor = p.overall >= 85 ? colors.success : p.overall >= 80 ? colors.warning : colors.text;
              return (
                <View key={p.id} style={styles.playerRow}>
                  <Caption color={colors.primary} style={styles.playerPos}>{p.position}</Caption>
                  <View style={styles.playerInfo}>
                    <Body numberOfLines={1}>{p.name}</Body>
                    {isCalledUp && (
                      <View style={styles.calledUpTag}>
                        <Badge value={t('internationals.called_up_tag')} tone="warning" size="sm" />
                      </View>
                    )}
                  </View>
                  <Stat color={ovrColor} style={styles.playerOvr}>{p.overall}</Stat>
                </View>
              );
            })}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  breakBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xxs,
  },
  emptyWrap: { marginHorizontal: spacing.md },
  groupCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  playerPos: {
    width: 44,
  },
  playerInfo: { flex: 1, gap: spacing.xxs },
  calledUpTag: { alignSelf: 'flex-start' },
  playerOvr: {
    width: 32,
    textAlign: 'right',
  },
});
