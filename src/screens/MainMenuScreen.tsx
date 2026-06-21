import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { useTranslation } from '@/i18n';
import { useI18nStore } from '@/store/i18n-store';
import { changeLanguage } from '@/i18n/persistence';
import { getAllSaves, deleteSave } from '@/database/queries/saves';
import { RootStackParamList } from '@/navigation/types';
import { SaveGame } from '@/types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'MainMenu'>;

export function MainMenuScreen() {
  const navigation = useNavigation<NavProp>();
  const { dbHandle, isReady } = useDatabaseStore();
  const loadSave = useGameStore((s) => s.loadSave);
  const { t } = useTranslation();
  const language = useI18nStore((s) => s.language);

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

  function handleDeleteSave(save: SaveGame) {
    const label = save.name || t('mainmenu.save_default', { id: save.id });
    Alert.alert(
      t('mainmenu.delete_title'),
      t('mainmenu.delete_confirm', { name: label }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => doDelete(save) },
      ],
    );
  }

  async function doDelete(save: SaveGame) {
    if (!dbHandle) return;
    await deleteSave(dbHandle, save.id);
    setSaves(prev => prev.filter(s => s.id !== save.id));
  }

  return (
    <View style={commonStyles.screen}>
      <View style={styles.topBar}>
        <View style={styles.langToggle}>
          {(['pt', 'en'] as const).map((lng) => (
            <TouchableOpacity
              key={lng}
              style={[styles.langButton, language === lng && styles.langButtonActive]}
              onPress={() => handleSetLanguage(lng)}
              activeOpacity={0.7}
            >
              <Text style={[styles.langButtonText, language === lng && styles.langButtonTextActive]}>
                {lng.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          testID="mainmenu-settings"
          accessibilityRole="button"
          accessibilityLabel={t('nav.settings')}
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.7}
        >
          <Text style={styles.settingsButtonText}>{t('nav.settings')}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.titleSection}>
        <Text style={styles.title}>FOOTBALL MANAGER</Text>
        <Text style={styles.subtitle}>{t('mainmenu.subtitle')}</Text>
      </View>

      <View style={styles.buttonSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('NewGame')}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>{t('mainmenu.new_game').toUpperCase()}</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : saves.length > 0 ? (
          <View style={styles.savesSection}>
            <Text style={styles.savesLabel}>{t('mainmenu.load_game')}</Text>
            <ScrollView style={styles.savesList} showsVerticalScrollIndicator={false}>
              {saves.map((save) => (
                <View key={save.id} style={styles.saveCard}>
                  <TouchableOpacity
                    style={styles.saveCardContent}
                    onPress={() => handleLoadSave(save)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveName}>{save.name || t('mainmenu.save_default', { id: save.id })}</Text>
                    <Text style={styles.saveMeta}>
                      {t('mainmenu.save_meta', { season: save.currentSeason, week: save.currentWeek })}
                    </Text>
                    <Text style={styles.saveDifficulty}>{save.difficulty}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteSave(save)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deleteButtonText}>X</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.noSavesContainer}>
            <Text style={styles.noSavesText}>{t('mainmenu.no_saves')}</Text>
          </View>
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
  },
  title: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.primary,
    fontSize: fontSize.lg,
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
  buttonSection: {
    flex: 2,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  savesSection: {
    flex: 1,
  },
  savesLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  savesList: {
    flex: 1,
  },
  saveCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveCardContent: {
    flex: 1,
    padding: spacing.md,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.danger}22`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  saveName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  saveMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  saveDifficulty: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
    textTransform: 'capitalize',
  },
  noSavesContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  noSavesText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
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
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingsButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  langButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langButtonText: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' },
  langButtonTextActive: { color: colors.text },
});
