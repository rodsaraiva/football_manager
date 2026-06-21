import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, radius, commonStyles } from '@/theme';
import { Card, Icon, Badge } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Headline, Label, Body, Caption } from '@/components/typography';
import { RootStackParamList } from '@/navigation/types';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useTranslation } from '@/i18n';
import { ContextualHint } from '@/components/ContextualHint';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getClubsByLeague } from '@/database/queries/clubs';
import { calculateOverall } from '@/utils/overall';
import { buildContractAlerts } from '@/engine/reports/contract-alerts';
import { SquadPlayer } from '@/engine/reports/technical-report';
import { getNextFixtureForClub } from '@/database/queries/fixtures';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface HubCardProps {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  accent: string;
  badge?: number;
  testID?: string;
}

function HubCard({ icon, title, subtitle, onPress, accent, badge, testID }: HubCardProps) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Card variant="detail" accent={accent} style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
          <Icon name={icon} color={accent} size={22} />
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Body style={styles.title}>{title}</Body>
            {badge != null && badge > 0 && <Badge value={badge} tone="danger" size="sm" />}
          </View>
          <Label>{subtitle}</Label>
        </View>
        <Icon name="arrowRight" color={colors.textMuted} size={20} />
      </Card>
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
        <View style={styles.headerRow}>
          <Headline style={styles.headerTitle}>{t('reports.header_title')}</Headline>
          <ContextualHint screen="reports" titleKey="hints.reports_title" bodyKey="hints.reports_body" />
        </View>
        <Caption color={colors.primary}>{t('reports.header_sub')}</Caption>
      </View>

      <HubCard
        icon="tactics"
        title={t('reports.technical_title')}
        subtitle={t('reports.technical_sub')}
        accent={colors.reportTechnical}
        badge={contractAlertCount}
        onPress={() => navigation.navigate('ReportsTechnical')}
        testID="hub-technical"
      />
      <HubCard
        icon="money"
        title={t('reports.financial_title')}
        subtitle={t('reports.financial_sub')}
        accent={colors.reportFinancial}
        onPress={() => navigation.navigate('ReportsFinancial')}
        testID="hub-financial"
      />
      <HubCard
        icon="chart"
        title={t('reports.analytics_title')}
        subtitle={t('reports.analytics_sub')}
        accent={colors.reportAnalytics}
        onPress={() => navigation.navigate('ReportsAnalytics')}
        testID="hub-analytics"
      />
      <HubCard
        icon="squad"
        title={t('reports.youth_title')}
        subtitle={t('reports.youth_sub')}
        accent={colors.reportYouth}
        onPress={() => navigation.navigate('ReportsYouth')}
        testID="hub-youth"
      />
      <HubCard
        icon="target"
        title={t('reports.radar_title')}
        subtitle={t('reports.radar_sub')}
        accent={colors.reportRadar}
        onPress={() => navigation.navigate('ReportsRadar', {})}
        testID="hub-radar"
      />
      <HubCard
        icon="shield"
        title={t('reports.opponent_title')}
        subtitle={nextOpponentName ? t('reports.opponent_sub_vs', { name: nextOpponentName }) : t('reports.opponent_sub_none')}
        accent={colors.reportOpponent}
        onPress={() => navigation.navigate('ReportsOpponent')}
        testID="hub-opponent"
      />
      <HubCard
        icon="assist"
        title={t('reports.roi_title')}
        subtitle={t('reports.roi_sub')}
        accent={colors.reportROI}
        onPress={() => navigation.navigate('ReportsTransferROI')}
        testID="hub-roi"
      />
      <HubCard
        icon="chart"
        title={t('reports.projection_title')}
        subtitle={t('reports.projection_sub')}
        accent={colors.reportProjection}
        onPress={() => navigation.navigate('ReportsProjection')}
        testID="hub-projection"
      />
      <HubCard
        icon="goal"
        title={t('reports.scout_title')}
        subtitle={t('reports.scout_sub')}
        accent={colors.reportScout}
        onPress={() => navigation.navigate('ReportsFreeAgentScout')}
        testID="hub-scout"
      />
      <HubCard
        icon="target"
        title={t('scouting.title')}
        subtitle={t('scouting.subtitle')}
        accent={colors.reportScout}
        onPress={() => navigation.navigate('Scouting')}
        testID="hub-scouting"
      />
      <HubCard
        icon="whistle"
        title={t('internationals.title')}
        subtitle={t('internationals.subtitle')}
        accent={colors.reportAnalytics}
        onPress={() => navigation.navigate('Internationals')}
        testID="hub-internationals"
      />

      <View style={styles.secondary}>
        <HubCard
          icon="tactics"
          title={t('reports.league_table_title')}
          subtitle={t('reports.league_table_sub')}
          accent={colors.reportTechnical}
          onPress={() => navigation.navigate('LeagueStandings')}
          testID="hub-table"
        />
        <HubCard
          icon="news"
          title={t('reports.history_title')}
          subtitle={t('reports.history_sub')}
          accent={colors.reportHistory}
          onPress={() => navigation.navigate('SeasonHistory')}
          testID="hub-history"
        />
        <HubCard
          icon="shield"
          title={t('achievements.hub_title')}
          subtitle={t('achievements.hub_sub')}
          accent={colors.gold}
          onPress={() => navigation.navigate('Achievements')}
          testID="hub-achievements"
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: 'bold',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontWeight: '700',
  },
  secondary: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
});
