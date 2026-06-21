import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { colors, fontSize, radius, spacing } from '@/theme';
import { resolveStatBar } from './kit/statBarStyle';

interface StatBarProps { label: string; value: number; maxValue?: number; }

const BAR_HEIGHT = 6;

export default function StatBar({ label, value, maxValue = 99 }: StatBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const { fillPercent, colorStart, colorEnd, valueColor } = resolveStatBar(value, maxValue);
  const gradId = `sb-${Math.round(value)}-${Math.round(maxValue)}`;
  const fillWidth = (trackWidth * fillPercent) / 100;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.barContainer}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {trackWidth > 0 && (
          <Svg width={trackWidth} height={BAR_HEIGHT}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colorStart} />
                <Stop offset="1" stopColor={colorEnd} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={fillWidth} height={BAR_HEIGHT} rx={radius.sm} fill={`url(#${gradId})`} />
          </Svg>
        )}
      </View>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xs },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, width: 90 },
  barContainer: {
    flex: 1, height: BAR_HEIGHT, backgroundColor: colors.border,
    borderRadius: radius.sm, overflow: 'hidden', marginHorizontal: spacing.sm, justifyContent: 'center',
  },
  value: { fontSize: fontSize.sm, fontWeight: '600', width: 26, textAlign: 'right' },
});
