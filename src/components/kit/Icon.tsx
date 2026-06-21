import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';
import { ICONS, IconName } from './icons';

interface Props { name: IconName; size?: number; color?: string; }

export function Icon({ name, size = 24, color = colors.text }: Props) {
  const def = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox={def.viewBox}>
      {def.paths.map((p, i) => (
        <Path key={i} d={p.d} fill={color} fillRule={p.fillRule} />
      ))}
    </Svg>
  );
}
