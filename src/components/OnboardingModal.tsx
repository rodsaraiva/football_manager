import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { Sheet, Card, Button, Icon } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Display, Body, Label, Caption } from '@/components/typography';

interface Props {
  visible: boolean;
  onStart: () => void;
}

const CARDS: { icon: IconName; titleKey: TKey; descKey: TKey }[] = [
  { icon: 'play', titleKey: 'onboarding.card_advance_title', descKey: 'onboarding.card_advance_desc' },
  { icon: 'squad', titleKey: 'onboarding.card_squad_title', descKey: 'onboarding.card_squad_desc' },
  { icon: 'shield', titleKey: 'onboarding.card_board_title', descKey: 'onboarding.card_board_desc' },
  { icon: 'whistle', titleKey: 'onboarding.card_live_title', descKey: 'onboarding.card_live_desc' },
];

/** One-time welcome shown on the first game. Dismissed via the "Começar" button. */
export function OnboardingModal({ visible, onStart }: Props) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onStart} testID="onboarding-sheet">
      <Display style={styles.title}>{t('onboarding.title')}</Display>
      <Body color={colors.primary} style={styles.subtitle}>{t('onboarding.subtitle')}</Body>

      <ScrollView style={styles.cards} contentContainerStyle={styles.cardsContent}>
        {CARDS.map((c) => (
          <Card key={c.titleKey} variant="detail" style={styles.card}>
            <Icon name={c.icon} color={colors.primary} size={28} />
            <View style={styles.cardText}>
              <Label color={colors.text}>{t(c.titleKey)}</Label>
              <Caption color={colors.textSecondary}>{t(c.descKey)}</Caption>
            </View>
          </Card>
        ))}
      </ScrollView>

      <Button
        label={t('onboarding.start')}
        variant="primary"
        onPress={onStart}
        testID="onboarding-start"
        accessibilityLabel={t('onboarding.start')}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: spacing.xxs,
    marginBottom: spacing.md,
  },
  cards: {
    marginBottom: spacing.md,
  },
  cardsContent: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardText: { flex: 1 },
});
