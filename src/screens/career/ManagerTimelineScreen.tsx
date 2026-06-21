import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getManagerCareer, getClubNameMap } from '@/database/queries/legacy';
import { ManagerCareerEntry } from '@/types/legacy';
import { classifySeasonSaga } from '@/engine/legacy/saga-engine';
import { Card, Badge, EmptyState } from '@/components/kit';
import type { BadgeTone } from '@/components/kit';
import { Title, Body, Label, Caption } from '@/components/typography';

const EXIT_TONE: Record<ManagerCareerEntry['exitReason'], BadgeTone> = {
  stayed: 'success', fired: 'danger', resigned: 'warning',
};

export function ManagerTimelineScreen() {
  const { t } = useTranslation();
  const { currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;

  const [career, setCareer] = useState<ManagerCareerEntry[]>([]);
  const [clubNames, setClubNames] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle || saveId == null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const data = await getManagerCareer(dbHandle, saveId);
      const names = await getClubNameMap(dbHandle, saveId);
      if (!cancelled) { setCareer(data); setClubNames(names); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [dbHandle, saveId]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (career.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState art="generic" title={t('legacy.empty')} />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {career.map((e) => {
        const saga = classifySeasonSaga({
          season: e.season, leaguePosition: e.leaguePosition, totalTeams: e.totalTeams,
          expectedPosition: null, wonLeague: e.leaguePosition === 1, wonCup: false,
          wasPromoted: false, wasRelegated: false, trophies: e.trophies,
        });
        const clubName = clubNames.get(e.clubId) ?? t('manager_career.no_club');
        const position = e.leaguePosition != null
          ? `${e.leaguePosition}/${e.totalTeams}`
          : t('manager_career.in_progress');
        return (
          <Card key={e.season} variant="detail" style={styles.card} testID={`career-${e.season}`}>
            <View style={styles.header}>
              <Title>{t('standings.season', { season: e.season })}</Title>
              <Badge tone={EXIT_TONE[e.exitReason]} value={t(`manager_career.exit_${e.exitReason}` as TKey)} />
            </View>
            <Body color={colors.textSecondary}>{clubName}</Body>
            <View style={styles.metaRow}>
              <Caption color={colors.textSecondary}>{`${t('manager_career.position')}: ${position}`}</Caption>
              <Caption color={colors.gold}>{`${t('legacy.trophies')}: ${e.trophies}`}</Caption>
            </View>
            <View style={styles.saga}>
              <Label>{t(saga.titleKey as TKey, saga.vars)}</Label>
              <Body color={colors.text}>{t(saga.bodyKey as TKey, saga.vars)}</Body>
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
  card: { marginHorizontal: spacing.md, marginTop: spacing.sm, gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  saga: { gap: spacing.xxs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
});
