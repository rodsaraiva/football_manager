import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import PlayerCard from '@/components/PlayerCard';
import { Card, Chip, Badge, Icon, EmptyState } from '@/components/kit';
import { Body } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { Player, PlayerAttributes, Position } from '@/types';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/types';

type FilterCategory = 'All' | 'GK' | 'DEF' | 'MID' | 'FWD';

const FILTER_TABS: FilterCategory[] = ['All', 'GK', 'DEF', 'MID', 'FWD'];

const DEF_POSITIONS: Position[] = ['CB', 'LB', 'RB'];
const MID_POSITIONS: Position[] = ['CDM', 'CM', 'CAM', 'LM', 'RM'];
const FWD_POSITIONS: Position[] = ['LW', 'RW', 'ST'];

const POSITION_ORDER: Record<string, number> = {
  GK: 0, CB: 1, LB: 2, RB: 3,
  CDM: 4, CM: 5, CAM: 6, LM: 7, RM: 8,
  LW: 9, RW: 10, ST: 11,
};

interface PlayerWithAttributes extends Player {
  attributes: PlayerAttributes;
  overall: number;
}

function matchesFilter(position: Position, filter: FilterCategory): boolean {
  if (filter === 'All') return true;
  if (filter === 'GK') return position === 'GK';
  if (filter === 'DEF') return DEF_POSITIONS.includes(position);
  if (filter === 'MID') return MID_POSITIONS.includes(position);
  if (filter === 'FWD') return FWD_POSITIONS.includes(position);
  return true;
}

export function SquadListScreen() {
  const playerClubId = useGameStore((s) => s.playerClubId);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const accent = useClubAccent();

  const [players, setPlayers] = useState<PlayerWithAttributes[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterCategory>('All');

  useEffect(() => {
    if (!dbHandle || playerClubId === null || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const basePlayers = await getPlayersByClub(dbHandle, saveId, playerClubId);
        const withAttributes: PlayerWithAttributes[] = [];
        for (const p of basePlayers) {
          const full = await getPlayerById(dbHandle, saveId, p.id);
          if (full) {
            withAttributes.push({
              ...full,
              overall: calculateOverall(full.attributes, full.position),
            });
          }
        }
        withAttributes.sort((a, b) => {
          const posA = POSITION_ORDER[a.position] ?? 99;
          const posB = POSITION_ORDER[b.position] ?? 99;
          if (posA !== posB) return posA - posB;
          return b.overall - a.overall;
        });
        setPlayers(withAttributes);
      } finally {
        setLoading(false);
      }
    })();
  }, [dbHandle, playerClubId]);

  const filtered = players.filter((p) => matchesFilter(p.position, filter));

  const handleSelectPlayer = useCallback(
    (id: number) => navigation.navigate('PlayerDetail', { playerId: id }),
    [navigation],
  );

  return (
    <View style={commonStyles.screen}>
      <View style={styles.topLinks}>
        <TouchableOpacity
          style={styles.topLinkItem}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('YouthAcademy')}
          testID="squad-link-youth"
          accessibilityRole="button"
          accessibilityLabel={t('home.youth_academy_link')}
        >
          <Card variant="detail" accent={accent.accent} style={styles.linkCard}>
            <Icon name="squad" color={accent.accent} size={18} />
            <Body color={accent.accent}>{t('home.youth_academy_link')}</Body>
          </Card>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.topLinkItem}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('TeamTalk')}
          testID="squad-link-teamtalk"
          accessibilityRole="button"
          accessibilityLabel={t('interaction.team_talk_link')}
        >
          <Card variant="detail" accent={accent.accent} style={styles.linkCard}>
            <Icon name="whistle" color={accent.accent} size={18} />
            <Body color={accent.accent}>{t('interaction.team_talk_link')}</Body>
          </Card>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <Chip
            key={tab}
            label={tab === 'All' ? t('transfer.filter_all') : tab}
            selected={filter === tab}
            accent={accent.accent}
            onPress={() => setFilter(tab)}
            testID={`squad-filter-${tab}`}
          />
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={accent.accent} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState art="search" title={t('transfer.no_players_found')} accent={accent.accent} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View>
              <PlayerCard
                name={item.name}
                position={item.position}
                overall={item.overall}
                age={item.age}
                morale={item.morale}
                fitness={item.fitness}
                onPress={() => handleSelectPlayer(item.id)}
                testID={`squad-player-${item.id}`}
              />
              {(item.isTransferListed || item.isLoanListed || item.willRetireAtSeasonEnd) && (
                <View style={styles.listingBadges}>
                  {item.isTransferListed && <Badge value={t('squad.tag_listed')} tone="warning" size="sm" />}
                  {item.isLoanListed && <Badge value={t('squad.tag_loan')} tone="accent" accent={accent.accent} size="sm" />}
                  {item.willRetireAtSeasonEnd && <Badge value={t('squad.tag_retiring')} tone="danger" size="sm" />}
                </View>
              )}
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topLinks: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  topLinkItem: {
    flex: 1,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingBadges: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    marginTop: -spacing.sm,
    gap: spacing.xs,
  },
});
