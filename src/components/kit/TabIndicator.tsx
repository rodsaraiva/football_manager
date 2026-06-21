import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

interface Props { active: boolean; shape?: 'underline' | 'pill'; accent?: string; width?: number; }

export function TabIndicator({ active, shape = 'underline', accent = colors.primary, width }: Props) {
  const color = active ? accent : 'transparent';
  if (shape === 'pill') {
    return <View style={[styles.pill, { backgroundColor: active ? accent : 'transparent', borderColor: color, width }]} />;
  }
  return <View style={[styles.underline, { backgroundColor: color, width }]} />;
}

const styles = StyleSheet.create({
  underline: { height: 3, borderRadius: radius.sm, alignSelf: 'center' },
  pill: { height: 28, borderRadius: radius.pill, borderWidth: 1 },
});
