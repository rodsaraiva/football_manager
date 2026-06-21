import React, { useEffect, useState } from 'react';
import { View, FlatList, ActivityIndicator } from 'react-native';
import { spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, EmptyState } from '@/components/kit';
import { Body, Label, Stat } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useTranslation } from '@/i18n';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { buildTopScorers, TopScorerRow } from './top-scorers';

export function TopScorersScreen() {
  const { playerClub, season, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const accent = useClubAccent();
  const [rows, setRows] = useState<TopScorerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saveId = currentSave?.id;
    if (!dbHandle || !playerClub || saveId == null) {
      setLoading(false);
      return;
    }
    (async () => {
      const competitions = await getCompetitionsBySeason(dbHandle, saveId, season);
      const leagueComp = competitions.find(
        (c) => c.leagueId === playerClub.leagueId && c.type === 'league',
      );
      if (leagueComp) {
        setRows(await buildTopScorers(dbHandle, saveId, season, leagueComp.id));
      }
      setLoading(false);
    })();
  }, [dbHandle, playerClub, season, currentSave]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={commonStyles.screen}>
        <EmptyState art="search" title={t('topscorers.empty')} />
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.playerId)}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <Card variant="detail" accent={accent.accent} style={styles.row}>
            <Stat style={styles.rank}>{index + 1}</Stat>
            <Body numberOfLines={1} style={styles.name}>{item.name}</Body>
            <Stat color={accent.accent} style={styles.goals}>{item.goals}</Stat>
            <Label style={styles.goalsLabel}>{t('topscorers.goals')}</Label>
            <Label style={styles.assists}>{item.assists} {t('topscorers.assists')}</Label>
          </Card>
        )}
      />
    </View>
  );
}

const styles = {
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.lg },
  list: { padding: spacing.md },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  rank: { width: spacing.xl },
  name: { flex: 1 },
  goals: {},
  goalsLabel: {},
  assists: {},
};
