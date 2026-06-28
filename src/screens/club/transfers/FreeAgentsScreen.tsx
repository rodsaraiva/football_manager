import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import {
  Card,
  Badge,
  Button,
  Chip,
  Sheet,
  EmptyState,
  useConfirm,
} from '@/components/kit';
import { Title, Body, Label, Caption, Stat } from '@/components/typography';
import { useTranslation } from '@/i18n';
import { getPositionColor, getOverallColor } from '@/utils/player-colors';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useCelebrationStore } from '@/store/celebration-store';
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
  const accent = useClubAccent();
  const confirm = useConfirm();
  const { playerClubId, season, week, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const saveId = currentSave?.id;

  const [agents, setAgents] = useState<FreeAgentWithOverall[]>([]);
  const [loading, setLoading] = useState(true);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('All');
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
    const playerName = selected.name;
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
      useCelebrationStore.getState().push({
        kind: 'transfer',
        titleKey: 'celebration.transfer',
        detail: playerName,
      });
      handleCloseSign();
      load();
      await confirm({ title: t('transfer.signed_title'), message: t('transfer.signed_msg', { name: playerName }), confirmLabel: t('kit.ok') });
    } else {
      await confirm({ title: t('transfer.cannot_sign'), message: res.reason ?? t('transfer.unknown_error'), confirmLabel: t('kit.ok'), tone: 'danger' });
    }
  }, [dbHandle, selected, playerClubId, saveId, wageStr, years, season, week, handleCloseSign, load, confirm, t]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      {/* Position filter */}
      <View style={styles.filterHeader}>
        <Label style={styles.filterLabel}>{t('transfer.position_label')}</Label>
      </View>
      <FlatList
        horizontal
        testID="free-agents-position-filter"
        accessibilityLabel={t('transfer.position_label')}
        data={POSITION_OPTIONS}
        keyExtractor={(p) => p}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: pos }) => (
          <Chip
            label={pos === 'All' ? t('transfer.filter_all') : pos}
            selected={positionFilter === pos}
            accent={accent.accent}
            onPress={() => setPositionFilter(pos)}
            testID={`chip-filter-${pos}`}
            accessibilityLabel={pos === 'All' ? t('transfer.filter_all') : pos}
          />
        )}
      />

      {filtered.length === 0 ? (
        <EmptyState
          art="search"
          title={t('transfer.no_free_agents')}
          ctaLabel={t('transfer.refresh_list')}
          onCtaPress={load}
          accent={accent.accent}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const pColor = getPositionColor(item.position);
            const oColor = getOverallColor(item.overall);
            const expected = freeAgentExpectedWage(item.overall);
            return (
              <Card variant="detail" accent={accent.accent} style={styles.playerRow}>
                <Badge value={item.position} accent={pColor} tone="accent" />
                <View style={styles.playerInfo}>
                  <Body numberOfLines={1}>{item.name}</Body>
                  <Label>{t('transfer.fa_meta', { age: item.age, wage: formatMoney(expected) })}</Label>
                </View>
                <Stat color={oColor} style={styles.ovr}>{item.overall}</Stat>
                <Button
                  label={t('transfer.sign_btn')}
                  variant="primary"
                  onPress={() => handleOpenSign(item)}
                  testID={`free-agent-sign-${item.id}`}
                  accessibilityLabel={t('transfer.sign_btn')}
                />
              </Card>
            );
          }}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Sign sheet */}
      <Sheet visible={selected !== null} onClose={handleCloseSign} testID="free-agent-sign-sheet">
        <ScrollView>
          {selected && (
            <>
              <Title style={styles.sheetTitle}>{t('transfer.sign_free_agent')}</Title>

              <Card variant="summary" style={styles.playerCard}>
                <Body style={styles.cardName}>{selected.name}</Body>
                <Label>
                  {t('transfer.player_meta', { position: selected.position, age: selected.age, ovr: selected.overall })}
                </Label>
                <View style={styles.cardStats}>
                  <View style={styles.cardStat}>
                    <Caption style={styles.fieldLabel}>{t('transfer.expected_wage')}</Caption>
                    <Stat>{formatMoney(freeAgentExpectedWage(selected.overall))}/wk</Stat>
                  </View>
                </View>
              </Card>

              <Caption style={styles.fieldLabel}>{t('transfer.wage_offer')}</Caption>
              <TextInput
                style={styles.input}
                value={wageStr}
                onChangeText={setWageStr}
                keyboardType="numeric"
                placeholder={t('transfer.wage_short')}
                placeholderTextColor={colors.textMuted}
              />
              <Caption style={styles.helper}>
                {formatMoney(parseNumber(wageStr))}/wk —{' '}
                {parseNumber(wageStr) >= freeAgentExpectedWage(selected.overall)
                  ? 'acceptable'
                  : 'below expectation'}
              </Caption>

              <Caption style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                {t('transfer.contract_length')}
              </Caption>
              <View style={styles.yearsRow}>
                {[1, 2, 3, 4, 5].map((y) => (
                  <Chip
                    key={y}
                    label={t(y > 1 ? 'transfer.years_other' : 'transfer.years_one', { n: y })}
                    selected={years === y}
                    accent={accent.accent}
                    onPress={() => setYears(y)}
                    testID={`year-${y}`}
                  />
                ))}
              </View>

              <Caption style={styles.summary}>
                {t('transfer.signing_bonus', { bonus: formatMoney(parseNumber(wageStr) * 4) })}
              </Caption>

              <View style={styles.actions}>
                <Button
                  label={t('common.cancel')}
                  variant="secondary"
                  onPress={handleCloseSign}
                  testID="free-agent-sign-cancel"
                  accessibilityLabel={t('common.cancel')}
                />
                <Button
                  label={t('transfer.sign_player')}
                  variant="primary"
                  onPress={handleSubmitSigning}
                  testID="free-agent-sign-confirm"
                  accessibilityLabel={t('transfer.sign_player')}
                />
              </View>
            </>
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  filterLabel: {
    color: colors.textSecondary,
  },
  filterRow: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  playerInfo: {
    flex: 1,
  },
  ovr: {
    marginHorizontal: spacing.sm,
  },
  sheetTitle: {
    marginBottom: spacing.md,
  },
  playerCard: {
    marginBottom: spacing.md,
  },
  cardName: {
    fontWeight: '700',
  },
  cardStats: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  cardStat: {
    flex: 1,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  fieldLabelSpaced: {
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: fontSize.md,
  },
  helper: {
    marginTop: spacing.xs,
  },
  yearsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summary: {
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
