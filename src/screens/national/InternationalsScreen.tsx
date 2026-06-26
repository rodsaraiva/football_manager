import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, commonStyles } from '@/theme';
import { RootStackParamList } from '@/navigation/types';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getUserManagedNation, NationalTeam } from '@/database/queries/national-teams';
import { calculateOverall } from '@/utils/overall';
import { Position } from '@/types';
import {
  isInternationalBreak,
  selectCallUps,
  INTERNATIONAL_CALLUP_MIN_OVERALL,
  TRAVEL_FATIGUE_PENALTY,
} from '@/engine/national/international-duty';
import { activeNationalWindow } from '@/engine/national/national-views';
import { Card, Badge, Button, EmptyState } from '@/components/kit';
import { Headline, Title, Body, Label, Caption, Stat } from '@/components/typography';

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { playerClubId, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const saveId = currentSave?.id;

  const [nation, setNation] = useState<NationalTeam | null>(null);
  const [groups, setGroups] = useState<NationalityGroup[]>([]);
  const [calledUpIds, setCalledUpIds] = useState<Set<number>>(new Set());

  const isBreak = isInternationalBreak(week);
  const windowWeek = activeNationalWindow(week);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId == null || saveId == null) return;
    setNation(await getUserManagedNation(dbHandle, saveId));

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
        <Headline>{t('national.hub_title')}</Headline>
        <Body color={colors.textSecondary}>{t('internationals.subtitle')}</Body>
      </View>

      {nation ? (
        <Card variant="detail" accent={colors.primary} selected style={styles.nationCard}>
          <Title>{nation.name}</Title>
          <View style={styles.nationStats}>
            <View style={styles.nationStat}>
              <Label color={colors.textMuted}>{t('national.strength')}</Label>
              <Stat color={colors.primaryLight}>{nation.strength}</Stat>
            </View>
            <View style={styles.nationStat}>
              <Label color={colors.textMuted}>{t('national.continent')}</Label>
              <Body>{nation.continent}</Body>
            </View>
          </View>
        </Card>
      ) : (
        <View style={styles.emptyWrap}>
          <EmptyState art="squad" title={t('national.no_nation')} />
        </View>
      )}

      <View style={styles.actions}>
        <Button
          label={t('national.open_squad')}
          onPress={() => navigation.navigate('NationalSquad')}
          accessibilityLabel={t('national.open_squad')}
          testID="national-open-squad"
        />
        <Button
          label={t('national.open_calendar')}
          variant="secondary"
          onPress={() => navigation.navigate('NationalCalendar')}
          accessibilityLabel={t('national.open_calendar')}
          testID="national-open-calendar"
        />
        <Button
          label={t('national.open_history')}
          variant="secondary"
          onPress={() => navigation.navigate('NationalHistory')}
          accessibilityLabel={t('national.open_history')}
          testID="national-open-history"
        />
      </View>

      {isBreak && (
        <Card variant="detail" accent={colors.warning} style={styles.breakBanner}>
          <Body>{t('internationals.break_banner')}</Body>
          <Caption color={colors.textSecondary}>
            {t('internationals.fatigue_note', { penalty: TRAVEL_FATIGUE_PENALTY })}
          </Caption>
        </Card>
      )}

      <View style={styles.sectionHeader}>
        <Label color={colors.textMuted}>{t('national.eligible_context')}</Label>
        <Caption color={colors.textMuted}>{t('national.window', { week: windowWeek })}</Caption>
      </View>

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
  nationCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  nationStats: { flexDirection: 'row', gap: spacing.xl },
  nationStat: { gap: spacing.xxs },
  actions: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  breakBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xxs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyWrap: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
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
  playerPos: { width: 44 },
  playerInfo: { flex: 1, gap: spacing.xxs },
  calledUpTag: { alignSelf: 'flex-start' },
  playerOvr: { width: 32, textAlign: 'right' },
});
