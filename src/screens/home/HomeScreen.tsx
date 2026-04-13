import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { Fixture } from '@/types';
import { RootStackParamList } from '@/navigation/types';
import { SeededRng } from '@/engine/rng';
import { getFixturesByClub } from '@/database/queries/fixtures';
import { getClubById } from '@/database/queries/clubs';
import { advanceGameWeek } from '@/engine/game-loop';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavProp>();

  const {
    playerClub,
    playerClubId,
    season,
    week,
    recentResults,
    isAdvancing,
    isNewSeason,
    lastMatchResult,
    currentSave,
    setAdvancing,
    updateWeek,
    setLastMatchResult,
    setNewSeason,
    setPlayerClub,
    setRecentResults,
  } = useGameStore();

  const { dbHandle } = useDatabaseStore();

  // Navigate to EndOfSeason when flag is set
  useEffect(() => {
    if (isNewSeason) {
      navigation.navigate('EndOfSeason');
    }
  }, [isNewSeason, navigation]);

  const handleAdvanceWeek = useCallback(async () => {
    if (isAdvancing || !dbHandle || !playerClubId || !currentSave) return;
    setAdvancing(true);
    try {
      const rng = new SeededRng(season * 1000 + week);
      const result = advanceGameWeek({
        dbHandle,
        season,
        week,
        playerClubId,
        saveId: currentSave.id,
        rng,
      });

      updateWeek(result.newSeason, result.newWeek);
      if (result.playerMatchResult) setLastMatchResult(result.playerMatchResult);

      // Reload club data
      const updatedClub = getClubById(dbHandle, playerClubId);
      if (updatedClub) setPlayerClub(updatedClub);

      // Reload recent results
      const allFixtures = getFixturesByClub(dbHandle, playerClubId, result.isSeasonEnd ? season : result.newSeason);
      const played = allFixtures.filter(f => f.played);
      setRecentResults(played.slice(-5));

      if (result.isSeasonEnd) setNewSeason(true);
    } finally {
      setAdvancing(false);
    }
  }, [
    isAdvancing,
    dbHandle,
    playerClubId,
    currentSave,
    season,
    week,
    setAdvancing,
    updateWeek,
    setLastMatchResult,
    setNewSeason,
    setPlayerClub,
    setRecentResults,
  ]);

  const renderRecentResult = useCallback(
    ({ item }: { item: Fixture }) => {
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
            <Text style={styles.resultWeek}>
              Week {item.week}, Season {item.season}
            </Text>
          </View>
        </View>
      );
    },
    [playerClub?.id],
  );

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <Text style={styles.clubName}>{playerClub?.name ?? 'No Club'}</Text>
        <Text style={styles.seasonInfo}>
          Season {season} — Week {week}
        </Text>
      </View>

      {/* Last Match Result Banner */}
      {lastMatchResult !== null && (
        <TouchableOpacity
          style={styles.matchResultBanner}
          onPress={() => navigation.navigate('MatchResult', { fixtureId: -1 })}
          activeOpacity={0.8}
        >
          <Text style={styles.matchResultLabel}>LAST RESULT</Text>
          <Text style={styles.matchResultScore}>
            {lastMatchResult.homeGoals} - {lastMatchResult.awayGoals}
          </Text>
          <Text style={styles.matchResultTap}>Tap to view details</Text>
        </TouchableOpacity>
      )}

      {/* Next Match Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>NEXT MATCH</Text>
        <Text style={styles.nextMatchText}>No upcoming matches</Text>
      </View>

      {/* Advance Week Button */}
      <TouchableOpacity
        style={[styles.advanceButton, isAdvancing && styles.advanceButtonDisabled]}
        onPress={handleAdvanceWeek}
        disabled={isAdvancing}
        activeOpacity={0.8}
      >
        {isAdvancing ? (
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
  matchResultBanner: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  matchResultLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  matchResultScore: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  matchResultTap: {
    color: colors.primary,
    fontSize: fontSize.xs,
    marginTop: 2,
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
