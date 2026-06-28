import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getRivalries, getHeadToHead, getClubNameMap } from '@/database/queries/legacy';
import { Rivalry } from '@/types/legacy';
import { HeadToHead } from '@/engine/legacy/rivalry-engine';
import { Card, Chip, EmptyState } from '@/components/kit';
import StatBar from '@/components/StatBar';
import { Title, Body, Label, Caption } from '@/components/typography';

interface RivalRow { rivalry: Rivalry; opponentId: number; h2h: HeadToHead; }

export function RivalriesScreen() {
  const { t } = useTranslation();
  const { accent } = useClubAccent();
  const { currentSave, playerClubId } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;

  const [rows, setRows] = useState<RivalRow[]>([]);
  const [clubNames, setClubNames] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle || saveId == null || playerClubId == null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const rivalries = await getRivalries(dbHandle, saveId, playerClubId);
      const names = await getClubNameMap(dbHandle, saveId);
      const built: RivalRow[] = [];
      for (const r of rivalries) {
        const opponentId = r.clubAId === playerClubId ? r.clubBId : r.clubAId;
        const h2h = await getHeadToHead(dbHandle, saveId, playerClubId, opponentId);
        built.push({ rivalry: r, opponentId, h2h });
      }
      if (!cancelled) { setRows(built); setClubNames(names); setLoading(false); }
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

  if (rows.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState art="generic" title={t('legacy.empty')} />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {rows.map(({ rivalry, opponentId, h2h }) => (
        <Card key={opponentId} variant="detail" style={styles.card} testID={`rivalry-${opponentId}`}>
          <View style={styles.header}>
            <Title>{clubNames.get(opponentId) ?? `#${opponentId}`}</Title>
            <Chip label={t(`rivalry.origin_${rivalry.origin}` as TKey)} accent={accent} selected onPress={() => {}} />
          </View>
          <Label>{t('rivalry.intensity')}</Label>
          <StatBar value={rivalry.intensity} maxValue={100} color={accent} />
          <View style={styles.h2hRow}>
            <Caption color={colors.textSecondary}>{`${t('rivalry.meetings')}: ${h2h.meetings}`}</Caption>
            <Caption color={colors.gold}>{`${t('rivalry.head_to_head')}: ${h2h.titleDeciders}`}</Caption>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { marginHorizontal: spacing.md, marginTop: spacing.sm, gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2hRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.xxs },
});
