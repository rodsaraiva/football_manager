/**
 * Pitch2D — campo de futebol em SVG (landscape), no padrão de RadarChart.tsx:
 * react-native-svg declarativo + tokens de @/theme, sem estado. Serve de fundo
 * composável: os mapas (ShotMap/HeatMap) passam seus nós SVG como `children`,
 * desenhados sobre as linhas do campo usando a MESMA geometria normalizada.
 *
 * Coordenadas normalizadas: x∈[0,1] ao longo do comprimento (gol esquerdo→direito),
 * y∈[0,1] ao longo da largura (topo→base). Use `projectX`/`projectY` p/ converter.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { colors, radius } from '@/theme';

/** Geometria canônica do campo — fonte única p/ ShotMap/HeatMap projetarem sobre o MESMO desenho. */
export const PITCH_DEFAULT_WIDTH = 320;
export const PITCH_ASPECT = 0.64; // altura/largura aproximada de um campo

const PADDING = 8;

/** Altura derivada da largura quando não informada explicitamente. */
export function pitchHeight(width: number): number {
  return Math.round(width * PITCH_ASPECT);
}

export interface PitchGeometry {
  width: number;
  height: number;
  /** Retângulo jogável (dentro do padding). */
  fieldX: number;
  fieldY: number;
  fieldW: number;
  fieldH: number;
}

export function pitchGeometry(width: number, height: number): PitchGeometry {
  return {
    width,
    height,
    fieldX: PADDING,
    fieldY: PADDING,
    fieldW: width - PADDING * 2,
    fieldH: height - PADDING * 2,
  };
}

/** Projeta x normalizado [0,1] → coordenada SVG dentro do campo. */
export function projectX(g: PitchGeometry, x: number): number {
  return g.fieldX + x * g.fieldW;
}

/** Projeta y normalizado [0,1] → coordenada SVG dentro do campo. */
export function projectY(g: PitchGeometry, y: number): number {
  return g.fieldY + y * g.fieldH;
}

interface Pitch2DProps {
  width?: number;
  height?: number;
  children?: React.ReactNode;
  testID?: string;
}

export function Pitch2D({ width = PITCH_DEFAULT_WIDTH, height, children, testID }: Pitch2DProps) {
  const h = height ?? pitchHeight(width);
  const g = pitchGeometry(width, h);
  const { fieldX, fieldY, fieldW, fieldH } = g;

  const cx = fieldX + fieldW / 2;
  const cy = fieldY + fieldH / 2;
  const centerR = fieldH * 0.13;

  // Áreas: penalidade ≈ 16% do comprimento × 58% da largura; pequena ≈ 6% × 28%.
  const penW = fieldW * 0.16;
  const penH = fieldH * 0.58;
  const goalAreaW = fieldW * 0.06;
  const goalAreaH = fieldH * 0.28;
  const penY = fieldY + (fieldH - penH) / 2;
  const goalAreaY = fieldY + (fieldH - goalAreaH) / 2;
  const penSpotL = fieldX + fieldW * 0.1;
  const penSpotR = fieldX + fieldW * 0.9;

  const lineColor = colors.textMuted;
  const lineW = 1;

  return (
    <View testID={testID}>
      <Svg width={width} height={h}>
        {/* Gramado */}
      <Rect
        x={fieldX}
        y={fieldY}
        width={fieldW}
        height={fieldH}
        rx={radius.sm}
        fill={colors.surfaceLight}
        stroke={lineColor}
        strokeWidth={lineW}
      />
      {/* Linha do meio */}
      <Line x1={cx} y1={fieldY} x2={cx} y2={fieldY + fieldH} stroke={lineColor} strokeWidth={lineW} />
      {/* Círculo central + marca */}
      <Circle cx={cx} cy={cy} r={centerR} fill="none" stroke={lineColor} strokeWidth={lineW} />
      <Circle cx={cx} cy={cy} r={1.5} fill={lineColor} />
      {/* Grande área esquerda/direita */}
      <Rect x={fieldX} y={penY} width={penW} height={penH} fill="none" stroke={lineColor} strokeWidth={lineW} />
      <Rect x={fieldX + fieldW - penW} y={penY} width={penW} height={penH} fill="none" stroke={lineColor} strokeWidth={lineW} />
      {/* Pequena área esquerda/direita */}
      <Rect x={fieldX} y={goalAreaY} width={goalAreaW} height={goalAreaH} fill="none" stroke={lineColor} strokeWidth={lineW} />
      <Rect x={fieldX + fieldW - goalAreaW} y={goalAreaY} width={goalAreaW} height={goalAreaH} fill="none" stroke={lineColor} strokeWidth={lineW} />
      {/* Marcas de pênalti */}
      <Circle cx={penSpotL} cy={cy} r={1.5} fill={lineColor} />
      <Circle cx={penSpotR} cy={cy} r={1.5} fill={lineColor} />

        {children}
      </Svg>
    </View>
  );
}
