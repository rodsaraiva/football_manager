import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';

interface Props {
  visible: boolean;
  onStart: () => void;
}

const CARDS: { icon: string; titleKey: TKey; descKey: TKey }[] = [
  { icon: '⏭️', titleKey: 'onboarding.card_advance_title', descKey: 'onboarding.card_advance_desc' },
  { icon: '👥', titleKey: 'onboarding.card_squad_title', descKey: 'onboarding.card_squad_desc' },
  { icon: '🎯', titleKey: 'onboarding.card_board_title', descKey: 'onboarding.card_board_desc' },
  { icon: '▶️', titleKey: 'onboarding.card_live_title', descKey: 'onboarding.card_live_desc' },
];

/** One-time welcome shown on the first game. Dismissed via the "Começar" button. */
export function OnboardingModal({ visible, onStart }: Props) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onStart}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('onboarding.title')}</Text>
          <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>

          <ScrollView style={styles.cards} contentContainerStyle={styles.cardsContent}>
            {CARDS.map((c) => (
              <View key={c.titleKey} style={styles.card}>
                <Text style={styles.cardIcon}>{c.icon}</Text>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{t(c.titleKey)}</Text>
                  <Text style={styles.cardDesc}>{t(c.descKey)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.startButton} onPress={onStart} activeOpacity={0.8}>
            <Text style={styles.startText}>{t('onboarding.start')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  content: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.primary,
    fontSize: fontSize.sm,
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
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardIcon: {
    fontSize: 28,
    width: 44,
    textAlign: 'center',
    marginRight: spacing.sm,
  },
  cardText: { flex: 1 },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  cardDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
    lineHeight: 18,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
