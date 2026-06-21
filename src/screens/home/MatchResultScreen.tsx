import React from 'react';
import { View, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, alpha, spacing, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, Button } from '@/components/kit';
import { Display, Title, Body, Label, Caption, Stat } from '@/components/typography';
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
      <Stat style={statStyles.value}>{home}</Stat>
      <View style={statStyles.barsWrapper}>
        <Label style={statStyles.label}>{label}</Label>
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
      <Stat style={statStyles.value}>{away}</Stat>
    </View>
  );
}

const statStyles = {
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginVertical: spacing.xs,
  },
  barsWrapper: {
    flex: 1,
    alignItems: 'center' as const,
    marginHorizontal: spacing.sm,
  },
  label: {
    marginBottom: spacing.xxs,
  },
  bars: {
    flexDirection: 'row' as const,
    width: '100%' as const,
    height: spacing.xs,
    gap: spacing.xxs,
  },
  homeBar: {
    flex: 1,
    height: spacing.xs,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden' as const,
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
  },
  homeBarFill: {
    height: '100%' as const,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
  },
  awayBar: {
    flex: 1,
    height: spacing.xs,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden' as const,
  },
  awayBarFill: {
    height: '100%' as const,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
  },
  value: {
    width: spacing.xl,
    textAlign: 'center' as const,
  },
};

function getRatingColor(rating: number): string {
  if (rating >= 8) return colors.success;
  if (rating >= 7) return alpha(colors.success, 0.67);
  if (rating >= 6) return colors.warning;
  return colors.danger;
}

export function MatchResultScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const navigation = useNavigation<NavProp>();
  const { lastMatchResult, playerClub, lastMatchIsHome, lastMatchOpponentName, pressPending } = useGameStore();

  // After acknowledging the result, route into the press conference when the gate is
  // armed (set by advanceGameWeek when a user match was played). Covers the halftime-
  // resume path, which navigates here. The gate is cleared on the press screen, so
  // there is no double-navigation with HomeScreen's effect.
  const continuePress = () => {
    if (pressPending) {
      navigation.navigate('PressConference');
    } else {
      navigation.goBack();
    }
  };

  if (!lastMatchResult) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <Body style={styles.noData}>{t('matchresult.no_data')}</Body>
        <View style={styles.continueWrap}>
          <Button
            label={t('matchresult.continue')}
            variant="primary"
            onPress={continuePress}
            testID="matchresult-continue"
            accessibilityLabel={t('matchresult.continue')}
          />
        </View>
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
      <Card variant="hero" accent={accent.accent} style={styles.scoreCard}>
        <View style={styles.scoreRow}>
          <Body numberOfLines={1} style={styles.teamName}>{homeTeam}</Body>
          <View style={styles.scoreBox}>
            <Display>{homeGoals} - {awayGoals}</Display>
          </View>
          <Body numberOfLines={1} style={[styles.teamName, styles.teamNameRight]}>{awayTeam}</Body>
        </View>
        <Caption>
          {t('matchresult.attendance', { count: lastMatchResult.attendance.toLocaleString() })}
        </Caption>
      </Card>

      {/* Match Events */}
      {goalEvents.length > 0 && (
        <View style={styles.section}>
          <Title style={styles.sectionTitle}>{t('matchresult.goals')}</Title>
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
          <Title style={styles.sectionTitle}>{t('matchresult.events')}</Title>
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
        <Title style={styles.sectionTitle}>{t('matchresult.stats')}</Title>
        <Card variant="summary" accent={accent.accent}>
          <StatRow label={t('matchresult.possession')} home={stats.homePossession} away={stats.awayPossession} />
          <View style={styles.divider} />
          <StatRow label={t('matchresult.shots')} home={stats.homeShots} away={stats.awayShots} />
          <View style={styles.divider} />
          <StatRow label={t('matchresult.fouls')} home={stats.homeFouls} away={stats.awayFouls} />
          <View style={styles.divider} />
          <StatRow label={t('matchresult.corners')} home={stats.homeCorners} away={stats.awayCorners} />
        </Card>
      </View>

      {/* Player Ratings */}
      {allRatings.length > 0 && (
        <View style={styles.section}>
          <Title style={styles.sectionTitle}>{t('matchresult.player_ratings')}</Title>
          <Card variant="summary" accent={accent.accent}>
            {allRatings.map((pr: PlayerRating, idx: number) => (
              <View key={idx} style={styles.ratingRow}>
                <Body>Player #{pr.playerId}</Body>
                <Stat color={getRatingColor(pr.rating)}>{pr.rating.toFixed(1)}</Stat>
              </View>
            ))}
          </Card>
        </View>
      )}

      {/* Continue Button */}
      <View style={styles.continueWrap}>
        <Button
          label={t('matchresult.continue')}
          variant="primary"
          onPress={continuePress}
          testID="matchresult-continue"
          accessibilityLabel={t('matchresult.continue')}
        />
      </View>
    </ScrollView>
  );
}

const styles = {
  container: {
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  noData: {
    marginBottom: spacing.lg,
  },
  scoreCard: {
    margin: spacing.md,
    alignItems: 'center' as const,
  },
  scoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    width: '100%' as const,
    marginBottom: spacing.sm,
  },
  teamName: {
    flex: 1,
    textAlign: 'left' as const,
  },
  teamNameRight: {
    textAlign: 'right' as const,
  },
  scoreBox: {
    paddingHorizontal: spacing.md,
  },
  section: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  continueWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
};
