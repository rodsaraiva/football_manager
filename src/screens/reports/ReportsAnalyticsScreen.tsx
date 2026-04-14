import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubsByLeague } from '@/database/queries/clubs';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getFixturesByClub } from '@/database/queries/fixtures';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { calculateStandings } from '@/engine/competition/standings';
import {
  buildAnalyticsReport,
  AnalyticsReport,
  ClubSample,
  RankLine,
} from '@/engine/reports/analytics-report';
import { Fixture } from '@/types';

export function ReportsAnalyticsScreen() {
  const { playerClub, playerClubId, season, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<AnalyticsReport | null>(null);

  const load = React.useCallback(async () => {
    if (!dbHandle || !playerClub || !playerClubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Collect every club in the same league
      const leagueClubs = await getClubsByLeague(dbHandle, playerClub.leagueId);
      const clubIds = leagueClubs.map((c) => c.id);

      // Locate the league competition to filter fixtures
      const comps = await getCompetitionsBySeason(dbHandle, season);
      const leagueComp = comps.find((c) => c.leagueId === playerClub.leagueId && c.type === 'league');

      // Gather all played fixtures for the league this season
      const allFixtures: Fixture[] = [];
      const seen = new Set<number>();
      for (const cid of clubIds) {
        const fxs = await getFixturesByClub(dbHandle, cid, season);
        for (const f of fxs) {
          if (!seen.has(f.id) && f.played && (!leagueComp || f.competitionId === leagueComp.id)) {
            seen.add(f.id);
            allFixtures.push(f);
          }
        }
      }
      const standings = calculateStandings(allFixtures, clubIds);
      const standingByClub = new Map(standings.map((s) => [s.clubId, s]));

      // Compute squad overall per club (can be expensive — limit to modest squad sizes)
      const samples: ClubSample[] = [];
      for (const c of leagueClubs) {
        const squadBase = await getPlayersByClub(dbHandle, c.id);
        const overalls: number[] = [];
        let best = 0;
        for (const p of squadBase) {
          if (p.injuryWeeksLeft > 0) continue;
          const full = await getPlayerById(dbHandle, p.id);
          if (!full) continue;
          const o = calculateOverall(full.attributes, full.position);
          overalls.push(o);
          if (o > best) best = o;
        }
        const avgOverall = overalls.length > 0 ? overalls.reduce((s, v) => s + v, 0) / overalls.length : 0;
        const st = standingByClub.get(c.id);
        samples.push({
          clubId: c.id,
          name: c.shortName,
          squadOverall: avgOverall,
          bestOverall: best,
          points: st?.points ?? 0,
          matchesPlayed: st?.played ?? 0,
          goalsFor: st?.goalsFor ?? 0,
          goalsAgainst: st?.goalsAgainst ?? 0,
        });
      }

      const r = buildAnalyticsReport({ playerClubId, samples });
      setReport(r);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClub, playerClubId, season, week]);

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
        <Text style={styles.subtitle}>
          Sem dados suficientes para análise comparativa ainda.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIntro}>
          Comparação da sua equipa vs. os outros {report.lines[0].total - 1} clubes da liga.
        </Text>
      </View>

      {report.lines.map((line) => (
        <RankCard key={line.metric} line={line} />
      ))}
    </ScrollView>
  );
}

function RankCard({ line }: { line: RankLine }) {
  const rankColor =
    line.rank === 1 ? colors.gold
    : line.rank <= 3 ? colors.success
    : line.rank <= line.total / 2 ? colors.primaryLight
    : line.rank <= (line.total * 3) / 4 ? colors.warning
    : colors.danger;

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
  },
});
