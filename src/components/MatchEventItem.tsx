import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '@/theme';
import { MatchEventType } from '@/types/match';

interface MatchEventItemProps {
  minute: number;
  type: MatchEventType;
  playerName: string;
  secondaryPlayerName?: string;
}

const EVENT_ICONS: Record<MatchEventType, string> = {
  goal: '⚽',
  assist: '👟',
  yellow: '🟨',
  red: '🟥',
  substitution: '🔄',
  injury: '🏥',
  penalty_scored: '⚽(P)',
  penalty_missed: '❌(P)',
};

export default function MatchEventItem({
  minute,
  type,
  playerName,
  secondaryPlayerName,
}: MatchEventItemProps) {
  const icon = EVENT_ICONS[type];

  return (
    <View style={styles.container}>
      <Text style={styles.minute}>{minute}&apos;</Text>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.names}>
        <Text style={styles.playerName}>{playerName}</Text>
        {secondaryPlayerName ? (
          <Text style={styles.secondaryName}>{secondaryPlayerName}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  minute: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    width: 32,
    textAlign: 'right',
    marginRight: spacing.sm,
  },
  icon: {
    fontSize: fontSize.md,
    width: 32,
    textAlign: 'center',
    marginRight: spacing.sm,
  },
  names: {
    flex: 1,
  },
  playerName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  secondaryName: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
});
