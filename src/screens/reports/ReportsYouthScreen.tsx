import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { getFixturesByClub, getMatchEvents } from '@/database/queries/fixtures';
import { calculateOverall } from '@/utils/overall';
import { buildYouthReport, YouthReport, YouthListItem, U21_AGE_LIMIT } from '@/engine/reports/youth-report';
import { FORM_WINDOW, SquadPlayer } from '@/engine/reports/technical-report';
import { MatchEvent } from '@/types';

export function ReportsYouthScreen() {
  const { playerClubId, season, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<YouthReport | null>(null);

  const load = React.useCallback(async () => {
    if (!dbHandle || !playerClubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const basePlayers = await getPlayersByClub(dbHandle, playerClubId);
      const squad: SquadPlayer[] = [];
      for (const p of basePlayers) {
        const full = await getPlayerById(dbHandle, p.id);
        if (!full) continue;
        squad.push({
          id: full.id,
          name: full.name,
          age: full.age,
          position: full.position,
          overall: calculateOverall(full.attributes, full.position),
          basePotential: full.basePotential,
          effectivePotential: full.effectivePotential,
          injuryWeeksLeft: full.injuryWeeksLeft,
        });
      }

      const allFixtures = await getFixturesByClub(dbHandle, playerClubId, season);
      const recent = allFixtures
        .filter((f) => f.played && f.week < week)
        .sort((a, b) => b.week - a.week)
        .slice(0, FORM_WINDOW);

      const eventsByFixture = new Map<number, MatchEvent[]>();
      for (const f of recent) {
        eventsByFixture.set(f.id, await getMatchEvents(dbHandle, f.id));
      }

      const r = buildYouthReport({
        squad,
        recentFixtures: recent,
        eventsByFixture,
        playerClubId,
      });
      setReport(r);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, season, week]);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!report || report.topProspects.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.subtitle}>
          Nenhum jogador com até {U21_AGE_LIMIT} anos no elenco.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIntro}>
          Análise detalhada dos atletas com até {U21_AGE_LIMIT} anos.
        </Text>
      </View>

      <Section title="⭐ Principais promessas" subtitle="Mistura de overall atual e potencial">
        {report.topProspects.map((it) => <YouthCard key={it.player.id} item={it} />)}
      </Section>

      {report.mostUnderused.length > 0 && (
        <Section title="⏱️ Subutilizados" subtitle="Bom overall, nenhum minuto recente">
          {report.mostUnderused.map((it) => (
            <CompactRow key={it.player.id} item={it} />
          ))}
        </Section>
      )}

      {report.biggestGaps.length > 0 && (
        <Section title="📈 Maior espaço para crescer" subtitle="Maior gap de potencial não atingido">
          {report.biggestGaps.map((it) => (
            <CompactRow key={it.player.id} item={it} showGap />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSub}>{subtitle}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function YouthCard({ item }: { item: YouthListItem }) {
  const { player, form, potentialGap, starterComparison, insight } = item;
  return (
    <View style={styles.youthCard}>
      <View style={styles.youthHeader}>
        <View style={styles.youthHeaderLeft}>
          <Text style={styles.youthName}>{player.name}</Text>
          <Text style={styles.youthMeta}>
            {player.position} · {player.age}a
          </Text>
        </View>
        <View style={styles.youthBadges}>
          <Badge label="OVR" value={player.overall} color={colors.primary} />
          <Badge label="POT" value={player.effectivePotential} color={colors.gold} />
        </View>
      </View>

      <View style={styles.youthStats}>
        <StatChip icon="⚽" label={`${form.goals}G ${form.assists}A`} />
        <StatChip icon="🏟️" label={`${form.appearances} jogos`} />
        {form.appearances > 0 && (
          <StatChip icon="📊" label={`${form.avgRating.toFixed(1)} média`} />
        )}
        <StatChip icon="📈" label={`gap ${potentialGap}`} />
      </View>

      {starterComparison && (
        <Text style={styles.comparisonText}>
          Titular da posição:{' '}
          <Text style={styles.comparisonBold}>{starterComparison.starterName}</Text>{' '}
          (OVR {starterComparison.starterOverall}){' '}
          <Text
            style={{
              color: starterComparison.overallDelta >= 0 ? colors.success : colors.warning,
            }}
          >
            ({starterComparison.overallDelta >= 0 ? '+' : ''}
            {starterComparison.overallDelta})
          </Text>
        </Text>
      )}

      <Text style={styles.insight}>{insight}</Text>
    </View>
  );
}

function CompactRow({ item, showGap = false }: { item: YouthListItem; showGap?: boolean }) {
  return (
    <View style={styles.compactRow}>
      <View style={styles.compactLeft}>
        <Text style={styles.compactName}>{item.player.name}</Text>
        <Text style={styles.compactMeta}>
          {item.player.position} · {item.player.age}a · OVR {item.player.overall}
        </Text>
      </View>
      {showGap && (
        <View style={[styles.gapBadge, { borderColor: colors.success }]}>
          <Text style={[styles.gapText, { color: colors.success }]}>
            +{item.potentialGap}
          </Text>
        </View>
      )}
    </View>
  );
}

function Badge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={styles.badgeLabel}>{label}</Text>
      <Text style={[styles.badgeValue, { color }]}>{value}</Text>
    </View>
  );
}

function StatChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  subtitle: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  headerIntro: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },

  section: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  sectionSub: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  sectionBody: { gap: spacing.sm },

  youthCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  youthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  youthHeaderLeft: { flex: 1 },
  youthName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  youthMeta: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  youthBadges: { flexDirection: 'row', gap: spacing.xs },
  badge: {
    borderWidth: 2,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    minWidth: 42,
  },
  badgeLabel: {
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
  badgeValue: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  youthStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  chipIcon: { fontSize: 12 },
  chipLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  comparisonText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  comparisonBold: {
    color: colors.text,
    fontWeight: '600',
  },
  insight: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },

  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  compactLeft: { flex: 1 },
  compactName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  compactMeta: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  gapBadge: {
    borderWidth: 2,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  gapText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
