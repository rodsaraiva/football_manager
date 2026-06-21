import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubLegends, getPlayerNameMap } from '@/database/queries/legacy';
import { Legend } from '@/types/legacy';
import { Card, EmptyState } from '@/components/kit';
import StatBar from '@/components/StatBar';
import { Title, Body, Label, Caption } from '@/components/typography';

export function HallOfFameScreen() {
  const { t } = useTranslation();
  const { accent } = useClubAccent();
  const { currentSave, playerClubId } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;

  const [legends, setLegends] = useState<Legend[]>([]);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle || saveId == null || playerClubId == null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const data = await getClubLegends(dbHandle, saveId, playerClubId);
      const nameMap = await getPlayerNameMap(dbHandle, saveId, data.map((l) => l.playerId));
      if (!cancelled) { setLegends(data); setNames(nameMap); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [dbHandle, saveId, playerClubId]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (legends.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState art="generic" title={t('legacy.empty')} />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {legends.map((l, idx) => (
        <Card key={l.playerId} variant="detail" style={styles.card} testID={`legend-${l.playerId}`}>
          <View style={styles.header}>
            <Title>{`${idx + 1}. ${names.get(l.playerId) ?? `#${l.playerId}`}`}</Title>
            <Caption color={colors.gold}>{`${l.firstSeason}–${l.lastSeason}`}</Caption>
          </View>
          <Label>{t('legacy.legend_score')}</Label>
          <StatBar value={l.legendScore} maxValue={100} color={accent} />
          <View style={styles.statsRow}>
            <Stat label={t('legacy.appearances')} value={l.appearances} />
            <Stat label={t('legacy.goals')} value={l.goals} />
            <Stat label={t('legacy.trophies')} value={l.trophies} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Body color={colors.text}>{value}</Body>
      <Caption color={colors.textSecondary}>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { marginHorizontal: spacing.md, marginTop: spacing.sm, gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: spacing.xs },
  stat: { alignItems: 'center', gap: spacing.xxs },
});
