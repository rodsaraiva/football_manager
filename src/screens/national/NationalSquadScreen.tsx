import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByNationalities } from '@/database/queries/players';
import { getUserManagedNation, NationalTeam } from '@/database/queries/national-teams';
import {
  getCallUps,
  setManualCallUp,
  clearWindowCallUps,
} from '@/database/queries/national-callups';
import { DEMONYM_TO_COUNTRY } from '@/engine/national/nationality';
import { INTERNATIONAL_CALLUP_MIN_OVERALL } from '@/engine/national/international-duty';
import {
  activeNationalWindow,
  buildNationalSquadView,
  NationalPoolPlayer,
  NationalSquadView,
} from '@/engine/national/national-views';
import { calculateOverall } from '@/utils/overall';
import { Card, Chip, Badge, Button, EmptyState, useConfirm } from '@/components/kit';
import { Headline, Body, Label, Caption, Stat } from '@/components/typography';

function demonymsForCountry(countryName: string): string[] {
  return Object.entries(DEMONYM_TO_COUNTRY)
    .filter(([, name]) => name === countryName)
    .map(([demonym]) => demonym);
}

const EMPTY_VIEW: NationalSquadView = { rows: [], xi: [], calledCount: 0 };

export function NationalSquadScreen() {
  const { season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const confirm = useConfirm();
  const saveId = currentSave?.id;
  const windowWeek = activeNationalWindow(week);

  const [nation, setNation] = useState<NationalTeam | null>(null);
  const [view, setView] = useState<NationalSquadView>(EMPTY_VIEW);

  const load = useCallback(async () => {
    if (!dbHandle || saveId == null) return;
    const managed = await getUserManagedNation(dbHandle, saveId);
    setNation(managed);
    if (!managed) {
      setView(EMPTY_VIEW);
      return;
    }
    const players = await getPlayersWithAttributesByNationalities(
      dbHandle,
      saveId,
      demonymsForCountry(managed.name),
    );
    const pool: NationalPoolPlayer[] = players
      .map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        overall: calculateOverall(p.attributes, p.position),
      }))
      .filter((p) => p.overall >= INTERNATIONAL_CALLUP_MIN_OVERALL);
    const callUps = await getCallUps(dbHandle, saveId, managed.id, season, windowWeek);
    setView(buildNationalSquadView(pool, callUps));
  }, [dbHandle, saveId, season, windowWeek]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  const handleCallUp = useCallback(
    async (playerId: number, name: string) => {
      if (!dbHandle || saveId == null || !nation) return;
      const ok = await confirm({
        title: t('national.call_up'),
        message: t('national.call_up_confirm', { name }),
        confirmLabel: t('national.call_up'),
      });
      if (!ok) return;
      await setManualCallUp(dbHandle, saveId, nation.id, season, windowWeek, playerId, true);
      await load();
    },
    [dbHandle, saveId, nation, season, windowWeek, confirm, t, load],
  );

  const handleClear = useCallback(async () => {
    if (!dbHandle || saveId == null || !nation) return;
    const ok = await confirm({
      title: t('national.clear_window'),
      message: t('national.clear_window_confirm'),
      confirmLabel: t('national.clear_window'),
      tone: 'danger',
    });
    if (!ok) return;
    await clearWindowCallUps(dbHandle, saveId, nation.id, season, windowWeek);
    await load();
  }, [dbHandle, saveId, nation, season, windowWeek, confirm, t, load]);

  if (!nation) {
    return (
      <View style={commonStyles.screen}>
        <View style={styles.emptyWrap}>
          <EmptyState art="squad" title={t('national.no_nation')} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Headline>{t('national.squad_title')}</Headline>
        <Body color={colors.textSecondary}>
          {t('national.squad_subtitle', { nation: nation.name, week: windowWeek })}
        </Body>
        <Caption color={colors.textMuted}>{t('national.called_count', { count: view.calledCount })}</Caption>
      </View>

      {view.xi.length > 0 && (
        <Card variant="detail" accent={colors.primary} style={styles.xiCard}>
          <Label color={colors.textMuted}>{t('national.xi_preview')}</Label>
          {view.xi.map((p) => (
            <View key={p.id} style={styles.xiRow}>
              <Caption color={colors.primary} style={styles.pos}>{p.position}</Caption>
              <Body numberOfLines={1} style={styles.flex}>{p.name}</Body>
              <Stat color={colors.primaryLight} style={styles.ovr}>{p.overall}</Stat>
            </View>
          ))}
        </Card>
      )}

      {view.calledCount > 0 && (
        <View style={styles.clearWrap}>
          <Button
            label={t('national.clear_window')}
            variant="ghost"
            onPress={handleClear}
            accessibilityLabel={t('national.clear_window')}
            testID="national-clear-window"
          />
        </View>
      )}

      {view.rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState art="squad" title={t('national.squad_empty')} />
        </View>
      ) : (
        <Card variant="detail" style={styles.poolCard}>
          {view.rows.map((p) => (
            <View key={p.id} style={styles.poolRow}>
              <Caption color={colors.primary} style={styles.pos}>{p.position}</Caption>
              <View style={styles.flex}>
                <Body numberOfLines={1}>{p.name}</Body>
                <View style={styles.tags}>
                  {p.calledUp && (
                    <Badge
                      value={p.isStarter ? t('national.starter') : t('national.reserve')}
                      tone={p.isStarter ? 'success' : 'neutral'}
                      size="sm"
                    />
                  )}
                  {p.isManual && <Badge value={t('national.manual_tag')} tone="warning" size="sm" />}
                </View>
              </View>
              <Stat style={styles.ovr}>{p.overall}</Stat>
              {!p.calledUp && (
                <Chip
                  label={t('national.call_up')}
                  onPress={() => handleCallUp(p.id, p.name)}
                  accessibilityLabel={t('national.call_up')}
                  testID={`national-callup-${p.id}`}
                />
              )}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.xxs },
  xiCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: spacing.xs },
  xiRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clearWrap: { paddingHorizontal: spacing.md, marginBottom: spacing.sm, alignItems: 'flex-start' },
  poolCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: spacing.xs },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pos: { width: 36 },
  flex: { flex: 1, gap: spacing.xxs },
  tags: { flexDirection: 'row', gap: spacing.xs },
  ovr: { width: 32, textAlign: 'right' },
  emptyWrap: { marginHorizontal: spacing.md, marginTop: spacing.md },
});
