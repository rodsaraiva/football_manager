import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, commonStyles, fontSize, spacing } from '@/theme';

type TrainingFocus = 'Technical' | 'Tactical' | 'Physical' | 'Balanced';

interface TrainingCard {
  focus: TrainingFocus;
  icon: string;
  description: string;
}

const TRAINING_CARDS: TrainingCard[] = [
  {
    focus: 'Technical',
    icon: '⚽',
    description: 'Improves finishing, passing, dribbling',
  },
  {
    focus: 'Tactical',
    icon: '🧠',
    description: 'Improves positioning, vision, decisions',
  },
  {
    focus: 'Physical',
    icon: '💪',
    description: 'Improves pace, stamina, strength',
  },
  {
    focus: 'Balanced',
    icon: '⚖️',
    description: 'Even improvement across all areas',
  },
];

export function TrainingScreen() {
  const [selectedFocus, setSelectedFocus] = useState<TrainingFocus>('Balanced');

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.pageTitle}>Training Focus</Text>
      <Text style={styles.pageSubtitle}>
        Choose what your team focuses on during training sessions
      </Text>

      <View style={styles.grid}>
        {TRAINING_CARDS.map(({ focus, icon, description }) => {
          const isSelected = selectedFocus === focus;
          return (
            <Pressable
              key={focus}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => setSelectedFocus(focus)}
            >
              <Text style={styles.cardIcon}>{icon}</Text>
              <Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]}>
                {focus}
              </Text>
              <Text style={styles.cardDescription}>{description}</Text>
              {isSelected && (
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeText}>Active</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  pageTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  pageSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    // Two per row with gap
    width: '47%',
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceLight,
  },
  cardIcon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  cardTitleSelected: {
    color: colors.primaryLight,
  },
  cardDescription: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  selectedBadge: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  selectedBadgeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
