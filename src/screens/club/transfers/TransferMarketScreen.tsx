import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { ContextualHint } from '@/components/ContextualHint';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, Badge, Button, Chip, EmptyState, useConfirm } from '@/components/kit';
import { Body, Label, Stat } from '@/components/typography';
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
  const accent = useClubAccent();
  const confirm = useConfirm();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const season = useGameStore((s) => s.season);
  const week = useGameStore((s) => s.week);
  const currentSave = useGameStore((s) => s.currentSave);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const saveId = currentSave?.id;

  const [players, setPlayers] = useState<PlayerWithOverall[]>([]);
  const [loading, setLoading] = useState(true);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All');
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
        await confirm({ title: t('transfer.error'), message: t('transfer.player_is_free_agent'), confirmLabel: t('kit.ok') });
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
        const playerName = selectedPlayer.name;
        setSelectedPlayer(null);
        await confirm({ title: t('transfer.offer_sent_title'), message: t('transfer.offer_sent_msg', { player: playerName }), confirmLabel: t('kit.ok') });
      } catch (e) {
        await confirm({ title: t('transfer.error'), message: t('transfer.offer_failed', { error: (e as Error).message }), confirmLabel: t('kit.ok'), tone: 'danger' });
      }
    },
    [dbHandle, playerClubId, saveId, selectedPlayer, season, week, confirm, t],
  );

  return (
    <View style={commonStyles.screen}>
      {/* Position filter */}
      <View style={styles.filterHeader}>
        <Label style={styles.filterLabel}>{t('transfer.position_label')}</Label>
        <View style={styles.hintRight}>
          <ContextualHint screen="transfers" titleKey="hints.transfers_title" bodyKey="hints.transfers_body" />
        </View>
      </View>
      <FlatList
        horizontal
        testID="transfer-position-filter"
        accessibilityLabel={t('transfer.position_label')}
        data={POSITION_OPTIONS}
        keyExtractor={(p) => p}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: pos }) => (
          <Chip
            label={pos === 'All' ? t('transfer.filter_all') : pos}
            selected={positionFilter === pos}
            accent={accent.accent}
            onPress={() => setPositionFilter(pos)}
            testID={`chip-filter-${pos}`}
            accessibilityLabel={pos === 'All' ? t('transfer.filter_all') : pos}
          />
        )}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={accent.accent} size="large" />
        </View>
      ) : players.length === 0 ? (
        <EmptyState art="search" title={t('transfer.no_players_available')} />
      ) : (
        <FlatList
          data={players}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const posColor = getPositionColor(item.position);
            const ovrColor = getOverallColor(item.overall);
            return (
              <Card variant="detail" accent={accent.accent} style={styles.playerRow}>
                <Badge value={item.position} accent={posColor} tone="accent" />
                <View style={styles.playerInfo}>
                  <Body numberOfLines={1}>{item.name}</Body>
                  <Label>{t('transfer.age_value', { age: item.age, value: formatCurrency(item.marketValue) })}</Label>
                </View>
                <Stat color={ovrColor} style={styles.ovr}>{item.overall}</Stat>
                <Button
                  label={t('transfer.offer_btn')}
                  variant="primary"
                  onPress={() => handleOpenOffer(item)}
                  testID={`transfer-make-offer-${item.id}`}
                  accessibilityLabel={t('transfer.offer_btn')}
                />
              </Card>
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

const styles = {
  filterHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  filterLabel: {
    color: colors.textSecondary,
  },
  hintRight: {
    marginLeft: 'auto' as const,
  },
  filterRow: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  playerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  playerInfo: {
    flex: 1,
  },
  ovr: {
    marginHorizontal: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
