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
import { getFixturesByWeek, getFixturesByClub, updateFixtureResult } from '@/database/queries/fixtures';
import { getClubById, updateClubBudget } from '@/database/queries/clubs';
import { calculateWeeklyIncome, calculateWeeklyExpenses } from '@/engine/finance/finance-engine';
import { addFinanceEntry } from '@/database/queries/finances';
import { updateSaveWeek } from '@/database/queries/saves';

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
    if (isAdvancing || !dbHandle || !playerClubId) return;

    setAdvancing(true);

    try {
      // 1. Get fixtures for this week
      const weekFixtures = getFixturesByWeek(dbHandle, season, week);

      // 2. Simulate each unplayed fixture with reputation-weighted random results
      const rng = new SeededRng(season * 1000 + week);

      for (const fixture of weekFixtures) {
        if (fixture.played) continue;

        const homeClub = getClubById(dbHandle, fixture.homeClubId);
        const awayClub = getClubById(dbHandle, fixture.awayClubId);
        if (!homeClub || !awayClub) continue;

        const homeStrength = homeClub.reputation * 1.07; // home advantage
        const awayStrength = awayClub.reputation;
        const total = homeStrength + awayStrength;

        const homeExpected = (homeStrength / total) * 3;
        const awayExpected = (awayStrength / total) * 3;

        const homeGoals = Math.round(rng.nextFloat(0, homeExpected * 1.5));
        const awayGoals = Math.round(rng.nextFloat(0, awayExpected * 1.5));
        const attendance = Math.round(homeClub.stadiumCapacity * 0.75);

        updateFixtureResult(dbHandle, fixture.id, homeGoals, awayGoals, attendance);

        // If this is the player's match, store a MatchResult for display
        if (fixture.homeClubId === playerClubId || fixture.awayClubId === playerClubId) {
          const homePossession = Math.round((homeStrength / total) * 100);
          setLastMatchResult({
            homeGoals,
            awayGoals,
            events: [],
            homeRatings: [],
            awayRatings: [],
            stats: {
              homePossession,
              awayPossession: 100 - homePossession,
              homeShots: rng.nextInt(5, 15),
              awayShots: rng.nextInt(5, 15),
              homeFouls: rng.nextInt(8, 16),
              awayFouls: rng.nextInt(8, 16),
              homeCorners: rng.nextInt(3, 10),
              awayCorners: rng.nextInt(3, 10),
            },
            attendance,
          });
        }
      }

      // 3. Process finances for player's club
      const hasHomeMatch = weekFixtures.some((f) => f.homeClubId === playerClubId);
      const income = calculateWeeklyIncome({
        clubReputation: playerClub?.reputation ?? 70,
        stadiumCapacity: playerClub?.stadiumCapacity ?? 30000,
        hasHomeMatch,
        leaguePosition: 1,
        season,
        week,
      });
      const expenses = calculateWeeklyExpenses({
        totalPlayerWages: playerClub?.wageBudget ?? 500000,
        totalStaffWages: 100000,
        stadiumCapacity: playerClub?.stadiumCapacity ?? 30000,
        trainingFacilities: playerClub?.trainingFacilities ?? 3,
        youthAcademy: playerClub?.youthAcademy ?? 3,
        medicalDepartment: playerClub?.medicalDepartment ?? 3,
      });

      if (income.tv > 0) {
        addFinanceEntry(dbHandle, {
          clubId: playerClubId,
          season,
          week,
          type: 'tv',
          amount: income.tv,
          description: 'TV Revenue',
        });
      }
      if (income.sponsor > 0) {
        addFinanceEntry(dbHandle, {
          clubId: playerClubId,
          season,
          week,
          type: 'sponsor',
          amount: income.sponsor,
          description: 'Sponsor Revenue',
        });
      }
      if (income.ticket > 0) {
        addFinanceEntry(dbHandle, {
          clubId: playerClubId,
          season,
          week,
          type: 'ticket',
          amount: income.ticket,
          description: 'Matchday Revenue',
        });
      }
      addFinanceEntry(dbHandle, {
        clubId: playerClubId,
        season,
        week,
        type: 'wages',
        amount: -expenses.wages,
        description: 'Weekly Wages',
      });
      addFinanceEntry(dbHandle, {
        clubId: playerClubId,
        season,
        week,
        type: 'maintenance',
        amount: -expenses.maintenance,
        description: 'Maintenance',
      });

      const netChange =
        income.tv + income.sponsor + income.ticket - expenses.wages - expenses.maintenance;
      updateClubBudget(dbHandle, playerClubId, (playerClub?.budget ?? 0) + netChange);

      // 4. Advance week / season
      const newWeek = week >= 46 ? 1 : week + 1;
      const newSeason = week >= 46 ? season + 1 : season;

      if (currentSave) {
        updateSaveWeek(dbHandle, currentSave.id, newSeason, newWeek);
      }

      updateWeek(newSeason, newWeek);

      // Reload club data (budget changed)
      const updatedClub = getClubById(dbHandle, playerClubId);
      if (updatedClub) setPlayerClub(updatedClub);

      // Reload recent results
      const allClubFixtures = getFixturesByClub(dbHandle, playerClubId, season);
      const played = allClubFixtures.filter((f) => f.played);
      setRecentResults(played.slice(-5));

      if (week >= 46) {
        setNewSeason(true);
      }
    } finally {
      setAdvancing(false);
    }
  }, [
    isAdvancing,
    dbHandle,
    playerClubId,
    playerClub,
    season,
    week,
    currentSave,
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
