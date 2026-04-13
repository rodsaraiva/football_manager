import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, commonStyles, fontSize, spacing } from '@/theme';
import StatBar from '@/components/StatBar';
import { calculateOverall } from '@/utils/overall';
import { Player, PlayerAttributes, Position } from '@/types';

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

export default function PlayerDetailScreen({ player, onBack }: PlayerDetailScreenProps) {
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
        </View>

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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
