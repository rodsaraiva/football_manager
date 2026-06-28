/**
 * Projeção de Classificação Final
 *
 * Shows projected league standings at end of season using overall-based
 * expected-value model. Deterministic — no Monte Carlo.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, alpha, spacing, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { ValueBadge } from '@/components/ValueBadge';
import { EmptyState, Card } from '@/components/kit';
import { Display, Title, Body, Label, Caption } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubsByLeague } from '@/database/queries/clubs';
import { getCompetitionsBySeason, getLeagueById } from '@/database/queries/leagues';
import { getFixturesByClub } from '@/database/queries/fixtures';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { calculateStandings } from '@/engine/competition/standings';
import { projectClassification, ProjectedStanding } from '@/engine/reports/classification-projection';
import { Fixture, Position } from '@/types';

const ATTACK_POS: Position[] = ['ST', 'LW', 'RW'];
const MID_POS: Position[] = ['CM', 'CDM', 'CAM', 'LM', 'RM'];
const DEF_POS: Position[] = ['CB', 'LB', 'RB'];
const avg = (xs: number[]) => (xs.length === 0 ? 60 : xs.reduce((s, v) => s + v, 0) / xs.length);

export function ReportsProjectionScreen() {
  const { t } = useTranslation();
  const { playerClub, playerClubId, season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projection, setProjection] = useState<ProjectedStanding[]>([]);
  const [clubNames, setClubNames] = useState<Map<number, string>>(new Map());
  const [nextFiveFixtures, setNextFiveFixtures] = useState<
    { fixtureId: number; opponentName: string; difficulty: 'easy' | 'medium' | 'hard'; week: number }[]
  >([]);

  const load = useCallback(async () => {
    if (!dbHandle || !playerClub || !playerClubId || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const leagueClubs = await getClubsByLeague(dbHandle, saveId, playerClub.leagueId);
      const clubIds = leagueClubs.map((c) => c.id);

      const namesMap = new Map<number, string>();
      for (const c of leagueClubs) {
        namesMap.set(c.id, c.shortName || c.name);
      }
      setClubNames(namesMap);

      // Locate league competition
      const comps = await getCompetitionsBySeason(dbHandle, saveId, season);
      const leagueComp = comps.find((c) => c.leagueId === playerClub.leagueId && c.type === 'league');

      // Gather all fixtures
      const allFixtures: Fixture[] = [];
      const seen = new Set<number>();
      for (const cid of clubIds) {
        const fxs = await getFixturesByClub(dbHandle, saveId, cid, season);
        for (const f of fxs) {
          if (!seen.has(f.id) && (!leagueComp || f.competitionId === leagueComp.id)) {
            seen.add(f.id);
            allFixtures.push(f);
          }
        }
      }

      const playedFixtures = allFixtures.filter((f) => f.played);
      const remainingFixtures = allFixtures.filter((f) => !f.played);

      const currentStandings = calculateStandings(playedFixtures, clubIds);

      // Compute squad overall per club
      const overallByClub = new Map<number, number>();
      await Promise.all(
        leagueClubs.map(async (c) => {
          const squad = await getPlayersWithAttributesByClub(dbHandle, saveId, c.id);
          const overalls = squad
            .filter((p) => p.injuryWeeksLeft === 0)
            .map((p) => calculateOverall(p.attributes, p.position));
          overallByClub.set(c.id, avg(overalls));
        }),
      );

      const league = await getLeagueById(dbHandle, playerClub.leagueId);
      const divisionLevel = league?.divisionLevel ?? 1;
      const proj = projectClassification({
        currentStandings,
        remainingFixtures,
        overallByClub,
        leagueSize: clubIds.length,
        divisionLevel,
      });
      setProjection(proj);

      // Next 5 fixtures for the player's club
      const myOvr = overallByClub.get(playerClubId) ?? 60;
      const myNext = remainingFixtures
        .filter((f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId)
        .sort((a, b) => a.week - b.week)
        .slice(0, 5);

      setNextFiveFixtures(
        myNext.map((f) => {
          const oppId = f.homeClubId === playerClubId ? f.awayClubId : f.homeClubId;
          const oppOvr = overallByClub.get(oppId) ?? 60;
          const diff = oppOvr - myOvr;
          let difficulty: 'easy' | 'medium' | 'hard';
          if (diff < -10) difficulty = 'easy';
          else if (diff > 10) difficulty = 'hard';
          else difficulty = 'medium';
          return {
            fixtureId: f.id,
            opponentName: namesMap.get(oppId) ?? `Club ${oppId}`,
            difficulty,
            week: f.week,
          };
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClub, playerClubId, season, week]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.reportProjection} size="large" />
      </View>
    );
  }

  if (projection.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState art="generic" title={t('report.projection_empty')} />
      </View>
    );
  }

  const myEntry = projection.find((p) => p.clubId === playerClubId);

  return (
    <FlatList
      style={commonStyles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.reportProjection} />
      }
      data={projection}
      keyExtractor={(item) => String(item.clubId)}
      ListHeaderComponent={
        <>
          {myEntry && (
            <Card variant="summary" accent={statusColor(myEntry.status)} style={[styles.myStatusCard, { borderLeftColor: statusColor(myEntry.status) }]}>
              <Caption color={colors.textMuted} style={styles.myStatusTitle}>{t('report.projection_my_status')}</Caption>
              <View style={styles.myStatusRow}>
                <Display style={styles.myPosition}>{myEntry.projectedPosition}º</Display>
                <View style={styles.myStatusInfo}>
                  <Body color={colors.primary} style={styles.myPoints}>{t('report.projection_pts_proj', { pts: myEntry.projectedPoints.toFixed(1) })}</Body>
                  <Caption color={colors.textSecondary} style={styles.myPointsCurrent}>{t('report.projection_pts_current', { pts: myEntry.points, games: myEntry.remainingFixtures })}</Caption>
                </View>
                <ValueBadge
                  value={t(statusLabelKey(myEntry.status))}
                  tone={myEntry.status === 'title' ? 'warning' : myEntry.status === 'promotion' || myEntry.status === 'continental' ? 'success' : myEntry.status === 'relegation' ? 'danger' : 'neutral'}
                  size="sm"
                />
              </View>
            </Card>
          )}

          {nextFiveFixtures.length > 0 && (
            <Card variant="summary" style={styles.section}>
              <Title style={styles.sectionTitle}>{t('report.projection_next5')}</Title>
              <Caption color={colors.textMuted} style={styles.sectionSub}>{t('report.projection_next5_sub')}</Caption>
              {nextFiveFixtures.map((f) => (
                <View key={f.fixtureId} style={styles.fixtureRow}>
                  <Caption color={colors.textMuted} style={styles.fixtureWeek}>S{f.week}</Caption>
                  <Body style={styles.fixtureName}>{f.opponentName}</Body>
                  <ValueBadge
                    value={t(`report.difficulty_${f.difficulty}` as TKey)}
                    tone={f.difficulty === 'easy' ? 'success' : f.difficulty === 'hard' ? 'danger' : 'warning'}
                    size="sm"
                  />
                </View>
              ))}
            </Card>
          )}

          <View style={styles.tableHeader}>
            <Label color={colors.textMuted} style={[styles.headerCell, { width: 28 }]}>#</Label>
            <Label color={colors.textMuted} style={[styles.headerCell, { flex: 1 }]}>{t('report.col_club')}</Label>
            <Label color={colors.textMuted} style={[styles.headerCell, { width: 42, textAlign: 'right' }]}>Pts</Label>
            <Label color={colors.textMuted} style={[styles.headerCell, { width: 52, textAlign: 'right' }]}>Proj.</Label>
            <Label color={colors.textMuted} style={[styles.headerCell, { width: 34, textAlign: 'right' }]}>Res.</Label>
          </View>
        </>
      }
      renderItem={({ item }) => (
        <StandingRow
          entry={item}
          name={clubNames.get(item.clubId) ?? `Club ${item.clubId}`}
          isMyClub={item.clubId === playerClubId}
        />
      )}
      ListFooterComponent={
        <Caption color={colors.textMuted} style={styles.disclaimer}>
          {t('report.projection_disclaimer')}
        </Caption>
      }
    />
  );
}

function StandingRow({
  entry,
  name,
  isMyClub,
}: {
  entry: ProjectedStanding;
  name: string;
  isMyClub: boolean;
}) {
  return (
    <View
      style={[
        styles.tableRow,
        isMyClub && { borderLeftWidth: 3, borderLeftColor: colors.primary },
      ]}
    >
      <Body style={[styles.cell, { width: 28 }]}>{entry.projectedPosition}</Body>
      <Body style={[styles.cell, { flex: 1 }, isMyClub && styles.myClubText]} numberOfLines={1}>
        {name}
      </Body>
      <Body style={[styles.cell, { width: 42, textAlign: 'right' }]}>{entry.points}</Body>
      <Body style={[styles.cell, { width: 52, textAlign: 'right', color: colors.primary, fontWeight: '700' }]}>
        {entry.projectedPoints.toFixed(1)}
      </Body>
      <Body style={[styles.cell, { width: 34, textAlign: 'right', color: colors.textMuted }]}>
        {entry.remainingFixtures}
      </Body>
    </View>
  );
}

function statusColor(status: ProjectedStanding['status']): string {
  switch (status) {
    case 'title': return colors.gold;
    case 'promotion': return colors.success;
    case 'continental': return colors.success;
    case 'relegation': return colors.danger;
    default: return colors.textSecondary;
  }
}

function statusLabelKey(status: ProjectedStanding['status']): TKey {
  switch (status) {
    case 'title': return 'report.projection_zone_title';
    case 'promotion': return 'report.projection_zone_promotion';
    case 'continental': return 'report.projection_zone_continental';
    case 'relegation': return 'report.projection_zone_relegation';
    default: return 'report.projection_zone_safe';
  }
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  myStatusCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
  },
  myStatusTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  myStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  myPosition: {
    fontWeight: 'bold',
    width: 64,
  },
  myStatusInfo: { flex: 1 },
  myPoints: {
    fontWeight: '700',
  },
  myPointsCurrent: {
    marginTop: spacing.xxs,
  },
  section: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  sectionSub: {
    marginTop: spacing.xxs,
    marginBottom: spacing.sm,
  },
  fixtureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  fixtureWeek: {
    width: 24,
  },
  fixtureName: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCell: {
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.border, 0.27),
  },
  cell: {
  },
  myClubText: {
    color: colors.primary,
    fontWeight: '700',
  },
  disclaimer: {
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
