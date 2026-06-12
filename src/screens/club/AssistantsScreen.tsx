import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useAssistantStore } from '@/store/assistant-store';
import { getAssistantsBySave, dismissAssistant } from '@/database/queries/assistants';
import { AssistantRole, AssistantWithQuality } from '@/types/assistant';
import { RootStackParamList } from '@/navigation/types';

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
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardName}>{assistant.name}</Text>
          <Text style={styles.cardArchetype}>{t(ARCHETYPE_LABELS[assistant.archetype])}</Text>
        </View>
        <StarRating stars={assistant.qualityStars} />
      </View>
      <View style={styles.cardStats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t('assistants.age')}</Text>
          <Text style={styles.statValue}>{assistant.age}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t('assistants.seasons')}</Text>
          <Text style={styles.statValue}>{assistant.seasonsAtClub}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{t('assistants.wage_mo')}</Text>
          <Text style={styles.statValue}>${(assistant.wagePerMonth / 1000).toFixed(1)}K</Text>
        </View>
      </View>
      {assistant.willRetireNextSeason && (
        <View style={styles.retireBadge}>
          <Text style={styles.retireBadgeText}>{t('assistants.retiring')}</Text>
        </View>
      )}
      <Pressable style={styles.dismissBtn} onPress={onDismiss}>
        <Text style={styles.dismissBtnText}>{t('assistants.dismiss')}</Text>
      </Pressable>
    </View>
  );
}

function EmptySlot({ role, onHire }: { role: AssistantRole; onHire: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable style={styles.emptySlot} onPress={onHire}>
      <Text style={styles.emptySlotIcon}>+</Text>
      <Text style={styles.emptySlotText}>{t('assistants.hire_role', { role: t(ROLE_LABELS[role]) })}</Text>
    </Pressable>
  );
}

export function AssistantsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { assistants, setAssistants } = useAssistantStore();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!dbHandle || !currentSave) { setLoading(false); return; }
    const loaded = await getAssistantsBySave(dbHandle, currentSave.id);
    setAssistants(loaded);
    setLoading(false);
  }, [dbHandle, currentSave, setAssistants]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDismiss = (assistant: AssistantWithQuality) => {
    Alert.alert(
      t('assistants.dismiss_title'),
      t('assistants.dismiss_msg', { name: assistant.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('assistants.dismiss'),
          style: 'destructive',
          onPress: async () => {
            if (!dbHandle) return;
            await dismissAssistant(dbHandle, assistant.id);
            await load();
          },
        },
      ],
    );
  };

  const handleHire = (role: AssistantRole) => {
    navigation.navigate('ClubAssistantHiring', { role });
  };

  const roles: AssistantRole[] = ['squad', 'financial', 'youth'];

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.loadingText}>{t('newgame.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {roles.map((role) => {
        const assistant = assistants.find((a) => a.role === role);
        return (
          <View key={role}>
            <Text style={styles.sectionTitle}>{t(ROLE_LABELS[role]).toUpperCase()}</Text>
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
  loadingText: { color: colors.textMuted, fontSize: fontSize.md },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginHorizontal: spacing.md + 4,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  cardHeaderLeft: { flex: 1 },
  cardName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  cardArchetype: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  stars: { color: colors.gold, fontSize: fontSize.lg },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: 2 },
  retireBadge: {
    backgroundColor: colors.danger + '22',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  retireBadgeText: { color: colors.danger, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  dismissBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dismissBtnText: { color: colors.textMuted, fontSize: fontSize.sm },
  emptySlot: {
    backgroundColor: colors.surface,
    borderRadius: 12,
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
  emptySlotText: { color: colors.textSecondary, fontSize: fontSize.md },
});
