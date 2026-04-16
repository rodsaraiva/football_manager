/**
 * RadarChart — pure SVG spider chart via react-native-svg.
 *
 * Props:
 *   profiles  — up to 2 profiles to overlay
 *   axisLabels — labels for each axis (length must match values[])
 *   size       — chart square side in dp (default 300)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors, fontSize, spacing } from '@/theme';

export interface RadarProfile {
  label: string;
  color: string;
  values: number[]; // 0-100 per axis
}

interface RadarChartProps {
  profiles: RadarProfile[];
  axisLabels: string[];
  size?: number;
  maxValue?: number;
}

const DEFAULT_SIZE = 300;
const RING_COUNT = 5;

function toXY(angle: number, radius: number, cx: number, cy: number): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function RadarChart({ profiles, axisLabels, size = DEFAULT_SIZE, maxValue = 100 }: RadarChartProps) {
  const n = axisLabels.length;
  if (n === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  // Leave padding for axis labels
  const outerRadius = size * 0.35;
  const labelRadius = size * 0.47;

  // Angles start at top (-90°) and go clockwise
  const angles = axisLabels.map((_, i) => (2 * Math.PI * i) / n - Math.PI / 2);

  // Build ring polygon points strings
  const ringPoints = Array.from({ length: RING_COUNT }, (_, r) => {
    const frac = (r + 1) / RING_COUNT;
    return angles
      .map((a) => {
        const { x, y } = toXY(a, frac * outerRadius, cx, cy);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });

  // Build profile polygon points
  const profilePoints = profiles.map((prof) =>
    angles
      .map((a, i) => {
        const v = prof.values[i] ?? 0;
        const frac = Math.max(0, Math.min(1, v / maxValue));
        const { x, y } = toXY(a, frac * outerRadius, cx, cy);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' '),
  );

  return (
    <View>
      <Svg width={size} height={size}>
        {/* Background rings */}
        {ringPoints.map((pts, r) => (
          <Polygon
            key={`ring-${r}`}
            points={pts}
            fill="none"
            stroke={colors.border}
            strokeWidth={1}
          />
        ))}

        {/* Spokes */}
        {angles.map((a, i) => {
          const outer = toXY(a, outerRadius, cx, cy);
          return (
            <Line
              key={`spoke-${i}`}
              x1={cx}
              y1={cy}
              x2={outer.x}
              y2={outer.y}
              stroke={colors.border}
              strokeWidth={0.8}
            />
          );
        })}

        {/* Center dot */}
        <Circle cx={cx} cy={cy} r={2} fill={colors.textMuted} />

        {/* Profile polygons */}
        {profiles.map((prof, pi) => (
          <Polygon
            key={`prof-${pi}`}
            points={profilePoints[pi]}
            fill={prof.color}
            fillOpacity={0.2}
            stroke={prof.color}
            strokeWidth={2}
          />
        ))}

        {/* Axis labels */}
        {angles.map((a, i) => {
          const { x, y } = toXY(a, labelRadius, cx, cy);
          // Determine text anchor based on position
          let textAnchor: 'middle' | 'start' | 'end' = 'middle';
          const cos = Math.cos(a);
          if (cos > 0.15) textAnchor = 'start';
          else if (cos < -0.15) textAnchor = 'end';

          // Shorten long labels
          const raw = axisLabels[i] ?? '';
          const label = raw.length > 10 ? raw.slice(0, 9) + '.' : raw;

          return (
            <SvgText
              key={`label-${i}`}
              x={x}
              y={y}
              fill={colors.textSecondary}
              fontSize={8}
              textAnchor={textAnchor}
              alignmentBaseline="middle"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        {profiles.map((prof, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: prof.color }]} />
            <Text style={styles.legendLabel}>{prof.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },
});
