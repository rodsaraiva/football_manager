import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, commonStyles, fontSize, spacing, radius } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { updatePlayerMorale, updatePlayerContract } from '@/database/queries/players';
import { getRecentForm } from '@/database/queries/player-stats';
import { getClubById } from '@/database/queries/clubs';
import { computeTeamTalkDelta, TeamTalkTone } from '@/engine/morale/team-talk';
import { applyMoraleDelta } from '@/engine/morale/morale-engine';
import { evaluateRenewal } from '@/engine/transfer/contract-renewal';
import { canAffordWage } from '@/engine/finance/affordability';
import StatBar from '@/components/StatBar';
import { getPositionColor, getOverallColor } from '@/utils/player-colors';
import { calculateOverall } from '@/utils/overall';
import { Club, Player, PlayerAttributes, Position } from '@/types';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getPlayerAwards, getPlayerTitles, SeasonAward, PlayerTitle } from '../../database/queries/history';
import { setTransferListing, setLoanListing } from '../../database/queries/players';
import { RootStackParamList } from '@/navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface PlayerWithAttributes extends Player {
  attributes: PlayerAttributes;
}

interface PlayerDetailScreenProps {
  player: PlayerWithAttributes | null;
  onBack: () => void;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value}`;
}


/** Maps a camelCase PlayerAttributes key to its shared `tactics.attr_*` i18n key. */
function attrI18nKey(k: keyof PlayerAttributes): TKey {
  return ('tactics.attr_' + String(k).replace(/([A-Z])/g, '_$1').toLowerCase()) as TKey;
}

const TECHNICAL_ATTRS: (keyof PlayerAttributes)[] = ['finishing', 'passing', 'crossing', 'dribbling', 'heading', 'longShots', 'freeKicks'];
const MENTAL_ATTRS: (keyof PlayerAttributes)[] = ['vision', 'composure', 'decisions', 'positioning', 'aggression', 'leadership'];
const PHYSICAL_ATTRS: (keyof PlayerAttributes)[] = ['pace', 'stamina', 'strength', 'agility', 'jumping'];

function awardLabel(a: SeasonAward, t: (k: TKey, v?: Record<string, string | number>) => string): string {
  switch (a.awardType) {
    case 'top_scorer': return t('playerdetail.award_top_scorer', { rank: a.rank });
    case 'top_assister': return t('playerdetail.award_top_assister', { rank: a.rank });
    case 'mvp': return t('history.mvp');
    case 'breakthrough': return t('playerdetail.award_breakthrough');
  }
}

export default function PlayerDetailScreen({ player, onBack }: PlayerDetailScreenProps) {
  const { dbHandle } = useDatabaseStore();
  const { t } = useTranslation();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const season = useGameStore((s) => s.season);
  const navigation = useNavigation<NavProp>();
  const [morale, setMorale] = useState<number>(player?.morale ?? 50);
  useEffect(() => { setMorale(player?.morale ?? 50); }, [player?.id]);

  // Contract renewal modal
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [renewWage, setRenewWage] = useState('');
  const [renewYears, setRenewYears] = useState('2');
  const [renewalMsg, setRenewalMsg] = useState<string | null>(null);
  const [counter, setCounter] = useState<{ wage: number; years: number } | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const isOwnPlayer = player != null && playerClubId != null && player.clubId === playerClubId;

  useEffect(() => {
    if (!dbHandle || saveId == null || playerClubId == null || !isOwnPlayer) return;
    let cancelled = false;
    (async () => {
      const c = await getClubById(dbHandle, saveId, playerClubId);
      if (!cancelled) setClub(c);
    })();
    return () => { cancelled = true; };
  }, [dbHandle, saveId, playerClubId, isOwnPlayer, player?.id]);

  function openRenewal() {
    setRenewWage(player ? String(player.wage) : '');
    setRenewYears('2');
    setRenewalMsg(null);
    setCounter(null);
    setRenewalOpen(true);
  }

  async function persistRenewal(wage: number, years: number) {
    if (!dbHandle || !player || saveId == null || playerClubId == null || !club) return;
    // Wage-budget gate: subtract the player's current wage from the bill so the
    // renewal isn't double-counted, then test the renewed wage against the cap.
    const billRow = (await dbHandle
      .prepare('SELECT COALESCE(SUM(wage), 0) AS bill FROM players WHERE save_id = ? AND club_id = ? AND is_free_agent = 0')
      .get(saveId, playerClubId)) as { bill: number };
    if (!canAffordWage(billRow.bill - player.wage, club.wageBudget, wage)) {
      setRenewalMsg(t('renewal.wage_budget_exceeded'));
      return;
    }
    await updatePlayerContract(dbHandle, player.id, wage, season + years);
    setRenewalMsg(t('renewal.accepted'));
    setCounter(null);
  }

  async function handleProposeRenewal() {
    if (!player || !club) return;
    const offeredWage = parseInt(renewWage.replace(/\D/g, ''), 10);
    const offeredYears = Math.max(1, Math.min(5, parseInt(renewYears.replace(/\D/g, ''), 10) || 1));
    if (!Number.isFinite(offeredWage) || offeredWage <= 0) return;
    const result = evaluateRenewal({
      playerAge: player.age,
      playerOverall: Math.round(calculateOverall(player.attributes, player.position)),
      effectivePotential: player.effectivePotential,
      currentWage: player.wage,
      offeredWage,
      offeredYears,
      contractYearsLeft: Math.max(0, player.contractEnd - season),
      clubReputation: club.reputation,
    });
    if (result.decision === 'reject') { setRenewalMsg(t('renewal.rejected')); setCounter(null); return; }
    if (result.decision === 'counter') {
      setCounter({ wage: result.counterWage!, years: result.counterYears! });
      setRenewalMsg(t('renewal.countered', { wage: result.counterWage!, years: result.counterYears! }));
      return;
    }
    await persistRenewal(offeredWage, offeredYears);
  }

  async function handleTeamTalk(tone: TeamTalkTone) {
    if (!dbHandle || !player || saveId == null) return;
    const form = await getRecentForm(dbHandle, saveId, player.id, season);
    const delta = computeTeamTalkDelta({ tone, recentAvgRating: form.avgRating });
    const next = applyMoraleDelta(morale, delta);
    setMorale(next);
    await updatePlayerMorale(dbHandle, saveId, player.id, next);
  }

  const [awards, setAwards] = useState<SeasonAward[]>([]);
  const [titles, setTitles] = useState<PlayerTitle[]>([]);
  useEffect(() => {
    if (!dbHandle || !player || saveId == null) return;
    let cancelled = false;
    (async () => {
      const [a, ttls] = await Promise.all([
        getPlayerAwards(dbHandle, saveId, player.id),
        getPlayerTitles(dbHandle, saveId, player.id),
      ]);
      if (!cancelled) { setAwards(a); setTitles(ttls); }
    })();
    return () => { cancelled = true; };
  }, [dbHandle, player?.id]);

  const [isTransferListed, setIsTransferListedLocal] = useState<boolean>(player?.isTransferListed ?? false);
  const [askingPriceText, setAskingPriceText] = useState<string>(
    player?.askingPrice != null ? String(player.askingPrice) : '',
  );
  const [isLoanListed, setIsLoanListedLocal] = useState<boolean>(player?.isLoanListed ?? false);
  const [loanShareText, setLoanShareText] = useState<string>(
    player?.loanWageShare != null ? String(Math.round(player.loanWageShare * 100)) : '50',
  );

  async function handleToggleTransferListing(next: boolean) {
    setIsTransferListedLocal(next);
    if (!dbHandle || !player || saveId == null) return;
    const price = askingPriceText.trim() ? parseInt(askingPriceText.replace(/\D/g, ''), 10) : null;
    await setTransferListing(dbHandle, saveId, player.id, next, Number.isFinite(price) ? price : null);
  }

  async function handleBlurAskingPrice() {
    if (!dbHandle || !player || !isTransferListed || saveId == null) return;
    const price = askingPriceText.trim() ? parseInt(askingPriceText.replace(/\D/g, ''), 10) : null;
    await setTransferListing(dbHandle, saveId, player.id, true, Number.isFinite(price) ? price : null);
  }

  async function handleToggleLoanListing(next: boolean) {
    setIsLoanListedLocal(next);
    if (!dbHandle || !player || saveId == null) return;
    const sharePct = loanShareText.trim() ? parseInt(loanShareText.replace(/\D/g, ''), 10) : 50;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(sharePct) ? sharePct : 50));
    await setLoanListing(dbHandle, saveId, player.id, next, next ? clamped / 100 : null);
  }

  async function handleBlurLoanShare() {
    if (!dbHandle || !player || !isLoanListed || saveId == null) return;
    const sharePct = loanShareText.trim() ? parseInt(loanShareText.replace(/\D/g, ''), 10) : 50;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(sharePct) ? sharePct : 50));
    await setLoanListing(dbHandle, saveId, player.id, true, clamped / 100);
  }

  if (!player) {
    return (
      <View style={commonStyles.screen}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>{t('playerdetail.back')}</Text>
        </Pressable>
        <View style={styles.centered}>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.md }}>{t('playerdetail.not_found')}</Text>
        </View>
      </View>
    );
  }

  const overall = calculateOverall(player.attributes, player.position);
  const positionColor = getPositionColor(player.position);
  const overallColor = getOverallColor(overall);

  return (
    <View style={commonStyles.screen}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>{t('playerdetail.back')}</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.headerInfo}>
              <Text style={styles.playerName}>{player.name}</Text>
              <View style={styles.headerMeta}>
                <View style={[styles.positionBadge, { borderColor: positionColor }]}>
                  <Text style={[styles.positionText, { color: positionColor }]}>
                    {player.position}
                  </Text>
                </View>
                <Text style={styles.metaText}>{t('tactics.detail_age', { age: player.age })}</Text>
                <Text style={styles.metaText}>{player.nationality}</Text>
              </View>
            </View>
            <View style={[styles.overallCircle, { borderColor: overallColor }]}>
              <Text style={[styles.overallNumber, { color: overallColor }]}>{overall}</Text>
              <Text style={styles.overallLabel}>OVR</Text>
            </View>
          </View>

          {/* Morale & Fitness */}
          <View style={styles.barsSection}>
            <StatBar label="Morale" value={player.morale} maxValue={100} />
            <StatBar label="Fitness" value={player.fitness} maxValue={100} />
          </View>

          {/* Foot info */}
          <View style={styles.footRow}>
            <View style={styles.footItem}>
              <Text style={styles.footLabel}>{t('playerdetail.preferred_foot')}</Text>
              <Text style={styles.footValue}>{player.preferredFoot === 'left' ? t('playerdetail.foot_left') : t('playerdetail.foot_right')}</Text>
            </View>
            <View style={styles.footItem}>
              <Text style={styles.footLabel}>{t('tactics.detail_weak_foot')}</Text>
              <Text style={styles.footStars}>{'★'.repeat(player.weakFootAbility)}{'☆'.repeat(5 - player.weakFootAbility)}</Text>
            </View>
          </View>
        </View>

        {/* Radar comparison button */}
        <Pressable
          style={({ pressed }) => [styles.radarBtn, pressed && { opacity: 0.7 }]}
          onPress={() => navigation.navigate('ReportsRadar', { playerAId: player.id })}
        >
          <Text style={styles.radarBtnText}>🕸️ Comparar atributos</Text>
        </Pressable>

        {/* Attributes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('tactics.section_technical')}</Text>
          {TECHNICAL_ATTRS.map((key) => (
            <StatBar key={key} label={t(attrI18nKey(key))} value={player.attributes[key]} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('tactics.section_mental')}</Text>
          {MENTAL_ATTRS.map((key) => (
            <StatBar key={key} label={t(attrI18nKey(key))} value={player.attributes[key]} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('tactics.section_physical')}</Text>
          {PHYSICAL_ATTRS.map((key) => (
            <StatBar key={key} label={t(attrI18nKey(key))} value={player.attributes[key]} />
          ))}
        </View>

        {/* Contract Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('playerdetail.contract')}</Text>
          <View style={styles.contractRow}>
            <View style={styles.contractItem}>
              <Text style={commonStyles.label}>{t('transfer.weekly_wage')}</Text>
              <Text style={styles.contractValue}>{formatCurrency(player.wage)}</Text>
            </View>
            <View style={styles.contractItem}>
              <Text style={commonStyles.label}>{t('playerdetail.contract_ends')}</Text>
              <Text style={styles.contractValue}>{t('standings.season', { season: player.contractEnd })}</Text>
            </View>
            <View style={styles.contractItem}>
              <Text style={commonStyles.label}>{t('transfer.market_value')}</Text>
              <Text style={styles.contractValue}>{formatCurrency(player.marketValue)}</Text>
            </View>
          </View>
        </View>

        {/* Team Talk */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('morale.section_title')}</Text>
          <Text style={styles.moraleValue}>{t('morale.label')}: {morale}</Text>
          <View style={styles.teamTalkRow}>
            {(['praise', 'motivate', 'criticize'] as const).map((tone) => (
              <Pressable key={tone} style={styles.teamTalkButton} onPress={() => handleTeamTalk(tone)}>
                <Text style={styles.teamTalkButtonText}>{t(`morale.${tone}` as TKey)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Career */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('playerdetail.career')}</Text>

          <Text style={styles.careerSubHeading}>{t('playerdetail.titles')}</Text>
          {titles.length === 0 && <Text style={styles.careerEmpty}>{t('playerdetail.no_titles')}</Text>}
          {titles.map((title, i) => (
            <Text key={`title-${i}`} style={styles.careerRow}>
              {title.competitionName} — {t('standings.season', { season: title.season })}
            </Text>
          ))}

          <Text style={styles.careerSubHeading}>{t('playerdetail.awards')}</Text>
          {awards.length === 0 && <Text style={styles.careerEmpty}>{t('playerdetail.no_awards')}</Text>}
          {awards.map((a, i) => (
            <Text key={`award-${i}`} style={styles.careerRow}>
              {awardLabel(a, t)} — {a.competitionName} ({a.season})
              {a.awardType === 'top_scorer' || a.awardType === 'top_assister' ? ` · ${a.value}` : ''}
            </Text>
          ))}
        </View>

        {player.clubId === playerClubId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('renewal.title')}</Text>
            <Pressable style={styles.renewButton} onPress={openRenewal}>
              <Text style={styles.renewButtonText}>{t('renewal.button')}</Text>
            </Pressable>
          </View>
        )}

        {player.clubId === playerClubId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('tactics.transfer_status_title')}</Text>

            <View style={styles.listingRow}>
              <Text style={styles.listingLabel}>{t('playerdetail.listed_for_transfer')}</Text>
              <Switch
                value={isTransferListed}
                onValueChange={handleToggleTransferListing}
              />
            </View>
            {isTransferListed && (
              <View style={styles.listingRow}>
                <Text style={styles.listingLabel}>{t('tactics.asking_price')}</Text>
                <TextInput
                  style={styles.listingInput}
                  value={askingPriceText}
                  onChangeText={setAskingPriceText}
                  onBlur={handleBlurAskingPrice}
                  keyboardType="numeric"
                  placeholder={t('tactics.asking_price_placeholder')}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            <View style={styles.listingRow}>
              <Text style={styles.listingLabel}>{t('playerdetail.listed_for_loan')}</Text>
              <Switch
                value={isLoanListed}
                onValueChange={handleToggleLoanListing}
              />
            </View>
            {isLoanListed && (
              <View style={styles.listingRow}>
                <Text style={styles.listingLabel}>Borrower pays (%)</Text>
                <TextInput
                  style={styles.listingInput}
                  value={loanShareText}
                  onChangeText={setLoanShareText}
                  onBlur={handleBlurLoanShare}
                  keyboardType="numeric"
                  placeholder="50"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={renewalOpen} transparent animationType="fade" onRequestClose={() => setRenewalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('renewal.title')}</Text>

            <Text style={commonStyles.label}>{t('renewal.wage_label')}</Text>
            <TextInput
              style={styles.modalInput}
              value={renewWage}
              onChangeText={setRenewWage}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[commonStyles.label, { marginTop: spacing.sm }]}>{t('renewal.years_label')}</Text>
            <TextInput
              style={styles.modalInput}
              value={renewYears}
              onChangeText={setRenewYears}
              keyboardType="numeric"
              placeholder="2"
              placeholderTextColor={colors.textMuted}
            />

            {renewalMsg != null && <Text style={styles.modalMessage}>{renewalMsg}</Text>}

            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.modalButton, styles.modalCancel]} onPress={() => setRenewalOpen(false)}>
                <Text style={styles.modalButtonText}>{t('renewal.cancel')}</Text>
              </Pressable>
              {counter != null ? (
                <Pressable style={styles.modalButton} onPress={() => persistRenewal(counter.wage, counter.years)}>
                  <Text style={styles.modalButtonText}>{t('renewal.counter_accept')}</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.modalButton} onPress={handleProposeRenewal}>
                  <Text style={styles.modalButtonText}>{t('renewal.confirm')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  radarBtn: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  radarBtnText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  backButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  playerName: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  positionBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  positionText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  overallCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overallNumber: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  overallLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    letterSpacing: 1,
  },
  barsSection: {
    marginTop: spacing.md,
  },
  footRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  footItem: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  footLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  footValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  footStars: {
    color: colors.gold,
    fontSize: fontSize.md,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  contractRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  contractItem: {
    flex: 1,
    alignItems: 'center',
  },
  contractValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  careerSubHeading: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  careerEmpty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  careerRow: {
    color: colors.text,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  listingLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    flex: 1,
  },
  listingInput: {
    color: colors.text,
    fontSize: fontSize.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 120,
    textAlign: 'right',
  },
  moraleValue: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.sm },
  teamTalkRow: { flexDirection: 'row', gap: spacing.sm },
  teamTalkButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  teamTalkButtonText: { fontSize: fontSize.sm, color: colors.text, fontWeight: 'bold' },
  renewButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  renewButtonText: { fontSize: fontSize.sm, color: colors.text, fontWeight: 'bold' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
  },
  modalTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  modalInput: {
    color: colors.text,
    fontSize: fontSize.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  modalMessage: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  modalCancel: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonText: { fontSize: fontSize.sm, color: colors.text, fontWeight: 'bold' },
});
