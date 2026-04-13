import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubById } from '@/database/queries/clubs';
import { Club } from '@/types';

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

function formatCapacity(n: number): string {
  return n.toLocaleString();
}

function FacilityDots({ level, max = 5 }: { level: number; max?: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: max }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < level ? styles.dotFilled : styles.dotEmpty,
          ]}
        />
      ))}
    </View>
  );
}

function ReputationBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(1, Math.max(0, value / max));
  return (
    <View style={styles.repBarTrack}>
      <View style={[styles.repBarFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

interface InfoCardProps {
  label: string;
  children: React.ReactNode;
}

function InfoCard({ label, children }: InfoCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function ClubOverviewScreen() {
  const { playerClubId } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [club, setClub] = useState<Club | null>(null);

  useEffect(() => {
    if (!dbHandle || playerClubId == null) return;
    const loaded = getClubById(dbHandle, playerClubId);
    setClub(loaded);
  }, [dbHandle, playerClubId]);

  if (!club) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.emptyText}>Loading club data...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Club name header */}
      <View style={styles.header}>
        <Text style={styles.clubName}>{club.name}</Text>
        <Text style={styles.clubShort}>{club.shortName}</Text>
      </View>

      {/* Balance */}
      <InfoCard label="BUDGET">
        <Text style={styles.balanceAmount}>{formatCurrency(club.budget)}</Text>
        <Text style={styles.subtext}>Wage budget: {formatCurrency(club.wageBudget)} / wk</Text>
      </InfoCard>

      {/* Stadium */}
      <InfoCard label="STADIUM">
        <Text style={styles.value}>{club.stadiumName}</Text>
        <Text style={styles.subtext}>Capacity: {formatCapacity(club.stadiumCapacity)}</Text>
      </InfoCard>

      {/* Facilities */}
      <InfoCard label="FACILITIES">
        <View style={styles.facilityRow}>
          <Text style={styles.facilityName}>Training</Text>
          <View style={styles.facilityRight}>
            <Text style={styles.facilityLevel}>Lv. {club.trainingFacilities}/5</Text>
            <FacilityDots level={club.trainingFacilities} />
          </View>
        </View>
        <View style={[styles.facilityRow, styles.facilityRowBorder]}>
          <Text style={styles.facilityName}>Youth Academy</Text>
          <View style={styles.facilityRight}>
            <Text style={styles.facilityLevel}>Lv. {club.youthAcademy}/5</Text>
            <FacilityDots level={club.youthAcademy} />
          </View>
        </View>
        <View style={styles.facilityRow}>
          <Text style={styles.facilityName}>Medical</Text>
          <View style={styles.facilityRight}>
            <Text style={styles.facilityLevel}>Lv. {club.medicalDepartment}/5</Text>
            <FacilityDots level={club.medicalDepartment} />
          </View>
        </View>
      </InfoCard>

      {/* Reputation */}
      <InfoCard label="REPUTATION">
        <Text style={styles.value}>{club.reputation} / 100</Text>
        <ReputationBar value={club.reputation} />
      </InfoCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  header: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    margin: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clubName: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  clubShort: {
    color: colors.primary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
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
  cardLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  balanceAmount: {
    color: colors.success,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  value: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  subtext: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  facilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  facilityRowBorder: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  facilityName: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  facilityRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  facilityLevel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    minWidth: 50,
    textAlign: 'right',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotFilled: {
    backgroundColor: colors.primary,
  },
  dotEmpty: {
    backgroundColor: colors.border,
  },
  repBarTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  repBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
});
