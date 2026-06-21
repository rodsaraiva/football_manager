import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { colors, fontSize, radius, spacing } from '@/theme';
import { resolveStatBar } from './kit/statBarStyle';
import { useClubAccentRampOptional } from '@/theme/ClubAccentProvider';

interface StatBarProps {
  label?: string;
  value: number;
  maxValue?: number;
  tone?: 'rating' | 'accent';
  // Sobrescreve a cor do gradiente (mantém o start clareado via mixWithWhite).
  // Usado quando a cor é semântica (moral/fit/linha) em vez de derivada do rating.
  color?: string;
  // Renderiza só a barra (sem label nem value), para embutir em linhas customizadas.
  barOnly?: boolean;
  // Altura customizada da barra (default 6).
  height?: number;
  // Sobrescreve o texto do value (ex: avg com 1 casa). Ignorado em barOnly.
  valueText?: string;
}

const BAR_HEIGHT = 6;

export default function StatBar({
  label,
  value,
  maxValue = 99,
  tone = 'rating',
  color,
  barOnly = false,
  height,
  valueText,
}: StatBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const ramp = useClubAccentRampOptional();
  const accentOverride = color ?? (tone === 'accent' ? ramp?.accent : undefined);
  const { fillPercent, colorStart, colorEnd, valueColor } = resolveStatBar(value, maxValue, accentOverride);
  const barHeight = height ?? BAR_HEIGHT;
  const gradId = `sb-${Math.round(value)}-${Math.round(maxValue)}-${Math.round(fillPercent)}`;
  const fillWidth = (trackWidth * fillPercent) / 100;

  const bar = (
    <View
      style={[styles.barContainer, { height: barHeight }, barOnly && styles.barContainerFlush]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {trackWidth > 0 && (
        <Svg width={trackWidth} height={barHeight}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colorStart} />
              <Stop offset="1" stopColor={colorEnd} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={fillWidth} height={barHeight} rx={radius.sm} fill={`url(#${gradId})`} />
        </Svg>
      )}
    </View>
  );

  if (barOnly) return bar;

  return (
    <View style={styles.container}>
      {label != null && <Text style={styles.label}>{label}</Text>}
      {bar}
      <Text style={[styles.value, { color: valueColor }]}>{valueText ?? value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xs },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, width: 90 },
  barContainer: {
    flex: 1, backgroundColor: colors.border,
    borderRadius: radius.sm, overflow: 'hidden', marginHorizontal: spacing.sm, justifyContent: 'center',
  },
  barContainerFlush: { marginHorizontal: 0 },
  value: { fontSize: fontSize.sm, fontWeight: '600', width: 26, textAlign: 'right' },
});
