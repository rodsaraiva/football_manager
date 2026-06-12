import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, alpha, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import MatchEventItem from '@/components/MatchEventItem';
import { RootStackParamList } from '@/navigation/types';
import { PlayerRating } from '@/engine/simulation/player-rating';
import { MatchEvent } from '@/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface StatRowProps {
  label: string;
  home: number;
  away: number;
}

function StatRow({ label, home, away }: StatRowProps) {
  const total = home + away || 1;
  const homePercent = (home / total) * 100;
  const awayPercent = (away / total) * 100;

  return (
    <View style={statStyles.container}>
      <Text style={statStyles.value}>{home}</Text>
      <View style={statStyles.barsWrapper}>
        <Text style={statStyles.label}>{label}</Text>
        <View style={statStyles.bars}>
          <View style={statStyles.homeBar}>
            <View
              style={[
                statStyles.homeBarFill,
                { width: `${homePercent}%` as `${number}%` },
              ]}
            />
          </View>
          <View style={statStyles.awayBar}>
            <View
              style={[
                statStyles.awayBarFill,
                { width: `${awayPercent}%` as `${number}%` },
              ]}
            />
          </View>
        </View>
      </View>
      <Text style={statStyles.value}>{away}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  barsWrapper: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  bars: {
    flexDirection: 'row',
    width: '100%',
    height: 6,
    gap: spacing.xxs,
  },
  homeBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  homeBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  awayBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  awayBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  value: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    width: 30,
    textAlign: 'center',
  },
});

function getRatingColor(rating: number): string {
  if (rating >= 8) return colors.success;
  if (rating >= 7) return alpha(colors.success, 0.67);
  if (rating >= 6) return colors.warning;
  return colors.danger;
}

export function MatchResultScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { lastMatchResult, playerClub, lastMatchIsHome, lastMatchOpponentName } = useGameStore();

  if (!lastMatchResult) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <Text style={styles.noDataText}>{t('matchresult.no_data')}</Text>
        <TouchableOpacity style={styles.continueButton} onPress={() => navigation.goBack()}>
          <Text style={styles.continueButtonText}>{t('matchresult.continue')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { homeGoals, awayGoals, events, homeRatings, awayRatings, stats } = lastMatchResult;
  // Determine home/away names from the stored match context. When the player
  // was the away team, their club goes on the right.
  const opponentName = lastMatchOpponentName ?? t('matchresult.opponent');
  const playerName = playerClub?.name ?? t('matchresult.home');
  const homeTeam = lastMatchIsHome === false ? opponentName : playerName;
  const awayTeam = lastMatchIsHome === false ? playerName : opponentName;

  const goalEvents = events.filter((e: MatchEvent) => e.type === 'goal' || e.type === 'penalty_scored' || e.type === 'free_kick_scored');
  const allRatings: PlayerRating[] = [...homeRatings, ...awayRatings].sort(
    (a, b) => b.rating - a.rating,
  );

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Score Header */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreRow}>
          <Text style={styles.teamName} numberOfLines={1}>{homeTeam}</Text>
          <View style={styles.scoreBox}>
            <Text style={styles.score}>{homeGoals} - {awayGoals}</Text>
          </View>
          <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={1}>{awayTeam}</Text>
        </View>
        <Text style={styles.attendanceText}>
          {t('matchresult.attendance', { count: lastMatchResult.attendance.toLocaleString() })}
        </Text>
      </View>

      {/* Match Events */}
      {goalEvents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('matchresult.goals')}</Text>
          {goalEvents.map((event: MatchEvent, idx: number) => (
            <MatchEventItem
              key={idx}
              minute={event.minute}
              type={event.type}
              playerName={`Player #${event.playerId}`}
              secondaryPlayerName={
                event.secondaryPlayerId ? `Player #${event.secondaryPlayerId}` : undefined
              }
            />
          ))}
        </View>
      )}

      {/* All Events */}
      {events.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('matchresult.events')}</Text>
          {events.map((event: MatchEvent, idx: number) => (
            <MatchEventItem
              key={idx}
              minute={event.minute}
              type={event.type}
              playerName={`Player #${event.playerId}`}
              secondaryPlayerName={
                event.secondaryPlayerId ? `Player #${event.secondaryPlayerId}` : undefined
              }
            />
          ))}
        </View>
      )}

      {/* Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('matchresult.stats')}</Text>
        <View style={styles.statsCard}>
          <StatRow label={t('matchresult.possession')} home={stats.homePossession} away={stats.awayPossession} />
          <View style={styles.divider} />
          <StatRow label={t('matchresult.shots')} home={stats.homeShots} away={stats.awayShots} />
          <View style={styles.divider} />
          <StatRow label={t('matchresult.fouls')} home={stats.homeFouls} away={stats.awayFouls} />
          <View style={styles.divider} />
          <StatRow label={t('matchresult.corners')} home={stats.homeCorners} away={stats.awayCorners} />
        </View>
      </View>

      {/* Player Ratings */}
      {allRatings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('matchresult.player_ratings')}</Text>
          <View style={styles.ratingsCard}>
            {allRatings.map((pr: PlayerRating, idx: number) => (
              <View key={idx} style={styles.ratingRow}>
                <Text style={styles.ratingPlayerName}>Player #{pr.playerId}</Text>
                <Text style={[styles.ratingValue, { color: getRatingColor(pr.rating) }]}>
                  {pr.rating.toFixed(1)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Continue Button */}
      <TouchableOpacity
        style={styles.continueButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Text style={styles.continueButtonText}>{t('matchresult.continue')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
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
  noDataText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    marginBottom: spacing.lg,
  },
  scoreCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.sm,
  },
  teamName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
  },
  teamNameRight: {
    textAlign: 'right',
  },
  scoreBox: {
    paddingHorizontal: spacing.md,
  },
  score: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  attendanceText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  section: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  ratingsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ratingPlayerName: {
    color: colors.text,
    fontSize: fontSize.sm,
  },
  ratingValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  continueButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
});
