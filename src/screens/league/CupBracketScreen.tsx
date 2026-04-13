import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';

export function CupBracketScreen() {
  return (
    <View style={[commonStyles.screen, styles.container]}>
      <View style={styles.card}>
        <Text style={styles.icon}>🏆</Text>
        <Text style={styles.title}>Cup Bracket</Text>
        <Text style={styles.subtitle}>
          Draw will be made when the cup begins
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 360,
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
});
