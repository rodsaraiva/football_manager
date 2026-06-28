import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubRecords, getPlayerNameMap } from '@/database/queries/legacy';
import { ClubRecord } from '@/types/legacy';
import { Card, EmptyState } from '@/components/kit';
import { Title, Body, Caption } from '@/components/typography';

export function RecordsScreen() {
  const { t } = useTranslation();
  const { currentSave, playerClubId } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;

  const [records, setRecords] = useState<ClubRecord[]>([]);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle || saveId == null || playerClubId == null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const data = await getClubRecords(dbHandle, saveId, playerClubId);
      const holderIds = data.map((r) => r.holderId).filter((id): id is number => id != null);
      const nameMap = await getPlayerNameMap(dbHandle, saveId, holderIds);
      if (!cancelled) { setRecords(data); setNames(nameMap); setLoading(false); }
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

  if (records.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState art="generic" title={t('legacy.empty')} />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {records.map((r) => {
        const holder = r.holderId != null ? names.get(r.holderId) ?? `#${r.holderId}` : null;
        const detail = r.detail || holder || (r.season != null ? t('standings.season', { season: r.season }) : '');
        return (
          <Card key={r.type} variant="detail" style={styles.card} testID={`record-${r.type}`}>
            <Caption color={colors.textSecondary}>{t(`records.${r.type}` as TKey)}</Caption>
            <View style={styles.valueRow}>
              <Title color={colors.gold}>{r.value}</Title>
              {detail ? <Body color={colors.text}>{detail}</Body> : null}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { marginHorizontal: spacing.md, marginTop: spacing.sm, gap: spacing.xxs },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
});
