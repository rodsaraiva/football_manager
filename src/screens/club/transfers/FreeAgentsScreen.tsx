import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import { getPositionColor, getOverallColor } from '@/utils/player-colors';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getFreeAgents, getPlayerById } from '@/database/queries/players';
import {
  signFreeAgent,
  freeAgentExpectedWage,
} from '@/engine/transfer/free-agent-signing';
import { calculateOverall } from '@/utils/overall';
import { Player, Position } from '@/types';

type PositionFilter = 'All' | Position;

const POSITION_OPTIONS: PositionFilter[] = [
  'All', 'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST',
];

interface FreeAgentWithOverall extends Player {
  overall: number;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function parseNumber(input: string): number {
  const cleaned = input.replace(/[^0-9]/g, '');
  return cleaned === '' ? 0 : parseInt(cleaned, 10);
}

export function FreeAgentsScreen() {
  const { t } = useTranslation();
  const { playerClubId, season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;

  const [agents, setAgents] = useState<FreeAgentWithOverall[]>([]);
  const [loading, setLoading] = useState(true);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<FreeAgentWithOverall | null>(null);

  // Sign dialog state
  const [wageStr, setWageStr] = useState('');
  const [years, setYears] = useState(3);

  const load = useCallback(async () => {
    if (!dbHandle || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fa = await getFreeAgents(dbHandle, saveId);
      const hydrated: FreeAgentWithOverall[] = [];
      for (const p of fa) {
        const full = await getPlayerById(dbHandle, saveId, p.id);
        const overall = full ? calculateOverall(full.attributes, full.position) : 50;
        hydrated.push({ ...p, overall });
      }
      hydrated.sort((a, b) => b.overall - a.overall);
      setAgents(hydrated);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, saveId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = agents.filter(
    (a) => positionFilter === 'All' || a.position === positionFilter,
  );

  const handleOpenSign = useCallback((agent: FreeAgentWithOverall) => {
    setSelected(agent);
    const expected = freeAgentExpectedWage(agent.overall);
    setWageStr(String(expected));
    setYears(3);
  }, []);

  const handleCloseSign = useCallback(() => {
    setSelected(null);
    setWageStr('');
    setYears(3);
  }, []);

  const handleSubmitSigning = useCallback(async () => {
    if (!dbHandle || !selected || playerClubId === null || saveId == null) return;
    const wage = parseNumber(wageStr);
    const res = await signFreeAgent(dbHandle, saveId, {
      playerId: selected.id,
      clubId: playerClubId,
      wageOffered: wage,
      contractYears: years,
      playerOverall: selected.overall,
      season,
      week,
    });
    if (res.success) {
      Alert.alert(t('transfer.signed_title'), t('transfer.signed_msg', { name: selected.name }));
      handleCloseSign();
      load();
    } else {
      Alert.alert(t('transfer.cannot_sign'), res.reason ?? t('transfer.unknown_error'));
    }
  }, [dbHandle, selected, playerClubId, saveId, wageStr, years, season, week, handleCloseSign, load]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      {/* Position filter */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>{t('transfer.position_label')}</Text>
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setShowDropdown((v) => !v)}
        >
          <Text style={styles.dropdownButtonText}>{positionFilter === 'All' ? t('transfer.filter_all') : positionFilter} ▾</Text>
        </Pressable>
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          {POSITION_OPTIONS.map((pos) => (
            <Pressable
              key={pos}
              style={[styles.dropdownItem, positionFilter === pos && styles.dropdownItemActive]}
              onPress={() => {
                setPositionFilter(pos);
                setShowDropdown(false);
              }}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  positionFilter === pos && styles.dropdownItemTextActive,
                ]}
              >
                {pos === 'All' ? t('transfer.filter_all') : pos}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('transfer.no_free_agents')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const pColor = getPositionColor(item.position);
            const oColor = getOverallColor(item.overall);
            const expected = freeAgentExpectedWage(item.overall);
            return (
              <View style={styles.playerRow}>
                <View style={styles.positionBadge}>
                  <Text style={[styles.positionText, { color: pColor }]}>{item.position}</Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.playerMeta}>
                    {t('transfer.fa_meta', { age: item.age, wage: formatMoney(expected) })}
                  </Text>
                </View>
                <View style={[styles.overallBadge, { borderColor: oColor }]}>
                  <Text style={[styles.overallText, { color: oColor }]}>{item.overall}</Text>
                </View>
                <Pressable style={styles.signButton} onPress={() => handleOpenSign(item)}>
                  <Text style={styles.signButtonText}>{t('transfer.sign_btn')}</Text>
                </Pressable>
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Sign modal */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={handleCloseSign}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {selected && (
                <>
                  <Text style={styles.title}>{t('transfer.sign_free_agent')}</Text>

                  <View style={styles.playerCard}>
                    <Text style={styles.cardName}>{selected.name}</Text>
                    <Text style={styles.cardMeta}>
                      {t('transfer.player_meta', { position: selected.position, age: selected.age, ovr: selected.overall })}
                    </Text>
                    <View style={styles.cardStats}>
                      <View style={styles.cardStat}>
                        <Text style={styles.cardStatLabel}>{t('transfer.expected_wage')}</Text>
                        <Text style={styles.cardStatValue}>
                          {formatMoney(freeAgentExpectedWage(selected.overall))}/wk
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.fieldLabel}>{t('transfer.wage_offer')}</Text>
                  <TextInput
                    style={styles.input}
                    value={wageStr}
                    onChangeText={setWageStr}
                    keyboardType="numeric"
                    placeholder={t('transfer.wage_short')}
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.helper}>
                    {formatMoney(parseNumber(wageStr))}/wk —{' '}
                    {parseNumber(wageStr) >= freeAgentExpectedWage(selected.overall)
                      ? 'acceptable'
                      : 'below expectation'}
                  </Text>

                  <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>
                    {t('transfer.contract_length')}
                  </Text>
                  <View style={styles.yearsRow}>
                    {[1, 2, 3, 4, 5].map((y) => (
                      <Pressable
                        key={y}
                        style={[styles.yearChip, years === y && styles.yearChipActive]}
                        onPress={() => setYears(y)}
                      >
                        <Text style={[styles.yearChipText, years === y && styles.yearChipTextActive]}>
                          {t(y > 1 ? 'transfer.years_other' : 'transfer.years_one', { n: y })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.summary}>
                    {t('transfer.signing_bonus', { bonus: formatMoney(parseNumber(wageStr) * 4) })}
                  </Text>

                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.btn, styles.btnSecondary]}
                      onPress={handleCloseSign}
                    >
                      <Text style={styles.btnSecondaryText}>{t('common.cancel')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.btn, styles.btnPrimary]}
                      onPress={handleSubmitSigning}
                    >
                      <Text style={styles.btnPrimaryText}>{t('transfer.sign_player')}</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  dropdownButton: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownButtonText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  dropdown: {
    position: 'absolute',
    top: 52,
    left: spacing.md + 60,
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 100,
    elevation: 5,
    flexDirection: 'row',
    flexWrap: 'wrap',
    maxWidth: 280,
    padding: spacing.xs,
  },
  dropdownItem: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    margin: 2,
  },
  dropdownItemActive: {
    backgroundColor: colors.primary,
  },
  dropdownItemText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  dropdownItemTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    padding: spacing.sm,
  },
  positionBadge: {
    width: 44,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  positionText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  playerMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  overallBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  overallText: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  signButton: {
    backgroundColor: colors.success,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  signButtonText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  // Modal styles
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetContent: {
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  playerCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  cardMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  cardStats: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  cardStat: {
    flex: 1,
  },
  cardStatLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardStatValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: 2,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: fontSize.md,
  },
  helper: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  yearsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  yearChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  yearChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  yearChipTextActive: {
    color: colors.text,
  },
  summary: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnSecondaryText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
