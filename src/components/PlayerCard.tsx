import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { spacing } from '@/theme';
import { useTranslation } from '@/i18n';
import { getPositionColor, getOverallColor } from '@/utils/player-colors';
import { Position } from '@/types/player';
import { Card, Badge } from '@/components/kit';
import { Body, Caption, Stat } from '@/components/typography';

interface PlayerCardProps {
  name: string;
  position: Position;
  overall: number;
  age: number;
  morale?: number;
  fitness?: number;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}

export default function PlayerCard({
  name,
  position,
  overall,
  age,
  onPress,
  testID,
  accessibilityLabel,
}: PlayerCardProps) {
  const { t } = useTranslation();
  const positionColor = getPositionColor(position);
  const overallColor = getOverallColor(overall);

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card variant="summary" accent={positionColor} style={styles.card}>
        <View style={styles.position}>
          <Badge value={position} tone="neutral" accent={positionColor} size="sm" />
        </View>
        <View style={styles.info}>
          <Body numberOfLines={1}>{name}</Body>
          <Caption>{t('tactics.detail_age', { age })}</Caption>
        </View>
        <Stat color={overallColor}>{overall}</Stat>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.75,
  },
  position: {
    alignItems: 'center',
  },
  info: {
    flex: 1,
  },
});
