import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View, StyleSheet } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, Button, EmptyState, useConfirm } from '@/components/kit';
import { Body, Label, Caption, Stat } from '@/components/typography';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getActiveLoansByParent, recallLoan } from '@/database/queries/transfers';
import { buildLoanPortfolio, LoanPortfolioEntry } from '@/engine/transfer/loan-portfolio';

export function LoanPortfolioScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const confirm = useConfirm();
  const playerClubId = useGameStore((s) => s.playerClubId);
  const season = useGameStore((s) => s.season);
  const week = useGameStore((s) => s.week);
  const currentSave = useGameStore((s) => s.currentSave);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const saveId = currentSave?.id;

  const [entries, setEntries] = useState<LoanPortfolioEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId === null || saveId == null) { setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await getActiveLoansByParent(dbHandle, saveId, playerClubId);
      setEntries(buildLoanPortfolio(rows, season, week));
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, saveId, season, week]);

  useEffect(() => { load(); }, [load]);

  const handleRecall = useCallback(async (entry: LoanPortfolioEntry) => {
    if (!dbHandle || playerClubId === null || saveId == null) return;
    const ok = await confirm({
      title: t('loan_portfolio.recall'),
      message: t('loan_portfolio.recall_confirm', { name: entry.name }),
      confirmLabel: t('loan_portfolio.recall'),
    });
    if (!ok) return;
    await recallLoan(dbHandle, saveId, entry.playerId, playerClubId);
    await load();
  }, [dbHandle, playerClubId, saveId, confirm, t, load]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={commonStyles.screen}>
        <EmptyState art="squad" title={t('loan_portfolio.empty')} accent={accent.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={commonStyles.screen}
      contentContainerStyle={styles.list}
      data={entries}
      keyExtractor={(e) => String(e.playerId)}
      renderItem={({ item }) => (
        <Card variant="detail" accent={accent.accent} style={styles.card}>
          <Body numberOfLines={1} style={styles.name}>{item.name}</Body>
          <Caption color={colors.textMuted}>{item.loanClubName}</Caption>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Label color={colors.textMuted}>{t('loan_portfolio.appearances')}</Label>
              <Stat>{item.appearances}</Stat>
            </View>
            <View style={styles.stat}>
              <Label color={colors.textMuted}>{t('loan_portfolio.avg_rating')}</Label>
              <Stat>{item.avgRating.toFixed(1)}</Stat>
            </View>
            <View style={styles.stat}>
              <Label color={colors.textMuted}>{t('loan_portfolio.minutes')}</Label>
              <Stat>{item.minutesPlayed}</Stat>
            </View>
          </View>
          {item.recallEligible ? (
            <Button
              label={t('loan_portfolio.recall')}
              variant="secondary"
              onPress={() => handleRecall(item)}
              testID={`loan-recall-${item.playerId}`}
              accessibilityLabel={t('loan_portfolio.recall')}
            />
          ) : (
            <Caption color={colors.textMuted} style={styles.unavailable}>
              {t('loan_portfolio.recall_unavailable')}
            </Caption>
          )}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl },
  card: { marginBottom: spacing.sm, gap: spacing.xs },
  name: { fontWeight: '600' },
  stats: { flexDirection: 'row', gap: spacing.lg, marginVertical: spacing.sm },
  stat: { alignItems: 'flex-start' },
  unavailable: { fontStyle: 'italic', marginTop: spacing.xs },
});
