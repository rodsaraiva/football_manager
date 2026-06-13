import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
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
import { setJobOffersPending as persistJobOffersGate } from '@/database/queries/save';
import { acceptJobOffer } from '@/engine/board/accept-job-offer';
import { BOARD_TRUST_INITIAL } from '@/engine/balance';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function JobOffersScreen() {
  const navigation = useNavigation<NavProp>();
  const { t } = useTranslation();
  const {
    season,
    currentSave,
    setPlayerClub,
    setPreseasonPending,
    setJobOffersPending,
  } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { setCurrentObjective, setCurrentTrust } = useBoardStore();
  const saveId = currentSave?.id;

  const [offers, setOffers] = useState<PendingJobOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!dbHandle || saveId == null) return;
    setLoading(true);
    const pending = await getPendingJobOffers(dbHandle, saveId, season);
    setOffers(pending);
    setLoading(false);
  }, [dbHandle, saveId, season]);

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
        season,
        rng: new SeededRng(season * 4099 + offer.offeringClubId),
      });
      // Mirror the persisted switch into the stores. Manager reputation is intentionally
      // left untouched — the career value persists across the move.
      setPlayerClub(result.newClub);
      setCurrentObjective(result.newObjective);
      setCurrentTrust(BOARD_TRUST_INITIAL);
      setJobOffersPending(false);
      setPreseasonPending(true);
      navigation.navigate('Game');
    } catch {
      // Reload to reflect whatever persisted; the user can retry.
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleStay() {
    if (!dbHandle || saveId == null || busy) return;
    setBusy(true);
    try {
      await expirePendingJobOffers(dbHandle, saveId, season);
      await persistJobOffersGate(dbHandle, saveId, false);
      setJobOffersPending(false);
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
        <Text style={styles.headerTitle}>{t('joboffers.title')}</Text>
        <Text style={styles.headerSub}>{t('joboffers.subtitle')}</Text>
      </View>

      {offers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('joboffers.empty')}</Text>
        </View>
      ) : (
        offers.map((offer) => (
          <View key={offer.id} style={styles.offerCard}>
            <View style={styles.offerTop}>
              <View style={styles.offerInfo}>
                <Text style={styles.clubName}>{offer.clubName}</Text>
                <Text style={styles.clubMeta}>
                  {t('joboffers.club_meta', { league: offer.leagueName, division: offer.divisionLevel })}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.acceptBtn, busy && styles.btnDisabled, pressed && styles.btnPressed]}
                disabled={busy}
                onPress={() => {
                  Alert.alert(
                    t('joboffers.title'),
                    t('joboffers.accept_confirm', { club: offer.clubName }),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('joboffers.accept'), onPress: () => handleAccept(offer) },
                    ],
                  );
                }}
              >
                <Text style={styles.acceptText}>{t('joboffers.accept')}</Text>
              </Pressable>
            </View>
            <View style={styles.repRow}>
              <View style={styles.barContainer}>
                <View style={[styles.barFill, { width: `${offer.clubReputation}%` as `${number}%` }]} />
              </View>
              <Text style={styles.repLabel}>{t('joboffers.club_reputation', { rep: offer.clubReputation })}</Text>
            </View>
          </View>
        ))
      )}

      <Pressable
        style={({ pressed }) => [styles.stayBtn, busy && styles.btnDisabled, pressed && styles.btnPressed]}
        disabled={busy}
        onPress={handleStay}
      >
        <Text style={styles.stayText}>{t('joboffers.stay')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: 'bold' },
  headerSub: { color: colors.primary, fontSize: fontSize.sm, marginTop: spacing.xxs },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.md,
  },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md },
  offerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  offerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  offerInfo: { flex: 1, marginRight: spacing.sm },
  clubName: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  clubMeta: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.xxs },
  acceptBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  acceptText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  btnPressed: { opacity: 0.7 },
  repRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barContainer: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.sm },
  repLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '600', minWidth: 110, textAlign: 'right' },
  stayBtn: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    paddingVertical: 16,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stayText: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '700' },
});
