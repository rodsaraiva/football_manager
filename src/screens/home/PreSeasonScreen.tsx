import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, Button, EmptyState } from '@/components/kit';
import { Display, Title, Body, Label, Caption } from '@/components/typography';
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
  const accent = useClubAccent();
  const { playerClub, playerClubId, season, currentSave, setPreseasonPending: setStorePending } = useGameStore();
  const { dbHandle } = useDatabaseStore();

  const [opponents, setOpponents] = useState<FriendlyOpponentCandidate[]>([]);
  const [played, setPlayed] = useState<PlayedRow[]>([]);
  const [, setClubNames] = useState<Record<number, string>>({});
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
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <Card variant="hero" accent={accent.accent} style={styles.headerCard}>
        <Display>{t('preseason.title')}</Display>
        <Label color={accent.accent} style={styles.subtitle}>{t('preseason.subtitle', { max: PRESEASON_MAX_FRIENDLIES })}</Label>
        <Body style={styles.intro}>{t('preseason.intro')}</Body>
        <Label style={styles.counter}>{t('preseason.friendly_count', { count, max: PRESEASON_MAX_FRIENDLIES })}</Label>
      </Card>

      {/* Suggested opponents */}
      <View style={styles.sectionHeader}>
        <Title>{t('preseason.suggested_label')}</Title>
      </View>
      {opponents.length === 0 ? (
        <EmptyState art="squad" title={t('preseason.no_opponents')} />
      ) : (
        opponents.map((opp) => (
          <Card key={opp.id} variant="detail" accent={accent.accent} style={styles.opponentCard}>
            <View style={styles.opponentInfo}>
              <Body numberOfLines={1}>{opp.name}</Body>
              <Caption>{t('preseason.opponent_rep', { rep: opp.reputation })}</Caption>
            </View>
            <Button
              label={t('preseason.play_button')}
              variant="primary"
              loading={playingId === opp.id}
              disabled={atCap || playingId !== null}
              onPress={() => handlePlay(opp)}
              testID={`preseason-play-${opp.id}`}
              accessibilityLabel={t('preseason.play_button')}
            />
          </Card>
        ))
      )}

      {/* Played friendlies */}
      <View style={styles.sectionHeader}>
        <Title>{t('preseason.played_label')}</Title>
      </View>
      {played.length === 0 ? (
        <EmptyState art="generic" title={t('preseason.empty_played')} />
      ) : (
        played.map((f) => (
          <Card key={f.id} variant="detail" accent={accent.accent} style={styles.resultCard}>
            <Body numberOfLines={1} style={styles.resultText}>
              {t('preseason.result_score', {
                home: f.homeName,
                homeGoals: f.homeGoals ?? 0,
                awayGoals: f.awayGoals ?? 0,
                away: f.awayName,
              })}
            </Body>
          </Card>
        ))
      )}

      {/* Start season */}
      <View style={styles.startWrap}>
        <Button
          label={t('preseason.start_season')}
          variant="primary"
          onPress={handleStartSeason}
          testID="preseason-start"
          accessibilityLabel={t('preseason.start_season')}
        />
      </View>
    </ScrollView>
  );
}

const styles = {
  container: {
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerCard: {
    margin: spacing.md,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  intro: {
    marginTop: spacing.sm,
  },
  counter: {
    marginTop: spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  opponentCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  opponentInfo: {
    flex: 1,
  },
  resultCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  resultText: {
    textAlign: 'center' as const,
  },
  startWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
};
