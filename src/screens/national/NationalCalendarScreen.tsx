import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { loadNationalTeams, getUserManagedNation } from '@/database/queries/national-teams';
import { loadNationalFixtures, buildCycleSchedule } from '@/database/queries/national-fixtures';
import {
  buildNationalCalendarView,
  NationalCalendarView,
  NationalFixtureRow,
} from '@/engine/national/national-views';
import { Card, EmptyState } from '@/components/kit';
import { Headline, Body, Label, Caption, Stat } from '@/components/typography';

const EMPTY_VIEW: NationalCalendarView = { qualifiers: [], knockout: [], standings: [] };

function FixtureLine({ f, vs }: { f: NationalFixtureRow; vs: string }) {
  const score = f.played ? `${f.homeGoals}-${f.awayGoals}` : vs;
  return (
    <View style={[styles.fixtureRow, f.involvesUser && styles.fixtureUser]}>
      <Body numberOfLines={1} style={styles.fixtureTeam}>{f.homeName}</Body>
      <Caption color={f.played ? colors.text : colors.textMuted} style={styles.fixtureScore}>{score}</Caption>
      <Body numberOfLines={1} style={[styles.fixtureTeam, styles.fixtureAway]}>{f.awayName}</Body>
    </View>
  );
}

export function NationalCalendarScreen() {
  const { season, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const saveId = currentSave?.id;

  const [view, setView] = useState<NationalCalendarView>(EMPTY_VIEW);

  const load = useCallback(async () => {
    if (!dbHandle || saveId == null) return;
    const teams = await loadNationalTeams(dbHandle, saveId);
    if (teams.length < 2) {
      setView(EMPTY_VIEW);
      return;
    }
    const nation = await getUserManagedNation(dbHandle, saveId);
    const fixtures = await loadNationalFixtures(dbHandle, saveId, season);
    const schedule = buildCycleSchedule(saveId, season, teams.map((tm) => tm.id));
    setView(
      buildNationalCalendarView({
        fixtures,
        teams,
        qualifierCompetitionId: schedule.competitionId,
        userNationId: nation?.id ?? null,
      }),
    );
  }, [dbHandle, saveId, season]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  const vs = t('national.vs');
  const isEmpty = view.qualifiers.length === 0 && view.knockout.length === 0;

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Headline>{t('national.calendar_title')}</Headline>
        <Body color={colors.textSecondary}>{t('national.season_label', { season })}</Body>
      </View>

      {isEmpty ? (
        <View style={styles.emptyWrap}>
          <EmptyState art="generic" title={t('national.calendar_empty')} />
        </View>
      ) : (
        <>
          {view.standings.length > 0 && (
            <Card variant="detail" style={styles.card}>
              <Label color={colors.textMuted}>{t('national.standings')}</Label>
              <View style={styles.tableHead}>
                <Caption color={colors.textMuted} style={styles.colPos}>{t('national.col_pos')}</Caption>
                <Caption color={colors.textMuted} style={styles.colTeam}>{t('national.col_team')}</Caption>
                <Caption color={colors.textMuted} style={styles.colNum}>{t('national.col_played')}</Caption>
                <Caption color={colors.textMuted} style={styles.colNum}>{t('national.col_gd')}</Caption>
                <Caption color={colors.textMuted} style={styles.colNum}>{t('national.col_points')}</Caption>
              </View>
              {view.standings.map((s) => (
                <View key={s.clubId} style={[styles.tableRow, s.isUser && styles.fixtureUser]}>
                  <Caption color={colors.textMuted} style={styles.colPos}>{s.rank}</Caption>
                  <Body numberOfLines={1} style={styles.colTeam}>{s.name}</Body>
                  <Caption style={styles.colNum}>{s.played}</Caption>
                  <Caption style={styles.colNum}>{s.goalDifference}</Caption>
                  <Stat style={styles.colNum}>{s.points}</Stat>
                </View>
              ))}
            </Card>
          )}

          {view.qualifiers.length > 0 && (
            <Card variant="detail" style={styles.card}>
              <Label color={colors.textMuted}>{t('national.qualifiers')}</Label>
              {view.qualifiers.map((f) => (
                <FixtureLine key={f.id} f={f} vs={vs} />
              ))}
            </Card>
          )}

          {view.knockout.length > 0 && (
            <Card variant="detail" accent={colors.gold} style={styles.card}>
              <Label color={colors.textMuted}>{t('national.knockout')}</Label>
              {view.knockout.map((r) => (
                <View key={r.round} style={styles.roundGroup}>
                  <Caption color={colors.gold}>{t('national.round', { round: r.round })}</Caption>
                  {r.fixtures.map((f) => (
                    <FixtureLine key={f.id} f={f} vs={vs} />
                  ))}
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.xxs },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: spacing.xs },
  emptyWrap: { marginHorizontal: spacing.md, marginTop: spacing.md },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  colPos: { width: 24 },
  colTeam: { flex: 1 },
  colNum: { width: 32, textAlign: 'right' },
  fixtureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  fixtureUser: { backgroundColor: colors.surfaceLight, borderRadius: radius.sm },
  fixtureTeam: { flex: 1 },
  fixtureAway: { textAlign: 'right' },
  fixtureScore: { width: 48, textAlign: 'center' },
  roundGroup: { gap: spacing.xxs, marginTop: spacing.xs },
});
