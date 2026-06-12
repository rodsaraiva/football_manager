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
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { getPositionColor, getOverallColor } from '@/utils/player-colors';
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

export function TransferMarketScreen() {
  const { t } = useTranslation();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const season = useGameStore((s) => s.season);
  const week = useGameStore((s) => s.week);
  const currentSave = useGameStore((s) => s.currentSave);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const saveId = currentSave?.id;

  const [players, setPlayers] = useState<PlayerWithOverall[]>([]);
  const [loading, setLoading] = useState(true);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithOverall | null>(null);
  const [buyerBudget, setBuyerBudget] = useState(0);

  const loadPlayers = useCallback(async () => {
    if (!dbHandle || playerClubId === null || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const filters = positionFilter !== 'All' ? { position: positionFilter as Position } : {};
      const results = (await searchPlayers(dbHandle, saveId, filters)).filter(
        (p) => p.clubId !== playerClubId && !p.isFreeAgent,
      );
      const withOverall: PlayerWithOverall[] = [];
      for (const p of results) {
        const full = await getPlayerById(dbHandle, saveId, p.id);
        const overall = full ? calculateOverall(full.attributes, full.position) : 50;
        withOverall.push({ ...p, overall });
      }
      withOverall.sort((a, b) => b.overall - a.overall);
      setPlayers(withOverall);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, saveId, positionFilter]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // Load buyer budget whenever modal opens
  useEffect(() => {
    if (!selectedPlayer || !dbHandle || playerClubId === null || saveId == null) return;
    (async () => {
      const club = await getClubById(dbHandle, saveId, playerClubId);
      setBuyerBudget(club?.budget ?? 0);
    })();
  }, [selectedPlayer, dbHandle, playerClubId, saveId]);

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
      if (!dbHandle || playerClubId === null || !selectedPlayer || saveId == null) return;
      if (selectedPlayer.clubId === null) {
        Alert.alert(t('transfer.error'), t('transfer.player_is_free_agent'));
        return;
      }
      try {
        await createOffer(dbHandle, saveId, {
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
          createdSeason: season,
          createdWeek: week,
        });
        setSelectedPlayer(null);
        Alert.alert(
          t('transfer.offer_sent_title'),
          t('transfer.offer_sent_msg', { player: selectedPlayer.name }),
          [{ text: 'OK' }],
        );
      } catch (e) {
        Alert.alert(t('transfer.error'), t('transfer.offer_failed', { error: (e as Error).message }));
      }
    },
    [dbHandle, playerClubId, saveId, selectedPlayer, season, week],
  );

  return (
    <View style={commonStyles.screen}>
      {/* Position filter */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>{t('transfer.position_label')}</Text>
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setShowDropdown((v) => !v)}
        >
          <Text style={styles.dropdownButtonText}>{positionFilter === 'All' ? t('transfer.filter_all') : positionFilter} ▾</Text>
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
                {pos === 'All' ? t('transfer.filter_all') : pos}
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
          <Text style={styles.emptyText}>{t('transfer.no_players_available')}</Text>
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
                  <Text style={styles.playerMeta}>{t('transfer.age_value', { age: item.age, value: formatCurrency(item.marketValue) })}</Text>
                </View>
                <View style={[styles.overallBadge, { borderColor: ovrColor }]}>
                  <Text style={[styles.overallText, { color: ovrColor }]}>{item.overall}</Text>
                </View>
                <Pressable
                  style={styles.offerButton}
                  onPress={() => handleOpenOffer(item)}
                >
                  <Text style={styles.offerButtonText}>{t('transfer.offer_btn')}</Text>
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
    borderRadius: radius.md,
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
    borderRadius: radius.md,
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
    margin: spacing.xxs,
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
    borderRadius: radius.lg,
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
    marginTop: spacing.xxs,
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
