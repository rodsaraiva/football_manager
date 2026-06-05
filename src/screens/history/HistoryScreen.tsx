import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getSeasonSummary, SeasonCompetitionSummary } from '@/database/queries/history';

export function HistoryScreen() {
  const { season: currentSeason, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;

  const defaultSeason = currentSeason > 1 ? currentSeason - 1 : 1;
  const [selectedSeason, setSelectedSeason] = useState<number>(defaultSeason);
  const [summary, setSummary] = useState<SeasonCompetitionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const seasons: number[] = [];
  for (let s = 1; s < currentSeason; s++) seasons.push(s);

  useEffect(() => {
    if (!dbHandle || saveId == null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const data = await getSeasonSummary(dbHandle, saveId, selectedSeason);
      if (!cancelled) {
        setSummary(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbHandle, saveId, selectedSeason]);

  if (seasons.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.emptyText}>No completed seasons yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Season chip row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {seasons.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, selectedSeason === s && styles.chipSelected]}
            onPress={() => setSelectedSeason(s)}
          >
            <Text style={[styles.chipText, selectedSeason === s && styles.chipTextSelected]}>
              Season {s}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : summary.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No data recorded for Season {selectedSeason}.</Text>
        </View>
      ) : (
        summary.map((entry) => (
          <SummaryCard key={entry.competitionId} entry={entry} />
        ))
      )}
    </ScrollView>
  );
}

function SummaryCard({ entry }: { entry: SeasonCompetitionSummary }) {
  const topScorer = entry.topScorers[0] ?? null;
  const topAssister = entry.topAssisters[0] ?? null;

  return (
    <View style={styles.card}>
      {/* Card header */}
      <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
        <Text style={styles.competitionName}>{entry.competitionName || `Competition ${entry.competitionId}`}</Text>
      </View>

      {/* Champion / Runner-up */}
      <View style={styles.section}>
        <Row label="Champion" value={`Club ${entry.championClubId}`} valueColor={colors.gold} />
        {entry.runnerUpClubId != null && (
          <Row label="Runner-up" value={`Club ${entry.runnerUpClubId}`} valueColor={colors.silver} />
        )}
      </View>

      {/* Awards */}
      {(topScorer || topAssister || entry.mvp || entry.breakthrough) && (
        <View style={[styles.section, styles.sectionBorder]}>
          <Text style={styles.sectionLabel}>AWARDS</Text>
          {topScorer && (
            <Row
              label="Top Scorer"
              value={`Player ${topScorer.playerId} — ${topScorer.value} goals`}
              valueColor={colors.text}
            />
          )}
          {topAssister && (
            <Row
              label="Top Assister"
              value={`Player ${topAssister.playerId} — ${topAssister.value} assists`}
              valueColor={colors.text}
            />
          )}
          {entry.mvp && (
            <Row
              label="MVP"
              value={`Player ${entry.mvp.playerId}`}
              valueColor={colors.primaryLight}
            />
          )}
          {entry.breakthrough && (
            <Row
              label="Breakthrough"
              value={`Player ${entry.breakthrough.playerId}`}
              valueColor={colors.success}
            />
          )}
        </View>
      )}

      {/* Relegated clubs */}
      {entry.relegated.length > 0 && (
        <View style={[styles.section, styles.sectionBorder]}>
          <Text style={styles.sectionLabel}>RELEGATED</Text>
          {entry.relegated.map((rel) => (
            <Row
              key={rel.clubId}
              label={`${rel.finalPosition}th`}
              value={`Club ${rel.clubId}`}
              valueColor={colors.danger}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
  },

  // Chip row
  chipRow: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipRowContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.text,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  competitionName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sectionBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },

  // Row
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  rowLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  rowValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
