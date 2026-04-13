import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '@/theme';
import { StandingsEntry } from '@/engine/competition/standings';

interface StandingsTableProps {
  entries: StandingsEntry[];
  highlightClubId?: number;
  clubNames?: Record<number, string>;
}

const COL_WIDTHS = {
  rank: 28,
  club: 0, // flex: 1
  stat: 28,
  pts: 34,
};

function HeaderCell({ label, flex, width }: { label: string; flex?: number; width?: number }) {
  return (
    <Text
      style={[
        styles.headerCell,
        flex !== undefined ? { flex } : { width },
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
}

function Cell({
  value,
  flex,
  width,
  bold,
  color,
}: {
  value: string | number;
  flex?: number;
  width?: number;
  bold?: boolean;
  color?: string;
}) {
  return (
    <Text
      style={[
        styles.cell,
        flex !== undefined ? { flex } : { width },
        bold && styles.bold,
        color ? { color } : undefined,
      ]}
      numberOfLines={1}
    >
      {value}
    </Text>
  );
}

export default function StandingsTable({
  entries,
  highlightClubId,
  clubNames,
}: StandingsTableProps) {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.headerRow}>
        <HeaderCell label="#" width={COL_WIDTHS.rank} />
        <HeaderCell label="Club" flex={1} />
        <HeaderCell label="P" width={COL_WIDTHS.stat} />
        <HeaderCell label="W" width={COL_WIDTHS.stat} />
        <HeaderCell label="D" width={COL_WIDTHS.stat} />
        <HeaderCell label="L" width={COL_WIDTHS.stat} />
        <HeaderCell label="GF" width={COL_WIDTHS.stat} />
        <HeaderCell label="GA" width={COL_WIDTHS.stat} />
        <HeaderCell label="GD" width={COL_WIDTHS.stat} />
        <HeaderCell label="Pts" width={COL_WIDTHS.pts} />
      </View>

      {/* Rows */}
      {entries.map((entry, index) => {
        const isHighlighted = entry.clubId === highlightClubId;
        const clubName = clubNames?.[entry.clubId] ?? `Club ${entry.clubId}`;
        const gdStr = entry.goalDifference > 0 ? `+${entry.goalDifference}` : String(entry.goalDifference);

        return (
          <View
            key={entry.clubId}
            style={[styles.row, isHighlighted && styles.highlightedRow]}
          >
            <Cell value={index + 1} width={COL_WIDTHS.rank} color={colors.textMuted} />
            <Cell value={clubName} flex={1} bold={isHighlighted} color={isHighlighted ? colors.primaryLight : colors.text} />
            <Cell value={entry.played} width={COL_WIDTHS.stat} />
            <Cell value={entry.wins} width={COL_WIDTHS.stat} color={colors.success} />
            <Cell value={entry.draws} width={COL_WIDTHS.stat} color={colors.textSecondary} />
            <Cell value={entry.losses} width={COL_WIDTHS.stat} color={colors.danger} />
            <Cell value={entry.goalsFor} width={COL_WIDTHS.stat} />
            <Cell value={entry.goalsAgainst} width={COL_WIDTHS.stat} />
            <Cell value={gdStr} width={COL_WIDTHS.stat} color={entry.goalDifference >= 0 ? colors.success : colors.danger} />
            <Cell value={entry.points} width={COL_WIDTHS.pts} bold color={isHighlighted ? colors.primaryLight : colors.text} />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCell: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  highlightedRow: {
    backgroundColor: `${colors.primary}22`,
  },
  cell: {
    color: colors.text,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  bold: {
    fontWeight: 'bold',
  },
});
