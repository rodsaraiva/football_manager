import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { resolveCardStyle, CardVariant } from './cardStyle';

interface Props {
  variant?: CardVariant;
  accent?: string;
  selected?: boolean;
  style?: object;
  children?: React.ReactNode;
  testID?: string;
}

export function Card({ variant = 'detail', accent = colors.primary, selected = false, style, children, testID }: Props) {
  const r = resolveCardStyle(variant, accent);
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          backgroundColor: r.backgroundColor,
          borderColor: selected ? accent : r.borderColor,
          borderWidth: selected ? 2 : r.borderWidth,
          borderRadius: r.radius,
          padding: r.padding,
          ...r.elevation,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ base: {} });
