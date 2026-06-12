import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useTranslation } from '@/i18n';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { buildCupBracket, CupRound } from './cup-bracket';

export function CupBracketScreen() {
  const { season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
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
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (rounds.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.empty}>{t('cupbracket.empty')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.content}>
      {rounds.map((r) => (
        <View key={r.round} style={styles.roundBlock}>
          <Text style={styles.roundTitle}>{t('cupbracket.round', { n: r.round })}</Text>
          {r.ties.map((tie, i) => (
            <View key={i} style={styles.tie}>
              <Text style={styles.team}>{tie.homeName}</Text>
              <Text style={styles.score}>
                {tie.homeGoals != null && tie.awayGoals != null
                  ? `${tie.homeGoals} - ${tie.awayGoals}`
                  : 'vs'}
              </Text>
              <Text style={[styles.team, styles.teamRight]}>{tie.awayName}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.pending}>{t('cupbracket.draw_pending')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
  content: { padding: spacing.md },
  roundBlock: { marginBottom: spacing.lg },
  roundTitle: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
  tie: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  team: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600', flex: 1 },
  teamRight: { textAlign: 'right' },
  score: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700', marginHorizontal: spacing.sm },
  pending: { color: colors.textMuted, fontSize: fontSize.xs, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.md },
});
