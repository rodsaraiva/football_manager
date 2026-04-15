import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getAllSaves, deleteSave } from '@/database/queries/saves';
import { RootStackParamList } from '@/navigation/types';
import { SaveGame } from '@/types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'MainMenu'>;

export function MainMenuScreen() {
  const navigation = useNavigation<NavProp>();
  const { dbHandle, isReady } = useDatabaseStore();
  const loadSave = useGameStore((s) => s.loadSave);

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
    const confirmed = window.confirm(`Deletar "${save.name || `Save #${save.id}`}"?`);
    if (!confirmed || !dbHandle) return;
    await deleteSave(dbHandle, save.id);
    setSaves(prev => prev.filter(s => s.id !== save.id));
  }

  return (
    <View style={commonStyles.screen}>
      <View style={styles.titleSection}>
        <Text style={styles.title}>FOOTBALL MANAGER</Text>
        <Text style={styles.subtitle}>Career Mode</Text>
      </View>

      <View style={styles.buttonSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('NewGame')}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>NEW GAME</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : saves.length > 0 ? (
          <View style={styles.savesSection}>
            <Text style={styles.savesLabel}>LOAD GAME</Text>
            <ScrollView style={styles.savesList} showsVerticalScrollIndicator={false}>
              {saves.map((save) => (
                <View key={save.id} style={styles.saveCard}>
                  <TouchableOpacity
                    style={styles.saveCardContent}
                    onPress={() => handleLoadSave(save)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveName}>{save.name || `Save #${save.id}`}</Text>
                    <Text style={styles.saveMeta}>
                      Season {save.currentSeason} — Week {save.currentWeek}
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
            <Text style={styles.noSavesText}>No saved games</Text>
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
    borderRadius: 8,
    paddingVertical: 16,
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
    borderRadius: 8,
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
    marginTop: 2,
  },
  saveDifficulty: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  noSavesContainer: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  noSavesText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
