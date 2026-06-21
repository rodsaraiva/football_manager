import React from 'react';
import { Text, type TextProps } from 'react-native';
import { textStyle, type TypographyVariant } from '@/theme/typography';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
}

// Wrapper fino sobre <Text>: aplica textStyle(variant) + cor + style do consumidor.
// `style` vem por último p/ permitir override pontual (margin, align) sem perder a base.
function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[textStyle(variant, color ? { color } : undefined), style]} />;
}

const make = (variant: TypographyVariant) => {
  const C = (props: AppTextProps) => <AppText variant={variant} {...props} />;
  C.displayName = variant[0].toUpperCase() + variant.slice(1);
  return C;
};

export const Display = make('display');
export const Headline = make('headline');
export const Title = make('title');
export const Subheading = make('subheading');
export const Body = make('body');
export const Label = make('label');
export const Caption = make('caption');
export const Stat = make('stat');
