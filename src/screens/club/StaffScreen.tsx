import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getStaffByClub, hireStaff, fireStaff } from '@/database/queries/staff';
import { generateStaffCandidates, canHireStaff } from '@/engine/staff/staff-market';
import { SeededRng } from '@/engine/rng';
import { STAFF_ROLE_LIMITS } from '@/engine/balance';
import { Staff, StaffCandidate, StaffRole } from '@/types';
import { Card, Button } from '@/components/kit';
import { Title, Body, Label, Caption, Stat } from '@/components/typography';

const ROLE_ORDER: StaffRole[] = ['scout', 'assistant', 'physio', 'youth_coach', 'fitness_coach'];

const ROLE_LABEL_KEYS: Record<StaffRole, TKey> = {
  scout: 'staff.role_scout',
  physio: 'staff.role_physio',
  assistant: 'staff.role_assistant',
  youth_coach: 'staff.role_youth_coach',
  fitness_coach: 'staff.role_fitness_coach',
};

const ROLE_SEED_INDEX: Record<StaffRole, number> = {
  scout: 0,
  assistant: 1,
  physio: 2,
  youth_coach: 3,
  fitness_coach: 4,
};

const CANNOT_HIRE_KEYS: Record<'budget' | 'wage_budget' | 'slots', TKey> = {
  budget: 'staff.cannot_hire_budget',
  wage_budget: 'staff.cannot_hire_wage_budget',
  slots: 'staff.cannot_hire_slots',
};

function formatWage(wage: number): string {
  if (wage >= 1_000) {
    return `$${(wage / 1_000).toFixed(0)}K`;
  }
  return `$${wage}`;
}

function AbilityStars({ ability, max = 20 }: { ability: number; max?: number }) {
  const stars = Math.round((ability / max) * 5);
  return (
    <View style={styles.starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={[styles.star, i < stars ? styles.starFilled : styles.starEmpty]}>
          ★
        </Text>
      ))}
      <Caption color={colors.textSecondary} style={styles.abilityNum}>{ability}/{max}</Caption>
    </View>
  );
}

function StaffCard({ item, onFire }: { item: Staff; onFire: () => void }) {
  const { t } = useTranslation();
  const roleLabel = ROLE_LABEL_KEYS[item.role] ? t(ROLE_LABEL_KEYS[item.role]) : item.role;

  return (
    <Card variant="detail" style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Title>{item.name}</Title>
          <Caption color={colors.primary}>{roleLabel}</Caption>
        </View>
        <Stat color={colors.warning}>{t('staff.candidate_wage', { wage: formatWage(item.wage) })}</Stat>
      </View>
      <View style={styles.cardBottom}>
        <Label style={styles.abilityLabel}>{t('staff.ability')}</Label>
        <AbilityStars ability={item.ability} />
      </View>
      <Button
        label={t('staff.fire_button')}
        variant="ghost"
        onPress={onFire}
        testID={`fire-staff-${item.id}`}
        accessibilityLabel={t('staff.fire_button')}
      />
    </Card>
  );
}

function CandidateCard({
  candidate,
  onHire,
}: {
  candidate: StaffCandidate;
  onHire: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card variant="detail" accent={colors.primary} selected style={styles.candidateCard}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Title>{candidate.name}</Title>
          <Caption color={colors.textSecondary}>
            {t('staff.candidate_ability', { ability: candidate.ability })}
          </Caption>
        </View>
        <Stat color={colors.warning}>{t('staff.candidate_wage', { wage: formatWage(candidate.wage) })}</Stat>
      </View>
      <Button
        label={t('staff.hire_button')}
        variant="primary"
        onPress={onHire}
        testID={`hire-candidate-${candidate.name}`}
        accessibilityLabel={t('staff.hire_button')}
      />
    </Card>
  );
}

