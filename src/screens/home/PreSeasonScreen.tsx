import React, { useEffect, useState, useCallback } from 'react';
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
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { RootStackParamList } from '@/navigation/types';
import { SeededRng } from '@/engine/rng';
import { getAllClubs } from '@/database/queries/clubs';
import { setPreseasonPending } from '@/database/queries/save';
import {
  createFriendly,
  getFriendliesBySeason,
  countFriendliesBySeason,
} from '@/database/queries/friendlies';
import { playFriendly } from '@/engine/preseason/preseason-runner';
import {
  suggestFriendlyOpponents,
  FriendlyOpponentCandidate,
  PRESEASON_MAX_FRIENDLIES,
} from '@/engine/preseason/preseason-engine';
import { Friendly } from '@/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface PlayedRow extends Friendly {
  homeName: string;
  awayName: string;
}

export function PreSeasonScreen() {
  const navigation = useNavigation<NavProp>();
  const { t } = useTranslation();
  const { playerClub, playerClubId, season, currentSave, setPreseasonPending: setStorePending } = useGameStore();
  const { dbHandle } = useDatabaseStore();

  const [opponents, setOpponents] = useState<FriendlyOpponentCandidate[]>([]);
  const [played, setPlayed] = useState<PlayedRow[]>([]);
  const [clubNames, setClubNames] = useState<Record<number, string>>({});
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!dbHandle || !playerClubId || !playerClub || !currentSave) return;
    const saveId = currentSave.id;
    const allClubs = await getAllClubs(dbHandle, saveId);
    const names: Record<number, string> = {};
    for (const c of allClubs) names[c.id] = c.name;
    setClubNames(names);

    const candidates: FriendlyOpponentCandidate[] = allClubs.map((c) => ({
      id: c.id,
      name: c.name,
      reputation: c.reputation,
    }));
    const suggested = suggestFriendlyOpponents({
      playerClubId,
      playerReputation: playerClub.reputation,
      candidates,
      rng: new SeededRng(saveId * 31 + season),
    });
    setOpponents(suggested);

    const friendlies = await getFriendliesBySeason(dbHandle, saveId, season);
    setPlayed(
      friendlies
        .filter((f) => f.played)
        .map((f) => ({
          ...f,
          homeName: names[f.homeClubId] ?? `#${f.homeClubId}`,
          awayName: names[f.awayClubId] ?? `#${f.awayClubId}`,
        })),
    );
    setCount(await countFriendliesBySeason(dbHandle, saveId, season));
  }, [dbHandle, playerClubId, playerClub, currentSave, season]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  const handlePlay = useCallback(
    async (opponent: FriendlyOpponentCandidate) => {
      if (!dbHandle || !playerClubId || !currentSave) return;
      if (count >= PRESEASON_MAX_FRIENDLIES || playingId !== null) return;
      setPlayingId(opponent.id);
      try {
        const saveId = currentSave.id;
        const friendlyId = await createFriendly(dbHandle, saveId, {
          season,
          homeClubId: playerClubId,
          awayClubId: opponent.id,
        });
        await playFriendly({
          dbHandle,
          saveId,
          season,
          friendlyId,
          playerClubId,
          rng: new SeededRng(saveId * 101 + friendlyId),
        });
        await reload();
      } catch (err) {
        console.error('[PreSeason] friendly failed:', err);
      } finally {
        setPlayingId(null);
      }
    },
    [dbHandle, playerClubId, currentSave, season, count, playingId, reload],
  );

  const handleStartSeason = useCallback(async () => {
    if (!dbHandle || !currentSave) return;
    await setPreseasonPending(dbHandle, currentSave.id, false);
    setStorePending(false);
    navigation.navigate('Game');
  }, [dbHandle, currentSave, setStorePending, navigation]);

  const atCap = count >= PRESEASON_MAX_FRIENDLIES;

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>{t('preseason.title')}</Text>
        <Text style={styles.subtitle}>{t('preseason.subtitle', { max: PRESEASON_MAX_FRIENDLIES })}</Text>
        <Text style={styles.intro}>{t('preseason.intro')}</Text>
        <Text style={styles.counter}>{t('preseason.friendly_count', { count, max: PRESEASON_MAX_FRIENDLIES })}</Text>
      </View>

      {/* Suggested opponents */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('preseason.suggested_label')}</Text>
      </View>
      {opponents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('preseason.no_opponents')}</Text>
        </View>
      ) : (
        opponents.map((opp) => (
          <View key={opp.id} style={styles.opponentCard}>
            <View style={styles.opponentInfo}>
              <Text style={styles.opponentName} numberOfLines={1}>{opp.name}</Text>
              <Text style={styles.opponentRep}>{t('preseason.opponent_rep', { rep: opp.reputation })}</Text>
            </View>
            <TouchableOpacity
              style={[styles.playButton, (atCap || playingId !== null) && styles.playButtonDisabled]}
              onPress={() => handlePlay(opp)}
              disabled={atCap || playingId !== null}
              activeOpacity={0.8}
            >
              {playingId === opp.id ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.playButtonText}>{t('preseason.play_button')}</Text>
              )}
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Played friendlies */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('preseason.played_label')}</Text>
      </View>
      {played.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('preseason.empty_played')}</Text>
        </View>
      ) : (
        played.map((f) => (
          <View key={f.id} style={styles.resultCard}>
            <Text style={styles.resultText} numberOfLines={1}>
              {t('preseason.result_score', {
                home: f.homeName,
                homeGoals: f.homeGoals ?? 0,
                awayGoals: f.awayGoals ?? 0,
                away: f.awayName,
              })}
            </Text>
          </View>
        ))
      )}

      {/* Start season */}
      <TouchableOpacity
        style={styles.startButton}
        onPress={handleStartSeason}
        activeOpacity={0.8}
      >
        <Text style={styles.startButtonText}>{t('preseason.start_season')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  subtitle: {
    color: colors.primary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  intro: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  counter: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  opponentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  opponentInfo: {
    flex: 1,
  },
  opponentName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  opponentRep: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  playButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minWidth: 96,
    alignItems: 'center',
  },
  playButtonDisabled: {
    opacity: 0.4,
  },
  playButtonText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 18,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  startButtonText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
