import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation, objectiveDescriptor } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useBoardStore } from '@/store/board-store';
import { useGameStore } from '@/store/game-store';

function reputationLabelKey(rep: number): TKey {
  if (rep <= 30) return 'board.rep_small';
  if (rep <= 55) return 'board.rep_mid';
  if (rep <= 70) return 'board.rep_established';
  if (rep <= 85) return 'board.rep_big';
  return 'board.rep_elite';
}

function TrustBar({ trust }: { trust: number }) {
  const segments = 5;
  const filled = Math.round((trust / 100) * segments);
  return (
    <View style={styles.trustBarRow}>
      {Array.from({ length: segments }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.trustSegment,
            i < filled && { backgroundColor: trust < 40 ? colors.danger : trust < 80 ? colors.warning : colors.success },
          ]}
        />
      ))}
    </View>
  );
}

export function BoardScreen() {
  const { currentObjective, currentTrust, reputationHistory } = useBoardStore();
  const { playerClub, season } = useGameStore();
  const { t } = useTranslation();

  const reputation = playerClub?.reputation ?? 50;
  const objDesc = currentObjective ? objectiveDescriptor(currentObjective.type, currentObjective.target) : null;

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>{t('board.reputation')}</Text>
        <Text style={styles.bigNumber}>{reputation}</Text>
        <Text style={styles.subLabel}>{t(reputationLabelKey(reputation))}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t('board.confidence')}</Text>
        <TrustBar trust={currentTrust} />
        <Text style={styles.subLabel}>{currentTrust}/100</Text>
        {currentTrust < 40 && (
          <Text style={[styles.warning, { color: colors.danger }]}>
            {currentTrust < 20 ? t('board.trust_dismissal') : t('board.trust_budget_cut')}
          </Text>
        )}
        {currentTrust > 80 && (
          <Text style={[styles.warning, { color: colors.success }]}>{t('board.trust_backing')}</Text>
        )}
      </View>

      {currentObjective && (
        <View style={styles.card}>
          <Text style={styles.label}>{t('board.objective', { season })}</Text>
          <Text style={styles.objectiveText}>{objDesc && t(objDesc.key, objDesc.vars)}</Text>
        </View>
      )}

      {reputationHistory.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>{t('board.reputation_history')}</Text>
          {reputationHistory.slice(0, 5).map((entry) => (
            <View key={entry.id} style={styles.historyRow}>
              <Text style={styles.historySeason}>{t('standings.season', { season: entry.season })}</Text>
              <Text style={styles.historyRep}>{entry.reputation}</Text>
              <Text style={[styles.historyDelta, { color: entry.delta >= 0 ? colors.success : colors.danger }]}>
                {entry.delta >= 0 ? `+${entry.delta}` : `${entry.delta}`}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1 },
  bigNumber: { color: colors.primary, fontSize: fontSize.display, fontWeight: '900', textAlign: 'center' },
  subLabel: { color: colors.text, fontSize: fontSize.sm, textAlign: 'center' },
  objectiveText: { color: colors.text, fontSize: fontSize.md },
  warning: { fontSize: fontSize.sm, marginTop: spacing.xs },
  trustBarRow: { flexDirection: 'row', gap: spacing.xs, marginVertical: spacing.xs },
  trustSegment: {
    flex: 1, height: 12, borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  historySeason: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },
  historyRep: { color: colors.text, fontSize: fontSize.sm, width: 40, textAlign: 'center' },
  historyDelta: { fontSize: fontSize.sm, width: 40, textAlign: 'right' },
});
