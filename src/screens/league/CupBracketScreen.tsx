import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, EmptyState } from '@/components/kit';
import { Body, Label, Caption, Stat } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useTranslation } from '@/i18n';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { buildCupBracket, CupRound } from './cup-bracket';

export function CupBracketScreen() {
  const { season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const accent = useClubAccent();
  const [rounds, setRounds] = useState<CupRound[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saveId = currentSave?.id;
    if (!dbHandle || saveId == null) {
      setLoading(false);
      return;
    }
    (async () => {
      const competitions = await getCompetitionsBySeason(dbHandle, saveId, season);
      const cup = competitions.find((c) => c.type === 'cup');
      if (cup) {
        setRounds(await buildCupBracket(dbHandle, saveId, season, week, cup.id));
      }
      setLoading(false);
    })();
  }, [dbHandle, season, week, currentSave]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  if (rounds.length === 0) {
    return (
      <View style={commonStyles.screen}>
        <EmptyState art="generic" title={t('cupbracket.empty')} />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.content}>
      {rounds.map((r) => (
        <View key={r.round} style={styles.roundBlock}>
          <Label style={styles.roundTitle}>{t('cupbracket.round', { n: r.round })}</Label>
          {r.ties.map((tie, i) => (
            <Card key={i} variant="detail" accent={accent.accent} style={styles.tie}>
              <Body numberOfLines={1} style={styles.team}>{tie.homeName}</Body>
              <Stat color={accent.accent} style={styles.score}>
                {tie.homeGoals != null && tie.awayGoals != null
                  ? `${tie.homeGoals} - ${tie.awayGoals}`
                  : 'vs'}
              </Stat>
              <Body numberOfLines={1} style={[styles.team, styles.teamRight]}>{tie.awayName}</Body>
            </Card>
          ))}
        </View>
      ))}
      <Caption style={styles.pending}>{t('cupbracket.draw_pending')}</Caption>
    </ScrollView>
  );
}

const styles = {
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.lg },
  content: { padding: spacing.md },
  roundBlock: { marginBottom: spacing.lg },
  roundTitle: { marginBottom: spacing.sm },
  tie: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  team: { flex: 1 },
  teamRight: { textAlign: 'right' as const },
  score: {},
  pending: { textAlign: 'center' as const, fontStyle: 'italic' as const, marginTop: spacing.md },
};
