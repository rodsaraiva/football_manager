import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { EmptyState } from '@/components/EmptyState';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubsByLeague } from '@/database/queries/clubs';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getFixturesByClub } from '@/database/queries/fixtures';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { calculateStandings } from '@/engine/competition/standings';
import {
  buildAnalyticsReport,
  AnalyticsReport,
  ClubSample,
  PositionGroupOveralls,
  RankLine,
} from '@/engine/reports/analytics-report';
import { Fixture, Position } from '@/types';

const ATTACK_POS: Position[] = ['ST', 'LW', 'RW'];
const MID_POS: Position[] = ['CM', 'CDM', 'CAM', 'LM', 'RM'];
const DEF_POS: Position[] = ['CB', 'LB', 'RB'];
const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length);

export function ReportsAnalyticsScreen() {
  const { t } = useTranslation();
  const { playerClub, playerClubId, season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<AnalyticsReport | null>(null);

  const load = React.useCallback(async () => {
    if (!dbHandle || !playerClub || !playerClubId || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Collect every club in the same league
      const leagueClubs = await getClubsByLeague(dbHandle, saveId, playerClub.leagueId);
      const clubIds = leagueClubs.map((c) => c.id);

      // Locate the league competition to filter fixtures
      const comps = await getCompetitionsBySeason(dbHandle, saveId, season);
      const leagueComp = comps.find((c) => c.leagueId === playerClub.leagueId && c.type === 'league');

      // Gather all played fixtures for the league this season
      const allFixtures: Fixture[] = [];
      const seen = new Set<number>();
      for (const cid of clubIds) {
        const fxs = await getFixturesByClub(dbHandle, saveId, cid, season);
        for (const f of fxs) {
          if (!seen.has(f.id) && f.played && (!leagueComp || f.competitionId === leagueComp.id)) {
            seen.add(f.id);
            allFixtures.push(f);
          }
        }
      }
      const standings = calculateStandings(allFixtures, clubIds);
      const standingByClub = new Map(standings.map((s) => [s.clubId, s]));

      // Compute squad overall per club using a single batch query per club.
      const samples: ClubSample[] = await Promise.all(
        leagueClubs.map(async (c) => {
          const squad = await getPlayersWithAttributesByClub(dbHandle, saveId, c.id);
          const overalls: number[] = [];
          const attackOv: number[] = [];
          const midOv: number[] = [];
          const defOv: number[] = [];
          const gkOv: number[] = [];
          let best = 0;
          for (const p of squad) {
            if (p.injuryWeeksLeft > 0) continue;
            const o = calculateOverall(p.attributes, p.position);
            overalls.push(o);
            if (o > best) best = o;
            if (ATTACK_POS.includes(p.position)) attackOv.push(o);
            else if (MID_POS.includes(p.position)) midOv.push(o);
            else if (DEF_POS.includes(p.position)) defOv.push(o);
            else if (p.position === 'GK') gkOv.push(o);
          }
          const byGroup: PositionGroupOveralls = {
            attack: avg(attackOv),
            midfield: avg(midOv),
            defense: avg(defOv),
            goalkeeper: avg(gkOv),
          };
          const st = standingByClub.get(c.id);
          return {
            clubId: c.id,
            name: c.shortName,
            squadOverall: avg(overalls),
            bestOverall: best,
            points: st?.points ?? 0,
            matchesPlayed: st?.played ?? 0,
            goalsFor: st?.goalsFor ?? 0,
            goalsAgainst: st?.goalsAgainst ?? 0,
            byGroup,
          };
        }),
      );

      const r = buildAnalyticsReport({ playerClubId, samples });
      setReport(r);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClub, playerClubId, season, week, saveId]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!report || report.lines.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState icon="📊" title={t('report.analytics_empty')} />
      </View>
    );
  }

  return (
    <ScrollView
      style={commonStyles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerIntro}>
          {t('report.analytics_intro', { count: report.lines[0].total - 1 })}
        </Text>
      </View>

      {report.lines.map((line) => (
        <RankCard key={line.metric} line={line} />
      ))}
    </ScrollView>
  );
}

function RankCard({ line }: { line: RankLine }) {
  const { t } = useTranslation();
  const rankColor =
    line.rank === 1 ? colors.gold
    : line.rank <= 3 ? colors.success
    : line.rank <= line.total / 2 ? colors.primaryLight
    : line.rank <= (line.total * 3) / 4 ? colors.warning
    : colors.danger;

  // Position bar: 0% = worst (last), 100% = best (1st)
  const positionPct = line.total > 1 ? ((line.total - line.rank) / (line.total - 1)) * 100 : 100;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.metricLabel}>{line.metric.toUpperCase()}</Text>
        <View style={[styles.rankBadge, { borderColor: rankColor }]}>
          <Text style={[styles.rankText, { color: rankColor }]}>
            {line.rank}º
          </Text>
          <Text style={styles.rankTotal}>/{line.total}</Text>
        </View>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barMarker,
            { left: `${Math.max(0, Math.min(100, positionPct))}%`, backgroundColor: rankColor },
          ]}
        />
      </View>
      <View style={styles.barLegend}>
        <Text style={styles.barLegendText}>{t('report.worst')}</Text>
        <Text style={styles.barLegendText}>{t('report.best')}</Text>
      </View>
      <Text style={styles.description}>{line.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  subtitle: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerIntro: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  rankText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  rankTotal: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginLeft: 2,
  },
  description: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  barTrack: {
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    position: 'relative',
    marginTop: spacing.xs,
  },
  barMarker: {
    position: 'absolute',
    top: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
  },
  barLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  barLegendText: {
    color: colors.textMuted,
    fontSize: 10,
  },
});
