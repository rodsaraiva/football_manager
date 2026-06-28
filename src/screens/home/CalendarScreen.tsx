import React, { useMemo } from 'react';
import { View, FlatList } from 'react-native';
import { colors, spacing, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card } from '@/components/kit';
import { Title, Body, Label, Caption, Stat } from '@/components/typography';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';

interface WeekItem {
  weekNumber: number;
  status: 'past' | 'current' | 'future';
  scoreText?: string;
}

export function CalendarScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
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
    if (status === 'current') return accent.accent;
    if (status === 'past') return colors.textMuted;
    return colors.textSecondary;
  }

  function renderWeekItem({ item }: { item: WeekItem }) {
    const isCurrent = item.status === 'current';

    return (
      <View
        style={[
          styles.weekRow,
          isCurrent && { backgroundColor: colors.surface, borderLeftColor: accent.accent },
        ]}
      >
        <View style={[styles.weekBadge, { backgroundColor: isCurrent ? accent.accent : colors.surfaceLight }]}>
          <Stat color={isCurrent ? accent.onAccent : getStatusColor(item.status)} style={styles.weekNumber}>
            {item.weekNumber}
          </Stat>
        </View>

        <View style={styles.weekContent}>
          <Body color={getStatusColor(item.status)}>
            {t('calendar.week', { n: item.weekNumber })}
          </Body>
          <Caption>
            {item.status === 'past' && item.scoreText
              ? t('calendar.result', { score: item.scoreText })
              : item.status === 'past'
              ? t('calendar.no_fixture')
              : item.status === 'current'
              ? t('calendar.current_week')
              : t('calendar.upcoming')}
          </Caption>
        </View>

        <View style={styles.statusIndicator}>
          {item.status === 'past' && (
            <Label>{item.scoreText ? item.scoreText : '—'}</Label>
          )}
          {item.status === 'current' && (
            <View style={[styles.currentDot, { backgroundColor: accent.accent }]} />
          )}
          {item.status === 'future' && (
            <Caption>{t('calendar.vs_tbd')}</Caption>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <Card variant="summary" accent={accent.accent} style={styles.header}>
        <Title>{t('calendar.header_title', { season })}</Title>
        <Label>{t('calendar.header_sub', { total: weekItems.length, week })}</Label>
      </Card>

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

const styles = {
  header: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingVertical: spacing.xs,
  },
  weekRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  weekBadge: {
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: spacing.md,
  },
  weekNumber: {},
  weekContent: {
    flex: 1,
  },
  statusIndicator: {
    alignItems: 'flex-end' as const,
    minWidth: spacing.xxl,
  },
  currentDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radius.pill,
  },
};
