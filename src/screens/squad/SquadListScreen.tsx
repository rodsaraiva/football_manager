import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, commonStyles, fontSize, spacing } from '@/theme';
import PlayerCard from '@/components/PlayerCard';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { Player, PlayerAttributes, Position } from '@/types';
import PlayerDetailScreen from './PlayerDetailScreen';

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
  const dbHandle = useDatabaseStore((s) => s.dbHandle);

  const [players, setPlayers] = useState<PlayerWithAttributes[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterCategory>('All');
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  useEffect(() => {
    if (!dbHandle || playerClubId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const basePlayers = await getPlayersByClub(dbHandle, playerClubId);
        const withAttributes: PlayerWithAttributes[] = [];
        for (const p of basePlayers) {
          const full = await getPlayerById(dbHandle, p.id);
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

  const handleSelectPlayer = useCallback((id: number) => {
    setSelectedPlayerId(id);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedPlayerId(null);
  }, []);

  if (selectedPlayerId !== null) {
    const player = players.find((p) => p.id === selectedPlayerId) ?? null;
    return (
      <PlayerDetailScreen
        player={player}
        onBack={handleBack}
      />
    );
  }

  return (
    <View style={commonStyles.screen}>
      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.filterChip, filter === tab && styles.filterChipActive]}
            onPress={() => setFilter(tab)}
          >
            <Text style={[styles.filterChipText, filter === tab && styles.filterChipTextActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No players found</Text>
        </View>
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
              />
              {(item.isTransferListed || item.isLoanListed || item.willRetireAtSeasonEnd) && (
                <View style={styles.listingBadges}>
                  {item.isTransferListed && <Text style={styles.listingBadge}>💰</Text>}
                  {item.isLoanListed && <Text style={styles.listingBadge}>🔁</Text>}
                  {item.willRetireAtSeasonEnd && <Text style={[styles.listingBadge, styles.retiringBadge]}>🏁 Retiring</Text>}
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.text,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  listingBadges: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    marginTop: -spacing.sm,
    gap: spacing.xs,
  },
  listingBadge: {
    fontSize: fontSize.xs,
    marginLeft: spacing.xs,
  },
  retiringBadge: {
    color: colors.warning,
    fontWeight: '700',
  },
});