export function StaffScreen() {
  const { playerClubId, playerClub, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [openRole, setOpenRole] = useState<StaffRole | null>(null);
  const [hireError, setHireError] = useState<string | null>(null);
  const { t } = useTranslation();
  const saveId = currentSave?.id;

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId == null || saveId == null) return;
    const loaded = await getStaffByClub(dbHandle, saveId, playerClubId);
    setStaff(loaded);
  }, [dbHandle, playerClubId, saveId]);

  useEffect(() => {
    load();
  }, [load, week]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const candidatesForRole = useCallback(
    (role: StaffRole): StaffCandidate[] => {
      const reputation = playerClub?.reputation ?? 50;
      const seed = (saveId ?? 0) * 1000 + ROLE_SEED_INDEX[role] * 100 + week;
      return generateStaffCandidates(role, reputation, new SeededRng(seed));
    },
    [playerClub, saveId, week],
  );

  const handleHire = async (role: StaffRole, candidate: StaffCandidate) => {
    if (!dbHandle || saveId == null || playerClubId == null || !playerClub) return;
    const currentCountForRole = staff.filter((s) => s.role === role).length;
    const result = canHireStaff({
      budget: playerClub.budget,
      wageBudget: playerClub.wageBudget,
      candidateWage: candidate.wage,
      currentCountForRole,
      maxSlots: STAFF_ROLE_LIMITS[role],
    });
    if (!result.ok) {
      setHireError(t(CANNOT_HIRE_KEYS[result.reason!]));
      return;
    }
    // Contratação direta: a escolha do candidato já é explícita, dispensa confirmação.
    setHireError(null);
    await hireStaff(dbHandle, saveId, playerClubId, candidate);
    setOpenRole(null);
    await load();
  };

  const handleFire = async (member: Staff) => {
    if (!dbHandle || saveId == null) return;
    // Ação direta e reversível (pode recontratar), dispensa confirmação.
    await fireStaff(dbHandle, saveId, member.id);
    await load();
  };

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.listContent}>
      <View style={styles.listHeader}>
        <Label>
          {t(staff.length === 1 ? 'staff.count_one' : 'staff.count_other', { count: staff.length })}
        </Label>
      </View>

      {ROLE_ORDER.map((role) => {
        const members = staff.filter((s) => s.role === role);
        const maxSlots = STAFF_ROLE_LIMITS[role];
        const isFull = members.length >= maxSlots;
        const isOpen = openRole === role;
        return (
          <View key={role} style={styles.roleSection}>
            <Label style={styles.sectionTitle}>
              {t(ROLE_LABEL_KEYS[role]).toUpperCase()} ({members.length}/{maxSlots})
            </Label>
            {members.map((m) => (
              <StaffCard key={m.id} item={m} onFire={() => handleFire(m)} />
            ))}
            {!isFull && (
              <Pressable
                style={styles.hireToggle}
                onPress={() => { setHireError(null); setOpenRole(isOpen ? null : role); }}
                accessibilityRole="button"
                accessibilityLabel={t('staff.hire_button')}
                testID={`hire-toggle-${role}`}
              >
                <Body color={colors.primary}>
                  {isOpen ? '−' : '+'} {t('staff.hire_button')}
                </Body>
              </Pressable>
            )}
            {isOpen && hireError && <Caption color={colors.danger} style={styles.hireError}>{hireError}</Caption>}
            {isOpen && !isFull &&
              candidatesForRole(role).map((c) => (
                <CandidateCard key={`${role}-${c.name}`} candidate={c} onHire={() => handleHire(role, c)} />
              ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hireError: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  listHeader: {
    marginBottom: spacing.sm,
  },
  roleSection: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  card: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  candidateCard: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  abilityLabel: {
    minWidth: 50,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  star: {
    fontSize: fontSize.lg,
  },
  starFilled: {
    color: colors.gold,
  },
  starEmpty: {
    color: colors.border,
  },
  abilityNum: {
    marginLeft: spacing.xs,
  },
  hireToggle: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: spacing.sm,
  },
});
