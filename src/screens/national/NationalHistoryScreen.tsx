import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { loadNationalTeams } from '@/database/queries/national-teams';
import { getNationalTitles, NationalTitle } from '@/database/queries/national-titles';
import { getTopCaps, NationalCapLeader } from '@/database/queries/national-caps';
import { Card, Badge, EmptyState } from '@/components/kit';
import { Headline, Body, Label, Caption, Stat } from '@/components/typography';

export function NationalHistoryScreen() {
  const { currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const saveId = currentSave?.id;

  const [titles, setTitles] = useState<NationalTitle[]>([]);
  const [leaders, setLeaders] = useState<NationalCapLeader[]>([]);
  const [nameById, setNameById] = useState<Map<number, string>>(new Map());

  const load = useCallback(async () => {
    if (!dbHandle || saveId == null) return;
    const teams = await loadNationalTeams(dbHandle, saveId);
    setNameById(new Map(teams.map((tm) => [tm.id, tm.name])));
    setTitles(await getNationalTitles(dbHandle, saveId));
    setLeaders(await getTopCaps(dbHandle, saveId, 10));
  }, [dbHandle, saveId]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  const name = (id: number) => nameById.get(id) ?? String(id);

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Headline>{t('national.history_title')}</Headline>
      </View>

      <View style={styles.sectionHeader}>
        <Label color={colors.textMuted}>{t('national.titles')}</Label>
      </View>
      {titles.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState art="generic" title={t('national.no_titles')} />
        </View>
      ) : (
        titles.map((title) => (
          <Card
            key={title.id}
            variant="detail"
            accent={title.userManagedWon ? colors.gold : colors.border}
            selected={title.userManagedWon}
            style={styles.card}
          >
            <View style={styles.titleRow}>
              <Caption color={colors.textMuted}>{t('national.season_label', { season: title.season })}</Caption>
              {title.userManagedWon && <Badge value={t('national.you_won')} tone="warning" size="sm" />}
            </View>
            <View style={styles.honourRow}>
              <Label color={colors.gold}>{t('national.champion')}</Label>
              <Body style={styles.flex} numberOfLines={1}>{name(title.championNationalId)}</Body>
            </View>
            <View style={styles.honourRow}>
              <Label color={colors.textMuted}>{t('national.runner_up')}</Label>
              <Body color={colors.textSecondary} style={styles.flex} numberOfLines={1}>
                {name(title.runnerUpNationalId)}
              </Body>
            </View>
          </Card>
        ))
      )}

      <View style={styles.sectionHeader}>
        <Label color={colors.textMuted}>{t('national.leaders')}</Label>
      </View>
      {leaders.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState art="squad" title={t('national.no_leaders')} />
        </View>
      ) : (
        <Card variant="detail" style={styles.card}>
          <View style={styles.leaderHead}>
            <Caption color={colors.textMuted} style={styles.flex}>{t('national.col_team')}</Caption>
            <Caption color={colors.textMuted} style={styles.num}>{t('national.caps')}</Caption>
            <Caption color={colors.textMuted} style={styles.num}>{t('national.goals')}</Caption>
          </View>
          {leaders.map((l, i) => (
            <View key={l.playerId} style={styles.leaderRow}>
              <Caption color={colors.textMuted} style={styles.rank}>{i + 1}</Caption>
              <Body numberOfLines={1} style={styles.flex}>{l.name}</Body>
              <Stat style={styles.num}>{l.caps}</Stat>
              <Stat color={colors.primaryLight} style={styles.num}>{l.goals}</Stat>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  sectionHeader: { paddingHorizontal: spacing.md, marginBottom: spacing.xs, marginTop: spacing.sm },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: spacing.xs },
  emptyWrap: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  honourRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  leaderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.sm },
  rank: { width: 20 },
  num: { width: 44, textAlign: 'right' },
});
