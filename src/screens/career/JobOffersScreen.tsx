import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useBoardStore } from '@/store/board-store';
import { RootStackParamList } from '@/navigation/types';
import { SeededRng } from '@/engine/rng';
import {
  getPendingJobOffers,
  expirePendingJobOffers,
  PendingJobOffer,
} from '@/database/queries/job-offers';
import { setJobOffersPending as persistJobOffersGate, markSaveEnded, setUnemployed as persistUnemployed } from '@/database/queries/save';
import { acceptJobOffer } from '@/engine/board/accept-job-offer';
import { processAchievementCheckpoint } from '@/engine/achievements/achievements-checkpoint';
import { BOARD_TRUST_INITIAL } from '@/engine/balance';
import { Card, Button, EmptyState, useConfirm } from '@/components/kit';
import StatBar from '@/components/StatBar';
import { Headline, Body, Title, Caption } from '@/components/typography';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function JobOffersScreen() {
  const navigation = useNavigation<NavProp>();
  const { t } = useTranslation();
  const {
    season,
    currentSave,
    unemployed,
    setPlayerClub,
    setPreseasonPending,
    setJobOffersPending,
    setUnemployed,
    setPendingAchievementToastIds,
  } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { setCurrentObjective, setCurrentTrust } = useBoardStore();
  const confirm = useConfirm();
  const saveId = currentSave?.id;
  // Offers are keyed to the season that just finished (the trigger). The store's `season`
  // already points at the new season, so the offer season is one behind.
  const offerSeason = season - 1;

  const [offers, setOffers] = useState<PendingJobOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!dbHandle || saveId == null) return;
    setLoading(true);
    const pending = await getPendingJobOffers(dbHandle, saveId, offerSeason);
    setOffers(pending);
    setLoading(false);
  }, [dbHandle, saveId, offerSeason]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleAccept(offer: PendingJobOffer) {
    if (!dbHandle || saveId == null || busy) return;
    setBusy(true);
    try {
      const result = await acceptJobOffer({
        db: dbHandle,
        saveId,
        offeringClubId: offer.offeringClubId,
        offerSeason,
        newSeason: season,
        rng: new SeededRng(season * 4099 + offer.offeringClubId),
      });
      // Mirror the persisted switch into the stores. Manager reputation is intentionally
      // left untouched — the career value persists across the move.
      setPlayerClub(result.newClub);
      setCurrentObjective(result.newObjective);
      setCurrentTrust(BOARD_TRUST_INITIAL);
      setJobOffersPending(false);
      setPreseasonPending(true);
      // W2: a rescued manager is no longer unemployed once they sign on. The rescue
      // club's world was already rolled over in the dismissal branch.
      if (unemployed) {
        await persistUnemployed(dbHandle, saveId, false);
        setUnemployed(false);
      }

      // P8 achievement: changed clubs via offer → 'poached'. Toast surfaces on Home.
      try {
        const newly = await processAchievementCheckpoint({
          db: dbHandle,
          saveId,
          season,
          week: 1,
          snapshot: { changedClubs: true },
        });
        if (newly.length > 0) setPendingAchievementToastIds(newly.map((d) => d.id));
      } catch { /* best-effort */ }

      navigation.navigate('Game');
    } catch {
      // Reload to reflect whatever persisted; the user can retry.
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmAccept(offer: PendingJobOffer) {
    const ok = await confirm({
      title: t('joboffers.title'),
      message: t('joboffers.accept_confirm', { club: offer.clubName }),
      confirmLabel: t('joboffers.accept'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) handleAccept(offer);
  }

  async function handleStay() {
    if (!dbHandle || saveId == null || busy) return;
    setBusy(true);
    try {
      await expirePendingJobOffers(dbHandle, saveId, offerSeason);
      await persistJobOffersGate(dbHandle, saveId, false);
      setJobOffersPending(false);

      // W2: an unemployed (dismissed) manager declining every rescue offer ends the
      // career — there is no current club to stay at.
      if (unemployed) {
        await markSaveEnded(dbHandle, saveId);
        await persistUnemployed(dbHandle, saveId, false);
        setUnemployed(false);
        navigation.navigate('GameOver', {
          reason: t('endseason.gameover_trust_depleted'),
          trust: 0,
          objectiveDescription: '',
        });
        return;
      }

      // Keep current club; its own pre-season gate (already set by the rollover) drives the flow.
      navigation.navigate('Game');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Headline>{unemployed ? t('joboffers.unemployed_header') : t('joboffers.title')}</Headline>
        <Body color={colors.primary}>{unemployed ? t('joboffers.unemployed_sub') : t('joboffers.subtitle')}</Body>
      </View>

      {offers.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState art="generic" title={t('joboffers.empty')} />
        </View>
      ) : (
        offers.map((offer) => (
          <Card key={offer.id} variant="detail" accent={colors.primary} selected style={styles.offerCard}>
            <View style={styles.offerTop}>
              <View style={styles.offerInfo}>
                <Title>{offer.clubName}</Title>
                <Caption color={colors.textSecondary}>
                  {t('joboffers.club_meta', { league: offer.leagueName, division: offer.divisionLevel })}
                </Caption>
              </View>
              <Button
                label={t('joboffers.accept')}
                variant="primary"
                disabled={busy}
                onPress={() => confirmAccept(offer)}
                testID={`accept-offer-${offer.id}`}
                accessibilityLabel={t('joboffers.accept')}
              />
            </View>
            <StatBar
              value={offer.clubReputation}
              maxValue={100}
              color={colors.primary}
              valueText={t('joboffers.club_reputation', { rep: offer.clubReputation })}
            />
          </Card>
        ))
      )}

      <View style={styles.stayWrap}>
        <Button
          label={unemployed ? t('joboffers.decline_all') : t('joboffers.stay')}
          variant="secondary"
          disabled={busy}
          onPress={handleStay}
          testID="joboffers-stay"
          accessibilityLabel={unemployed ? t('joboffers.decline_all') : t('joboffers.stay')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  emptyWrap: { marginHorizontal: spacing.md },
  offerCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  offerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  offerInfo: { flex: 1 },
  stayWrap: { marginHorizontal: spacing.md, marginTop: spacing.md },
});
