/**
 * Radar Comparativo de Atributos
 *
 * Mostra o perfil de atributos de um jogador como spider chart,
 * com opção de sobrepor um segundo jogador ou a média da posição no elenco.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  FlatList,
} from 'react-native';
import { useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { alpha, colors, spacing, fontSize, commonStyles } from '@/theme';
import { SectionCard } from '@/components/SectionCard';
import { ValueBadge } from '@/components/ValueBadge';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getClubsByLeague } from '@/database/queries/clubs';
import { calculateOverall } from '@/utils/overall';
import { ATTRIBUTE_LABELS, SquadPlayer } from '@/engine/reports/technical-report';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { PlayerAttributes, Position } from '@/types';
import { RadarChart, RadarProfile } from '@/components/RadarChart';
import { RootStackParamList } from '@/navigation/types';

type RadarRouteProps = RouteProp<RootStackParamList, 'ReportsRadar'>;

type CompareMode = 'player' | 'position_avg';

const ATTR_KEYS = Object.keys(ATTRIBUTE_LABELS) as (keyof PlayerAttributes)[];

/** Maps a camelCase PlayerAttributes key to its shared `tactics.attr_*` i18n key. */
function attrI18nKey(k: keyof PlayerAttributes): TKey {
  return ('tactics.attr_' + String(k).replace(/([A-Z])/g, '_$1').toLowerCase()) as TKey;
}

function buildValues(attrs: PlayerAttributes): number[] {
  return ATTR_KEYS.map((k) => attrs[k] as number);
}

function computePositionAvgFromMap(
  leagueByPos: Map<Position, PlayerAttributes[]>,
  position: Position,
): number[] {
  const matching = leagueByPos.get(position) ?? [];
  if (matching.length === 0) return ATTR_KEYS.map(() => 50);
  return ATTR_KEYS.map((k) => {
    const sum = matching.reduce((acc, a) => acc + ((a[k] as number) ?? 0), 0);
    return Math.round(sum / matching.length);
  });
}

