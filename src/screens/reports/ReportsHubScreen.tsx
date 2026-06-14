import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { RootStackParamList } from '@/navigation/types';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useTranslation } from '@/i18n';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getClubsByLeague } from '@/database/queries/clubs';
import { calculateOverall } from '@/utils/overall';
import { buildContractAlerts } from '@/engine/reports/contract-alerts';
import { SquadPlayer } from '@/engine/reports/technical-report';
import { getNextFixtureForClub } from '@/database/queries/fixtures';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface HubCardProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  accent: string;
  badge?: number;
}

function HubCard({ icon, title, subtitle, onPress, accent, badge }: HubCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: accent },
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {badge != null && badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function ReportsHubScreen() {
  const navigation = useNavigation<NavProp>();
  const { playerClubId, season, currentSave, playerClub } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;
  const [contractAlertCount, setContractAlertCount] = useState(0);
  const [nextOpponentName, setNextOpponentName] = useState<string | null>(null);
  const { t } = useTranslation();

  useFocusEffect(
    React.useCallback(() => {
      if (!dbHandle || !playerClubId || saveId == null) return;

      // Load contract alerts
      getPlayersWithAttributesByClub(dbHandle, saveId, playerClubId).then((fullPlayers) => {
        const squad: SquadPlayer[] = fullPlayers.map((full) => ({
          id: full.id,
          name: full.name,
          age: full.age,
          position: full.position,
          overall: calculateOverall(full.attributes, full.position),
          basePotential: full.basePotential,
          effectivePotential: full.effectivePotential,
          injuryWeeksLeft: full.injuryWeeksLeft,
          attributes: full.attributes,
          morale: full.morale,
          contractEnd: full.contractEnd,
          wage: full.wage,
        }));
        setContractAlertCount(buildContractAlerts(squad, season).length);
      }).catch(() => {});

      // Load next opponent name for hub card subtitle
      if (playerClub) {
        getNextFixtureForClub(dbHandle, saveId, playerClubId, season).then(async (fixture) => {
          if (!fixture) { setNextOpponentName(null); return; }
          const opponentId = fixture.homeClubId === playerClubId ? fixture.awayClubId : fixture.homeClubId;
          const leagueClubs = await getClubsByLeague(dbHandle, saveId, playerClub.leagueId);
          const opp = leagueClubs.find((c) => c.id === opponentId);
          setNextOpponentName(opp?.shortName ?? opp?.name ?? null);
        }).catch(() => setNextOpponentName(null));
      }
    }, [dbHandle, playerClubId, playerClub, season, saveId]),
  );

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('reports.header_title')}</Text>
        <Text style={styles.headerSub}>{t('reports.header_sub')}</Text>
      </View>

      <HubCard
        icon="📋"
        title={t('reports.technical_title')}
        subtitle={t('reports.technical_sub')}
        accent={colors.reportTechnical}
        badge={contractAlertCount}
        onPress={() => navigation.navigate('ReportsTechnical')}
      />
      <HubCard
        icon="💰"
        title={t('reports.financial_title')}
        subtitle={t('reports.financial_sub')}
        accent={colors.reportFinancial}
        onPress={() => navigation.navigate('ReportsFinancial')}
      />
      <HubCard
        icon="📊"
        title={t('reports.analytics_title')}
        subtitle={t('reports.analytics_sub')}
        accent={colors.reportAnalytics}
        onPress={() => navigation.navigate('ReportsAnalytics')}
      />
      <HubCard
        icon="🌱"
        title={t('reports.youth_title')}
        subtitle={t('reports.youth_sub')}
        accent={colors.reportYouth}
        onPress={() => navigation.navigate('ReportsYouth')}
      />
      <HubCard
        icon="🕸️"
        title={t('reports.radar_title')}
        subtitle={t('reports.radar_sub')}
        accent={colors.reportRadar}
        onPress={() => navigation.navigate('ReportsRadar', {})}
      />
      <HubCard
        icon="🔍"
        title={t('reports.opponent_title')}
        subtitle={nextOpponentName ? t('reports.opponent_sub_vs', { name: nextOpponentName }) : t('reports.opponent_sub_none')}
        accent={colors.reportOpponent}
        onPress={() => navigation.navigate('ReportsOpponent')}
      />
      <HubCard
        icon="💼"
        title={t('reports.roi_title')}
        subtitle={t('reports.roi_sub')}
        accent={colors.reportROI}
        onPress={() => navigation.navigate('ReportsTransferROI')}
      />
      <HubCard
        icon="📈"
        title={t('reports.projection_title')}
        subtitle={t('reports.projection_sub')}
        accent={colors.reportProjection}
        onPress={() => navigation.navigate('ReportsProjection')}
      />
      <HubCard
        icon="🎯"
        title={t('reports.scout_title')}
        subtitle={t('reports.scout_sub')}
        accent={colors.reportScout}
        onPress={() => navigation.navigate('ReportsFreeAgentScout')}
      />
      <HubCard
        icon="🕵️"
        title={t('scouting.title')}
        subtitle={t('scouting.subtitle')}
        accent={colors.reportScout}
        onPress={() => navigation.navigate('Scouting')}
      />
      <HubCard
        icon="🌍"
        title={t('internationals.title')}
        subtitle={t('internationals.subtitle')}
        accent={colors.reportAnalytics}
        onPress={() => navigation.navigate('Internationals')}
      />

      <View style={styles.secondary}>
        <HubCard
          icon="🏆"
          title={t('reports.league_table_title')}
          subtitle={t('reports.league_table_sub')}
          accent={colors.reportTechnical}
          onPress={() => navigation.navigate('LeagueStandings')}
        />
        <HubCard
          icon="📜"
          title={t('reports.history_title')}
          subtitle={t('reports.history_sub')}
          accent={colors.reportHistory}
          onPress={() => navigation.navigate('SeasonHistory')}
        />
        <HubCard
          icon="🏆"
          title={t('achievements.hub_title')}
          subtitle={t('achievements.hub_sub')}
          accent={colors.gold}
          onPress={() => navigation.navigate('Achievements')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  headerSub: {
    color: colors.primary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  cardPressed: { backgroundColor: colors.surfaceLight },
  icon: {
    fontSize: 26,
    width: 40,
    textAlign: 'center',
    marginRight: spacing.sm,
  },
  content: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  badgeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: fontSize.xxl,
    marginLeft: spacing.sm,
  },
  secondary: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
});
