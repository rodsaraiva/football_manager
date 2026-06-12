import React, { Component, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { translate } from '@/i18n/translate';
import { useI18nStore } from '@/store/i18n-store';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface to console for diagnosis; do not re-throw (would white-screen).
    console.error('ErrorBoundary caught:', error);
  }

  handleRetry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const lang = useI18nStore.getState().language;
      return (
        <View style={[commonStyles.screen, styles.centered]}>
          <Text style={styles.title}>{translate(lang, 'errorboundary.title')}</Text>
          <Text style={styles.message}>{translate(lang, 'errorboundary.message')}</Text>
          <Pressable style={styles.retry} onPress={this.handleRetry}>
            <Text style={styles.retryText}>{translate(lang, 'errorboundary.retry')}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { color: colors.danger, fontSize: fontSize.xxl, fontWeight: 'bold', marginBottom: spacing.md, textAlign: 'center' },
  message: { color: colors.text, fontSize: fontSize.md, textAlign: 'center', marginBottom: spacing.lg },
  retry: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  retryText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
});
