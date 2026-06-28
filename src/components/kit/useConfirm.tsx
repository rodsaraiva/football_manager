import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '@/theme';
import { useTranslation } from '@/i18n';
import { Sheet } from './Sheet';
import { Button } from './Button';

export interface ConfirmOptions {
  title: string; message?: string;
  confirmLabel?: string; cancelLabel?: string;
  tone?: 'default' | 'danger';
}

type Resolver = (v: boolean) => void;
const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm precisa de <ConfirmProvider> no topo da árvore.');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet visible={opts != null} onClose={() => settle(false)} testID="confirm-sheet">
        {opts && (
          <View>
            <Text style={styles.title}>{opts.title}</Text>
            {opts.message != null && <Text style={styles.message}>{opts.message}</Text>}
            <View style={styles.actions}>
              <Button
                label={opts.cancelLabel ?? t('kit.cancel')}
                variant="ghost"
                onPress={() => settle(false)}
                testID="confirm-no"
              />
              <Button
                label={opts.confirmLabel ?? t('kit.confirm_default')}
                variant={opts.tone === 'danger' ? 'danger' : 'primary'}
                onPress={() => settle(true)}
                testID="confirm-yes"
              />
            </View>
          </View>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.xs },
  message: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
});
