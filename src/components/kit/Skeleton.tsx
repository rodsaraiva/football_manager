import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

interface Props { width?: number | string; height?: number; radius?: number; style?: object; }

export function Skeleton({ width = '100%', height = 12, radius: r = radius.sm, style }: Props) {
  return <View style={[styles.base, { width: width as any, height, borderRadius: r }, style]} />;
}

const styles = StyleSheet.create({ base: { backgroundColor: colors.surfaceLight, opacity: 0.6 } });