export function ReportsRadarScreen() {
  const route = useRoute<RadarRouteProps>();
  const { t } = useTranslation();
  const AXIS_LABELS = ATTR_KEYS.map((k) => t(attrI18nKey(k)));
  const { playerClub, playerClubId, currentSave } = useGameStore();
  const saveId = currentSave?.id;
  const { dbHandle } = useDatabaseStore();

  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  const [leagueByPos, setLeagueByPos] = useState<Map<Position, PlayerAttributes[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const [playerAId, setPlayerAId] = useState<number | null>(route.params?.playerAId ?? null);
  const [playerBId, setPlayerBId] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>('position_avg');

  const [showPickerA, setShowPickerA] = useState(false);
  const [showPickerB, setShowPickerB] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!dbHandle || !playerClub || !playerClubId || saveId == null) return;
      setLoading(true);
      (async () => {
        const ownSquad = await getPlayersWithAttributesByClub(dbHandle, saveId, playerClubId);
        const s: SquadPlayer[] = ownSquad.map((p) => ({
          id: p.id,
          name: p.name,
          age: p.age,
          position: p.position,
          overall: calculateOverall(p.attributes, p.position),
          basePotential: p.basePotential,
          effectivePotential: p.effectivePotential,
          injuryWeeksLeft: p.injuryWeeksLeft,
          attributes: p.attributes,
          morale: p.morale,
        }));
        setSquad(s);
        if (route.params?.playerAId == null && s.length > 0) {
          setPlayerAId(s[0].id);
        }

        const leagueClubs = await getClubsByLeague(dbHandle, saveId, playerClub.leagueId);
        const byPos = new Map<Position, PlayerAttributes[]>();
        const rosters = await Promise.all(
          leagueClubs.map((c) => getPlayersWithAttributesByClub(dbHandle, saveId, c.id)),
        );
        for (const roster of rosters) {
          for (const p of roster) {
            const list = byPos.get(p.position) ?? [];
            list.push(p.attributes);
            byPos.set(p.position, list);
          }
        }
        setLeagueByPos(byPos);
      })().finally(() => setLoading(false));
    }, [dbHandle, playerClub, playerClubId, route.params?.playerAId]),
  );

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.reportRadar} size="large" />
      </View>
    );
  }

  const playerA = squad.find((p) => p.id === playerAId) ?? null;
  const playerB = compareMode === 'player' ? (squad.find((p) => p.id === playerBId) ?? null) : null;

  // Build profiles
  const profiles: RadarProfile[] = [];
  if (playerA?.attributes) {
    profiles.push({
      label: `${playerA.name} (${playerA.overall})`,
      color: colors.primary,
      values: buildValues(playerA.attributes),
    });
  }
  if (compareMode === 'position_avg' && playerA) {
    const avgVals = computePositionAvgFromMap(leagueByPos, playerA.position);
    profiles.push({
      label: t('report.radar_league_avg_profile', { position: playerA.position }),
      color: colors.accent,
      values: avgVals,
    });
  } else if (compareMode === 'player' && playerB?.attributes) {
    profiles.push({
      label: `${playerB.name} (${playerB.overall})`,
      color: colors.accent,
      values: buildValues(playerB.attributes),
    });
  }

  // Delta table (only when 2 profiles with attrs)
  const deltaRows: { attrKey: keyof PlayerAttributes; delta: number }[] = [];
  if (profiles.length === 2 && playerA?.attributes) {
    const bVals =
      compareMode === 'position_avg' && playerA
        ? computePositionAvgFromMap(leagueByPos, playerA.position)
        : playerB?.attributes
        ? buildValues(playerB.attributes)
        : null;
    if (bVals) {
      const rows = ATTR_KEYS.map((k, i) => ({
        attrKey: k,
        delta: (playerA.attributes![k] as number) - bVals[i],
      }));
      rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      deltaRows.push(...rows);
    }
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Player A Picker */}
      <SectionCard title={t('report.radar_player_a')}>
        <Pressable style={styles.pickerBtn} onPress={() => setShowPickerA(!showPickerA)}>
          <Text style={styles.pickerBtnText}>
            {playerA ? `${playerA.name} · ${playerA.position} · OVR ${playerA.overall}` : t('report.radar_select')}
          </Text>
          <Text style={styles.chevron}>{showPickerA ? '▲' : '▼'}</Text>
        </Pressable>
        {showPickerA && (
          <View style={styles.pickerList}>
            {squad.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.pickerItem, p.id === playerAId && styles.pickerItemSelected]}
                onPress={() => {
                  setPlayerAId(p.id);
                  setShowPickerA(false);
                }}
              >
                <Text style={[styles.pickerItemText, p.id === playerAId && styles.pickerItemTextSelected]}>
                  {p.name} · {p.position} · OVR {p.overall}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </SectionCard>

      {/* Compare mode toggle */}
      <SectionCard title={t('report.radar_compare_with')}>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeChip, compareMode === 'position_avg' && styles.modeChipActive]}
            onPress={() => setCompareMode('position_avg')}
          >
            <Text style={[styles.modeChipText, compareMode === 'position_avg' && styles.modeChipTextActive]}>
              {t('report.radar_league_avg')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, compareMode === 'player' && styles.modeChipActive]}
            onPress={() => setCompareMode('player')}
          >
            <Text style={[styles.modeChipText, compareMode === 'player' && styles.modeChipTextActive]}>
              {t('report.radar_other_player')}
            </Text>
          </Pressable>
        </View>
      </SectionCard>

      {/* Player B Picker (only if mode = player) */}
      {compareMode === 'player' && (
        <SectionCard title={t('report.radar_player_b')}>
          <Pressable style={styles.pickerBtn} onPress={() => setShowPickerB(!showPickerB)}>
            <Text style={styles.pickerBtnText}>
              {playerB ? `${playerB.name} · ${playerB.position} · OVR ${playerB.overall}` : t('report.radar_select')}
            </Text>
            <Text style={styles.chevron}>{showPickerB ? '▲' : '▼'}</Text>
          </Pressable>
          {showPickerB && (
            <View style={styles.pickerList}>
              {squad
                .filter((p) => p.id !== playerAId)
                .map((p) => (
                  <Pressable
                    key={p.id}
                    style={[styles.pickerItem, p.id === playerBId && styles.pickerItemSelected]}
                    onPress={() => {
                      setPlayerBId(p.id);
                      setShowPickerB(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, p.id === playerBId && styles.pickerItemTextSelected]}>
                      {p.name} · {p.position} · OVR {p.overall}
                    </Text>
                  </Pressable>
                ))}
            </View>
          )}
        </SectionCard>
      )}

      {/* Radar Chart */}
      {profiles.length > 0 && (
        <SectionCard title="" style={styles.chartContainer}>
          <RadarChart profiles={profiles} axisLabels={AXIS_LABELS} size={300} />
        </SectionCard>
      )}

      {/* Delta table */}
      {deltaRows.length > 0 && (
        <SectionCard title={t('report.radar_diff_title')} subtitle={t('report.radar_diff_sub')}>
          {deltaRows.map(({ attrKey, delta }) => (
            <View key={attrKey} style={styles.deltaRow}>
              <Text style={styles.deltaLabel}>{t(attrI18nKey(attrKey))}</Text>
              <ValueBadge
                value={`${delta >= 0 ? '+' : ''}${delta}`}
                tone={delta >= 0 ? 'success' : 'danger'}
                size="sm"
              />
            </View>
          ))}
        </SectionCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    backgroundColor: colors.surfaceLight,
  },
  pickerBtnText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  pickerList: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    maxHeight: 200,
  },
  pickerItem: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerItemSelected: {
    backgroundColor: alpha(colors.primary, 0.2),
  },
  pickerItemText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  pickerItemTextSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeChip: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  modeChipTextActive: {
    color: colors.text,
  },
  chartContainer: {
    alignItems: 'center',
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  deltaLabel: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
  },
});
