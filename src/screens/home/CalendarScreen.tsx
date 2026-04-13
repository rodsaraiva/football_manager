import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
} from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';

interface WeekItem {
  weekNumber: number;
  status: 'past' | 'current' | 'future';
  scoreText?: string;
}

export function CalendarScreen() {
  const { week, season, recentResults } = useGameStore();

  const weekItems: WeekItem[] = useMemo(() => {
    return Array.from({ length: 46 }, (_, i) => {
      const weekNumber = i + 1;
      const playedFixture = recentResults.find((f) => f.week === weekNumber && f.played);

      let status: 'past' | 'current' | 'future';
      if (weekNumber < week) status = 'past';
      else if (weekNumber === week) status = 'current';
      else status = 'future';

      let scoreText: string | undefined;
      if (playedFixture && playedFixture.homeGoals != null && playedFixture.awayGoals != null) {
        scoreText = `${playedFixture.homeGoals} - ${playedFixture.awayGoals}`;
      }

      return { weekNumber, status, scoreText };
    });
  }, [week, recentResults]);

  function getStatusColor(status: WeekItem['status']): string {
    if (status === 'current') return colors.primary;
    if (status === 'past') return colors.textMuted;
    return colors.textSecondary;
  }

  function renderWeekItem({ item }: { item: WeekItem }) {
    const isCurrent = item.status === 'current';

    return (
      <View
        style={[
          styles.weekRow,
          isCurrent && styles.weekRowCurrent,
        ]}
      >
        <View style={[styles.weekBadge, isCurrent && styles.weekBadgeCurrent]}>
          <Text style={[styles.weekNumber, { color: isCurrent ? colors.text : getStatusColor(item.status) }]}>
            {item.weekNumber}
          </Text>
        </View>

        <View style={styles.weekContent}>
          <Text style={[styles.weekLabel, { color: getStatusColor(item.status) }]}>
            Week {item.weekNumber}
          </Text>
          <Text style={styles.weekDetail}>
            {item.status === 'past' && item.scoreText
              ? `Result: ${item.scoreText}`
              : item.status === 'past'
              ? 'No fixture'
              : item.status === 'current'
              ? 'Current week'
              : 'Upcoming'}
          </Text>
        </View>

        <View style={styles.statusIndicator}>
          {item.status === 'past' && (
            <Text style={styles.pastIndicator}>
              {item.scoreText ? item.scoreText : '—'}
            </Text>
          )}
          {item.status === 'current' && (
            <View style={styles.currentDot} />
          )}
          {item.status === 'future' && (
            <Text style={styles.futureIndicator}>vs TBD</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Season {season} Calendar</Text>
        <Text style={styles.headerSubtitle}>46 weeks · Week {week} current</Text>
      </View>

      <FlatList
        data={weekItems}
        keyExtractor={(item) => String(item.weekNumber)}
        renderItem={renderWeekItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialScrollIndex={Math.max(0, week - 3)}
        getItemLayout={(_, index) => ({
          length: 64,
          offset: 64 * index,
          index,
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  listContent: {
    paddingVertical: spacing.xs,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  weekRowCurrent: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  weekBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  weekBadgeCurrent: {
    backgroundColor: colors.primary,
  },
  weekNumber: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  weekContent: {
    flex: 1,
  },
  weekLabel: {
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  weekDetail: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  statusIndicator: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  pastIndicator: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  currentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  futureIndicator: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
});
