import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { getClubTrophies, ClubTrophySummary } from '../../database/queries/history';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubById } from '@/database/queries/clubs';
import { Club } from '@/types';
import { RootStackParamList } from '@/navigation/types';

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
  const { playerClubId, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const navigation = useNavigation<NavProp>();
  const [club, setClub] = useState<Club | null>(null);
  const [trophies, setTrophies] = useState<ClubTrophySummary[]>([]);

  useEffect(() => {
    if (!dbHandle || playerClubId == null) return;
    let cancelled = false;
    (async () => {
      const t = await getClubTrophies(dbHandle, playerClubId);
      if (!cancelled) setTrophies(t);
    })();
    return () => { cancelled = true; };
  }, [dbHandle, playerClubId]);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId == null) return;
    const loaded = await getClubById(dbHandle, playerClubId);
    setClub(loaded);
  }, [dbHandle, playerClubId]);

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
        <Text style={styles.emptyText}>Loading club data...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Club name header */}
      <View style={styles.header}>
        <Text style={styles.clubName}>{club.name}</Text>
        <Text style={styles.clubShort}>{club.shortName}</Text>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Text style={styles.headerStatLabel}>Budget</Text>
            <Text style={styles.headerStatValue}>{formatCurrency(club.budget)}</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStat}>
            <Text style={styles.headerStatLabel}>Reputation</Text>
            <Text style={styles.headerStatValue}>{club.reputation}/100</Text>
          </View>
        </View>
      </View>

      {/* Transfers section */}
      <Text style={styles.sectionTitle}>TRANSFERS</Text>
      <HubCard
        icon="🔄"
        title="Transfer Market"
        subtitle="Browse and bid for players"
        accent={colors.accent}
        onPress={() => navigation.navigate('TransferMarket')}
      />
      <HubCard
        icon="📤"
        title="Offers Sent"
        subtitle="Track your bids"
        accent={colors.primary}
        onPress={() => navigation.navigate('OffersSent')}
      />
      <HubCard
        icon="📥"
        title="Offers Received"
        subtitle="Bids for your players"
        accent={colors.warning}
        onPress={() => navigation.navigate('OffersReceived')}
      />
      <HubCard
        icon="🏷️"
        title="My Listings"
        subtitle="Liste seu plantel para venda ou empréstimo"
        accent={colors.warning}
        onPress={() => navigation.navigate('MyListings')}
      />
      <HubCard
        icon="🆓"
        title="Free Agents"
        subtitle="Sign unattached players"
        accent={colors.success}
        onPress={() => navigation.navigate('FreeAgents')}
      />

      {/* Management section */}
      <Text style={styles.sectionTitle}>MANAGEMENT</Text>
      <HubCard
        icon="💰"
        title="Finances"
        subtitle="Income & expenses"
        accent={colors.success}
        onPress={() => navigation.navigate('ClubFinances')}
      />
      <HubCard
        icon="👔"
        title="Staff"
        subtitle="Coaches & scouts"
        accent={colors.primaryLight}
        onPress={() => navigation.navigate('ClubStaff')}
      />
      <HubCard
        icon="🏗️"
        title="Upgrades"
        subtitle="Facilities & stadium"
        accent={colors.gold}
        onPress={() => navigation.navigate('ClubUpgrades')}
      />
      <HubCard
        icon="🏛️"
        title="Board"
        subtitle="Reputation, trust & objectives"
        accent={colors.primary}
        onPress={() => navigation.navigate('ClubBoard')}
      />
      <HubCard
        icon="🧠"
        title="Assistants"
        subtitle="Squad analyst, financial advisor & youth coach"
        accent={colors.accent}
        onPress={() => navigation.navigate('ClubAssistants')}
      />

      {/* Trophy Cabinet */}
      <Text style={styles.sectionTitle}>TROPHY CABINET</Text>
      <View style={styles.trophyCard}>
        {trophies.length === 0 && <Text style={styles.empty}>No trophies yet.</Text>}
        {trophies.map((t) => (
          <View key={t.competitionId} style={styles.trophyRow}>
            <Text style={styles.trophyComp}>{t.competitionName}</Text>
            <Text style={styles.trophyCount}>
              {t.titles} {t.titles === 1 ? 'title' : 'titles'}
              {t.runnerUps > 0 ? ` · ${t.runnerUps} runner-up` : ''}
            </Text>
            {t.titleYears.length > 0 && (
              <Text style={styles.trophyYears}>Years: {t.titleYears.join(', ')}</Text>
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
    borderRadius: 12,
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
    marginTop: 2,
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
    borderRadius: 12,
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
    marginTop: 2,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: fontSize.xxl,
    marginLeft: spacing.sm,
  },
  trophyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
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
    marginTop: 2,
  },
  trophyYears: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
});
