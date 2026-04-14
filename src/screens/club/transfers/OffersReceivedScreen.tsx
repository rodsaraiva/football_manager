import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';

export function OffersReceivedScreen() {
  return (
    <View style={[commonStyles.screen, styles.center]}>
      <Text style={styles.title}>Offers Received</Text>
      <Text style={styles.subtitle}>Coming in Fase 2</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
