import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, commonStyles, fontSize, spacing } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { searchPlayers, getPlayerById } from '@/database/queries/players';
import { getClubById } from '@/database/queries/clubs';
import { createOffer } from '@/database/queries/transfers';
import { calculateOverall } from '@/utils/overall';
import { Player, Position } from '@/types';
import { OfferModal } from './OfferModal';

type PositionFilter = 'All' | Position;

const POSITION_OPTIONS: PositionFilter[] = [
  'All', 'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST',
];

interface PlayerWithOverall extends Player {
  overall: number;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}

function getPositionColor(position: Position): string {
  if (position === 'GK') return '#f4a261';
  if (['CB', 'LB', 'RB'].includes(position)) return colors.primary;
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return colors.success;
  return colors.accent;
}

function getOverallColor(overall: number): string {
  if (overall >= 85) return '#00e676';
  if (overall >= 75) return colors.success;
  if (overall >= 60) return colors.warning;
  if (overall >= 40) return '#ff9800';
  return colors.danger;
}

export function TransferMarketScreen() {
  const playerClubId = useGameStore((s) => s.playerClubId);
  const season = useGameStore((s) => s.season);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);

  const [players, setPlayers] = useState<PlayerWithOverall[]>([]);
  const [loading, setLoading] = useState(true);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithOverall | null>(null);
  const [buyerBudget, setBuyerBudget] = useState(0);

  const loadPlayers = useCallback(async () => {
    if (!dbHandle || playerClubId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const filters = positionFilter !== 'All' ? { position: positionFilter as Position } : {};
      const results = (await searchPlayers(dbHandle, filters)).filter(
        (p) => p.clubId !== playerClubId && !p.isFreeAgent,
      );
      const withOverall: PlayerWithOverall[] = [];
      for (const p of results) {
        const full = await getPlayerById(dbHandle, p.id);
        const overall = full ? calculateOverall(full.attributes, full.position) : 50;
        withOverall.push({ ...p, overall });
      }
      withOverall.sort((a, b) => b.overall - a.overall);
      setPlayers(withOverall);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, positionFilter]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // Load buyer budget whenever modal opens
  useEffect(() => {
    if (!selectedPlayer || !dbHandle || playerClubId === null) return;
    (async () => {
      const club = await getClubById(dbHandle, playerClubId);
      setBuyerBudget(club?.budget ?? 0);
    })();
  }, [selectedPlayer, dbHandle, playerClubId]);

  const handleOpenOffer = useCallback((player: PlayerWithOverall) => {
    setSelectedPlayer(player);
  }, []);

  const handleCloseOffer = useCallback(() => {
    setSelectedPlayer(null);
  }, []);

  const handleSubmitOffer = useCallback(
    async (
      fee: number,
      wage: number,
      kind: 'transfer' | 'loan',
      loanDurationSeasons?: number,
    ) => {
      if (!dbHandle || playerClubId === null || !selectedPlayer) return;
      if (selectedPlayer.clubId === null) {
        Alert.alert('Error', 'This player has no club (free agent). Use the Free Agents screen.');
        return;
      }
      try {
        await createOffer(dbHandle, {
          playerId: selectedPlayer.id,
          offeringClubId: playerClubId,
          sellingClubId: selectedPlayer.clubId,
          feeOffered: fee,
          wageOffered: wage,
          offerType: kind,
          loanEnd:
            kind === 'loan' && loanDurationSeasons
              ? season + loanDurationSeasons
              : null,
        });
        setSelectedPlayer(null);
        Alert.alert(
          'Offer sent',
          `Your ${kind} offer for ${selectedPlayer.name} has been submitted. Response will come next week.`,
          [{ text: 'OK' }],
        );
      } catch (e) {
        Alert.alert('Error', `Failed to submit offer: ${(e as Error).message}`);
      }
    },
    [dbHandle, playerClubId, selectedPlayer, season],
  );

  return (
    <View style={commonStyles.screen}>
      {/* Position filter */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Position:</Text>
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setShowDropdown((v) => !v)}
        >
          <Text style={styles.dropdownButtonText}>{positionFilter} ▾</Text>
        </Pressable>
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          {POSITION_OPTIONS.map((pos) => (
            <Pressable
              key={pos}
              style={[styles.dropdownItem, positionFilter === pos && styles.dropdownItemActive]}
              onPress={() => {
                setPositionFilter(pos);
                setShowDropdown(false);
              }}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  positionFilter === pos && styles.dropdownItemTextActive,
                ]}
              >
                {pos}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : players.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No players available</Text>
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const posColor = getPositionColor(item.position);
            const ovrColor = getOverallColor(item.overall);
            return (
              <View style={styles.playerRow}>
                <View style={styles.positionBadge}>
                  <Text style={[styles.positionText, { color: posColor }]}>{item.position}</Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.playerMeta}>Age {item.age} · {formatCurrency(item.marketValue)}</Text>
                </View>
                <View style={[styles.overallBadge, { borderColor: ovrColor }]}>
                  <Text style={[styles.overallText, { color: ovrColor }]}>{item.overall}</Text>
                </View>
                <Pressable
                  style={styles.offerButton}
                  onPress={() => handleOpenOffer(item)}
                >
                  <Text style={styles.offerButtonText}>Offer</Text>
                </Pressable>
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      )}

      {selectedPlayer && (
        <OfferModal
          visible={selectedPlayer !== null}
          onClose={handleCloseOffer}
          onSubmit={handleSubmitOffer}
          playerName={selectedPlayer.name}
          playerPosition={selectedPlayer.position}
          playerAge={selectedPlayer.age}
          playerOverall={selectedPlayer.overall}
          marketValue={selectedPlayer.marketValue}
          currentWage={selectedPlayer.wage}
          buyerBudget={buyerBudget}
          currentSeason={season}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  dropdownButton: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownButtonText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  dropdown: {
    position: 'absolute',
    top: 52,
    left: spacing.md + 60,
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 100,
    elevation: 5,
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: 280,
    padding: spacing.xs,
  },
  dropdownItem: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    margin: 2,
  },
  dropdownItemActive: {
    backgroundColor: colors.primary,
  },
  dropdownItemText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  dropdownItemTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    padding: spacing.sm,
  },
  positionBadge: {
    width: 44,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  positionText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  playerMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  overallBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  overallText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  offerButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  offerButtonText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
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
});
