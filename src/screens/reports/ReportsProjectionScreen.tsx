/**
 * Projeção de Classificação Final
 *
 * Shows projected league standings at end of season using overall-based
 * expected-value model. Deterministic — no Monte Carlo.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { alpha, colors, spacing, fontSize, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { ValueBadge } from '@/components/ValueBadge';
import { EmptyState } from '@/components/EmptyState';
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
        <EmptyState icon="📈" title={t('report.projection_empty')} />
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
            <View style={[styles.myStatusCard, { borderLeftColor: statusColor(myEntry.status) }]}>
              <Text style={styles.myStatusTitle}>{t('report.projection_my_status')}</Text>
              <View style={styles.myStatusRow}>
                <Text style={styles.myPosition}>{myEntry.projectedPosition}º</Text>
                <View style={styles.myStatusInfo}>
                  <Text style={styles.myPoints}>{t('report.projection_pts_proj', { pts: myEntry.projectedPoints.toFixed(1) })}</Text>
                  <Text style={styles.myPointsCurrent}>{t('report.projection_pts_current', { pts: myEntry.points, games: myEntry.remainingFixtures })}</Text>
                </View>
                <ValueBadge
                  value={t(statusLabelKey(myEntry.status))}
                  tone={myEntry.status === 'title' ? 'warning' : myEntry.status === 'promotion' || myEntry.status === 'continental' ? 'success' : myEntry.status === 'relegation' ? 'danger' : 'neutral'}
                  size="sm"
                />
              </View>
            </View>
          )}

          {nextFiveFixtures.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('report.projection_next5')}</Text>
              <Text style={styles.sectionSub}>{t('report.projection_next5_sub')}</Text>
              {nextFiveFixtures.map((f, i) => (
                <View key={f.fixtureId} style={styles.fixtureRow}>
                  <Text style={styles.fixtureWeek}>S{f.week}</Text>
                  <Text style={styles.fixtureName}>{f.opponentName}</Text>
                  <ValueBadge
                    value={t(`report.difficulty_${f.difficulty}` as TKey)}
                    tone={f.difficulty === 'easy' ? 'success' : f.difficulty === 'hard' ? 'danger' : 'warning'}
                    size="sm"
                  />
                </View>
              ))}
            </View>
          )}

          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: 28 }]}>#</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>{t('report.col_club')}</Text>
            <Text style={[styles.headerCell, { width: 42, textAlign: 'right' }]}>Pts</Text>
            <Text style={[styles.headerCell, { width: 52, textAlign: 'right' }]}>Proj.</Text>
            <Text style={[styles.headerCell, { width: 34, textAlign: 'right' }]}>Res.</Text>
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
        <Text style={styles.disclaimer}>
          {t('report.projection_disclaimer')}
        </Text>
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
      <Text style={[styles.cell, { width: 28 }]}>{entry.projectedPosition}</Text>
      <Text style={[styles.cell, { flex: 1 }, isMyClub && styles.myClubText]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.cell, { width: 42, textAlign: 'right' }]}>{entry.points}</Text>
      <Text style={[styles.cell, { width: 52, textAlign: 'right', color: colors.primary, fontWeight: '700' }]}>
        {entry.projectedPoints.toFixed(1)}
      </Text>
      <Text style={[styles.cell, { width: 34, textAlign: 'right', color: colors.textMuted }]}>
        {entry.remainingFixtures}
      </Text>
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
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
  myStatusCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  myStatusTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
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
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: 'bold',
    width: 50,
  },
  myStatusInfo: { flex: 1 },
  myPoints: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  myPointsCurrent: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  sectionSub: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  fixtureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  fixtureWeek: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    width: 24,
  },
  fixtureName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCell: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
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
    color: colors.text,
    fontSize: fontSize.sm,
  },
  myClubText: {
    color: colors.primary,
    fontWeight: '700',
  },
  disclaimer: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
