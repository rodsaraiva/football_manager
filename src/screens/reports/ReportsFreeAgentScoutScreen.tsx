/**
 * Scouting de Free Agents com Fit Tático
 *
 * Shows free agents ranked by how well they cover positional gaps in the
 * user's squad, with filters for position, overall range, and wage range.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Pressable,
  ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { EmptyState, Card, Chip } from '@/components/kit';
import StatBar from '@/components/StatBar';
import { Body, Label, Caption } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getFreeAgentsWithAttributes, getPlayersWithAttributesByClub } from '@/database/queries/players';
import {
  buildFreeAgentScout,
  FreeAgentFit,
  SquadGap,
} from '@/engine/reports/free-agent-scout';
import { Player, PlayerAttributes, Position } from '@/types'; // PlayerAttributes used in engine shape cast
import { RootStackParamList } from '@/navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const ALL_POSITIONS = 'Todas';

interface ScoutData {
  fits: FreeAgentFit[];
  squadGaps: SquadGap[];
  wageBudgetRemaining: number;
}

function fitScoreColor(score: number): string {
  if (score >= 60) return colors.success;
  if (score >= 30) return colors.warning;
  return colors.danger;
}

// ─── FitBar ──────────────────────────────────────────────────────────────────

function FitBar({ score }: { score: number }) {
  return (
    <View style={styles.fitBarTrack}>
      <StatBar
        barOnly
        value={Math.max(2, Math.min(100, score))}
        maxValue={100}
        color={fitScoreColor(score)}
      />
    </View>
  );
}

// ─── AgentCard ───────────────────────────────────────────────────────────────

function AgentCard({ item, onPress }: { item: FreeAgentFit; onPress: () => void }) {
  const { t } = useTranslation();
  const isInjured = item.player.injuryWeeksLeft > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.player.name}
      testID={`fa-scout-${item.player.id}`}
    >
      <Card variant="detail" style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Body style={styles.playerName}>{item.player.name}</Body>
            {isInjured && (
              <View style={styles.injuredBadge}>
                <Caption color={colors.text} style={styles.injuredText}>{t('report.scout_injured')}</Caption>
              </View>
            )}
          </View>
          <Caption color={colors.textSecondary}>
            {item.coversPosition} · {t('report.scout_years', { age: item.player.age })} · OVR {item.overall}
          </Caption>
        </View>
        <View style={styles.wageBox}>
          <Label color={colors.text}>{formatWage(item.player.wage)}</Label>
          <Caption color={colors.textMuted}>{t('report.scout_per_week')}</Caption>
        </View>
      </View>

      <View style={styles.fitRow}>
        <Label color={fitScoreColor(item.fitScore)} style={styles.fitLabel}>
          {t('report.scout_fit', { score: item.fitScore.toFixed(0) })}
        </Label>
        <FitBar score={item.fitScore} />
        <Caption color={colors.textMuted} style={styles.gapText}>
          {item.gapCovered >= 0 ? `+${item.gapCovered.toFixed(0)}` : item.gapCovered.toFixed(0)}
        </Caption>
      </View>
      </Card>
    </Pressable>
  );
}

function formatWage(w: number): string {
  if (w >= 1_000_000) return `$${(w / 1_000_000).toFixed(1)}M`;
  if (w >= 1_000) return `$${Math.round(w / 1_000)}K`;
  return `$${w}`;
}

// ─── SquadGapsSection ────────────────────────────────────────────────────────

function SquadGapsSection({ gaps }: { gaps: SquadGap[] }) {
  const { t } = useTranslation();
  if (gaps.length === 0) return null;
  const top5 = gaps.slice(0, 5);
  return (
    <Card variant="summary" style={styles.gapsSection}>
      <Label color={colors.textSecondary} style={styles.sectionTitle}>{t('report.scout_squad_gaps')}</Label>
      <View style={styles.gapsRow}>
        {top5.map((g) => (
          <View key={g.position} style={styles.gapChip}>
            <Caption color={colors.danger} style={styles.gapChipPos}>{g.position}</Caption>
            <Caption color={colors.textMuted}>OVR {g.avgOverall}</Caption>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ─── FiltersBar ──────────────────────────────────────────────────────────────

const POSITIONS: (Position | typeof ALL_POSITIONS)[] = [
  ALL_POSITIONS,
  'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST',
];

interface Filters {
  position: Position | typeof ALL_POSITIONS;
  minOverall: number;
  maxWage: number;
}

interface FiltersBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  maxBudget: number;
}

function FiltersBar({ filters, onChange, maxBudget }: FiltersBarProps) {
  const { t } = useTranslation();
  const steps = [0, 50, 60, 70, 80];
  const wageLimits = [0, 10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
  const effectiveMax = maxBudget > 0 ? maxBudget : 1_000_000;

  return (
    <View style={styles.filtersContainer}>
      {/* Position filter */}
      <Label color={colors.textMuted} style={styles.filterLabel}>{t('report.scout_filter_position')}</Label>
      <FlatList
        horizontal
        data={POSITIONS}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: pos }) => (
          <Chip
            label={pos === ALL_POSITIONS ? t('report.scout_filter_all') : pos}
            selected={filters.position === pos}
            onPress={() => onChange({ ...filters, position: pos })}
            accent={colors.reportScout}
            testID={`fa-filter-pos-${pos}`}
          />
        )}
      />

      {/* Min overall filter */}
      <Label color={colors.textMuted} style={styles.filterLabel}>{t('report.scout_filter_min_ovr')}</Label>
      <View style={styles.filterRow}>
        {steps.map((s) => (
          <Chip
            key={s}
            label={s === 0 ? t('report.scout_filter_all') : `${s}+`}
            selected={filters.minOverall === s}
            onPress={() => onChange({ ...filters, minOverall: s })}
            accent={colors.reportScout}
            testID={`fa-filter-ovr-${s}`}
          />
        ))}
      </View>

      {/* Max wage filter */}
      <Label color={colors.textMuted} style={styles.filterLabel}>{t('report.scout_filter_max_wage')}</Label>
      <FlatList
        horizontal
        data={wageLimits}
        keyExtractor={(w) => String(w)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: w }) => {
          const label = w === 0 ? t('report.scout_filter_all') : formatWage(w);
          const active = filters.maxWage === (w === 0 ? Infinity : w);
          return (
            <Chip
              label={label}
              selected={active}
              onPress={() => onChange({ ...filters, maxWage: w === 0 ? Infinity : w })}
              accent={colors.reportScout}
              testID={`fa-filter-wage-${w}`}
            />
          );
        }}
      />
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function ReportsFreeAgentScoutScreen() {
  const { t } = useTranslation();
  const { playerClubId, playerClub, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;
  const navigation = useNavigation<NavProp>();

  const [loading, setLoading] = useState(true);
  const [scoutData, setScoutData] = useState<ScoutData | null>(null);
  const [filters, setFilters] = useState<Filters>({
    position: ALL_POSITIONS,
    minOverall: 0,
    maxWage: Infinity,
  });

  const load = useCallback(async () => {
    if (!dbHandle || !playerClubId || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [freeAgentsWithAttrs, squadWithAttrs] = await Promise.all([
        getFreeAgentsWithAttributes(dbHandle, saveId),
        getPlayersWithAttributesByClub(dbHandle, saveId, playerClubId),
      ]);

      // Compute wage budget remaining
      const totalSquadWage = squadWithAttrs.reduce((sum, p) => sum + p.wage, 0);
      const wageBudget = playerClub?.wageBudget ?? 0;
      const wageBudgetRemaining = Math.max(0, wageBudget - totalSquadWage);

      // Normalise shape for engine
      const agentsForEngine = freeAgentsWithAttrs.map((p) => ({
        player: p as Player,
        attributes: p.attributes as PlayerAttributes,
      }));
      const squadForEngine = squadWithAttrs.map((p) => ({
        player: p as Player,
        attributes: p.attributes as PlayerAttributes,
      }));

      const result = buildFreeAgentScout({
        freeAgentsWithAttrs: agentsForEngine,
        squadWithAttrs: squadForEngine,
        wageBudgetRemaining,
      });

      setScoutData({ ...result, wageBudgetRemaining });
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, playerClub]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Apply local filters — no re-query
  const filteredFits = useMemo(() => {
    if (!scoutData) return [];
    return scoutData.fits.filter((fit) => {
      // Position filter: match primary OR secondary position
      if (filters.position !== ALL_POSITIONS) {
        const matchesPrimary = fit.player.position === filters.position;
        const matchesSecondary = fit.player.secondaryPosition === filters.position;
        if (!matchesPrimary && !matchesSecondary) return false;
      }
      // Overall filter: fit.overall is pre-computed for coversPosition
      if (fit.overall < filters.minOverall) return false;
      // Wage filter
      if (fit.player.wage > filters.maxWage) return false;
      return true;
    });
  }, [scoutData, filters]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.reportScout} size="large" />
      </View>
    );
  }

  if (!scoutData) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Body color={colors.textMuted}>{t('report.scout_no_data')}</Body>
      </View>
    );
  }

  const ListHeader = (
    <>
      <SquadGapsSection gaps={scoutData.squadGaps} />
      <View style={styles.budgetBar}>
        <Label color={colors.success}>
          {t('report.scout_wage_space', { value: formatWage(scoutData.wageBudgetRemaining) })}
        </Label>
        <Caption color={colors.textMuted}>
          {t('report.scout_agents_evaluated', { count: scoutData.fits.length })}
        </Caption>
      </View>
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        maxBudget={scoutData.wageBudgetRemaining}
      />
      {filteredFits.length === 0 && (
        <EmptyState
          art="search"
          title={t('report.scout_empty_title')}
          description={t('report.scout_empty_description')}
        />
      )}
    </>
  );

  return (
    <View style={commonStyles.screen}>
      <FlatList
        data={filteredFits}
        keyExtractor={(item) => String(item.player.id)}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
        renderItem={({ item }: ListRenderItemInfo<FreeAgentFit>) => (
          <AgentCard
            item={item}
            onPress={() => navigation.navigate('PlayerDetail', { playerId: item.player.id })}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  listContent: { paddingBottom: spacing.xl },

  // Squad gaps section
  gapsSection: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  gapsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  gapChip: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  gapChipPos: {
    fontWeight: '700',
  },

  // Budget bar
  budgetBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },

  // Filters
  filtersContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    marginBottom: spacing.sm,
  },
  filterLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.md,
    marginBottom: spacing.xs,
  },

  // Agent card
  card: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardInfo: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  playerName: {
    fontWeight: '700',
  },
  injuredBadge: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  injuredText: {
    fontWeight: '700',
  },
  wageBox: {
    alignItems: 'flex-end',
  },

  // Fit bar
  fitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  fitLabel: {
    fontWeight: '700',
    width: 48,
  },
  fitBarTrack: {
    flex: 1,
    justifyContent: 'center',
  },
  gapText: {
    width: 36,
    textAlign: 'right',
  },
});
