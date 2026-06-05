import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { generateCandidates, candidateWillAccept } from '@/engine/assistant/assistant-engine';
import { insertAssistant } from '@/database/queries/assistants';
import { addFinanceEntry } from '@/database/queries/finances';
import { SeededRng } from '@/engine/rng';
import { AssistantCandidate } from '@/types/assistant';
import { RootStackParamList } from '@/navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'ClubAssistantHiring'>;

const ARCHETYPE_LABELS: Record<string, string> = {
  old_school: 'Old School',
  analytics:  'Analytics',
  motivator:  'Motivator',
  tactician:  'Tactician',
  developer:  'Developer',
  pragmatic:  'Pragmatic',
};

function CandidateCard({
  candidate,
  clubReputation,
  onHire,
}: {
  candidate: AssistantCandidate;
  clubReputation: number;
  onHire: () => void;
}) {
  const canAccept = candidateWillAccept({ candidate, clubReputation, offeredWage: candidate.wagePerMonth });

  return (
    <View style={[styles.card, !canAccept && styles.cardDisabled]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{candidate.name}</Text>
        <Text style={styles.stars}>{'★'.repeat(candidate.qualityStars)}{'☆'.repeat(5 - candidate.qualityStars)}</Text>
      </View>
      <View style={styles.cardMeta}>
        <Text style={styles.metaItem}>Age {candidate.age}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaItem}>{ARCHETYPE_LABELS[candidate.archetype]}</Text>
      </View>
      <View style={styles.cardStats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>MONTHLY WAGE</Text>
          <Text style={styles.statValue}>${(candidate.wagePerMonth / 1000).toFixed(1)}K</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>MIN. REP</Text>
          <Text style={[styles.statValue, !canAccept && { color: colors.danger }]}>
            {candidate.reputationRequired}
          </Text>
        </View>
      </View>
      {!canAccept && (
        <Text style={styles.refuseNote}>Club not attractive enough (rep {clubReputation}/{candidate.reputationRequired})</Text>
      )}
      <Pressable style={[styles.hireBtn, !canAccept && styles.hireBtnDisabled]} onPress={onHire} disabled={!canAccept}>
        <Text style={[styles.hireBtnText, !canAccept && styles.hireBtnTextDisabled]}>Hire</Text>
      </Pressable>
    </View>
  );
}

export function AssistantHiringScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteT>();
  const { role } = route.params;
  const { currentSave, season, playerClub, playerClubId } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [candidates, setCandidates] = useState<AssistantCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentSave) return;
    const rng = new SeededRng(season * 999 + currentSave.id + (role === 'squad' ? 0 : role === 'financial' ? 1 : 2));
    const generated = generateCandidates({ role, saveId: currentSave.id, season, rng });
    setCandidates(generated);
    setLoading(false);
  }, [role, currentSave, season]);

  const handleHire = (candidate: AssistantCandidate) => {
    Alert.alert(
      'Hire Assistant',
      `Hire ${candidate.name} for $${(candidate.wagePerMonth / 1000).toFixed(1)}K/month?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hire',
          onPress: async () => {
            if (!dbHandle || !currentSave || !playerClubId) return;
            await insertAssistant(dbHandle, {
              role: candidate.role,
              clubId: playerClubId,
              saveId: currentSave.id,
              name: candidate.name,
              age: candidate.age,
              archetype: candidate.archetype,
              seasonsAtClub: 0,
              retirementAge: 60 + Math.floor(Math.random() * 11),
              wagePerMonth: candidate.wagePerMonth,
              willRetireNextSeason: false,
            });
            await addFinanceEntry(dbHandle, currentSave.id, {
              clubId: playerClubId,
              season,
              week: 1,
              type: 'assistant_wage',
              amount: -candidate.wagePerMonth,
              description: `Signing bonus — ${candidate.name}`,
            });
            navigation.goBack();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>Your club reputation: {playerClub?.reputation ?? '—'}</Text>
      {candidates.map((c, i) => (
        <CandidateCard
          key={i}
          candidate={c}
          clubReputation={playerClub?.reputation ?? 0}
          onHire={() => handleHire(c)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { alignItems: 'center', justifyContent: 'center' },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardDisabled: { opacity: 0.6 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  stars: { color: colors.gold, fontSize: fontSize.md },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  metaItem: { color: colors.textSecondary, fontSize: fontSize.sm },
  metaDot: { color: colors.textMuted, marginHorizontal: spacing.xs },
  cardStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  stat: { flex: 1 },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: 2 },
  refuseNote: { color: colors.danger, fontSize: fontSize.xs, marginBottom: spacing.sm },
  hireBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  hireBtnDisabled: { backgroundColor: colors.border },
  hireBtnText: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  hireBtnTextDisabled: { color: colors.textMuted },
});
