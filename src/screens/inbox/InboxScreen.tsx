import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { Card, Badge, Icon, EmptyState } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Headline, Body, Caption } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getThreads, getThreadView } from '@/database/queries/inbox';
import type { InboxCategory, InboxThreadView } from '@/engine/inbox/inbox-types';
import type { RootStackParamList } from '@/navigation/types';
import type { TKey } from '@/i18n/translate';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_ICON: Record<InboxCategory, IconName> = {
  board: 'shield',
  contract: 'news',
  loan: 'squad',
  sponsor: 'money',
  scout: 'target',
  injury: 'injury',
  transfer: 'money',
};

const CATEGORY_KEY: Record<InboxCategory, TKey> = {
  board: 'inbox.cat_board',
  contract: 'inbox.cat_contract',
  loan: 'inbox.cat_loan',
  sponsor: 'inbox.cat_sponsor',
  scout: 'inbox.cat_scout',
  injury: 'inbox.cat_injury',
  transfer: 'inbox.cat_transfer',
};

export function InboxScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { currentSave, season, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();

  const [views, setViews] = useState<InboxThreadView[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!dbHandle || !currentSave) {
        setLoading(false);
        return;
      }
      const saveId = currentSave.id;
      (async () => {
        setLoading(true);
        const threads = await getThreads(dbHandle, saveId);
        const full: InboxThreadView[] = [];
        for (const tr of threads) {
          const v = await getThreadView(dbHandle, saveId, tr.id);
          if (v) full.push(v);
        }
        if (!active) return;
        setViews(full);
        setLoading(false);
        await useGameStore.getState().refreshInboxCounts(dbHandle);
      })();
      return () => { active = false; };
    }, [dbHandle, currentSave]),
  );

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (views.length === 0) {
    return (
      <View style={commonStyles.screen}>
        <View style={styles.header}>
          <Headline>{t('inbox.title')}</Headline>
          <Body color={colors.primary}>{t('news.header_sub', { season, week })}</Body>
        </View>
        <View style={styles.emptyWrap}>
          <EmptyState art="inbox" title={t('inbox.title')} description={t('inbox.empty')} />
        </View>
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <View style={styles.header}>
        <Headline>{t('inbox.title')}</Headline>
        <Body color={colors.primary}>{t('news.header_sub', { season, week })}</Body>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {views.map((v) => {
          const last = v.messages[v.messages.length - 1];
          const actionable = v.status === 'open' && v.actionKind !== 'none';
          const accent = actionable ? colors.gold : v.read ? colors.border : colors.primary;
          const title = last ? t(last.title.key, last.title.vars) : '';
          const body = last ? t(last.body.key, last.body.vars) : '';
          return (
            <Pressable
              key={v.id}
              testID={`inbox-thread-${v.id}`}
              accessibilityRole="button"
              accessibilityLabel={title}
              onPress={() => navigation.navigate('InboxThread', { threadId: v.id })}
            >
              <Card variant="detail" accent={accent} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Icon name={CATEGORY_ICON[v.category]} color={accent} size={20} />
                </View>
                <View style={styles.cardContent}>
                  <View style={styles.titleRow}>
                    <Body style={styles.titleText}>{title}</Body>
                    {!v.read && <Badge value="●" tone="primary" size="sm" />}
                    {actionable && <Badge value={t('inbox.status_open')} tone="warning" size="sm" accent={colors.gold} />}
                  </View>
                  <Caption color={colors.textSecondary}>{body}</Caption>
                  <Caption color={colors.textMuted}>{t(CATEGORY_KEY[v.category])}</Caption>
                  {v.deadlineSeason !== null && v.deadlineWeek !== null && v.status === 'open' && (
                    <Caption color={colors.warning}>
                      {t('inbox.deadline', { season: v.deadlineSeason, week: v.deadlineWeek })}
                    </Caption>
                  )}
                </View>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xxs,
  },
  emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md },
  list: { padding: spacing.sm, paddingBottom: spacing.xl },
  card: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: spacing.xs, gap: spacing.sm },
  cardIcon: { width: 36, alignItems: 'center', paddingTop: spacing.xxs },
  cardContent: { flex: 1, gap: spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  titleText: { flexShrink: 1 },
});
