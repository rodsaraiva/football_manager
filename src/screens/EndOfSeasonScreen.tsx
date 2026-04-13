import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { RootStackParamList } from '@/navigation/types';
import { getClubsByLeague } from '@/database/queries/clubs';
import {
  getCompetitionsBySeason,
  getAllLeagues,
  createCompetition,
  addCompetitionEntry,
} from '@/database/queries/leagues';
import { getFixturesByClub, createFixture } from '@/database/queries/fixtures';
import { getSeasonBalance } from '@/database/queries/finances';
import { calculateStandings } from '@/engine/competition/standings';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
import { Fixture } from '@/types';
import { recalculatePotential } from '@/engine/training/potential';
import { getPlayersByClub } from '@/database/queries/players';
import { generateYouthPlayers } from '@/engine/youth/youth-academy';
import { SeededRng } from '@/engine/rng';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface SeasonStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  leaguePosition: number | null;
  totalTeams: number;
  income: number;
  expenses: number;
}

export function EndOfSeasonScreen() {
  const navigation = useNavigation<NavProp>();
  const { season, playerClub, playerClubId, setNewSeason, updateWeek, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();

  const [stats, setStats] = useState<SeasonStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!dbHandle || !playerClub || !playerClubId) {
      setLoading(false);
      return;
    }

    try {
      // Get all club fixtures for the season
      const allFixtures = getFixturesByClub(dbHandle, playerClubId, season);
      const played = allFixtures.filter((f) => f.played);

      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;

      for (const f of played) {
        const isHome = f.homeClubId === playerClubId;
        const myGoals = isHome ? (f.homeGoals ?? 0) : (f.awayGoals ?? 0);
        const oppGoals = isHome ? (f.awayGoals ?? 0) : (f.homeGoals ?? 0);
        goalsFor += myGoals;
        goalsAgainst += oppGoals;
        if (myGoals > oppGoals) wins++;
        else if (myGoals === oppGoals) draws++;
        else losses++;
      }

      // Compute league standings for player's club
      const leagueClubs = getClubsByLeague(dbHandle, playerClub.leagueId);
      const clubIds = leagueClubs.map((c) => c.id);

      const competitions = getCompetitionsBySeason(dbHandle, season);
      const leagueComp = competitions.find(
        (comp) => comp.leagueId === playerClub.leagueId && comp.type === 'league',
      );

      let leaguePosition: number | null = null;
      const totalTeams = leagueClubs.length;

      if (leagueComp) {
        // Collect all played league fixtures across all league clubs
        const fixtureSet = new Map<number, Fixture>();
        for (const clubId of clubIds) {
          const clubFixtures = getFixturesByClub(dbHandle, clubId, season);
          for (const f of clubFixtures) {
            if (f.competitionId === leagueComp.id && f.played && !fixtureSet.has(f.id)) {
              fixtureSet.set(f.id, f);
            }
          }
        }
        const allLeagueFixtures = Array.from(fixtureSet.values());
        const standings = calculateStandings(allLeagueFixtures, clubIds);
        const idx = standings.findIndex((e) => e.clubId === playerClubId);
        leaguePosition = idx >= 0 ? idx + 1 : null;
      }

      // Financial summary
      const balance = getSeasonBalance(dbHandle, playerClubId, season);
      const income = balance > 0 ? balance : 0;
      const expenses = balance < 0 ? Math.abs(balance) : 0;

      setStats({
        played: played.length,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        leaguePosition,
        totalTeams,
        income,
        expenses,
      });
    } catch (e) {
      // Fallback empty stats
      setStats({
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        leaguePosition: null,
        totalTeams: 0,
        income: 0,
        expenses: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClub, playerClubId, season]);

  async function handleContinue() {
    if (!dbHandle || starting || !playerClubId) return;
    setStarting(true);

    try {
      const newSeason = season + 1;

      // 1. Age all players
      dbHandle.prepare('UPDATE players SET age = age + 1').run();

      // 2. Contract expiry — mark players whose contract ends this season as free agents
      dbHandle.prepare('UPDATE players SET is_free_agent = 1 WHERE contract_end <= ?').run(season);

      // 3. Dynamic potential recalculation for player's club squad
      if (playerClubId) {
        const squad = getPlayersByClub(dbHandle, playerClubId);
        for (const player of squad) {
          const seasonStats = dbHandle.prepare(
            'SELECT avg_rating, minutes_played FROM player_stats WHERE player_id = ? AND season = ?',
          ).get(player.id, season) as { avg_rating: number; minutes_played: number } | undefined;

          if (!seasonStats) continue;

          const minutesPercent = Math.min(100, (seasonStats.minutes_played / (38 * 90)) * 100);

          const result = recalculatePotential({
            basePotential: player.basePotential,
            effectivePotential: player.effectivePotential,
            currentOverall: 70, // simplified — use average of attributes
            seasonRatings: [{ avgRating: seasonStats.avg_rating, minutesPercent }],
          });

          if (result.newEffectivePotential !== player.effectivePotential) {
            dbHandle.prepare('UPDATE players SET effective_potential = ? WHERE id = ?').run(
              result.newEffectivePotential,
              player.id,
            );
          }
        }
      }

      // 4. Youth academy generation
      if (playerClubId) {
        const youth = generateYouthPlayers({
          clubId: playerClubId,
          academyLevel: playerClub?.youthAcademy ?? 3,
          youthCoachBonus: 5, // simplified
          countryCode: 'EN', // simplified
          rng: new SeededRng(newSeason * 7777),
        });

        const maxIdRow = dbHandle.prepare('SELECT MAX(id) as maxId FROM players').get() as { maxId: number };
        let nextId = (maxIdRow?.maxId ?? 0) + 1;

        for (const y of youth) {
          dbHandle.prepare(
            'INSERT INTO players (id, name, nationality, age, position, secondary_position, club_id, wage, contract_end, market_value, base_potential, effective_potential, morale, fitness, injury_weeks_left, is_free_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ).run(
            nextId, y.name, 'Local', y.age, y.position, null,
            playerClubId, 5000, newSeason + 3, 100000,
            y.basePotential, y.basePotential, 70, 100, 0, 0,
          );

          const a = y.attributes;
          dbHandle.prepare(
            'INSERT INTO player_attributes (player_id, finishing, passing, crossing, dribbling, heading, long_shots, free_kicks, vision, composure, decisions, positioning, aggression, leadership, pace, stamina, strength, agility, jumping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ).run(
            nextId, a.finishing, a.passing, a.crossing, a.dribbling, a.heading,
            a.longShots, a.freeKicks, a.vision, a.composure, a.decisions,
            a.positioning, a.aggression, a.leadership, a.pace, a.stamina,
            a.strength, a.agility, a.jumping,
          );

          nextId++;
        }
      }

      // Generate calendar for the new season
      const leagues = getAllLeagues(dbHandle);
      const clubsByLeague: Record<number, number[]> = {};
      const championsLeagueClubs: number[] = [];

      for (const league of leagues) {
        const clubs = getClubsByLeague(dbHandle, league.id);
        const sorted = [...clubs].sort((a, b) => b.reputation - a.reputation);
        clubsByLeague[league.id] = clubs.map((c) => c.id);
        // Top 2 clubs per league go to Champions League (up to 8 total)
        if (championsLeagueClubs.length < 8) {
          for (const club of sorted.slice(0, 2)) {
            if (championsLeagueClubs.length < 8) {
              championsLeagueClubs.push(club.id);
            }
          }
        }
      }

      // Ensure we have at least 8 for Champions League
      if (championsLeagueClubs.length < 8) {
        const allIds = Object.values(clubsByLeague).flat();
        for (const id of allIds) {
          if (!championsLeagueClubs.includes(id) && championsLeagueClubs.length < 8) {
            championsLeagueClubs.push(id);
          }
        }
      }

      const calendar = generateSeasonCalendar({
        season: newSeason,
        leagues,
        clubsByLeague,
        championsLeagueClubs,
      });

      // Persist competitions
      for (const comp of calendar.competitions) {
        try {
          createCompetition(dbHandle, {
            id: comp.id + newSeason * 10000,
            name: comp.name,
            type: comp.type,
            format: comp.format,
            season: newSeason,
            leagueId: comp.leagueId,
          });
        } catch {
          // May already exist
        }
      }

      // Persist entries
      for (const entry of calendar.entries) {
        const compId = entry.competitionId + newSeason * 10000;
        try {
          addCompetitionEntry(dbHandle, {
            competitionId: compId,
            clubId: entry.clubId,
            groupName: entry.groupName,
            seed: entry.seed,
          });
        } catch {
          // May already exist
        }
      }

      // Persist fixtures
      for (const fixture of calendar.fixtures) {
        const compId = fixture.competitionId + newSeason * 10000;
        const fixtureId = fixture.id + newSeason * 100000;
        try {
          createFixture(dbHandle, {
            id: fixtureId,
            competitionId: compId,
            season: newSeason,
            week: fixture.week,
            round: typeof fixture.round === 'number' ? String(fixture.round) : fixture.round,
            homeClubId: fixture.homeClubId,
            awayClubId: fixture.awayClubId,
          });
        } catch {
          // May already exist
        }
      }

      // Reset to new season
      setNewSeason(false);
      updateWeek(newSeason, 1);
    } catch (err) {
      // Still proceed even if calendar generation failed
      setNewSeason(false);
      updateWeek(season + 1, 1);
    } finally {
      setStarting(false);
      navigation.navigate('Game');
    }
  }

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Compiling season report...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Title */}
      <View style={styles.titleCard}>
        <Text style={styles.trophy}>SEASON COMPLETE</Text>
        <Text style={styles.titleText}>Season {season}</Text>
        <Text style={styles.clubName}>{playerClub?.name ?? 'Your Club'}</Text>
      </View>

      {/* League Position */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>FINAL LEAGUE POSITION</Text>
          {stats.leaguePosition !== null ? (
            <View style={styles.positionRow}>
              <Text style={[styles.positionNumber, getPositionStyle(stats.leaguePosition)]}>
                {stats.leaguePosition}
              </Text>
              <Text style={styles.positionOf}>of {stats.totalTeams}</Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>Position not available</Text>
          )}
        </View>
      )}

      {/* Season Stats */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>SEASON STATS</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.played}</Text>
              <Text style={styles.statLabel}>Played</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.success }]}>{stats.wins}</Text>
              <Text style={styles.statLabel}>Wins</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.warning }]}>{stats.draws}</Text>
              <Text style={styles.statLabel}>Draws</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.danger }]}>{stats.losses}</Text>
              <Text style={styles.statLabel}>Losses</Text>
            </View>
          </View>
          <View style={styles.goalRow}>
            <Text style={styles.goalText}>Goals: {stats.goalsFor} scored / {stats.goalsAgainst} conceded</Text>
          </View>
        </View>
      )}

      {/* Financial Summary */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>FINANCIAL SUMMARY</Text>
          <View style={styles.financeRow}>
            <View style={styles.financeItem}>
              <Text style={styles.financeLabel}>Total Income</Text>
              <Text style={[styles.financeValue, { color: colors.success }]}>
                {formatCurrency(stats.income)}
              </Text>
            </View>
            <View style={styles.financeItem}>
              <Text style={styles.financeLabel}>Total Expenses</Text>
              <Text style={[styles.financeValue, { color: colors.danger }]}>
                {formatCurrency(stats.expenses)}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Net Balance</Text>
            <Text
              style={[
                styles.balanceValue,
                { color: stats.income - stats.expenses >= 0 ? colors.success : colors.danger },
              ]}
            >
              {formatCurrency(stats.income - stats.expenses)}
            </Text>
          </View>
        </View>
      )}

      {/* Continue Button */}
      <TouchableOpacity
        style={[styles.continueButton, starting && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={starting}
        activeOpacity={0.8}
      >
        {starting ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.continueButtonText}>CONTINUE TO SEASON {season + 1}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}$${abs}`;
}

function getPositionStyle(position: number): { color: string } {
  if (position === 1) return { color: colors.gold };
  if (position <= 3) return { color: colors.silver };
  if (position <= 6) return { color: colors.success };
  return { color: colors.text };
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl * 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.md,
  },
  titleCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.xl,
    margin: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  trophy: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  titleText: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  clubName: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
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
    marginBottom: spacing.sm,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  positionNumber: {
    fontSize: 64,
    fontWeight: 'bold',
    lineHeight: 72,
  },
  positionOf: {
    color: colors.textSecondary,
    fontSize: fontSize.xl,
    marginLeft: spacing.sm,
  },
  noDataText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  goalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  goalText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  financeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  financeItem: {
    flex: 1,
    alignItems: 'center',
  },
  financeLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  financeValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  balanceValue: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 18,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
