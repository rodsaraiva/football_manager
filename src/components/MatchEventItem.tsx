import React from 'react';
import { View } from 'react-native';
import { colors, fontSize, spacing } from '@/theme';
import { Icon } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Body, Label, Caption } from '@/components/typography';
import { MatchEventType } from '@/types/match';

interface MatchEventItemProps {
  minute: number;
  type: MatchEventType;
  playerName: string;
  secondaryPlayerName?: string;
}

interface EventGlyph {
  icon: IconName;
  color: string;
  suffix?: string;
}

const EVENT_GLYPHS: Record<MatchEventType, EventGlyph> = {
  goal: { icon: 'goal', color: colors.text },
  assist: { icon: 'assist', color: colors.textSecondary },
  yellow: { icon: 'yellow', color: colors.warning },
  red: { icon: 'red', color: colors.danger },
  substitution: { icon: 'sub', color: colors.textSecondary },
  injury: { icon: 'injury', color: colors.danger },
  penalty_scored: { icon: 'goal', color: colors.text, suffix: '(P)' },
  penalty_missed: { icon: 'close', color: colors.danger, suffix: '(P)' },
  free_kick_scored: { icon: 'goal', color: colors.text, suffix: '(FK)' },
  free_kick_missed: { icon: 'close', color: colors.danger, suffix: '(FK)' },
  shot_on_target: { icon: 'target', color: colors.textSecondary },
  shot_off_target: { icon: 'target', color: colors.textMuted },
  save: { icon: 'glove', color: colors.textSecondary },
  penalty_shootout: { icon: 'goal', color: colors.text },
  // L2 Fase 6: eventos de fase descritivos (timeline detalhada / PassNetwork futura).
  tackle: { icon: 'shield', color: colors.textMuted },
  key_pass: { icon: 'assist', color: colors.textMuted },
  recovery: { icon: 'shield', color: colors.textMuted },
  possession_change: { icon: 'arrowRight', color: colors.textMuted },
};

export default function MatchEventItem({
  minute,
  type,
  playerName,
  secondaryPlayerName,
}: MatchEventItemProps) {
  const glyph = EVENT_GLYPHS[type];

  return (
    <View style={styles.container}>
      <Label style={styles.minute}>{minute}&apos;</Label>
      <View style={styles.icon}>
        <Icon name={glyph.icon} color={glyph.color} size={fontSize.lg} />
        {glyph.suffix != null && <Caption color={glyph.color}>{glyph.suffix}</Caption>}
      </View>
      <View style={styles.names}>
        <Body>{playerName}</Body>
        {secondaryPlayerName ? (
          <Caption>{secondaryPlayerName}</Caption>
        ) : null}
      </View>
    </View>
  );
}

const styles = {
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  minute: {
    width: spacing.xl,
    textAlign: 'right' as const,
    marginRight: spacing.sm,
  },
  icon: {
    width: spacing.xl,
    alignItems: 'center' as const,
    marginRight: spacing.sm,
  },
  names: {
    flex: 1,
  },
};
