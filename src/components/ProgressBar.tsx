import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme';
import { useClubAccentContext } from '@/theme/ClubAccentProvider';

interface ProgressBarProps {
  progress: number;
  height?: number;
  trackColor?: string;
  testID?: string;
}

export default function ProgressBar({
  progress,
  height = 6,
  trackColor = colors.border,
  testID,
}: ProgressBarProps): React.JSX.Element {
  const { accent } = useClubAccentContext();
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View testID={testID} style={[styles.track, { height, backgroundColor: trackColor }]}>
      <View style={[styles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', borderRadius: radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.sm },
});
