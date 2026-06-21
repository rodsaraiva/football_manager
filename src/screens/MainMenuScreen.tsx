import React, { useEffect, useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, radius, commonStyles, alpha } from '@/theme';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { useTranslation } from '@/i18n';
import { useI18nStore } from '@/store/i18n-store';
import { changeLanguage } from '@/i18n/persistence';
import { getAllSaves, deleteSave } from '@/database/queries/saves';
import { RootStackParamList } from '@/navigation/types';
import { SaveGame } from '@/types';
import { Button, Chip, Card, Icon, useConfirm } from '@/components/kit';
import { Display, Title, Body, Label, Caption } from '@/components/typography';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'MainMenu'>;

export function MainMenuScreen() {
  const navigation = useNavigation<NavProp>();
  const { dbHandle, isReady } = useDatabaseStore();
  const loadSave = useGameStore((s) => s.loadSave);
  const { t } = useTranslation();
  const language = useI18nStore((s) => s.language);
  const confirm = useConfirm();

  function handleSetLanguage(lang: 'pt' | 'en') {
    if (dbHandle) changeLanguage(dbHandle, lang);
  }

  const [saves, setSaves] = useState<SaveGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady || !dbHandle) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const result = await getAllSaves(dbHandle);
        setSaves(result);
      } catch {
        setSaves([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isReady, dbHandle]);

  function handleLoadSave(save: SaveGame) {
    loadSave(save);
    navigation.navigate('Game');
  }

  async function handleDeleteSave(save: SaveGame) {
    const label = save.name || t('mainmenu.save_default', { id: save.id });
    const ok = await confirm({
      title: t('mainmenu.delete_title'),
      message: t('mainmenu.delete_confirm', { name: label }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok || !dbHandle) return;
    await deleteSave(dbHandle, save.id);
    setSaves(prev => prev.filter(s => s.id !== save.id));
  }

  return (
    <View style={commonStyles.screen}>
      <View style={styles.topBar}>
        <View style={styles.langToggle}>
          {(['pt', 'en'] as const).map((lng) => (
            <Chip
              key={lng}
              label={lng.toUpperCase()}
              selected={language === lng}
              onPress={() => handleSetLanguage(lng)}
              testID={`mainmenu-language-${lng}`}
              accessibilityLabel={lng.toUpperCase()}
            />
          ))}
        </View>
        <Pressable
          testID="mainmenu-settings"
          accessibilityRole="button"
          accessibilityLabel={t('nav.settings')}
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Caption color={colors.textSecondary}>{t('nav.settings')}</Caption>
        </Pressable>
      </View>
      <View style={styles.titleSection}>
        <Display>FOOTBALL MANAGER</Display>
        <Body color={colors.primary}>{t('mainmenu.subtitle')}</Body>
      </View>

      <View style={styles.buttonSection}>
        <Button
          label={t('mainmenu.new_game').toUpperCase()}
          variant="primary"
          onPress={() => navigation.navigate('NewGame')}
          testID="mainmenu-new-game"
          accessibilityLabel={t('mainmenu.new_game')}
        />

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : saves.length > 0 ? (
          <View style={styles.savesSection}>
            <Label style={styles.savesLabel}>{t('mainmenu.load_game')}</Label>
            <ScrollView style={styles.savesList} showsVerticalScrollIndicator={false}>
              {saves.map((save) => (
                <Card key={save.id} variant="detail" style={styles.saveCard}>
                  <Pressable
                    style={styles.saveCardContent}
                    onPress={() => handleLoadSave(save)}
                    accessibilityRole="button"
                    accessibilityLabel={save.name || t('mainmenu.save_default', { id: save.id })}
                    testID={`mainmenu-load-${save.id}`}
                  >
                    <Title>{save.name || t('mainmenu.save_default', { id: save.id })}</Title>
                    <Caption color={colors.textSecondary}>
                      {t('mainmenu.save_meta', { season: save.currentSeason, week: save.currentWeek })}
                    </Caption>
                    <Caption color={colors.textMuted} style={styles.saveDifficulty}>{save.difficulty}</Caption>
                  </Pressable>
                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => handleDeleteSave(save)}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                    testID={`mainmenu-delete-${save.id}`}
                  >
                    <Icon name="close" color={colors.danger} size={16} />
                  </Pressable>
                </Card>
              ))}
            </ScrollView>
          </View>
        ) : (
          <Card variant="detail" style={styles.noSavesContainer}>
            <Body color={colors.textMuted}>{t('mainmenu.no_saves')}</Body>
          </Card>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.sm,
  },
  buttonSection: {
    flex: 2,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  loader: { marginTop: spacing.lg },
  savesSection: {
    flex: 1,
  },
  savesLabel: {
    marginBottom: spacing.sm,
  },
  savesList: {
    flex: 1,
  },
  saveCard: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveCardContent: {
    flex: 1,
    gap: spacing.xxs,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: alpha(colors.danger, 0.13),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  saveDifficulty: {
    textTransform: 'capitalize',
  },
  noSavesContainer: {
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  langToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  settingsButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
