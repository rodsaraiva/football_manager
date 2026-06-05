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
import { colors, commonStyles, fontSize, spacing } from '@/theme';
import StatBar from '@/components/StatBar';
import { getPositionColor, getOverallColor } from '@/utils/player-colors';
import { calculateOverall } from '@/utils/overall';
import { Player, PlayerAttributes, Position } from '@/types';
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


const TECHNICAL_ATTRS: { key: keyof PlayerAttributes; label: string }[] = [
  { key: 'finishing', label: 'Finishing' },
  { key: 'passing', label: 'Passing' },
  { key: 'crossing', label: 'Crossing' },
  { key: 'dribbling', label: 'Dribbling' },
  { key: 'heading', label: 'Heading' },
  { key: 'longShots', label: 'Long Shots' },
  { key: 'freeKicks', label: 'Free Kicks' },
];

const MENTAL_ATTRS: { key: keyof PlayerAttributes; label: string }[] = [
  { key: 'vision', label: 'Vision' },
  { key: 'composure', label: 'Composure' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'positioning', label: 'Positioning' },
  { key: 'aggression', label: 'Aggression' },
  { key: 'leadership', label: 'Leadership' },
];

const PHYSICAL_ATTRS: { key: keyof PlayerAttributes; label: string }[] = [
  { key: 'pace', label: 'Pace' },
  { key: 'stamina', label: 'Stamina' },
  { key: 'strength', label: 'Strength' },
  { key: 'agility', label: 'Agility' },
  { key: 'jumping', label: 'Jumping' },
];

function awardLabel(a: SeasonAward): string {
  switch (a.awardType) {
    case 'top_scorer': return `Top Scorer (rank ${a.rank})`;
    case 'top_assister': return `Top Assister (rank ${a.rank})`;
    case 'mvp': return 'MVP';
    case 'breakthrough': return 'Breakthrough Player';
  }
}

export default function PlayerDetailScreen({ player, onBack }: PlayerDetailScreenProps) {
  const { dbHandle } = useDatabaseStore();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const navigation = useNavigation<NavProp>();
  const [awards, setAwards] = useState<SeasonAward[]>([]);
  const [titles, setTitles] = useState<PlayerTitle[]>([]);
  useEffect(() => {
    if (!dbHandle || !player || saveId == null) return;
    let cancelled = false;
    (async () => {
      const [a, t] = await Promise.all([
        getPlayerAwards(dbHandle, saveId, player.id),
        getPlayerTitles(dbHandle, saveId, player.id),
      ]);
      if (!cancelled) { setAwards(a); setTitles(t); }
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
          <Text style={styles.backButtonText}>← Back to Squad</Text>
        </Pressable>
        <View style={styles.centered}>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.md }}>Player not found</Text>
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
        <Text style={styles.backButtonText}>← Back to Squad</Text>
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
                <Text style={styles.metaText}>Age {player.age}</Text>
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
              <Text style={styles.footLabel}>Pé Preferido</Text>
              <Text style={styles.footValue}>{player.preferredFoot === 'left' ? 'Esquerdo' : 'Direito'}</Text>
            </View>
            <View style={styles.footItem}>
              <Text style={styles.footLabel}>Pé Ruim</Text>
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
          <Text style={styles.sectionTitle}>Technical</Text>
          {TECHNICAL_ATTRS.map(({ key, label }) => (
            <StatBar key={key} label={label} value={player.attributes[key]} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mental</Text>
          {MENTAL_ATTRS.map(({ key, label }) => (
            <StatBar key={key} label={label} value={player.attributes[key]} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Physical</Text>
          {PHYSICAL_ATTRS.map(({ key, label }) => (
            <StatBar key={key} label={label} value={player.attributes[key]} />
          ))}
        </View>

        {/* Contract Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contract</Text>
          <View style={styles.contractRow}>
            <View style={styles.contractItem}>
              <Text style={commonStyles.label}>Weekly Wage</Text>
              <Text style={styles.contractValue}>{formatCurrency(player.wage)}</Text>
            </View>
            <View style={styles.contractItem}>
              <Text style={commonStyles.label}>Contract Ends</Text>
              <Text style={styles.contractValue}>Season {player.contractEnd}</Text>
            </View>
            <View style={styles.contractItem}>
              <Text style={commonStyles.label}>Market Value</Text>
              <Text style={styles.contractValue}>{formatCurrency(player.marketValue)}</Text>
            </View>
          </View>
        </View>

        {/* Career */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Career</Text>

          <Text style={styles.careerSubHeading}>Titles</Text>
          {titles.length === 0 && <Text style={styles.careerEmpty}>No titles yet.</Text>}
          {titles.map((t, i) => (
            <Text key={`title-${i}`} style={styles.careerRow}>
              {t.competitionName} — Season {t.season}
            </Text>
          ))}

          <Text style={styles.careerSubHeading}>Individual Awards</Text>
          {awards.length === 0 && <Text style={styles.careerEmpty}>No awards yet.</Text>}
          {awards.map((a, i) => (
            <Text key={`award-${i}`} style={styles.careerRow}>
              {awardLabel(a)} — {a.competitionName} ({a.season})
              {a.awardType === 'top_scorer' || a.awardType === 'top_assister' ? ` · ${a.value}` : ''}
            </Text>
          ))}
        </View>

        {player.clubId === playerClubId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transfer Status</Text>

            <View style={styles.listingRow}>
              <Text style={styles.listingLabel}>Listed for transfer</Text>
              <Switch
                value={isTransferListed}
                onValueChange={handleToggleTransferListing}
              />
            </View>
            {isTransferListed && (
              <View style={styles.listingRow}>
                <Text style={styles.listingLabel}>Asking price</Text>
                <TextInput
                  style={styles.listingInput}
                  value={askingPriceText}
                  onChangeText={setAskingPriceText}
                  onBlur={handleBlurAskingPrice}
                  keyboardType="numeric"
                  placeholder="Open to offers"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            <View style={styles.listingRow}>
              <Text style={styles.listingLabel}>Listed for loan</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  radarBtn: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
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
    borderRadius: 12,
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
    paddingVertical: 2,
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
    borderRadius: 8,
    padding: spacing.sm,
    alignItems: 'center',
  },
  footLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
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
    borderRadius: 12,
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
});
