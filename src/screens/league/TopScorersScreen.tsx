import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useTranslation } from '@/i18n';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { buildTopScorers, TopScorerRow } from './top-scorers';

export function TopScorersScreen() {
  const { playerClub, season, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
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
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.empty}>{t('topscorers.empty')}</Text>
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
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.goals}>{item.goals} {t('topscorers.goals')}</Text>
            <Text style={styles.assists}>{item.assists} {t('topscorers.assists')}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
  list: { padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  rank: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: 'bold', width: 28 },
  name: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', flex: 1 },
  goals: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700', marginRight: spacing.sm },
  assists: { color: colors.textSecondary, fontSize: fontSize.xs },
});
