import React, { useEffect, useState } from 'react';
import {
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
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { updatePlayerMorale, updatePlayerContract } from '@/database/queries/players';
import { getRecentForm } from '@/database/queries/player-stats';
import { getClubById } from '@/database/queries/clubs';
import { applyMoraleDelta } from '@/engine/morale/morale-engine';
import { evaluatePraise, evaluateCriticism, InteractionReaction } from '@/engine/morale/interactions';
import { hasInteractedThisWeek, recordInteraction } from '@/database/queries/interactions';
import { getPlayerKnowledge } from '@/database/queries/scouting';
import { knowledgeTier, maskedRange, ScoutingTier } from '@/engine/scouting/scouting-engine';
import { evaluateRenewal } from '@/engine/transfer/contract-renewal';
import { canAffordWage } from '@/engine/finance/affordability';
import StatBar from '@/components/StatBar';
import { getPositionColor, getOverallColor } from '@/utils/player-colors';
import { calculateOverall } from '@/utils/overall';
import { Club, Player, PlayerAttributes } from '@/types';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getPlayerAwards, getPlayerTitles, SeasonAward, PlayerTitle } from '../../database/queries/history';
import { setTransferListing, setLoanListing } from '../../database/queries/players';
import { RootStackParamList } from '@/navigation/types';
import { Card, Button, Badge, Sheet } from '@/components/kit';
import { Title, Body, Label, Caption, Stat } from '@/components/typography';

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

/**
 * Attribute row that respects scouting fog. Full tier renders the exact StatBar;
 * lower tiers show a masked range (bar at the range midpoint) or "?" for unknown.
 */
function MaskedAttr({ label, value, tier }: { label: string; value: number; tier: ScoutingTier }) {
  if (tier === 'full') return <StatBar label={label} value={value} />;

  const range = maskedRange(value, tier);
  if (range == null) {
    // unknown: empty bar + "?"
    return (
      <View style={maskedStyles.container}>
        <Label style={maskedStyles.label}>{label}</Label>
        <View style={maskedStyles.barContainer} />
        <Label style={maskedStyles.unknown}>?</Label>
      </View>
    );
  }
  const mid = (range.lo + range.hi) / 2;
  return (
    <View style={maskedStyles.container}>
      <Label style={maskedStyles.label}>{label}</Label>
      <View style={maskedStyles.barContainer}>
        <View style={[maskedStyles.barFill, { width: `${mid}%` as `${number}%` }]} />
      </View>
      <Label style={maskedStyles.range}>{range.lo}–{range.hi}</Label>
    </View>
  );
}

const maskedStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xs },
  label: { width: 90 },
  barContainer: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
  },
  barFill: { height: '100%', borderRadius: radius.sm, backgroundColor: colors.textMuted },
  range: { width: 48, textAlign: 'right' },
  unknown: { width: 48, textAlign: 'right' },
});

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
  const accent = useClubAccent();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const season = useGameStore((s) => s.season);
  const week = useGameStore((s) => s.week);
  const navigation = useNavigation<NavProp>();
  const [morale, setMorale] = useState<number>(player?.morale ?? 50);
  useEffect(() => { setMorale(player?.morale ?? 50); }, [player?.id]);

  // Individual interaction (praise/criticize): one per player per week.
  const [interactionDone, setInteractionDone] = useState(false);
  const [reaction, setReaction] = useState<InteractionReaction | null>(null);
  useEffect(() => {
    if (!dbHandle || !player || saveId == null) return;
    let cancelled = false;
    (async () => {
      const done = await hasInteractedThisWeek(dbHandle, saveId, player.id, season, week);
      if (!cancelled) { setInteractionDone(done); setReaction(null); }
    })();
    return () => { cancelled = true; };
  }, [dbHandle, saveId, player?.id, season, week]);

  // Contract renewal modal
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [renewWage, setRenewWage] = useState('');
  const [renewYears, setRenewYears] = useState('2');
  const [renewalMsg, setRenewalMsg] = useState<string | null>(null);
  const [counter, setCounter] = useState<{ wage: number; years: number } | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const isOwnPlayer = player != null && playerClubId != null && player.clubId === playerClubId;

  // Fog-of-war: non-own players' attributes are masked by scouting knowledge.
  const [knowledge, setKnowledge] = useState<number>(0);
  useEffect(() => {
    if (!dbHandle || !player || saveId == null) return;
    if (isOwnPlayer) { setKnowledge(100); return; }
    let cancelled = false;
    (async () => {
      const k = await getPlayerKnowledge(dbHandle, saveId, player.id);
      if (!cancelled) setKnowledge(k);
    })();
    return () => { cancelled = true; };
  }, [dbHandle, saveId, player?.id, isOwnPlayer]);
  const scoutingTier: ScoutingTier = isOwnPlayer ? 'full' : knowledgeTier(knowledge);

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

  async function handleInteraction(kind: 'praise' | 'criticize') {
    if (!dbHandle || !player || saveId == null || interactionDone) return;
    const form = await getRecentForm(dbHandle, saveId, player.id, season);
    const result =
      kind === 'praise'
        ? evaluatePraise({ recentAvgRating: form.avgRating, currentMorale: morale })
        : evaluateCriticism({ recentAvgRating: form.avgRating, currentMorale: morale });
    const next = applyMoraleDelta(morale, result.delta);
    setMorale(next);
    setReaction(result.reaction);
    setInteractionDone(true);
    await updatePlayerMorale(dbHandle, saveId, player.id, next);
    await recordInteraction(dbHandle, saveId, player.id, season, week);
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
        <Pressable
          style={styles.backButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('playerdetail.back')}
          testID="playerdetail-back"
        >
          <Label color={accent.accent}>{t('playerdetail.back')}</Label>
        </Pressable>
        <View style={styles.centered}>
          <Body color={colors.textMuted}>{t('playerdetail.not_found')}</Body>
        </View>
      </View>
    );
  }

  const overall = calculateOverall(player.attributes, player.position);
  const positionColor = getPositionColor(player.position);
  const overallColor = getOverallColor(overall);

  return (
    <View style={commonStyles.screen}>
      <Pressable
        style={styles.backButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t('playerdetail.back')}
        testID="playerdetail-back"
      >
        <Label color={accent.accent}>{t('playerdetail.back')}</Label>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Card variant="hero" accent={accent.accent} style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.headerInfo}>
              <Title style={styles.playerName}>{player.name}</Title>
              <View style={styles.headerMeta}>
                <Badge value={player.position} tone="neutral" accent={positionColor} size="sm" />
                <Caption>{t('tactics.detail_age', { age: player.age })}</Caption>
                <Caption>{player.nationality}</Caption>
              </View>
              {!isOwnPlayer && (
                <Caption color={colors.reportScout} style={styles.scoutingIndicator}>{t('scouting.indicator', { value: knowledge })}</Caption>
              )}
            </View>
            <View style={[styles.overallCircle, { borderColor: overallColor }]}>
              <Stat color={overallColor} style={styles.overallNumber}>{overall}</Stat>
              <Caption color={colors.textMuted}>OVR</Caption>
            </View>
          </View>

          {/* Morale & Fitness */}
          <View style={styles.barsSection}>
            <StatBar label="Morale" value={player.morale} maxValue={100} />
            <StatBar label="Fitness" value={player.fitness} maxValue={100} />
          </View>

          {/* C5: personality archetype + "why this morale?" deep-link */}
          <View style={styles.psychologyRow}>
            <Badge
              value={t(('psychology.archetype_' + player.personality) as TKey)}
              tone={player.falloutState === 'wantsOut' ? 'danger' : player.falloutState === 'unsettled' ? 'warning' : 'neutral'}
              size="sm"
            />
            <Pressable
              onPress={() => navigation.navigate('MoraleBreakdown', { playerId: player.id })}
              testID="playerdetail-morale-why"
              accessibilityLabel={t('psychology.link_why')}
            >
              <Label color={accent.accent}>{t('psychology.link_why')}</Label>
            </Pressable>
          </View>

          {/* Foot info */}
          <View style={styles.footRow}>
            <View style={styles.footItem}>
              <Caption color={colors.textMuted}>{t('playerdetail.preferred_foot')}</Caption>
              <Body>{player.preferredFoot === 'left' ? t('playerdetail.foot_left') : t('playerdetail.foot_right')}</Body>
            </View>
            <View style={styles.footItem}>
              <Caption color={colors.textMuted}>{t('tactics.detail_weak_foot')}</Caption>
              <Body color={colors.gold}>{'★'.repeat(player.weakFootAbility)}{'☆'.repeat(5 - player.weakFootAbility)}</Body>
            </View>
          </View>
        </Card>

        {/* Radar comparison button */}
        <View style={styles.radarBtn}>
          <Button
            label={t('playerdetail.compare_attributes')}
            variant="secondary"
            onPress={() => navigation.navigate('ReportsRadar', { playerAId: player.id })}
            testID="playerdetail-radar"
            accessibilityLabel={t('playerdetail.compare_attributes')}
          />
        </View>

        {/* Attributes */}
        <Card variant="detail" accent={accent.accent} style={styles.section}>
          <Label color={colors.textMuted} style={styles.sectionTitle}>{t('tactics.section_technical')}</Label>
          {TECHNICAL_ATTRS.map((key) => (
            <MaskedAttr key={key} label={t(attrI18nKey(key))} value={player.attributes[key]} tier={scoutingTier} />
          ))}
        </Card>

        <Card variant="detail" accent={accent.accent} style={styles.section}>
          <Label color={colors.textMuted} style={styles.sectionTitle}>{t('tactics.section_mental')}</Label>
          {MENTAL_ATTRS.map((key) => (
            <MaskedAttr key={key} label={t(attrI18nKey(key))} value={player.attributes[key]} tier={scoutingTier} />
          ))}
        </Card>

        <Card variant="detail" accent={accent.accent} style={styles.section}>
          <Label color={colors.textMuted} style={styles.sectionTitle}>{t('tactics.section_physical')}</Label>
          {PHYSICAL_ATTRS.map((key) => (
            <MaskedAttr key={key} label={t(attrI18nKey(key))} value={player.attributes[key]} tier={scoutingTier} />
          ))}
        </Card>

        {/* Contract Info */}
        <Card variant="detail" accent={accent.accent} style={styles.section}>
          <Label color={colors.textMuted} style={styles.sectionTitle}>{t('playerdetail.contract')}</Label>
          <View style={styles.contractRow}>
            <View style={styles.contractItem}>
              <Caption color={colors.textMuted}>{t('transfer.weekly_wage')}</Caption>
              <Body style={styles.contractValue}>{formatCurrency(player.wage)}</Body>
            </View>
            <View style={styles.contractItem}>
              <Caption color={colors.textMuted}>{t('playerdetail.contract_ends')}</Caption>
              <Body style={styles.contractValue}>{t('standings.season', { season: player.contractEnd })}</Body>
            </View>
            <View style={styles.contractItem}>
              <Caption color={colors.textMuted}>{t('transfer.market_value')}</Caption>
              <Body style={styles.contractValue}>{formatCurrency(player.marketValue)}</Body>
            </View>
          </View>
        </Card>

        {/* Individual interactions (own squad only) */}
        {isOwnPlayer && (
          <Card variant="detail" accent={accent.accent} style={styles.section}>
            <Label color={colors.textMuted} style={styles.sectionTitle}>{t('interaction.section_title')}</Label>
            <Body color={colors.textSecondary} style={styles.moraleValue}>{t('morale.label')}: {morale}</Body>
            <View style={styles.teamTalkRow}>
              {(['praise', 'criticize'] as const).map((kind) => (
                <View key={kind} style={styles.teamTalkButton}>
                  <Button
                    label={t(`interaction.${kind}` as TKey)}
                    variant={kind === 'criticize' ? 'danger' : 'primary'}
                    disabled={interactionDone}
                    onPress={() => handleInteraction(kind)}
                    testID={`playerdetail-${kind}`}
                    accessibilityLabel={t(`interaction.${kind}` as TKey)}
                  />
                </View>
              ))}
            </View>
            {reaction != null && (
              <Body color={reactionColor(reaction)} style={styles.reactionText}>
                {t(`interaction.reaction_${reaction}` as TKey)}
              </Body>
            )}
            {interactionDone && reaction == null && (
              <Caption color={colors.textMuted} style={styles.cooldownText}>{t('interaction.cooldown')}</Caption>
            )}
          </Card>
        )}

        {/* Career */}
        <Card variant="detail" accent={accent.accent} style={styles.section}>
          <Label color={colors.textMuted} style={styles.sectionTitle}>{t('playerdetail.career')}</Label>

          <Caption color={colors.textMuted} style={styles.careerSubHeading}>{t('playerdetail.titles')}</Caption>
          {titles.length === 0 && <Caption color={colors.textMuted} style={styles.careerEmpty}>{t('playerdetail.no_titles')}</Caption>}
          {titles.map((title, i) => (
            <Body key={`title-${i}`} style={styles.careerRow}>
              {title.competitionName} — {t('standings.season', { season: title.season })}
            </Body>
          ))}

          <Caption color={colors.textMuted} style={styles.careerSubHeading}>{t('playerdetail.awards')}</Caption>
          {awards.length === 0 && <Caption color={colors.textMuted} style={styles.careerEmpty}>{t('playerdetail.no_awards')}</Caption>}
          {awards.map((a, i) => (
            <Body key={`award-${i}`} style={styles.careerRow}>
              {awardLabel(a, t)} — {a.competitionName} ({a.season})
              {a.awardType === 'top_scorer' || a.awardType === 'top_assister' ? ` · ${a.value}` : ''}
            </Body>
          ))}
        </Card>

        {player.clubId === playerClubId && (
          <Card variant="detail" accent={accent.accent} style={styles.section}>
            <Label color={colors.textMuted} style={styles.sectionTitle}>{t('renewal.title')}</Label>
            <Button
              label={t('renewal.button')}
              variant="primary"
              onPress={openRenewal}
              testID="playerdetail-renew"
              accessibilityLabel={t('renewal.button')}
            />
          </Card>
        )}

        {player.clubId === playerClubId && (
          <Card variant="detail" accent={accent.accent} style={styles.section}>
            <Label color={colors.textMuted} style={styles.sectionTitle}>{t('tactics.transfer_status_title')}</Label>

            <View style={styles.listingRow}>
              <Body style={styles.listingLabel}>{t('playerdetail.listed_for_transfer')}</Body>
              <Switch
                value={isTransferListed}
                onValueChange={handleToggleTransferListing}
              />
            </View>
            {isTransferListed && (
              <View style={styles.listingRow}>
                <Body style={styles.listingLabel}>{t('tactics.asking_price')}</Body>
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
              <Body style={styles.listingLabel}>{t('playerdetail.listed_for_loan')}</Body>
              <Switch
                value={isLoanListed}
                onValueChange={handleToggleLoanListing}
              />
            </View>
            {isLoanListed && (
              <View style={styles.listingRow}>
                <Body style={styles.listingLabel}>{t('tactics.loan_wage_share')}</Body>
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
          </Card>
        )}
      </ScrollView>

      <Sheet visible={renewalOpen} onClose={() => setRenewalOpen(false)} testID="playerdetail-renewal">
        <Title style={styles.modalTitle}>{t('renewal.title')}</Title>

        <Label color={colors.textMuted}>{t('renewal.wage_label')}</Label>
        <TextInput
          style={styles.modalInput}
          value={renewWage}
          onChangeText={setRenewWage}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
        />

        <Label color={colors.textMuted} style={styles.modalYearsLabel}>{t('renewal.years_label')}</Label>
        <TextInput
          style={styles.modalInput}
          value={renewYears}
          onChangeText={setRenewYears}
          keyboardType="numeric"
          placeholder="2"
          placeholderTextColor={colors.textMuted}
        />

        {renewalMsg != null && <Body color={colors.textSecondary} style={styles.modalMessage}>{renewalMsg}</Body>}

        <View style={styles.modalButtonRow}>
          <View style={styles.modalButton}>
            <Button
              label={t('renewal.cancel')}
              variant="ghost"
              onPress={() => setRenewalOpen(false)}
              testID="playerdetail-renewal-cancel"
              accessibilityLabel={t('renewal.cancel')}
            />
          </View>
          <View style={styles.modalButton}>
            {counter != null ? (
              <Button
                label={t('renewal.counter_accept')}
                variant="primary"
                onPress={() => persistRenewal(counter.wage, counter.years)}
                testID="playerdetail-renewal-counter"
                accessibilityLabel={t('renewal.counter_accept')}
              />
            ) : (
              <Button
                label={t('renewal.confirm')}
                variant="primary"
                onPress={handleProposeRenewal}
                testID="playerdetail-renewal-confirm"
                accessibilityLabel={t('renewal.confirm')}
              />
            )}
          </View>
        </View>
      </Sheet>
    </View>
  );
}

function reactionColor(reaction: InteractionReaction): string {
  if (reaction === 'positive') return colors.success;
  if (reaction === 'negative') return colors.danger;
  return colors.textSecondary;
}

const styles = StyleSheet.create({
  radarBtn: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  backButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  headerCard: {
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
    marginBottom: spacing.xs,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  scoutingIndicator: {
    marginTop: spacing.xs,
  },
  overallCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overallNumber: {
    fontSize: fontSize.xl,
  },
  barsSection: {
    marginTop: spacing.md,
  },
  psychologyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  section: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
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
    marginTop: spacing.xs,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  careerSubHeading: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  careerEmpty: {
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  careerRow: {
    marginBottom: spacing.xs,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  listingLabel: {
    flex: 1,
  },
  listingInput: {
    color: colors.text,
    fontSize: fontSize.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 120,
    textAlign: 'right',
  },
  moraleValue: { marginBottom: spacing.sm },
  teamTalkRow: { flexDirection: 'row', gap: spacing.sm },
  teamTalkButton: { flex: 1 },
  reactionText: { marginTop: spacing.sm },
  cooldownText: { marginTop: spacing.sm, fontStyle: 'italic' },
  modalTitle: {
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
  modalYearsLabel: { marginTop: spacing.sm },
  modalMessage: {
    marginTop: spacing.md,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalButton: {
    flex: 1,
  },
});
