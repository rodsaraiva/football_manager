import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useTranslation, objectiveDescriptor } from '@/i18n';
import { useBoardStore } from '@/store/board-store';
import { useGameStore } from '@/store/game-store';

function reputationLabel(rep: number): string {
  if (rep <= 30) return 'Small Club';
  if (rep <= 55) return 'Mid-Table';
  if (rep <= 70) return 'Established';
  if (rep <= 85) return 'Big Club';
  return 'Elite';
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
        <Text style={styles.label}>CLUB REPUTATION</Text>
        <Text style={styles.bigNumber}>{reputation}</Text>
        <Text style={styles.subLabel}>{reputationLabel(reputation)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>BOARD CONFIDENCE</Text>
        <TrustBar trust={currentTrust} />
        <Text style={styles.subLabel}>{currentTrust}/100</Text>
        {currentTrust < 40 && (
          <Text style={[styles.warning, { color: colors.danger }]}>
            {currentTrust < 20 ? 'Dismissal risk — results needed urgently.' : 'Budget cuts possible — improve results.'}
          </Text>
        )}
        {currentTrust > 80 && (
          <Text style={[styles.warning, { color: colors.success }]}>Board fully backing you — budget boost available.</Text>
        )}
      </View>

      {currentObjective && (
        <View style={styles.card}>
          <Text style={styles.label}>SEASON {season} OBJECTIVE</Text>
          <Text style={styles.objectiveText}>{objDesc && t(objDesc.key, objDesc.vars)}</Text>
        </View>
      )}

      {reputationHistory.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.label}>REPUTATION HISTORY</Text>
          {reputationHistory.slice(0, 5).map((entry) => (
            <View key={entry.id} style={styles.historyRow}>
              <Text style={styles.historySeason}>Season {entry.season}</Text>
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
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1 },
  bigNumber: { color: colors.primary, fontSize: 56, fontWeight: '900', textAlign: 'center' },
  subLabel: { color: colors.text, fontSize: fontSize.sm, textAlign: 'center' },
  objectiveText: { color: colors.text, fontSize: fontSize.md },
  warning: { fontSize: fontSize.sm, marginTop: spacing.xs },
  trustBarRow: { flexDirection: 'row', gap: spacing.xs, marginVertical: spacing.xs },
  trustSegment: {
    flex: 1, height: 12, borderRadius: 4,
    backgroundColor: colors.border ?? '#333',
  },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border ?? '#222',
  },
  historySeason: { color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 },
  historyRep: { color: colors.text, fontSize: fontSize.sm, width: 40, textAlign: 'center' },
  historyDelta: { fontSize: fontSize.sm, width: 40, textAlign: 'right' },
});
