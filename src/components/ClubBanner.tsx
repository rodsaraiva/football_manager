import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, fontSize, radius } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useClubAccent } from '@/theme/useClubAccent';

export function ClubBanner({ subtitle }: { subtitle?: string }) {
  const club = useGameStore((s) => s.playerClub);
  const { accent, onAccent } = useClubAccent();
  if (!club) return null;
  return (
    <View style={[styles.banner, { backgroundColor: accent }]}>
      <Text style={[styles.name, { color: onAccent }]}>{club.name}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: onAccent }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  name: { fontSize: fontSize.xl, fontWeight: 'bold' },
  subtitle: { fontSize: fontSize.sm, marginTop: spacing.xxs, opacity: 0.9 },
});
