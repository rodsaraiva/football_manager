import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { getClubTrophies, ClubTrophySummary } from '../../database/queries/history';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
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
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  accent?: string;
}

function HubCard({ icon, title, subtitle, onPress, accent }: HubCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.hubCard,
        accent ? { borderLeftColor: accent, borderLeftWidth: 4 } : null,
        pressed && styles.hubCardPressed,
      ]}
      onPress={onPress}
    >
      <Text style={styles.hubIcon}>{icon}</Text>
      <View style={styles.hubContent}>
        <Text style={styles.hubTitle}>{title}</Text>
        {subtitle ? <Text style={styles.hubSubtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function ClubOverviewScreen() {
  const { t } = useTranslation();
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
      const t = await getClubTrophies(dbHandle, saveId, playerClubId);
      if (!cancelled) setTrophies(t);
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
        <Text style={styles.emptyText}>{t('club.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <ClubBanner subtitle={club.shortName} />
      <View style={styles.header}>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatLabel}>{t('club.budget_label')}</Text>
            <Text style={styles.headerStatValue}>{formatCurrency(club.budget)}</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Text style={styles.headerStatLabel}>{t('club.reputation_label')}</Text>
            <Text style={styles.headerStatValue}>{club.reputation}/100</Text>
          </View>
        </View>
      </View>

      {/* Transfers section */}
      <Text style={styles.sectionTitle}>{t('club.section_transfers')}</Text>
      <HubCard
        icon="🔄"
        title={t('club.transfer_market_title')}
        subtitle={t('club.transfer_market_sub')}
        accent={colors.accent}
        onPress={() => navigation.navigate('TransferMarket')}
      />
      <HubCard
        icon="📤"
        title={t('club.offers_sent_title')}
        subtitle={t('club.offers_sent_sub')}
        accent={colors.primary}
        onPress={() => navigation.navigate('OffersSent')}
      />
      <HubCard
        icon="📥"
        title={t('club.offers_received_title')}
        subtitle={t('club.offers_received_sub')}
        accent={colors.warning}
        onPress={() => navigation.navigate('OffersReceived')}
      />
      <HubCard
        icon="🏷️"
        title={t('club.my_listings_title')}
        subtitle={t('club.my_listings_sub')}
        accent={colors.warning}
        onPress={() => navigation.navigate('MyListings')}
      />
      <HubCard
        icon="🆓"
        title={t('club.free_agents_title')}
        subtitle={t('club.free_agents_sub')}
        accent={colors.success}
        onPress={() => navigation.navigate('FreeAgents')}
      />

      {/* Management section */}
      <Text style={styles.sectionTitle}>{t('club.section_management')}</Text>
      <HubCard
        icon="💰"
        title={t('club.finances_title')}
        subtitle={t('club.finances_sub')}
        accent={colors.success}
        onPress={() => navigation.navigate('ClubFinances')}
      />
      <HubCard
        icon="👔"
        title={t('club.staff_title')}
        subtitle={t('club.staff_sub')}
        accent={colors.primaryLight}
        onPress={() => navigation.navigate('ClubStaff')}
      />
      <HubCard
        icon="🏗️"
        title={t('club.upgrades_title')}
        subtitle={t('club.upgrades_sub')}
        accent={colors.gold}
        onPress={() => navigation.navigate('ClubUpgrades')}
      />
      <HubCard
        icon="🎯"
        title={t('training.title')}
        subtitle={t('training.subtitle')}
        accent={colors.primaryLight}
        onPress={() => navigation.navigate('Training')}
      />
      <HubCard
        icon="🏛️"
        title={t('club.board_title')}
        subtitle={t('club.board_sub')}
        accent={colors.primary}
        onPress={() => navigation.navigate('ClubBoard')}
      />
      <HubCard
        icon="🧠"
        title={t('club.assistants_title')}
        subtitle={t('club.assistants_sub')}
        accent={colors.accent}
        onPress={() => navigation.navigate('ClubAssistants')}
      />

      {/* Trophy Cabinet */}
      <Text style={styles.sectionTitle}>{t('club.section_trophies')}</Text>
      <View style={styles.trophyCard}>
        {trophies.length === 0 && <Text style={styles.empty}>{t('club.no_trophies')}</Text>}
        {trophies.map((trophy) => (
          <View key={trophy.competitionId} style={styles.trophyRow}>
            <Text style={styles.trophyComp}>{trophy.competitionName}</Text>
            <Text style={styles.trophyCount}>
              {trophy.titles === 1
                ? t('club.trophy_title_one', { count: trophy.titles })
                : t('club.trophy_title_other', { count: trophy.titles })}
              {trophy.runnerUps > 0 ? t('club.trophy_runner_up', { count: trophy.runnerUps }) : ''}
            </Text>
            {trophy.titleYears.length > 0 && (
              <Text style={styles.trophyYears}>{t('club.trophy_years', { years: trophy.titleYears.join(', ') })}</Text>
            )}
          </View>
        ))}
      </View>
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
    fontSize: fontSize.md,
  },
  header: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    margin: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clubName: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  clubShort: {
    color: colors.primary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  headerStats: {
    flexDirection: 'row',
    marginTop: spacing.md,
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
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerStatValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginTop: spacing.xxs,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginHorizontal: spacing.md + 4,
    marginBottom: spacing.xs,
  },
  hubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hubCardPressed: {
    backgroundColor: colors.surfaceLight,
  },
  hubIcon: {
    fontSize: 24,
    width: 36,
    textAlign: 'center',
    marginRight: spacing.sm,
  },
  hubContent: {
    flex: 1,
  },
  hubTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  hubSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: fontSize.xxl,
    marginLeft: spacing.sm,
  },
  trophyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  trophyRow: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  trophyComp: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  trophyCount: {
    color: colors.gold,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  trophyYears: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
});
