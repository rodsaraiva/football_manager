import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { getClubTrophies, ClubTrophySummary } from '../../database/queries/history';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, Icon } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Body, Label, Caption, Stat } from '@/components/typography';
import { ClubBanner } from '@/components/ClubBanner';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubById } from '@/database/queries/clubs';
import { Club } from '@/types';
import { RootStackParamList } from '@/navigation/types';
import { useTranslation } from '@/i18n';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

interface HubCardProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  accent: string;
}

function HubCard({ icon, title, subtitle, onPress, accent }: HubCardProps) {
  return (
    <Pressable
      onPress={onPress}
      testID={`club-hub-${icon}`}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Card variant="detail" accent={accent} style={styles.hubCard}>
        <View style={[styles.hubIcon, { backgroundColor: accent + '22' }]}>
          <Icon name={icon} color={accent} size={22} />
        </View>
        <View style={styles.hubContent}>
          <Body style={styles.hubTitle}>{title}</Body>
          {subtitle ? <Label>{subtitle}</Label> : null}
        </View>
        <Icon name="arrowRight" color={colors.textMuted} size={20} />
      </Card>
    </Pressable>
  );
}

export function ClubOverviewScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const { playerClubId, week, currentSave } = useGameStore();
  const saveId = currentSave?.id;
  const { dbHandle } = useDatabaseStore();
  const navigation = useNavigation<NavProp>();
  const [club, setClub] = useState<Club | null>(null);
  const [trophies, setTrophies] = useState<ClubTrophySummary[]>([]);

  useEffect(() => {
    if (!dbHandle || playerClubId == null || saveId == null) return;
    let cancelled = false;
    (async () => {
      const data = await getClubTrophies(dbHandle, saveId, playerClubId);
      if (!cancelled) setTrophies(data);
    })();
    return () => { cancelled = true; };
  }, [dbHandle, playerClubId]);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId == null || saveId == null) return;
    const loaded = await getClubById(dbHandle, saveId, playerClubId);
    setClub(loaded);
  }, [dbHandle, playerClubId, saveId]);

  useEffect(() => {
    load();
  }, [load, week]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!club) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Label style={styles.emptyText}>{t('club.loading')}</Label>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <ClubBanner subtitle={club.shortName} />
      <Card variant="hero" accent={accent.accent} style={styles.header}>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Caption style={styles.headerStatLabel}>{t('club.budget_label')}</Caption>
            <Stat>{formatCurrency(club.budget)}</Stat>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Caption style={styles.headerStatLabel}>{t('club.reputation_label')}</Caption>
            <Stat>{club.reputation}/100</Stat>
          </View>
        </View>
      </Card>

      {/* Transfers section */}
      <Caption style={styles.sectionTitle}>{t('club.section_transfers')}</Caption>
      <HubCard
        icon="sub"
        title={t('club.transfer_market_title')}
        subtitle={t('club.transfer_market_sub')}
        accent={accent.accent}
        onPress={() => navigation.navigate('TransferMarket')}
      />
      <HubCard
        icon="assist"
        title={t('club.offers_sent_title')}
        subtitle={t('club.offers_sent_sub')}
        accent={accent.accent}
        onPress={() => navigation.navigate('OffersSent')}
      />
      <HubCard
        icon="news"
        title={t('club.offers_received_title')}
        subtitle={t('club.offers_received_sub')}
        accent={colors.warning}
        onPress={() => navigation.navigate('OffersReceived')}
      />
      <HubCard
        icon="check"
        title={t('club.my_listings_title')}
        subtitle={t('club.my_listings_sub')}
        accent={colors.warning}
        onPress={() => navigation.navigate('MyListings')}
      />
      <HubCard
        icon="squad"
        title={t('club.free_agents_title')}
        subtitle={t('club.free_agents_sub')}
        accent={colors.success}
        onPress={() => navigation.navigate('FreeAgents')}
      />

      {/* Management section */}
      <Caption style={styles.sectionTitle}>{t('club.section_management')}</Caption>
      <HubCard
        icon="money"
        title={t('club.finances_title')}
        subtitle={t('club.finances_sub')}
        accent={colors.success}
        onPress={() => navigation.navigate('ClubFinances')}
      />
      <HubCard
        icon="squad"
        title={t('club.staff_title')}
        subtitle={t('club.staff_sub')}
        accent={accent.accent}
        onPress={() => navigation.navigate('ClubStaff')}
      />
      <HubCard
        icon="shield"
        title={t('club.upgrades_title')}
        subtitle={t('club.upgrades_sub')}
        accent={colors.gold}
        onPress={() => navigation.navigate('ClubUpgrades')}
      />
      <HubCard
        icon="target"
        title={t('training.title')}
        subtitle={t('training.subtitle')}
        accent={accent.accent}
        onPress={() => navigation.navigate('Training')}
      />
      <HubCard
        icon="whistle"
        title={t('club.board_title')}
        subtitle={t('club.board_sub')}
        accent={accent.accent}
        onPress={() => navigation.navigate('ClubBoard')}
      />
      <HubCard
        icon="chart"
        title={t('club.assistants_title')}
        subtitle={t('club.assistants_sub')}
        accent={colors.accent}
        onPress={() => navigation.navigate('ClubAssistants')}
      />

      {/* Trophy Cabinet */}
      <Caption style={styles.sectionTitle}>{t('club.section_trophies')}</Caption>
      <Card variant="summary" style={styles.trophyCard}>
        {trophies.length === 0 && <Label style={styles.empty}>{t('club.no_trophies')}</Label>}
        {trophies.map((trophy) => (
          <View key={trophy.competitionId} style={styles.trophyRow}>
            <Body style={styles.trophyComp}>{trophy.competitionName}</Body>
            <Label style={styles.trophyCount}>
              {trophy.titles === 1
                ? t('club.trophy_title_one', { count: trophy.titles })
                : t('club.trophy_title_other', { count: trophy.titles })}
              {trophy.runnerUps > 0 ? t('club.trophy_runner_up', { count: trophy.runnerUps }) : ''}
            </Label>
            {trophy.titleYears.length > 0 && (
              <Caption style={styles.trophyYears}>{t('club.trophy_years', { years: trophy.titleYears.join(', ') })}</Caption>
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
  },
  header: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerStat: {
    flex: 1,
  },
  headerStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  headerStatLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  hubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  hubIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubContent: {
    flex: 1,
  },
  hubTitle: {
    fontWeight: '600',
  },
  trophyCard: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  trophyRow: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  trophyComp: {
    fontWeight: '600',
  },
  trophyCount: {
    color: colors.gold,
    marginTop: spacing.xxs,
  },
  trophyYears: {
    marginTop: spacing.xxs,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
});
