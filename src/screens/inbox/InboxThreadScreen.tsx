import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { Card, Button, Toast, useConfirm } from '@/components/kit';
import { Body, Caption, Label } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getThreadView, markThreadRead } from '@/database/queries/inbox';
import { resolveInboxAction } from '@/engine/inbox/action-resolver';
import type { InboxActionChoice, InboxThreadView } from '@/engine/inbox/inbox-types';
import type { RootStackParamList } from '@/navigation/types';

type RouteT = RouteProp<RootStackParamList, 'InboxThread'>;

function isExpired(v: InboxThreadView, season: number, week: number): boolean {
  if (v.deadlineSeason === null || v.deadlineWeek === null) return false;
  return v.deadlineSeason < season || (v.deadlineSeason === season && v.deadlineWeek < week);
}

export function InboxThreadScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { threadId } = useRoute<RouteT>().params;
  const { currentSave, playerClubId, season, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const confirm = useConfirm();

  const [view, setView] = useState<InboxThreadView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [counterFee, setCounterFee] = useState('');
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);

  const reload = useCallback(async () => {
    if (!dbHandle || !currentSave) return;
    const v = await getThreadView(dbHandle, currentSave.id, threadId);
    setView(v);
  }, [dbHandle, currentSave, threadId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!dbHandle || !currentSave) { setLoading(false); return; }
      const saveId = currentSave.id;
      (async () => {
        setLoading(true);
        const v = await getThreadView(dbHandle, saveId, threadId);
        if (!active) return;
        setView(v);
        setLoading(false);
        await markThreadRead(dbHandle, saveId, threadId);
        await useGameStore.getState().refreshInboxCounts(dbHandle);
      })();
      return () => { active = false; };
    }, [dbHandle, currentSave, threadId]),
  );

  const act = useCallback(async (choice: InboxActionChoice) => {
    if (!dbHandle || !currentSave || !view || busy) return;
    const confirmKey = choice === 'accept' ? 'inbox.confirm_accept' : choice === 'reject' ? 'inbox.confirm_reject' : null;
    if (confirmKey) {
      const ok = await confirm({ title: t(confirmKey), tone: choice === 'reject' ? 'danger' : 'default' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const fee = choice === 'counter' ? Number(counterFee.replace(/[^\d]/g, '')) : undefined;
      const res = await resolveInboxAction(dbHandle, currentSave.id, {
        threadId, choice, season, week, playerClubId, counterFee: fee,
      });
      if (res.ok) {
        setToast({ title: t('inbox.toast_done'), tone: 'success' });
      } else {
        setToast({ title: t((res.reason ?? 'inbox.toast_error') as never), tone: 'danger' });
      }
      await reload();
      await useGameStore.getState().refreshInboxCounts(dbHandle);
    } finally {
      setBusy(false);
    }
  }, [dbHandle, currentSave, view, busy, counterFee, threadId, season, week, playerClubId, confirm, t, reload]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!view) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Body color={colors.textSecondary}>{t('inbox.err_not_found')}</Body>
      </View>
    );
  }

  const expired = isExpired(view, season, week);
  const showActions = view.status === 'open' && view.actionKind !== 'none' && !expired;

  return (
    <View style={commonStyles.screen}>
      <ScrollView contentContainerStyle={styles.list}>
        {view.deadlineSeason !== null && view.deadlineWeek !== null && (
          <Caption color={view.status === 'open' && !expired ? colors.warning : colors.textMuted} style={styles.deadline}>
            {t('inbox.deadline', { season: view.deadlineSeason, week: view.deadlineWeek })}
            {view.status === 'expired' || expired ? ` · ${t('inbox.status_expired')}` : ''}
          </Caption>
        )}
        {view.messages.map((m) => (
          <Card
            key={m.id}
            variant="detail"
            accent={m.fromSelf ? colors.primary : colors.border}
            style={[styles.bubble, m.fromSelf ? styles.bubbleSelf : styles.bubbleOther]}
          >
            <Body>{t(m.title.key, m.title.vars)}</Body>
            <Caption color={colors.textSecondary}>{t(m.body.key, m.body.vars)}</Caption>
          </Card>
        ))}
      </ScrollView>

      {showActions && (
        <View style={styles.actionBar}>
          {view.actionKind === 'offer_response' && (
            <>
              <View style={styles.counterRow}>
                <Label style={styles.counterLabel}>{t('inbox.counter_fee_label')}</Label>
                <TextInput
                  testID="inbox-counter-fee"
                  style={styles.feeInput}
                  value={counterFee}
                  onChangeText={setCounterFee}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.buttonRow}>
                <Button label={t('inbox.action_accept')} variant="primary" loading={busy} onPress={() => act('accept')} testID="inbox-action-accept" />
                <Button label={t('inbox.action_counter')} variant="secondary" loading={busy} onPress={() => act('counter')} testID="inbox-action-counter" />
                <Button label={t('inbox.action_reject')} variant="ghost" loading={busy} onPress={() => act('reject')} testID="inbox-action-reject" />
              </View>
            </>
          )}
          {view.actionKind === 'job_offer_response' && (
            <View style={styles.buttonRow}>
              <Button label={t('inbox.action_accept')} variant="primary" loading={busy} onPress={() => act('accept')} testID="inbox-action-accept" />
              <Button label={t('inbox.action_reject')} variant="ghost" loading={busy} onPress={() => act('reject')} testID="inbox-action-reject" />
            </View>
          )}
          {(view.actionKind === 'acknowledge' || view.actionKind === 'contract_renew') && (
            <View style={styles.buttonRow}>
              <Button label={t('inbox.action_ack')} variant="primary" loading={busy} onPress={() => act('ack')} testID="inbox-action-ack" />
            </View>
          )}
        </View>
      )}

      {toast && (
        <Toast
          title={toast.title}
          tone={toast.tone}
          onDismiss={() => { setToast(null); if (toast.tone === 'success') navigation.goBack(); }}
          testID="inbox-toast"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.sm, paddingBottom: spacing.xl, gap: spacing.xs },
  deadline: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  bubble: { gap: spacing.xxs, maxWidth: '88%' },
  bubbleSelf: { alignSelf: 'flex-end' },
  bubbleOther: { alignSelf: 'flex-start' },
  actionBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  counterLabel: { flexShrink: 0 },
  feeInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
