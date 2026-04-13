import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, commonStyles, fontSize, spacing } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import {
  getActiveTactic,
  getTacticPositions,
  updateTactic,
} from '@/database/queries/tactics';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { Formation, Tactic } from '@/types';
import { Player, PlayerAttributes, Position } from '@/types';

type PlayerWithOvr = Player & { attributes: PlayerAttributes; overall: number };

const FORMATIONS: Formation[] = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-5-1'];

/** Map each formation to its rows of position roles (GK first, then defensive → midfield → attack) */
const FORMATION_ROWS: Record<string, string[][]> = {
  '4-4-2':   [['GK'], ['CB', 'CB', 'LB', 'RB'], ['CM', 'CM', 'LM', 'RM'], ['ST', 'ST']],
  '4-3-3':   [['GK'], ['CB', 'CB', 'LB', 'RB'], ['CDM', 'CM', 'CM'], ['LW', 'ST', 'RW']],
  '4-2-3-1': [['GK'], ['CB', 'CB', 'LB', 'RB'], ['CDM', 'CDM'], ['CAM', 'LM', 'RM'], ['ST']],
  '3-5-2':   [['GK'], ['CB', 'CB', 'CB'], ['CDM', 'CM', 'CM', 'LM', 'RM'], ['ST', 'ST']],
  '4-5-1':   [['GK'], ['CB', 'CB', 'LB', 'RB'], ['CDM', 'CM', 'CM', 'LM', 'RM'], ['ST']],
};

function bestPlayerForPosition(
  position: Position,
  squad: PlayerWithOvr[],
  usedIds: Set<number>,
): PlayerWithOvr | null {
  // Score each player for the given position, pick best unused
  const candidates = squad
    .filter((p) => !usedIds.has(p.id))
    .map((p) => ({
      player: p,
      score: calculateOverall(p.attributes, position),
    }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.player ?? null;
}

interface SlotAssignment {
  positionRole: string;
  player: PlayerWithOvr | null;
}

function buildLineup(
  formation: string,
  squad: PlayerWithOvr[],
): SlotAssignment[][] {
  const rows = FORMATION_ROWS[formation] ?? FORMATION_ROWS['4-4-2'];
  const usedIds = new Set<number>();
  return rows.map((row) =>
    row.map((role) => {
      const player = bestPlayerForPosition(role as Position, squad, usedIds);
      if (player) usedIds.add(player.id);
      return { positionRole: role, player };
    }),
  );
}

export function TacticsScreen() {
  const playerClubId = useGameStore((s) => s.playerClubId);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);

  const [tactic, setTactic] = useState<Tactic | null>(null);
  const [squad, setSquad] = useState<PlayerWithOvr[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFormation, setSelectedFormation] = useState<Formation>('4-4-2');
  const [autoLineup, setAutoLineup] = useState<SlotAssignment[][] | null>(null);

  useEffect(() => {
    if (!dbHandle || playerClubId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const activeTactic = getActiveTactic(dbHandle, playerClubId);
      setTactic(activeTactic);
      if (activeTactic) setSelectedFormation(activeTactic.formation);

      const basePlayers = getPlayersByClub(dbHandle, playerClubId);
      const withAttrs: PlayerWithOvr[] = [];
      for (const p of basePlayers) {
        const full = getPlayerById(dbHandle, p.id);
        if (full) {
          withAttrs.push({ ...full, overall: calculateOverall(full.attributes, full.position) });
        }
      }
      setSquad(withAttrs);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId]);

  const handleAutoSelect = useCallback(() => {
    const lineup = buildLineup(selectedFormation, squad);
    setAutoLineup(lineup);
  }, [selectedFormation, squad]);

  const handleFormationChange = useCallback(
    (formation: Formation) => {
      setSelectedFormation(formation);
      setAutoLineup(null);

      if (!dbHandle || !tactic) return;
      try {
        updateTactic(dbHandle, tactic.id, { formation });
        setTactic((prev) => (prev ? { ...prev, formation } : prev));
      } catch {
        // silently ignore DB errors in tactic update
      }
    },
    [dbHandle, tactic],
  );

  const displayLineup = useMemo(
    () => autoLineup ?? buildLineup(selectedFormation, squad),
    [autoLineup, selectedFormation, squad],
  );

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.scrollContent}>
      {/* Formation selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Formation</Text>
        <View style={styles.formationRow}>
          {FORMATIONS.map((f) => (
            <Pressable
              key={f}
              style={[styles.formationChip, selectedFormation === f && styles.formationChipActive]}
              onPress={() => handleFormationChange(f)}
            >
              <Text
                style={[
                  styles.formationChipText,
                  selectedFormation === f && styles.formationChipTextActive,
                ]}
              >
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Auto Select button */}
      <Pressable style={styles.autoSelectButton} onPress={handleAutoSelect}>
        <Text style={styles.autoSelectText}>⚡ Auto Select</Text>
      </Pressable>

      {/* Formation view */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Lineup · {selectedFormation}</Text>
        <View style={styles.pitchView}>
          {displayLineup.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.pitchRow}>
              {row.map((slot, slotIdx) => {
                const ovr = slot.player?.overall;
                const ovrColor = ovr
                  ? ovr >= 75
                    ? colors.success
                    : ovr >= 60
                    ? colors.warning
                    : colors.danger
                  : colors.textMuted;
                return (
                  <View key={slotIdx} style={styles.pitchSlot}>
                    <Text style={[styles.pitchRole, { color: colors.textMuted }]}>
                      {slot.positionRole}
                    </Text>
                    <Text style={styles.pitchPlayerName} numberOfLines={1}>
                      {slot.player ? slot.player.name.split(' ').pop() ?? slot.player.name : '—'}
                    </Text>
                    {slot.player && (
                      <Text style={[styles.pitchOverall, { color: ovrColor }]}>
                        {slot.player.overall}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  formationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  formationChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formationChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  formationChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  formationChipTextActive: {
    color: colors.text,
  },
  autoSelectButton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    paddingVertical: 10,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  autoSelectText: {
    color: colors.primaryLight,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  pitchView: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  pitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  pitchSlot: {
    alignItems: 'center',
    minWidth: 60,
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    padding: spacing.xs,
  },
  pitchRole: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pitchPlayerName: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  pitchOverall: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    marginTop: 1,
  },
});
