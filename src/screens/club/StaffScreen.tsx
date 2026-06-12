import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ListRenderItemInfo,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getStaffByClub } from '@/database/queries/staff';
import { Staff, StaffRole } from '@/types';

const ROLE_LABEL_KEYS: Record<StaffRole, TKey> = {
  scout: 'staff.role_scout',
  physio: 'staff.role_physio',
  assistant: 'staff.role_assistant',
  youth_coach: 'staff.role_youth_coach',
  fitness_coach: 'staff.role_fitness_coach',
};

function formatWage(wage: number): string {
  if (wage >= 1_000) {
    return `$${(wage / 1_000).toFixed(0)}K/wk`;
  }
  return `$${wage}/wk`;
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

function StaffCard({ item }: { item: Staff }) {
  const { t } = useTranslation();
  const roleLabel = ROLE_LABEL_KEYS[item.role] ? t(ROLE_LABEL_KEYS[item.role]) : item.role;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.staffName}>{item.name}</Text>
          <Text style={styles.staffRole}>{roleLabel}</Text>
        </View>
        <Text style={styles.staffWage}>{formatWage(item.wage)}</Text>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.abilityLabel}>{t('staff.ability')}</Text>
        <AbilityStars ability={item.ability} />
      </View>
    </View>
  );
}

export function StaffScreen() {
  const { playerClubId, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [staff, setStaff] = useState<Staff[]>([]);
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

  function renderItem({ item }: ListRenderItemInfo<Staff>) {
    return <StaffCard item={item} />;
  }

  return (
    <View style={commonStyles.screen}>
      <FlatList
        data={staff}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.countText}>
              {t(staff.length === 1 ? 'staff.count_one' : 'staff.count_other', { count: staff.length })}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('staff.empty')}</Text>
          </View>
        }
        ListFooterComponent={
          <View style={[styles.hireButton, styles.hireButtonDisabled]}>
            <Text style={styles.hireButtonTextDisabled}>{t('staff.hire_coming_soon')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  hireButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  hireButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  hireButtonDisabled: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  hireButtonTextDisabled: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
});
