import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import { ValueBadge } from '@/components/ValueBadge';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getFixturesByClub, getMatchEvents } from '@/database/queries/fixtures';
import { calculateOverall } from '@/utils/overall';
import { buildYouthReport, YouthReport, YouthListItem, U21_AGE_LIMIT } from '@/engine/reports/youth-report';
import { FORM_WINDOW, SquadPlayer } from '@/engine/reports/technical-report';
import { MatchEvent, Position } from '@/types';
import { RootStackParamList } from '@/navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type PositionFilter = 'ALL' | 'GK' | 'DEF' | 'MID' | 'ATT';

const POSITION_GROUPS: Record<Exclude<PositionFilter, 'ALL'>, Position[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB'],
  MID: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  ATT: ['LW', 'RW', 'ST'],
};
const FILTER_LABELS: Record<PositionFilter, string> = {
  ALL: 'Todos',
  GK: 'GK',
  DEF: 'DEF',
  MID: 'MEI',
  ATT: 'ATA',
};

export function ReportsYouthScreen() {
  const navigation = useNavigation<NavProp>();
  const { playerClubId, season, week, currentSave } = useGameStore();
  const saveId = currentSave?.id;
  const { dbHandle } = useDatabaseStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<YouthReport | null>(null);
  const [squadAvgStarter, setSquadAvgStarter] = useState(0);
  const [filter, setFilter] = useState<PositionFilter>('ALL');

  const load = React.useCallback(async () => {
    if (!dbHandle || !playerClubId || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fullPlayers = await getPlayersWithAttributesByClub(dbHandle, saveId, playerClubId);
      const squad: SquadPlayer[] = fullPlayers.map((full) => ({
        id: full.id,
        name: full.name,
        age: full.age,
        position: full.position,
        overall: calculateOverall(full.attributes, full.position),
        basePotential: full.basePotential,
        effectivePotential: full.effectivePotential,
        injuryWeeksLeft: full.injuryWeeksLeft,
      }));

      // Avg overall of the top 11 players (rough "starter overall benchmark")
      const top11 = [...squad]
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 11);
      const starterAvg = top11.length === 0
        ? 0
        : top11.reduce((s, p) => s + p.overall, 0) / top11.length;
      setSquadAvgStarter(starterAvg);

      const allFixtures = await getFixturesByClub(dbHandle, saveId, playerClubId, season);
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

  if (!report || report.topProspects.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState icon="🌱" title={`Nenhum jogador com até ${U21_AGE_LIMIT} anos no elenco.`} />
      </View>
    );
  }

  const matchesFilter = (item: YouthListItem) => {
    if (filter === 'ALL') return true;
    return POSITION_GROUPS[filter].includes(item.player.position);
  };
  const filteredTop = report.topProspects.filter(matchesFilter);
  const filteredUnderused = report.mostUnderused.filter(matchesFilter);
  const filteredGaps = report.biggestGaps.filter(matchesFilter);
  const isReady = (item: YouthListItem) =>
    squadAvgStarter > 0 && item.player.overall >= squadAvgStarter - 2;

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
          Análise detalhada dos atletas com até {U21_AGE_LIMIT} anos.
        </Text>
        <View style={styles.filterRow}>
          {(Object.keys(FILTER_LABELS) as PositionFilter[]).map((opt) => (
            <Pressable
              key={opt}
              onPress={() => setFilter(opt)}
              style={[styles.filterChip, filter === opt && styles.filterChipActive]}
            >
              <Text
                style={[styles.filterChipText, filter === opt && styles.filterChipTextActive]}
              >
                {FILTER_LABELS[opt]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {filteredTop.length > 0 ? (
        <Section title="⭐ Principais promessas" subtitle="Mistura de overall atual e potencial">
          {filteredTop.map((it) => (
            <Pressable
              key={it.player.id}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: it.player.id })}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <YouthCard item={it} ready={isReady(it)} />
            </Pressable>
          ))}
        </Section>
      ) : (
        <SectionCard title="⭐ Principais promessas">
          <EmptyState icon="🌱" title="Nenhum jovem nesta posição." />
        </SectionCard>
      )}

      {filteredUnderused.length > 0 && (
        <Section title="⏱️ Subutilizados" subtitle="Bom overall, nenhum minuto recente">
          {filteredUnderused.map((it) => (
            <Pressable
              key={it.player.id}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: it.player.id })}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <CompactRow item={it} />
            </Pressable>
          ))}
        </Section>
      )}

      {filteredGaps.length > 0 && (
        <Section title="📈 Maior espaço para crescer" subtitle="Maior gap de potencial não atingido">
          {filteredGaps.map((it) => (
            <Pressable
              key={it.player.id}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: it.player.id })}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <CompactRow item={it} showGap />
            </Pressable>
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
    <SectionCard title={title} subtitle={subtitle}>
      {children}
    </SectionCard>
  );
}

function YouthCard({ item, ready = false }: { item: YouthListItem; ready?: boolean }) {
  const { player, form, potentialGap, starterComparison, insight } = item;
  return (
    <View style={styles.youthCard}>
      <View style={styles.youthHeader}>
        <View style={styles.youthHeaderLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={styles.youthName}>{player.name}</Text>
            {ready ? (
              <View style={styles.readyBadge}>
                <Text style={styles.readyBadgeText}>PRONTO</Text>
              </View>
            ) : (
              <View style={styles.promiseBadge}>
                <Text style={styles.promiseBadgeText}>PROMESSA</Text>
              </View>
            )}
          </View>
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
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.text,
  },
  readyBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  readyBadgeText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  promiseBadge: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  promiseBadgeText: {
    color: colors.gold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
