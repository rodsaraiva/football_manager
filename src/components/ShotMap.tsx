/**
 * ShotMap — finalizações plotadas sobre o Pitch2D. Posição por (x,y) normalizado,
 * RAIO ∝ xG, COR por resultado (gol/no-alvo/fora/defendido). Padrão RadarChart:
 * SVG + tokens + legenda em <View>. Consome só dados já persistidos (sem engine).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Circle } from 'react-native-svg';
import { colors, spacing, radius, fontSize, alpha } from '@/theme';
import { Caption } from '@/components/typography';
import { Pitch2D, pitchGeometry, pitchHeight, projectX, projectY, PITCH_DEFAULT_WIDTH } from './Pitch2D';
import { extractShots, shotColor, ShotResult } from '@/engine/match-2d/view-model';
import { MatchEvent } from '@/types';

const MIN_R = 3;
const R_SCALE = 14; // raio extra por unidade de xG

export interface ShotMapLabels {
  goal: string;
  onTarget: string;
  offTarget: string;
  saved: string;
}

const DEFAULT_LABELS: ShotMapLabels = {
  goal: 'Goal',
  onTarget: 'On target',
  offTarget: 'Off target',
  saved: 'Saved',
};

interface ShotMapProps {
  events: MatchEvent[];
  width?: number;
  height?: number;
  labels?: ShotMapLabels;
  testID?: string;
}

export function ShotMap({ events, width = PITCH_DEFAULT_WIDTH, height, labels = DEFAULT_LABELS, testID }: ShotMapProps) {
  const h = height ?? pitchHeight(width);
  const g = pitchGeometry(width, h);
  const shots = extractShots(events);

  const legend: { result: ShotResult; label: string }[] = [
    { result: 'goal', label: labels.goal },
    { result: 'on_target', label: labels.onTarget },
    { result: 'off_target', label: labels.offTarget },
    { result: 'saved', label: labels.saved },
  ];

  return (
    <View testID={testID}>
      <Pitch2D width={width} height={h}>
        {shots.map((s, i) => {
          const color = shotColor(s.result);
          return (
            <Circle
              key={i}
              cx={projectX(g, s.x)}
              cy={projectY(g, s.y)}
              r={MIN_R + s.xg * R_SCALE}
              fill={alpha(color, 0.55)}
              stroke={color}
              strokeWidth={1.2}
            />
          );
        })}
      </Pitch2D>

      <View style={styles.legend}>
        {legend.map((item) => (
          <View key={item.result} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: shotColor(item.result) }]} />
            <Caption color={colors.textSecondary} style={styles.legendLabel}>
              {item.label}
            </Caption>
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
    borderRadius: radius.round,
  },
  legendLabel: {
    fontSize: fontSize.xs,
  },
});
