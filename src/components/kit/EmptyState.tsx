import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fontSize, spacing } from '@/theme';
import { EMPTY_ART, EmptyArt } from './emptyStateArt';
import { Button } from './Button';

interface Props {
  art?: EmptyArt;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  accent?: string;
}

export function EmptyState({ art = 'generic', title, description, ctaLabel, onCtaPress, accent = colors.primary }: Props) {
  const def = EMPTY_ART[art];
  return (
    <View style={styles.container}>
      <Svg width={72} height={72} viewBox={def.viewBox} style={styles.art}>
        {def.paths.map((p, i) => (
          <Path key={i} d={p.d} fill="none" stroke={colors.textMuted} strokeWidth={2} />
        ))}
      </Svg>
      <Text style={styles.title}>{title}</Text>
      {description != null && <Text style={styles.description}>{description}</Text>}
      {ctaLabel != null && onCtaPress != null && (
        <View style={styles.cta}>
          <Button label={ctaLabel} variant="primary" accent={accent} onPress={onCtaPress} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  art: { marginBottom: spacing.md },
  title: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', textAlign: 'center' },
  description: { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 },
  cta: { marginTop: spacing.md, alignSelf: 'stretch' },
});
