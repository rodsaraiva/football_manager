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
      <Text style={styles.abilityNum}>{ability}/{max}</Text>
    </View>
  );
}

function StaffCard({ item, onFire }: { item: Staff; onFire: () => void }) {
  const { t } = useTranslation();
  const roleLabel = ROLE_LABEL_KEYS[item.role] ? t(ROLE_LABEL_KEYS[item.role]) : item.role;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.staffName}>{item.name}</Text>
          <Text style={styles.staffRole}>{roleLabel}</Text>
        </View>
        <Text style={styles.staffWage}>{t('staff.candidate_wage', { wage: formatWage(item.wage) })}</Text>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.abilityLabel}>{t('staff.ability')}</Text>
        <AbilityStars ability={item.ability} />
      </View>
      <Pressable style={styles.fireBtn} onPress={onFire}>
        <Text style={styles.fireBtnText}>{t('staff.fire_button')}</Text>
      </Pressable>
    </View>
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
    <View style={styles.candidateCard}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.staffName}>{candidate.name}</Text>
          <Text style={styles.candidateMeta}>
            {t('staff.candidate_ability', { ability: candidate.ability })}
          </Text>
        </View>
        <Text style={styles.staffWage}>{t('staff.candidate_wage', { wage: formatWage(candidate.wage) })}</Text>
      </View>
      <Pressable style={styles.hireBtn} onPress={onHire}>
        <Text style={styles.hireBtnText}>{t('staff.hire_button')}</Text>
      </Pressable>
    </View>
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
    // Contratação direta: a escolha do candidato já é explícita. (Alert.alert é
    // no-op no React Native Web, então um confirm via Alert não funcionaria.)
    setHireError(null);
    await hireStaff(dbHandle, saveId, playerClubId, candidate);
    setOpenRole(null);
    await load();
  };

  const handleFire = async (member: Staff) => {
    if (!dbHandle || saveId == null) return;
    // Ação direta (reversível: pode recontratar). Alert.alert é no-op no RN Web.
    await fireStaff(dbHandle, saveId, member.id);
    await load();
  };

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.listContent}>
      <View style={styles.listHeader}>
        <Text style={styles.countText}>
          {t(staff.length === 1 ? 'staff.count_one' : 'staff.count_other', { count: staff.length })}
        </Text>
      </View>

      {ROLE_ORDER.map((role) => {
        const members = staff.filter((s) => s.role === role);
        const maxSlots = STAFF_ROLE_LIMITS[role];
        const isFull = members.length >= maxSlots;
        const isOpen = openRole === role;
        return (
          <View key={role} style={styles.roleSection}>
            <Text style={styles.sectionTitle}>
              {t(ROLE_LABEL_KEYS[role]).toUpperCase()} ({members.length}/{maxSlots})
            </Text>
            {members.map((m) => (
              <StaffCard key={m.id} item={m} onFire={() => handleFire(m)} />
            ))}
            {!isFull && (
              <Pressable
                style={styles.hireToggle}
                onPress={() => { setHireError(null); setOpenRole(isOpen ? null : role); }}
              >
                <Text style={styles.hireToggleText}>
                  {isOpen ? '−' : '+'} {t('staff.hire_button')}
                </Text>
              </Pressable>
            )}
            {isOpen && hireError && <Text style={styles.hireError}>{hireError}</Text>}
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
    color: colors.danger,
    fontSize: fontSize.sm,
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
  countText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roleSection: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  candidateCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardLeft: {
    flex: 1,
  },
  staffName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  staffRole: {
    color: colors.primary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  candidateMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  staffWage: {
    color: colors.warning,
    fontSize: fontSize.md,
    fontWeight: '600',
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
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginLeft: spacing.xs,
  },
  fireBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fireBtnText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
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
  hireToggleText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  hireBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  hireBtnText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
});
