import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useDatabaseStore } from '@/store/database-store';
import { isHintSeen, markHintSeen } from '@/database/queries/settings';

interface Props {
  screen: string;
  titleKey: TKey;
  bodyKey: TKey;
}

/**
 * Dica contextual: um badge "?" no header que abre um popover (Modal) com a
 * explicação. Auto-aparece 1× por tela (persistido em app_settings); depois
 * fica acessível pelo "?". Modal em vez de tooltip absoluto para garantir que
 * o conteúdo fique clicável acima dos cards da tela (RN Web/native).
 */
export function ContextualHint({ screen, titleKey, bodyKey }: Props) {
  const { t } = useTranslation();
  const { dbHandle } = useDatabaseStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!dbHandle) return;
      const seen = await isHintSeen(dbHandle, screen);
      if (alive && !seen) setOpen(true);
    })();
    return () => { alive = false; };
  }, [dbHandle, screen]);

  const close = async () => {
    setOpen(false);
    if (dbHandle) await markHintSeen(dbHandle, screen);
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.badge}
        onPress={() => setOpen(true)}
        accessibilityLabel={t('hints.toggle')}
        activeOpacity={0.8}
      >
        <Text style={styles.badgeText}>?</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>{t(titleKey)}</Text>
            <Text style={styles.body}>{t(bodyKey)}</Text>
            <TouchableOpacity style={styles.dismiss} onPress={close} activeOpacity={0.8}>
              <Text style={styles.dismissText}>{t('hints.dismiss')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary,
  },
  badgeText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: 'bold' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.xs },
  body: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  dismiss: {
    marginTop: spacing.md,
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  dismissText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
});
