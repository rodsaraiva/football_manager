import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { Fixture } from '@/types';

export function HomeScreen() {
  const {
    playerClub,
    season,
    week,
    recentResults,
    isAdvancing,
    setAdvancing,
    updateWeek,
  } = useGameStore();

  const [advancing, setLocalAdvancing] = useState(false);

  async function handleAdvanceWeek() {
    if (advancing || isAdvancing) return;
    setLocalAdvancing(true);
    setAdvancing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const newWeek = week >= 46 ? 1 : week + 1;
    const newSeason = week >= 46 ? season + 1 : season;
    updateWeek(newSeason, newWeek);
    setAdvancing(false);
    setLocalAdvancing(false);
  }

  function renderRecentResult({ item }: { item: Fixture }) {
    const isHome = item.homeClubId === playerClub?.id;
    const myGoals = isHome ? item.homeGoals : item.awayGoals;
    const oppGoals = isHome ? item.awayGoals : item.homeGoals;
    const ha = isHome ? 'H' : 'A';

    let resultColor = colors.warning;
    if (myGoals != null && oppGoals != null) {
      if (myGoals > oppGoals) resultColor = colors.success;
      else if (myGoals < oppGoals) resultColor = colors.danger;
    }

    return (
      <View style={styles.resultCard}>
        <View style={[styles.resultBadge, { backgroundColor: resultColor }]}>
          <Text style={styles.resultBadgeText}>{ha}</Text>
        </View>
        <View style={styles.resultInfo}>
          <Text style={styles.resultScore}>
            {myGoals ?? '-'} - {oppGoals ?? '-'}
          </Text>
          <Text style={styles.resultWeek}>Week {item.week}, Season {item.season}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <Text style={styles.clubName}>{playerClub?.name ?? 'No Club'}</Text>
        <Text style={styles.seasonInfo}>Season {season} — Week {week}</Text>
      </View>

      {/* Next Match Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>NEXT MATCH</Text>
        <Text style={styles.nextMatchText}>No upcoming matches</Text>
      </View>

      {/* Advance Week Button */}
      <TouchableOpacity
        style={[styles.advanceButton, (advancing || isAdvancing) && styles.advanceButtonDisabled]}
        onPress={handleAdvanceWeek}
        disabled={advancing || isAdvancing}
        activeOpacity={0.8}
      >
        {advancing || isAdvancing ? (
          <View style={styles.advancingRow}>
            <ActivityIndicator color={colors.text} size="small" />
            <Text style={[styles.advanceButtonText, { marginLeft: spacing.sm }]}>
              Simulating...
            </Text>
          </View>
        ) : (
          <Text style={styles.advanceButtonText}>ADVANCE WEEK</Text>
        )}
      </TouchableOpacity>

      {/* Recent Results */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Results</Text>
      </View>

      {recentResults.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No results yet</Text>
        </View>
      ) : (
        <FlatList
          data={recentResults}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRecentResult}
          scrollEnabled={false}
          contentContainerStyle={styles.resultsList}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    margin: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clubName: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  seasonInfo: {
    color: colors.primary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  nextMatchText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  advanceButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 18,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  advanceButtonDisabled: {
    opacity: 0.6,
  },
  advanceButtonText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  advancingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  resultsList: {
    paddingHorizontal: spacing.md,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  resultBadgeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
  },
  resultInfo: {
    flex: 1,
  },
  resultScore: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  resultWeek: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
