/**
 * Relatório Pré-Jogo do Adversário
 *
 * Shows scouting info about the next opponent:
 * recent form, squad strength, top players, and attack/defense stats.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, alpha, spacing, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState, Card } from '@/components/kit';
import { Headline, Body, Label, Caption, Stat } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getClubById } from '@/database/queries/clubs';
import { getNextFixtureForClub, getRecentFixturesForClub, getMatchEvents } from '@/database/queries/fixtures';
import { calculateOverall } from '@/utils/overall';
import { buildOpponentReport, OpponentReport } from '@/engine/reports/opponent-report';
import { MatchEvent } from '@/types';

export function ReportsOpponentScreen() {
  const { t } = useTranslation();
  const { playerClubId, playerClub, season, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<OpponentReport | null>(null);
  const [noFixture, setNoFixture] = useState(false);

  const load = useCallback(async () => {
    if (!dbHandle || !playerClubId || !playerClub || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setNoFixture(false);
    try {
      const nextFixture = await getNextFixtureForClub(dbHandle, saveId, playerClubId, season);
      if (!nextFixture) {
        setNoFixture(true);
        setReport(null);
        return;
      }

      const opponentId =
        nextFixture.homeClubId === playerClubId ? nextFixture.awayClubId : nextFixture.homeClubId;

      const [opponentClub, opponentPlayers, recentFixtures] = await Promise.all([
        getClubById(dbHandle, saveId, opponentId),
        getPlayersWithAttributesByClub(dbHandle, saveId, opponentId),
        getRecentFixturesForClub(dbHandle, saveId, opponentId, season, 5),
      ]);

      if (!opponentClub) {
        setNoFixture(true);
        return;
      }

      // Load events for recent fixtures
      const eventsByFixture = new Map<number, MatchEvent[]>();
      for (const f of recentFixtures) {
        const evts = await getMatchEvents(dbHandle, f.id);
        eventsByFixture.set(f.id, evts);
      }

      const opponentSquad = opponentPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        overall: calculateOverall(p.attributes, p.position),
        attributes: p.attributes,
      }));

      const r = buildOpponentReport({
        nextFixture,
        playerClubId,
        playerClubReputation: playerClub.reputation,
        opponentClubId: opponentId,
        opponentName: opponentClub.name,
        opponentReputation: opponentClub.reputation,
        opponentRecentFixtures: recentFixtures,
        opponentSquad,
        eventsByFixture,
      });
      setReport(r);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, playerClub, season, saveId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.reportOpponent} size="large" />
      </View>
    );
  }

  if (noFixture || !report) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState art="search" title={t('report.opp_empty')} />
      </View>
    );
  }

  return (
    <ScrollView
      style={commonStyles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.reportOpponent} />
      }
    >
      {/* Header */}
      <Card variant="hero" accent={colors.reportOpponent} style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerInfo}>
            <Headline style={styles.opponentName}>{report.opponentName}</Headline>
            <Caption color={colors.textSecondary}>
              {t('report.opp_fixture_info', { week: report.fixtureWeek, venue: report.isHome ? t('report.opp_home') : t('report.opp_away') })}
            </Caption>
          </View>
          <View style={[styles.repBadge, { borderColor: repColor(report.reputationLabel) }]}>
            <Label color={repColor(report.reputationLabel)}>{report.reputationLabel}</Label>
          </View>
        </View>
        {report.alertMessage && (
          <View style={styles.alertBanner}>
            <Label color={colors.warning}>{report.alertMessage}</Label>
          </View>
        )}
      </Card>

      {/* Recent form */}
      <SectionCard title={t('report.opp_form')} subtitle={t('report.opp_form_sub', { n: report.recentForm.length })}>
        {report.recentForm.length === 0 ? (
          <Caption color={colors.textMuted} style={styles.empty}>{t('report.opp_no_games')}</Caption>
        ) : (
          <View style={styles.formRow}>
            {report.recentForm.map((r, i) => (
              <View key={i} style={[styles.resultChip, { backgroundColor: resultBg(r.result) }]}>
                <Label color={colors.text}>{r.result}</Label>
                <Caption color={colors.text} style={styles.resultScore}>{r.goalsFor}-{r.goalsAgainst}</Caption>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      {/* Squad strength */}
      <SectionCard title={t('report.opp_squad')} subtitle={t('report.opp_squad_sub', { ovr: report.squadAvgOverall })}>
        {report.topPlayers.map((p, i) => (
          <View key={p.id} style={styles.playerRow}>
            <Label color={colors.textMuted} style={styles.playerRank}>#{i + 1}</Label>
            <View style={styles.playerInfo}>
              <Body style={styles.playerName}>{p.name}</Body>
              <Caption color={colors.textSecondary}>{p.position}</Caption>
            </View>
            <View style={styles.ovrBadge}>
              <Label color={colors.primary}>{p.overall}</Label>
            </View>
          </View>
        ))}
      </SectionCard>

      {/* Attack vs Defense */}
      <SectionCard title={t('report.opp_atk_def')} subtitle={t('report.opp_atk_def_sub', { n: report.recentForm.length })}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Stat color={colors.success}>{report.goalsPerGame}</Stat>
            <Caption color={colors.textSecondary} style={styles.statLabel}>{t('report.opp_goals_for')}</Caption>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Stat color={colors.danger}>{report.concededPerGame}</Stat>
            <Caption color={colors.textSecondary} style={styles.statLabel}>{t('report.opp_goals_against')}</Caption>
          </View>
        </View>
      </SectionCard>
    </ScrollView>
  );
}

function repColor(label: 'Favorito' | 'Equilíbrio' | 'Zebra'): string {
  if (label === 'Favorito') return colors.danger;
  if (label === 'Zebra') return colors.success;
  return colors.warning;
}

function resultBg(result: 'W' | 'D' | 'L'): string {
  if (result === 'W') return alpha(colors.success, 0.8);
  if (result === 'L') return alpha(colors.danger, 0.8);
  return alpha(colors.warning, 0.8);
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  headerCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerInfo: { flex: 1 },
  opponentName: {
    fontWeight: 'bold',
  },
  repBadge: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  alertBanner: {
    marginTop: spacing.sm,
    backgroundColor: alpha(colors.warning, 0.2),
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  empty: {
    fontStyle: 'italic',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  resultChip: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    minWidth: 48,
  },
  resultScore: {
    marginTop: spacing.xxs,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  playerRank: {
    width: 20,
    textAlign: 'center',
  },
  playerInfo: { flex: 1 },
  playerName: {
    fontWeight: '600',
  },
  ovrBadge: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    textAlign: 'center',
    marginTop: spacing.xxs,
  },
  statDivider: {
    width: 1,
    height: 48,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
});
