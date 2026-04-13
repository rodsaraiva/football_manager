import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubsByLeague } from '@/database/queries/clubs';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getFixturesByWeek } from '@/database/queries/fixtures';
import { calculateStandings, StandingsEntry } from '@/engine/competition/standings';
import { Fixture } from '@/types';
import StandingsTable from '@/components/StandingsTable';

export function StandingsScreen() {
  const { playerClub, playerClubId, season, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();

  const [entries, setEntries] = useState<StandingsEntry[]>([]);
  const [clubNames, setClubNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [leagueName, setLeagueName] = useState('League Table');

  useEffect(() => {
    if (!dbHandle || !playerClub) {
      setLoading(false);
      return;
    }

    const leagueId = playerClub.leagueId;

    // Load all clubs in the league
    const leagueClubs = getClubsByLeague(dbHandle, leagueId);
    const clubIds = leagueClubs.map((c) => c.id);
    const namesMap: Record<number, string> = {};
    for (const c of leagueClubs) {
      namesMap[c.id] = c.name;
    }
    setClubNames(namesMap);

    // Find the league competition for this season
    const competitions = getCompetitionsBySeason(dbHandle, season);
    const leagueComp = competitions.find(
      (comp) => comp.leagueId === leagueId && comp.type === 'league',
    );

    if (leagueComp) {
      setLeagueName(leagueComp.name);
    }

    // Collect all played fixtures for the competition up to current week
    const playedFixtures: Fixture[] = [];
    for (let w = 1; w <= week; w++) {
      const weekFixtures = getFixturesByWeek(dbHandle, season, w);
      const leagueFixtures = leagueComp
        ? weekFixtures.filter((f) => f.competitionId === leagueComp.id && f.played)
        : weekFixtures.filter((f) => f.played);
      playedFixtures.push(...leagueFixtures);
    }

    const standings = calculateStandings(playedFixtures, clubIds);
    setEntries(standings);
    setLoading(false);
  }, [dbHandle, playerClub, season, week]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={commonStyles.screen}>
        <View style={styles.header}>
          <Text style={styles.leagueName}>{leagueName}</Text>
          <Text style={styles.seasonText}>Season {season}</Text>
        </View>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No matches played yet</Text>
          <Text style={styles.emptySubtext}>
            Standings will update as matches are played
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <View style={styles.header}>
        <Text style={styles.leagueName}>{leagueName}</Text>
        <Text style={styles.seasonText}>Season {season}</Text>
      </View>
      <StandingsTable
        entries={entries}
        highlightClubId={playerClubId ?? undefined}
        clubNames={clubNames}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leagueName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  seasonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  emptyCard: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
