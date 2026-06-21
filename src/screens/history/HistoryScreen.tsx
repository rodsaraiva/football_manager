import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getSeasonSummary, SeasonCompetitionSummary } from '@/database/queries/history';
import { Card, Chip, EmptyState } from '@/components/kit';
import { Title, Body, Label } from '@/components/typography';

export function HistoryScreen() {
  const { t } = useTranslation();
  const { accent } = useClubAccent();
  const { season: currentSeason, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;

  const defaultSeason = currentSeason > 1 ? currentSeason - 1 : 1;
  const [selectedSeason, setSelectedSeason] = useState<number>(defaultSeason);
  const [summary, setSummary] = useState<SeasonCompetitionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const seasons: number[] = [];
  for (let s = 1; s < currentSeason; s++) seasons.push(s);

  useEffect(() => {
    if (!dbHandle || saveId == null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const data = await getSeasonSummary(dbHandle, saveId, selectedSeason);
      if (!cancelled) {
        setSummary(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbHandle, saveId, selectedSeason]);

  if (seasons.length === 0) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <EmptyState art="generic" title={t('history.no_seasons')} />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {seasons.map((s) => (
          <Chip
            key={s}
            label={t('standings.season', { season: s })}
            selected={selectedSeason === s}
            accent={accent}
            onPress={() => setSelectedSeason(s)}
            testID={`history-season-${s}`}
          />
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : summary.length === 0 ? (
        <View style={styles.center}>
          <EmptyState art="search" title={t('history.no_data', { season: selectedSeason })} />
        </View>
      ) : (
        summary.map((entry) => (
          <SummaryCard key={entry.competitionId} entry={entry} />
        ))
      )}
    </ScrollView>
  );
}

function SummaryCard({ entry }: { entry: SeasonCompetitionSummary }) {
  const { t } = useTranslation();
  const topScorer = entry.topScorers[0] ?? null;
  const topAssister = entry.topAssisters[0] ?? null;

  return (
    <Card variant="detail" style={styles.card}>
      <View style={styles.cardHeader}>
        <Title>{entry.competitionName || `Competition ${entry.competitionId}`}</Title>
      </View>

      <View style={styles.section}>
        <Row label={t('history.champion')} value={`Club ${entry.championClubId}`} valueColor={colors.gold} />
        {entry.runnerUpClubId != null && (
          <Row label={t('history.runner_up')} value={`Club ${entry.runnerUpClubId}`} valueColor={colors.silver} />
        )}
      </View>

      {(topScorer || topAssister || entry.mvp || entry.breakthrough) && (
        <View style={[styles.section, styles.sectionBorder]}>
          <Label>{t('history.awards')}</Label>
          {topScorer && (
            <Row
              label={t('history.top_scorer')}
              value={`Player ${topScorer.playerId} — ${topScorer.value} goals`}
              valueColor={colors.text}
            />
          )}
          {topAssister && (
            <Row
              label={t('history.top_assister')}
              value={`Player ${topAssister.playerId} — ${topAssister.value} assists`}
              valueColor={colors.text}
            />
          )}
          {entry.mvp && (
            <Row
              label={t('history.mvp')}
              value={`Player ${entry.mvp.playerId}`}
              valueColor={colors.primaryLight}
            />
          )}
          {entry.breakthrough && (
            <Row
              label={t('history.breakthrough')}
              value={`Player ${entry.breakthrough.playerId}`}
              valueColor={colors.success}
            />
          )}
        </View>
      )}

      {entry.relegated.length > 0 && (
        <View style={[styles.section, styles.sectionBorder]}>
          <Label>{t('history.relegated')}</Label>
          {entry.relegated.map((rel) => (
            <Row
              key={rel.clubId}
              label={`${rel.finalPosition}th`}
              value={`Club ${rel.clubId}`}
              valueColor={colors.danger}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <View style={styles.row}>
      <Body color={colors.textSecondary}>{label}</Body>
      <Body color={valueColor}>{value}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },

  chipRow: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipRowContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },

  card: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  cardHeader: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  section: {
    gap: spacing.xxs,
  },
  sectionBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xxs,
  },
});
