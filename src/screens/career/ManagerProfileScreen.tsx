import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getManagerReputation, getManagerSavings, getUnemployedSince } from '@/database/queries/save';
import { getActiveManagerContract, ManagerContractRow } from '@/database/queries/manager-contract';
import { getClubById } from '@/database/queries/clubs';
import { Card } from '@/components/kit';
import StatBar from '@/components/StatBar';
import { Headline, Title, Body, Caption } from '@/components/typography';

export function ManagerProfileScreen() {
  const { t } = useTranslation();
  const { accent } = useClubAccent();
  const { currentSave, playerClub, season } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;

  const [loading, setLoading] = useState(true);
  const [reputation, setReputation] = useState(0);
  const [savings, setSavings] = useState(0);
  const [seasonsIdle, setSeasonsIdle] = useState<number | null>(null);
  const [contract, setContract] = useState<ManagerContractRow | null>(null);
  const [contractClubName, setContractClubName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dbHandle || saveId == null) return;
    setLoading(true);
    setReputation(await getManagerReputation(dbHandle, saveId));
    setSavings(await getManagerSavings(dbHandle, saveId));
    const since = await getUnemployedSince(dbHandle, saveId);
    setSeasonsIdle(since == null ? null : Math.max(0, season - since));
    const c = await getActiveManagerContract(dbHandle, saveId);
    setContract(c);
    if (c) {
      const club = await getClubById(dbHandle, saveId, c.clubId);
      setContractClubName(club?.name ?? null);
    } else {
      setContractClubName(null);
    }
    setLoading(false);
  }, [dbHandle, saveId, season]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Headline>{t('managerprofile.title')}</Headline>
      </View>

      <Card variant="detail" accent={accent} style={styles.card} testID="manager-profile-stats">
        <Title>{t('managerprofile.reputation')}</Title>
        <StatBar
          value={reputation}
          maxValue={100}
          color={accent}
          valueText={String(reputation)}
        />
        <View style={styles.row}>
          <Body color={colors.textSecondary}>{t('managerprofile.savings')}</Body>
          <Body>{savings}</Body>
        </View>
        {seasonsIdle != null && (
          <Caption color={colors.textSecondary}>
            {t('unemployed.seasons_idle', { seasons: seasonsIdle })}
          </Caption>
        )}
      </Card>

      <Card variant="detail" style={styles.card} testID="manager-profile-contract">
        <Title>{t('managerprofile.current_contract')}</Title>
        {contract ? (
          <>
            <Caption color={accent}>{contractClubName ?? `#${contract.clubId}`}</Caption>
            <Caption color={colors.textSecondary}>
              {t('joboffers.contract_duration', { seasons: contract.endSeason - contract.startSeason })}
            </Caption>
            <Caption color={colors.textSecondary}>
              {t('joboffers.contract_wage', { wage: contract.wagePerSeason })}
            </Caption>
            <Caption color={colors.textSecondary}>
              {t('joboffers.contract_clause', { clause: contract.releaseClause })}
            </Caption>
          </>
        ) : (
          <Body color={colors.textSecondary}>{t('managerprofile.no_contract')}</Body>
        )}
      </Card>

      <Card variant="detail" style={styles.card} testID="manager-profile-history">
        <Title>{t('managerprofile.club_history')}</Title>
        <Body color={colors.textSecondary}>{playerClub?.name ?? '—'}</Body>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
