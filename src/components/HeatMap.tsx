/**
 * HeatMap — densidade das posições (x,y) de todos os eventos num grid sobre o
 * Pitch2D. Intensidade por contagem (alpha do token). Padrão RadarChart: SVG +
 * tokens + legenda em <View>. Consome só dados já persistidos (sem engine).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Rect } from 'react-native-svg';
import { colors, spacing, fontSize, alpha } from '@/theme';
import { Caption } from '@/components/typography';
import { Pitch2D, pitchGeometry, pitchHeight, PITCH_DEFAULT_WIDTH } from './Pitch2D';
import { binHeatmap } from '@/engine/match-2d/view-model';
import { MatchEvent } from '@/types';

const DEFAULT_COLS = 12;
const DEFAULT_ROWS = 8;
const MIN_ALPHA = 0.12;
const MAX_ALPHA = 0.7;

export interface HeatMapLabels {
  less: string;
  more: string;
}

const DEFAULT_LABELS: HeatMapLabels = { less: 'Less', more: 'More' };

interface HeatMapProps {
  events: MatchEvent[];
  cols?: number;
  rows?: number;
  width?: number;
  height?: number;
  labels?: HeatMapLabels;
  testID?: string;
}

export function HeatMap({
  events,
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS,
  width = PITCH_DEFAULT_WIDTH,
  height,
  labels = DEFAULT_LABELS,
  testID,
}: HeatMapProps) {
  const h = height ?? pitchHeight(width);
  const g = pitchGeometry(width, h);
  const bins = binHeatmap(events, cols, rows);
  const cellW = g.fieldW / cols;
  const cellH = g.fieldH / rows;

  return (
    <View testID={testID}>
      <Pitch2D width={width} height={h}>
        {bins.cells.map((cell) => (
          <Rect
            key={`${cell.col},${cell.row}`}
            x={g.fieldX + cell.col * cellW}
            y={g.fieldY + cell.row * cellH}
            width={cellW}
            height={cellH}
            fill={alpha(colors.accent, MIN_ALPHA + cell.intensity * (MAX_ALPHA - MIN_ALPHA))}
          />
        ))}
      </Pitch2D>

      <View style={styles.legend}>
        <Caption color={colors.textSecondary} style={styles.legendLabel}>
          {labels.less}
        </Caption>
        <View style={styles.scale}>
          {[0.15, 0.35, 0.55, 0.75, 0.95].map((t) => (
            <View key={t} style={[styles.scaleCell, { backgroundColor: alpha(colors.accent, t) }]} />
          ))}
        </View>
        <Caption color={colors.textSecondary} style={styles.legendLabel}>
          {labels.more}
        </Caption>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  legendLabel: {
    fontSize: fontSize.xs,
  },
  scale: {
    flexDirection: 'row',
  },
  scaleCell: {
    width: 14,
    height: 10,
  },
});
