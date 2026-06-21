import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, radius, commonStyles } from '@/theme';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState, Chip, Icon } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Body, Label, Caption, Stat } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getFixturesByClub, getMatchEvents } from '@/database/queries/fixtures';
import { calculateOverall } from '@/utils/overall';
import { buildYouthReport, YouthReport, YouthListItem, U21_AGE_LIMIT } from '@/engine/reports/youth-report';
import { FORM_WINDOW, SquadPlayer } from '@/engine/reports/technical-report';
import { MatchEvent, Position } from '@/types';
import { RootStackParamList } from '@/navigation/types';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type PositionFilter = 'ALL' | 'GK' | 'DEF' | 'MID' | 'ATT';

const POSITION_GROUPS: Record<Exclude<PositionFilter, 'ALL'>, Position[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB'],
  MID: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  ATT: ['LW', 'RW', 'ST'],
};
const FILTER_ORDER: PositionFilter[] = ['ALL', 'GK', 'DEF', 'MID', 'ATT'];
function filterLabel(opt: PositionFilter, t: (k: TKey) => string): string {
  if (opt === 'ALL') return t('report.youth_filter_all');
  const labels: Record<Exclude<PositionFilter, 'ALL'>, string> = {
    GK: 'GK',
    DEF: 'DEF',
    MID: 'MEI',
    ATT: 'ATA',
  };
  return labels[opt];
}

export function ReportsYouthScreen() {
  const { t } = useTranslation();
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
        <ActivityIndicator color={colors.reportYouth} size="large" />
      </View>
    );
  }

  if (!report || report.topProspects.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState art="squad" title={t('report.youth_empty_squad', { limit: U21_AGE_LIMIT })} />
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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.reportYouth} />
      }
    >
      <View style={styles.header}>
        <Body color={colors.textSecondary} style={styles.headerIntro}>
          {t('report.youth_intro', { limit: U21_AGE_LIMIT })}
        </Body>
        <View style={styles.filterRow}>
          {FILTER_ORDER.map((opt) => (
            <Chip
              key={opt}
              label={filterLabel(opt, t)}
              selected={filter === opt}
              onPress={() => setFilter(opt)}
              accent={colors.reportYouth}
              testID={`youth-filter-${opt}`}
            />
          ))}
        </View>
      </View>

      {filteredTop.length > 0 ? (
        <Section title={t('report.youth_section_prospects')} subtitle={t('report.youth_section_prospects_sub')}>
          {filteredTop.map((it) => (
            <Pressable
              key={it.player.id}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: it.player.id })}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
              accessibilityRole="button"
              accessibilityLabel={it.player.name}
              testID={`youth-prospect-${it.player.id}`}
            >
              <YouthCard item={it} ready={isReady(it)} />
            </Pressable>
          ))}
        </Section>
      ) : (
        <SectionCard title={t('report.youth_section_prospects')}>
          <EmptyState art="squad" title={t('report.youth_empty_position')} />
        </SectionCard>
      )}

      {filteredUnderused.length > 0 && (
        <Section title={t('report.youth_section_underused')} subtitle={t('report.youth_section_underused_sub')}>
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
        <Section title={t('report.youth_section_gaps')} subtitle={t('report.youth_section_gaps_sub')}>
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
  const { t } = useTranslation();
  const { player, form, potentialGap, starterComparison, insight } = item;
  return (
    <View style={styles.youthCard}>
      <View style={styles.youthHeader}>
        <View style={styles.youthHeaderLeft}>
          <View style={styles.nameRow}>
            <Body style={styles.youthName}>{player.name}</Body>
            {ready ? (
              <View style={styles.readyBadge}>
                <Caption style={styles.readyBadgeText}>{t('report.youth_badge_ready')}</Caption>
              </View>
            ) : (
              <View style={styles.promiseBadge}>
                <Caption style={styles.promiseBadgeText}>{t('report.youth_badge_promise')}</Caption>
              </View>
            )}
          </View>
          <Caption color={colors.textSecondary}>
            {t('report.youth_pos_age', { position: player.position, age: player.age })}
          </Caption>
        </View>
        <View style={styles.youthBadges}>
          <AttrBadge label="OVR" value={player.overall} color={colors.primary} />
          <AttrBadge label="POT" value={player.effectivePotential} color={colors.gold} />
        </View>
      </View>

      <View style={styles.youthStats}>
        <StatChip icon="goal" label={`${form.goals}G ${form.assists}A`} />
        <StatChip icon="squad" label={t('report.youth_stat_games', { count: form.appearances })} />
        {form.appearances > 0 && (
          <StatChip icon="chart" label={t('report.youth_stat_rating', { rating: form.avgRating.toFixed(1) })} />
        )}
        <StatChip icon="target" label={t('report.youth_stat_gap', { gap: potentialGap })} />
      </View>

      {starterComparison && (
        <Caption color={colors.textSecondary} style={styles.comparisonText}>
          {t('report.youth_starter_label')}{' '}
          <Caption color={colors.text} style={styles.comparisonBold}>{starterComparison.starterName}</Caption>{' '}
          (OVR {starterComparison.starterOverall}){' '}
          <Caption color={starterComparison.overallDelta >= 0 ? colors.success : colors.warning}>
            ({starterComparison.overallDelta >= 0 ? '+' : ''}
            {starterComparison.overallDelta})
          </Caption>
        </Caption>
      )}

      <Caption color={colors.textSecondary} style={styles.insight}>{insight}</Caption>
    </View>
  );
}

function CompactRow({ item, showGap = false }: { item: YouthListItem; showGap?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.compactRow}>
      <View style={styles.compactLeft}>
        <Body style={styles.compactName}>{item.player.name}</Body>
        <Caption color={colors.textSecondary}>
          {t('report.youth_pos_age_ovr', {
            position: item.player.position,
            age: item.player.age,
            ovr: item.player.overall,
          })}
        </Caption>
      </View>
      {showGap && (
        <View style={[styles.gapBadge, { borderColor: colors.success }]}>
          <Label color={colors.success}>+{item.potentialGap}</Label>
        </View>
      )}
    </View>
  );
}

function AttrBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Caption style={styles.badgeLabel}>{label}</Caption>
      <Stat color={color} style={styles.badgeValue}>{value}</Stat>
    </View>
  );
}

function StatChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.chip}>
      <Icon name={icon} size={12} color={colors.textSecondary} />
      <Label color={colors.textSecondary}>{label}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  header: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  headerIntro: {
    fontStyle: 'italic',
  },

  youthCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  youthName: { fontWeight: '700' },
  youthBadges: { flexDirection: 'row', gap: spacing.xs },
  badge: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    alignItems: 'center',
    minWidth: 42,
  },
  badgeLabel: {
    letterSpacing: 1,
  },
  badgeValue: {
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
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  comparisonText: {
    marginTop: spacing.sm,
  },
  comparisonBold: {
    fontWeight: '600',
  },
  insight: {
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },

  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  compactLeft: { flex: 1 },
  compactName: { fontWeight: '600' },
  gapBadge: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  readyBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  readyBadgeText: {
    color: colors.text,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  promiseBadge: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  promiseBadgeText: {
    color: colors.gold,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
