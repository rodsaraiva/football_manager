/**
 * Relatório Pré-Jogo do Adversário
 *
 * Shows scouting info about the next opponent:
 * recent form, squad strength, top players, and attack/defense stats.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getClubById } from '@/database/queries/clubs';
import { getNextFixtureForClub, getRecentFixturesForClub, getMatchEvents } from '@/database/queries/fixtures';
import { calculateOverall } from '@/utils/overall';
import { buildOpponentReport, OpponentReport } from '@/engine/reports/opponent-report';
import { MatchEvent } from '@/types';

export function ReportsOpponentScreen() {
  const { playerClubId, playerClub, season } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<OpponentReport | null>(null);
  const [noFixture, setNoFixture] = useState(false);

  const load = useCallback(async () => {
    if (!dbHandle || !playerClubId || !playerClub) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setNoFixture(false);
    try {
      const nextFixture = await getNextFixtureForClub(dbHandle, playerClubId, season);
      if (!nextFixture) {
        setNoFixture(true);
        setReport(null);
        return;
      }

      const opponentId =
        nextFixture.homeClubId === playerClubId ? nextFixture.awayClubId : nextFixture.homeClubId;

      const [opponentClub, opponentPlayers, recentFixtures] = await Promise.all([
        getClubById(dbHandle, opponentId),
        getPlayersWithAttributesByClub(dbHandle, opponentId),
        getRecentFixturesForClub(dbHandle, opponentId, season, 5),
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
  }, [dbHandle, playerClubId, playerClub, season]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (noFixture || !report) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.emptyText}>Nenhum jogo agendado nesta temporada.</Text>
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
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerInfo}>
            <Text style={styles.opponentName}>{report.opponentName}</Text>
            <Text style={styles.fixtureInfo}>
              Semana {report.fixtureWeek} · {report.isHome ? 'Em casa' : 'Fora'}
            </Text>
          </View>
          <View style={[styles.repBadge, { borderColor: repColor(report.reputationLabel) }]}>
            <Text style={[styles.repText, { color: repColor(report.reputationLabel) }]}>
              {report.reputationLabel}
            </Text>
          </View>
        </View>
        {report.alertMessage && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertText}>{report.alertMessage}</Text>
          </View>
        )}
      </View>

      {/* Recent form */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Forma Recente</Text>
        <Text style={styles.sectionSub}>Últimos {report.recentForm.length} jogos</Text>
        {report.recentForm.length === 0 ? (
          <Text style={styles.empty}>Sem jogos disputados nesta temporada.</Text>
        ) : (
          <View style={styles.formRow}>
            {report.recentForm.map((r, i) => (
              <View key={i} style={[styles.resultChip, { backgroundColor: resultBg(r.result) }]}>
                <Text style={styles.resultText}>{r.result}</Text>
                <Text style={styles.resultScore}>{r.goalsFor}-{r.goalsAgainst}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Squad strength */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Força do Elenco</Text>
        <Text style={styles.sectionSub}>OVR médio: {report.squadAvgOverall}</Text>
        {report.topPlayers.map((p, i) => (
          <View key={p.id} style={styles.playerRow}>
            <Text style={styles.playerRank}>#{i + 1}</Text>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{p.name}</Text>
              <Text style={styles.playerMeta}>{p.position}</Text>
            </View>
            <View style={styles.ovrBadge}>
              <Text style={styles.ovrText}>{p.overall}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Attack vs Defense */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ataque vs. Defesa</Text>
        <Text style={styles.sectionSub}>Média por jogo nos últimos {report.recentForm.length} jogos</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.success }]}>{report.goalsPerGame}</Text>
            <Text style={styles.statLabel}>Gols marcados/jogo</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.danger }]}>{report.concededPerGame}</Text>
            <Text style={styles.statLabel}>Gols sofridos/jogo</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function repColor(label: 'Favorito' | 'Equilíbrio' | 'Zebra'): string {
  if (label === 'Favorito') return colors.danger;
  if (label === 'Zebra') return colors.success;
  return colors.warning;
}

function resultBg(result: 'W' | 'D' | 'L'): string {
  if (result === 'W') return colors.success + 'cc';
  if (result === 'L') return colors.danger + 'cc';
  return colors.warning + 'cc';
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerInfo: { flex: 1 },
  opponentName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  fixtureInfo: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  repBadge: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  repText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  alertBanner: {
    marginTop: spacing.sm,
    backgroundColor: colors.warning + '33',
    borderRadius: 6,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  alertText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '600',
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
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  resultChip: {
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    minWidth: 48,
  },
  resultText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  resultScore: {
    color: colors.text,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  playerRank: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    width: 20,
    textAlign: 'center',
  },
  playerInfo: { flex: 1 },
  playerName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  playerMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  ovrBadge: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ovrText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 48,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
});
