import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';
import { commonStyles } from '@/theme';
import { useTranslation, objectiveDescriptor } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useBoardStore } from '@/store/board-store';
import { useGameStore } from '@/store/game-store';
import { Card } from '@/components/kit';
import StatBar from '@/components/StatBar';
import { Label, Body, Caption, Stat } from '@/components/typography';

function reputationLabelKey(rep: number): TKey {
  if (rep <= 30) return 'board.rep_small';
  if (rep <= 55) return 'board.rep_mid';
  if (rep <= 70) return 'board.rep_established';
  if (rep <= 85) return 'board.rep_big';
  return 'board.rep_elite';
}

export function BoardScreen() {
  const { currentObjective, currentTrust, reputationHistory } = useBoardStore();
  const { playerClub, season } = useGameStore();
  const { t } = useTranslation();

  const reputation = playerClub?.reputation ?? 50;
  const objDesc = currentObjective ? objectiveDescriptor(currentObjective.type, currentObjective.target) : null;
  const trustColor = currentTrust < 40 ? colors.danger : currentTrust < 80 ? colors.warning : colors.success;

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <Card variant="summary" style={styles.card}>
        <Label>{t('board.reputation')}</Label>
        <Stat color={colors.primary} style={styles.bigNumber}>{reputation}</Stat>
        <Body style={styles.center}>{t(reputationLabelKey(reputation))}</Body>
      </Card>

      <Card variant="summary" style={styles.card}>
        <Label>{t('board.confidence')}</Label>
        <StatBar value={currentTrust} maxValue={100} color={trustColor} valueText={`${currentTrust}/100`} />
        {currentTrust < 40 && (
          <Caption color={colors.danger}>
            {currentTrust < 20 ? t('board.trust_dismissal') : t('board.trust_budget_cut')}
          </Caption>
        )}
        {currentTrust > 80 && (
          <Caption color={colors.success}>{t('board.trust_backing')}</Caption>
        )}
      </Card>

      {currentObjective && (
        <Card variant="summary" style={styles.card}>
          <Label>{t('board.objective', { season })}</Label>
          <Body>{objDesc && t(objDesc.key, objDesc.vars)}</Body>
        </Card>
      )}

      {reputationHistory.length > 0 && (
        <Card variant="summary" style={styles.card}>
          <Label>{t('board.reputation_history')}</Label>
          {reputationHistory.slice(0, 5).map((entry) => (
            <View key={entry.id} style={styles.historyRow}>
              <Body color={colors.textSecondary} style={styles.historySeason}>
                {t('standings.season', { season: entry.season })}
              </Body>
              <Stat style={styles.historyRep}>{entry.reputation}</Stat>
              <Stat
                color={entry.delta >= 0 ? colors.success : colors.danger}
                style={styles.historyDelta}
              >
                {entry.delta >= 0 ? `+${entry.delta}` : `${entry.delta}`}
              </Stat>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.xs },
  center: { textAlign: 'center' },
  bigNumber: { textAlign: 'center' },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  historySeason: { flex: 1 },
  historyRep: { width: 40, textAlign: 'center' },
  historyDelta: { width: 40, textAlign: 'right' },
});
