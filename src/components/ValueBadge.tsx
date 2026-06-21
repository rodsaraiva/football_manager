import React from 'react';
import { Badge } from './kit/Badge';

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'primary';
interface ValueBadgeProps { value: string | number; tone?: Tone; size?: 'sm' | 'md'; }

export function ValueBadge({ value, tone = 'neutral', size = 'md' }: ValueBadgeProps) {
  return <Badge value={value} tone={tone} size={size} />;
}
