import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useAssistantStore } from '@/store/assistant-store';
import { getAssistantsBySave, dismissAssistant } from '@/database/queries/assistants';
import { AssistantRole, AssistantWithQuality } from '@/types/assistant';
import { RootStackParamList } from '@/navigation/types';
import { Card, Button, Badge, useConfirm } from '@/components/kit';
import { Label, Body, Caption, Stat } from '@/components/typography';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const ROLE_LABELS: Record<AssistantRole, TKey> = {
  squad:     'assistants.role_squad',
  financial: 'assistants.role_financial',
  youth:     'assistants.role_youth',
};

const ARCHETYPE_LABELS: Record<string, TKey> = {
  old_school: 'assistants.arch_old_school',
  analytics:  'assistants.arch_analytics',
  motivator:  'assistants.arch_motivator',
  tactician:  'assistants.arch_tactician',
  developer:  'assistants.arch_developer',
  pragmatic:  'assistants.arch_pragmatic',
};

function StarRating({ stars }: { stars: number }) {
  return (
    <Text style={styles.stars}>
      {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
    </Text>
  );
}

function AssistantCard({
  assistant,
  onDismiss,
}: {
  assistant: AssistantWithQuality;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card variant="detail" style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Body>{assistant.name}</Body>
          <Caption color={colors.textSecondary}>{t(ARCHETYPE_LABELS[assistant.archetype])}</Caption>
        </View>
        <StarRating stars={assistant.qualityStars} />
      </View>
      <View style={styles.cardStats}>
        <View style={styles.stat}>
          <Label>{t('assistants.age')}</Label>
          <Stat>{assistant.age}</Stat>
        </View>
        <View style={styles.stat}>
          <Label>{t('assistants.seasons')}</Label>
          <Stat>{assistant.seasonsAtClub}</Stat>
        </View>
        <View style={styles.stat}>
          <Label>{t('assistants.wage_mo')}</Label>
          <Stat>${(assistant.wagePerMonth / 1000).toFixed(1)}K</Stat>
        </View>
      </View>
      {assistant.willRetireNextSeason && (
        <View style={styles.retireBadge}>
          <Badge value={t('assistants.retiring')} tone="danger" size="sm" />
        </View>
      )}
      <Button
        label={t('assistants.dismiss')}
        variant="ghost"
        onPress={onDismiss}
        testID={`dismiss-assistant-${assistant.id}`}
        accessibilityLabel={t('assistants.dismiss')}
      />
    </Card>
  );
}

function EmptySlot({ role, onHire }: { role: AssistantRole; onHire: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      style={styles.emptySlot}
      onPress={onHire}
      accessibilityRole="button"
      accessibilityLabel={t('assistants.hire_role', { role: t(ROLE_LABELS[role]) })}
      testID={`hire-slot-${role}`}
    >
      <Text style={styles.emptySlotIcon}>+</Text>
      <Body color={colors.textSecondary}>{t('assistants.hire_role', { role: t(ROLE_LABELS[role]) })}</Body>
    </Pressable>
  );
}

export function AssistantsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { assistants, setAssistants } = useAssistantStore();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!dbHandle || !currentSave) { setLoading(false); return; }
    const loaded = await getAssistantsBySave(dbHandle, currentSave.id);
    setAssistants(loaded);
    setLoading(false);
  }, [dbHandle, currentSave, setAssistants]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDismiss = async (assistant: AssistantWithQuality) => {
    const ok = await confirm({
      title: t('assistants.dismiss_title'),
      message: t('assistants.dismiss_msg', { name: assistant.name }),
      tone: 'danger',
      confirmLabel: t('assistants.dismiss'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok || !dbHandle) return;
    await dismissAssistant(dbHandle, assistant.id);
    await load();
  };

  const handleHire = (role: AssistantRole) => {
    navigation.navigate('ClubAssistantHiring', { role });
  };

  const roles: AssistantRole[] = ['squad', 'financial', 'youth'];

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Body color={colors.textMuted}>{t('newgame.loading')}</Body>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {roles.map((role) => {
        const assistant = assistants.find((a) => a.role === role);
        return (
          <View key={role}>
            <Label style={styles.sectionTitle}>{t(ROLE_LABELS[role]).toUpperCase()}</Label>
            {assistant ? (
              <AssistantCard assistant={assistant} onDismiss={() => handleDismiss(assistant)} />
            ) : (
              <EmptySlot role={role} onHire={() => handleHire(role)} />
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  center: { alignItems: 'center', justifyContent: 'center' },
  sectionTitle: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  card: { marginHorizontal: spacing.md, marginBottom: spacing.xs, gap: spacing.sm },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: { flex: 1 },
  stars: { color: colors.gold, fontSize: fontSize.lg },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  stat: { alignItems: 'center', flex: 1 },
  retireBadge: { alignSelf: 'flex-start' },
  emptySlot: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emptySlotIcon: { color: colors.primary, fontSize: fontSize.xxl, fontWeight: '300' },
});
