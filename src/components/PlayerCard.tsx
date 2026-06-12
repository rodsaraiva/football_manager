import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, commonStyles, fontSize, radius, spacing } from '@/theme';
import { useTranslation } from '@/i18n';
import { getPositionColor, getOverallColor } from '@/utils/player-colors';
import { Position } from '@/types/player';

interface PlayerCardProps {
  name: string;
  position: Position;
  overall: number;
  age: number;
  morale?: number;
  fitness?: number;
  onPress?: () => void;
}

export default function PlayerCard({
  name,
  position,
  overall,
  age,
  onPress,
}: PlayerCardProps) {
  const { t } = useTranslation();
  const positionColor = getPositionColor(position);
  const overallColor = getOverallColor(overall);

  return (
    <Pressable
      style={({ pressed }) => [commonStyles.card, styles.card, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.positionBadge}>
        <Text style={[styles.positionText, { color: positionColor }]}>{position}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.age}>{t('tactics.detail_age', { age })}</Text>
      </View>
      <View style={[styles.overallBadge, { borderColor: overallColor }]}>
        <Text style={[styles.overallText, { color: overallColor }]}>{overall}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.75,
  },
  positionBadge: {
    width: 44,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  positionText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  info: {
    flex: 1,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  age: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  overallBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  overallText: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
  },
});
