/**
 * Scouting de Free Agents com Fit Tático
 *
 * Shows free agents ranked by how well they cover positional gaps in the
 * user's squad, with filters for position, overall range, and wage range.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Pressable,
  ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { EmptyState } from '@/components/EmptyState';
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
  const clampedWidth = Math.max(2, Math.min(100, score));
  return (
    <View style={styles.fitBarTrack}>
      <View
        style={[
          styles.fitBarFill,
          { width: `${clampedWidth}%` as `${number}%`, backgroundColor: fitScoreColor(score) },
        ]}
      />
    </View>
  );
}

// ─── AgentCard ───────────────────────────────────────────────────────────────

function AgentCard({ item, onPress }: { item: FreeAgentFit; onPress: () => void }) {
  const isInjured = item.player.injuryWeeksLeft > 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.playerName}>{item.player.name}</Text>
            {isInjured && (
              <View style={styles.injuredBadge}>
                <Text style={styles.injuredText}>Lesionado</Text>
              </View>
            )}
          </View>
          <Text style={styles.playerMeta}>
            {item.coversPosition} · {item.player.age} anos · OVR {item.overall}
          </Text>
        </View>
        <View style={styles.wageBox}>
          <Text style={styles.wageValue}>{formatWage(item.player.wage)}</Text>
          <Text style={styles.wageLabel}>/sem</Text>
        </View>
      </View>

      <View style={styles.fitRow}>
        <Text style={[styles.fitLabel, { color: fitScoreColor(item.fitScore) }]}>
          Fit {item.fitScore.toFixed(0)}
        </Text>
        <FitBar score={item.fitScore} />
        <Text style={styles.gapText}>
          {item.gapCovered >= 0 ? `+${item.gapCovered.toFixed(0)}` : item.gapCovered.toFixed(0)}
        </Text>
      </View>
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
  if (gaps.length === 0) return null;
  const top5 = gaps.slice(0, 5);
  return (
    <View style={styles.gapsSection}>
      <Text style={styles.sectionTitle}>Lacunas no elenco</Text>
      <View style={styles.gapsRow}>
        {top5.map((g) => (
          <View key={g.position} style={styles.gapChip}>
            <Text style={styles.gapChipPos}>{g.position}</Text>
            <Text style={styles.gapChipOvr}>OVR {g.avgOverall}</Text>
          </View>
        ))}
      </View>
    </View>
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
  const steps = [0, 50, 60, 70, 80];
  const wageLimits = [0, 10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
  const effectiveMax = maxBudget > 0 ? maxBudget : 1_000_000;

  return (
    <View style={styles.filtersContainer}>
      {/* Position filter */}
      <Text style={styles.filterLabel}>Posição</Text>
      <FlatList
        horizontal
        data={POSITIONS}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: pos }) => (
          <Pressable
            style={[
              styles.filterChip,
              filters.position === pos && styles.filterChipActive,
            ]}
            onPress={() => onChange({ ...filters, position: pos })}
          >
            <Text
              style={[
                styles.filterChipText,
                filters.position === pos && styles.filterChipTextActive,
              ]}
            >
              {pos}
            </Text>
          </Pressable>
        )}
      />

      {/* Min overall filter */}
      <Text style={styles.filterLabel}>OVR mínimo</Text>
      <View style={styles.filterRow}>
        {steps.map((s) => (
          <Pressable
            key={s}
            style={[styles.filterChip, filters.minOverall === s && styles.filterChipActive]}
            onPress={() => onChange({ ...filters, minOverall: s })}
          >
            <Text style={[styles.filterChipText, filters.minOverall === s && styles.filterChipTextActive]}>
              {s === 0 ? 'Todos' : `${s}+`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Max wage filter */}
      <Text style={styles.filterLabel}>Salário máx.</Text>
      <FlatList
        horizontal
        data={wageLimits}
        keyExtractor={(w) => String(w)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: w }) => {
          const label = w === 0 ? 'Todos' : formatWage(w);
          const active = filters.maxWage === (w === 0 ? Infinity : w);
          return (
            <Pressable
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => onChange({ ...filters, maxWage: w === 0 ? Infinity : w })}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {label}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function ReportsFreeAgentScoutScreen() {
  const { playerClubId, playerClub } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const navigation = useNavigation<NavProp>();

  const [loading, setLoading] = useState(true);
  const [scoutData, setScoutData] = useState<ScoutData | null>(null);
  const [filters, setFilters] = useState<Filters>({
    position: ALL_POSITIONS,
    minOverall: 0,
    maxWage: Infinity,
  });

  const load = useCallback(async () => {
    if (!dbHandle || !playerClubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [freeAgentsWithAttrs, squadWithAttrs] = await Promise.all([
        getFreeAgentsWithAttributes(dbHandle),
        getPlayersWithAttributesByClub(dbHandle, playerClubId),
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
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!scoutData) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.emptyText}>Sem dados disponíveis.</Text>
      </View>
    );
  }

  const ListHeader = (
    <>
      <SquadGapsSection gaps={scoutData.squadGaps} />
      <View style={styles.budgetBar}>
        <Text style={styles.budgetText}>
          Espaço salarial: {formatWage(scoutData.wageBudgetRemaining)}
        </Text>
        <Text style={styles.budgetSub}>
          {scoutData.fits.length} agentes avaliados
        </Text>
      </View>
      <FiltersBar
        filters={filters}
        onChange={setFilters}
        maxBudget={scoutData.wageBudgetRemaining}
      />
      {filteredFits.length === 0 && (
        <EmptyState
          icon="👍"
          title="Nenhum agente encontrado"
          description="O teu elenco está bem coberto para os filtros selecionados. Tenta ampliar os critérios."
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
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
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
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  gapChipPos: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  gapChipOvr: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },

  // Budget bar
  budgetBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  budgetText: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  budgetSub: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
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
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.md,
    marginBottom: 4,
  },
  filterChip: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
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

  // Agent card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { backgroundColor: colors.surfaceLight },
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
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  injuredBadge: {
    backgroundColor: colors.danger,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  injuredText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  playerMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  wageBox: {
    alignItems: 'flex-end',
  },
  wageValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  wageLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
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
    fontSize: fontSize.xs,
    fontWeight: '700',
    width: 48,
  },
  fitBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fitBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  gapText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    width: 36,
    textAlign: 'right',
  },

  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
});
