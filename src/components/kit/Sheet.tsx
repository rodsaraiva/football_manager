import React from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius, alpha } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  testID?: string;
}

export function Sheet({ visible, onClose, children, testID }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable testID={testID ? `${testID}-backdrop` : undefined} style={styles.backdrop} onPress={onClose}>
        <Pressable testID={testID ? `${testID}-body` : undefined} style={styles.body} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: alpha('#000000', 0.7),
    justifyContent: 'center', paddingHorizontal: spacing.md,
  },
  body: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, maxHeight: '85%',
  },
});
