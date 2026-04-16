import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { RootStackParamList } from '@/navigation/types';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
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
  const { playerClubId, season } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [contractAlertCount, setContractAlertCount] = useState(0);
  const [nextOpponentName, setNextOpponentName] = useState<string | null>(null);
  const { playerClub } = useGameStore();

  useFocusEffect(
    React.useCallback(() => {
      if (!dbHandle || !playerClubId) return;

      // Load contract alerts
      getPlayersWithAttributesByClub(dbHandle, playerClubId).then((fullPlayers) => {
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
        getNextFixtureForClub(dbHandle, playerClubId, season).then(async (fixture) => {
          if (!fixture) { setNextOpponentName(null); return; }
          const opponentId = fixture.homeClubId === playerClubId ? fixture.awayClubId : fixture.homeClubId;
          const leagueClubs = await getClubsByLeague(dbHandle, playerClub.leagueId);
          const opp = leagueClubs.find((c) => c.id === opponentId);
          setNextOpponentName(opp?.shortName ?? opp?.name ?? null);
        }).catch(() => setNextOpponentName(null));
      }
    }, [dbHandle, playerClubId, playerClub, season]),
  );

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Relatórios</Text>
        <Text style={styles.headerSub}>Análises da comissão técnica</Text>
      </View>

      <HubCard
        icon="📋"
        title="Assistente Técnico"
        subtitle="Forma, evolução, quem merece chance"
        accent={colors.primary}
        badge={contractAlertCount}
        onPress={() => navigation.navigate('ReportsTechnical')}
      />
      <HubCard
        icon="💰"
        title="Assistente Financeiro"
        subtitle="Lucro, saldo de transferências, folha"
        accent={colors.success}
        onPress={() => navigation.navigate('ReportsFinancial')}
      />
      <HubCard
        icon="📊"
        title="Analista de Dados"
        subtitle="Comparações com o resto da liga"
        accent={colors.accent}
        onPress={() => navigation.navigate('ReportsAnalytics')}
      />
      <HubCard
        icon="🌱"
        title="Analista Sub-21"
        subtitle="Talentos jovens em detalhe"
        accent={colors.gold}
        onPress={() => navigation.navigate('ReportsYouth')}
      />
      <HubCard
        icon="🕸️"
        title="Radar de Atributos"
        subtitle="Comparação visual de perfis de jogadores"
        accent={colors.primaryLight}
        onPress={() => navigation.navigate('ReportsRadar', {})}
      />
      <HubCard
        icon="🔍"
        title="Próximo Adversário"
        subtitle={nextOpponentName ? `vs. ${nextOpponentName}` : 'Nenhum jogo agendado'}
        accent={colors.warning}
        onPress={() => navigation.navigate('ReportsOpponent')}
      />
      <HubCard
        icon="💼"
        title="ROI de Transferências"
        subtitle="Retorno sobre contratações e vendas"
        accent={colors.gold}
        onPress={() => navigation.navigate('ReportsTransferROI')}
      />
      <HubCard
        icon="📈"
        title="Projeção de Classificação"
        subtitle="Estimativa de onde terminarás na liga"
        accent={colors.primary}
        onPress={() => navigation.navigate('ReportsProjection')}
      />

      <View style={styles.secondary}>
        <HubCard
          icon="🏆"
          title="Tabela da Liga"
          subtitle="Classificação atualizada"
          accent={colors.primaryLight}
          onPress={() => navigation.navigate('LeagueStandings')}
        />
        <HubCard
          icon="📜"
          title="History"
          subtitle="Past champions, awards & records"
          accent={colors.gold}
          onPress={() => navigation.navigate('SeasonHistory')}
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
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  headerSub: {
    color: colors.primary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
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
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
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
