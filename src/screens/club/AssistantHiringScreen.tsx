import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { generateCandidates, candidateWillAccept } from '@/engine/assistant/assistant-engine';
import { insertAssistant } from '@/database/queries/assistants';
import { addFinanceEntry } from '@/database/queries/finances';
import { SeededRng } from '@/engine/rng';
import { ASSISTANT_RETIREMENT_MIN_AGE, ASSISTANT_RETIREMENT_MAX_AGE } from '@/engine/balance';
import { AssistantCandidate } from '@/types/assistant';
import { RootStackParamList } from '@/navigation/types';
import { Card, Button, useConfirm } from '@/components/kit';
import { Body, Label, Caption, Stat } from '@/components/typography';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteT = RouteProp<RootStackParamList, 'ClubAssistantHiring'>;

const ARCHETYPE_LABELS: Record<string, TKey> = {
  old_school: 'assistants.arch_old_school',
  analytics:  'assistants.arch_analytics',
  motivator:  'assistants.arch_motivator',
  tactician:  'assistants.arch_tactician',
  developer:  'assistants.arch_developer',
  pragmatic:  'assistants.arch_pragmatic',
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
  const { t } = useTranslation();
  const canAccept = candidateWillAccept({ candidate, clubReputation, offeredWage: candidate.wagePerMonth });

  return (
    <Card variant="detail" style={[styles.card, !canAccept && styles.cardDisabled]}>
      <View style={styles.cardHeader}>
        <Body>{candidate.name}</Body>
        <Text style={styles.stars}>{'★'.repeat(candidate.qualityStars)}{'☆'.repeat(5 - candidate.qualityStars)}</Text>
      </View>
      <View style={styles.cardMeta}>
        <Caption color={colors.textSecondary}>{t('assistants.age_n', { age: candidate.age })}</Caption>
        <Caption color={colors.textMuted}> · </Caption>
        <Caption color={colors.textSecondary}>{t(ARCHETYPE_LABELS[candidate.archetype])}</Caption>
      </View>
      <View style={styles.cardStats}>
        <View style={styles.stat}>
          <Label>{t('assistants.monthly_wage')}</Label>
          <Stat>${(candidate.wagePerMonth / 1000).toFixed(1)}K</Stat>
        </View>
        <View style={styles.stat}>
          <Label>{t('assistants.min_rep')}</Label>
          <Stat color={!canAccept ? colors.danger : undefined}>{candidate.reputationRequired}</Stat>
        </View>
      </View>
      {!canAccept && (
        <Caption color={colors.danger}>{t('assistants.not_attractive', { rep: clubReputation, req: candidate.reputationRequired })}</Caption>
      )}
      <Button
        label={t('assistants.hire_btn')}
        variant="primary"
        disabled={!canAccept}
        onPress={onHire}
        testID={`hire-candidate-${candidate.name}`}
        accessibilityLabel={t('assistants.hire_btn')}
      />
    </Card>
  );
}

export function AssistantHiringScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteT>();
  const { role } = route.params;
  const { currentSave, season, playerClub, playerClubId } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const confirm = useConfirm();
  const [candidates, setCandidates] = useState<AssistantCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentSave) return;
    const rng = new SeededRng(season * 999 + currentSave.id + (role === 'squad' ? 0 : role === 'financial' ? 1 : 2));
    const generated = generateCandidates({ role, saveId: currentSave.id, season, rng });
    setCandidates(generated);
    setLoading(false);
  }, [role, currentSave, season]);

  const handleHire = async (candidate: AssistantCandidate) => {
    const ok = await confirm({
      title: t('assistants.hire_title'),
      message: t('assistants.hire_msg', { name: candidate.name, wage: (candidate.wagePerMonth / 1000).toFixed(1) }),
      confirmLabel: t('assistants.hire_btn'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok || !dbHandle || !currentSave || !playerClubId) return;
    const retireRng = new SeededRng(currentSave.id * 131 + playerClubId * 7 + season + candidate.age);
    await insertAssistant(dbHandle, {
      role: candidate.role,
      clubId: playerClubId,
      saveId: currentSave.id,
      name: candidate.name,
      age: candidate.age,
      archetype: candidate.archetype,
      seasonsAtClub: 0,
      retirementAge: retireRng.nextInt(ASSISTANT_RETIREMENT_MIN_AGE, ASSISTANT_RETIREMENT_MAX_AGE),
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
      <Caption color={colors.textMuted} style={styles.subtitle}>
        {t('assistants.your_rep', { rep: playerClub?.reputation ?? '—' })}
      </Caption>
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
  subtitle: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  cardDisabled: { opacity: 0.6 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stars: { color: colors.gold, fontSize: fontSize.md },
  cardMeta: { flexDirection: 'row', alignItems: 'center' },
  cardStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  stat: { flex: 1 },
});
