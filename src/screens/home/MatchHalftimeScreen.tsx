import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useAssistantStore } from '@/store/assistant-store';
import { RootStackParamList } from '@/navigation/types';
import { MatchEvent, Mentality, Pressing, Tempo } from '@/types';
import { Tactic } from '@/types/tactic';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { resumeSecondHalf, SecondHalfOverrides } from '@/engine/simulation/match-engine';
import { orientResultToFixture } from '@/engine/match-day/halftime';
import { advanceGameWeek } from '@/engine/game-loop';
import { resolveAdvanceReload } from '@/engine/advance-reload';
import { getPlayerById } from '@/database/queries/players';
import { getClubById } from '@/database/queries/clubs';
import { getFixturesByClub as getClubFixtures } from '@/database/queries/fixtures';
import { SeededRng } from '@/engine/rng';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

const MAX_MANUAL_SUBS = 3;
const SUB_CAP = 5; // engine MAX_SUBS

const MENTALITY_OPTIONS: Mentality[] = ['defensive', 'balanced', 'attacking'];
const PRESSING_OPTIONS: Pressing[] = ['low', 'medium', 'high'];
const TEMPO_OPTIONS: Tempo[] = ['slow', 'normal', 'fast'];

interface ChipRowProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onSelect: (v: T) => void;
  labelFor: (v: T) => string;
}

function ChipRow<T extends string>({ label, options, value, onSelect, labelFor }: ChipRowProps<T>) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.optionGroup}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.optionButton, value === opt && styles.optionButtonActive]}
            onPress={() => onSelect(opt)}
          >
            <Text style={[styles.optionButtonText, value === opt && styles.optionButtonTextActive]}>
              {labelFor(opt)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface PendingSub {
  outId: number;
  inId: number;
}

export function MatchHalftimeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();

  const {
    halftime,
    halftimeIsHome,
    halftimeOpponentName,
    halftimeBench,
    halftimeTactic,
    playerClub,
    currentSave,
    playerClubId,
    season,
    week,
    setLastMatchResult,
    setLastMatchContext,
    setHalftime,
    setPressPending,
    updateWeek,
    setPlayerClub,
    setRecentResults,
    setNewSeason,
    setLastRetiredPlayerIds,
    setPendingAnnouncedRetirementIds,
  } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { setPendingComment, setLastCommentWeek } = useAssistantStore();

  const [playerNames, setPlayerNames] = useState<Record<number, string>>({});
  const [mentality, setMentality] = useState<Mentality>(halftimeTactic?.mentality ?? 'balanced');
  const [pressing, setPressing] = useState<Pressing>(halftimeTactic?.pressing ?? 'medium');
  const [tempo, setTempo] = useState<Tempo>(halftimeTactic?.tempo ?? 'normal');
  const [subs, setSubs] = useState<PendingSub[]>([]);
  const [resuming, setResuming] = useState(false);

  // On-pitch XI (the engine's home side = the user's team) at H2 start.
  const onPitch: PlayerForStrength[] = useMemo(
    () => (halftime ? halftime.home.squad : []),
    [halftime],
  );
  const bench: PlayerForStrength[] = halftimeBench;

  // Load names for everyone on pitch, on bench, and in first-half events.
  useEffect(() => {
    if (!halftime || !dbHandle || !currentSave) return;
    const saveId = currentSave.id;
    (async () => {
      const ids = new Set<number>();
      for (const p of onPitch) ids.add(p.id);
      for (const p of bench) ids.add(p.id);
      for (const ev of halftime.events) {
        ids.add(ev.playerId);
        if (ev.secondaryPlayerId) ids.add(ev.secondaryPlayerId);
      }
      const names: Record<number, string> = {};
      for (const id of ids) {
        try {
          const p = await getPlayerById(dbHandle, saveId, id);
          if (p) names[id] = p.name;
        } catch { /* ignore */ }
      }
      setPlayerNames(names);
    })();
  }, [halftime, dbHandle, currentSave, onPitch, bench]);

  const nameOf = useCallback(
    (id: number) => {
      const full = playerNames[id];
      if (!full) return `#${id}`;
      const parts = full.split(' ');
      return parts[parts.length - 1];
    },
    [playerNames],
  );

  // ── No active match guard ──────────────────────────────────────────────
  if (!halftime || halftimeIsHome === null) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <Text style={styles.noDataText}>{t('halftime.no_match')}</Text>
        <Pressable style={styles.resumeButton} onPress={() => navigation.goBack()}>
          <Text style={styles.resumeButtonText}>{t('matchresult.continue')}</Text>
        </Pressable>
      </View>
    );
  }

  const userGoals = halftime.home.goals;
  const oppGoals = halftime.away.goals;
  // Score shown in the real fixture orientation.
  const userName = playerClub?.name ?? t('matchresult.home');
  const oppName = halftimeOpponentName ?? t('matchresult.opponent');
  const leftName = halftimeIsHome ? userName : oppName;
  const rightName = halftimeIsHome ? oppName : userName;
  const leftGoals = halftimeIsHome ? userGoals : oppGoals;
  const rightGoals = halftimeIsHome ? oppGoals : userGoals;

  // First-half stats derived from the user's TeamState (home) vs opponent (away).
  const hs = halftime.home;
  const as = halftime.away;

  const onPitchIds = new Set(onPitch.map(p => p.id));
  const usedOutIds = new Set(subs.map(s => s.outId));
  const usedInIds = new Set(subs.map(s => s.inId));
  const subsUsedSoFar = halftime.home.subsUsed;
  const canAddSub =
    subs.length < MAX_MANUAL_SUBS &&
    subsUsedSoFar + subs.length < SUB_CAP &&
    bench.length > usedInIds.size &&
    onPitch.length > usedOutIds.size;

  const addSub = () => {
    const out = onPitch.find(p => !usedOutIds.has(p.id));
    const inn = bench.find(p => !usedInIds.has(p.id));
    if (out && inn) setSubs([...subs, { outId: out.id, inId: inn.id }]);
  };
  const removeSub = (idx: number) => setSubs(subs.filter((_, i) => i !== idx));
  const setSubOut = (idx: number, outId: number) =>
    setSubs(subs.map((s, i) => (i === idx ? { ...s, outId } : s)));
  const setSubIn = (idx: number, inId: number) =>
    setSubs(subs.map((s, i) => (i === idx ? { ...s, inId } : s)));

  const handleResume = async () => {
    if (resuming || !dbHandle || !currentSave || !playerClubId) return;
    setResuming(true);
    try {
      const newTactic: Tactic = {
        ...(halftimeTactic as Tactic),
        mentality,
        pressing,
        tempo,
      };
      const overrides: SecondHalfOverrides = {
        homeTactic: newTactic,
        homeSubs: subs.filter(s => onPitchIds.has(s.outId)),
      };
      // Resume with the live rng held in the halftime snapshot.
      const engineResult = resumeSecondHalf(halftime, overrides);
      // Re-orient to the fixture's home/away frame before persisting.
      const fixtureResult = orientResultToFixture(engineResult, halftimeIsHome);

      setLastMatchContext(halftimeIsHome, oppName);

      const rng = new SeededRng(season * 1000 + week);
      const result = await advanceGameWeek({
        dbHandle,
        season,
        week,
        playerClubId,
        saveId: currentSave.id,
        rng,
        userMatchResultOverride: fixtureResult,
      });

      updateWeek(result.newSeason, result.newWeek);
      if (result.playerMatchResult) setLastMatchResult(result.playerMatchResult);
      // Mirror the press gate the engine armed (a user match was played) so the
      // MatchResult continue button routes into the press conference.
      if (result.playerMatchResult) setPressPending(true);
      if (result.assistantComment) {
        setPendingComment(result.assistantComment);
        setLastCommentWeek(result.newWeek);
      }
      setHalftime(null);

      const updatedClub = await getClubById(dbHandle, currentSave.id, playerClubId);
      if (updatedClub) setPlayerClub(updatedClub);

      const reload = resolveAdvanceReload({ result, season });
      const allFixtures = await getClubFixtures(dbHandle, currentSave.id, playerClubId, reload.fetchSeasonForRecents);
      setRecentResults(allFixtures.filter(f => f.played).slice(-5));

      if (reload.shouldStartNewSeason) setNewSeason(true);
      if (result.retiringPlayerIds.length > 0) setLastRetiredPlayerIds(result.retiringPlayerIds);
      if (result.newlyAnnouncedRetirementIds.length > 0) {
        setPendingAnnouncedRetirementIds(result.newlyAnnouncedRetirementIds);
      }

      navigation.replace('MatchResult', { fixtureId: halftime.input.fixtureId });
    } catch (err) {
      console.error('[MatchHalftime] resume failed:', err);
      setResuming(false);
    }
  };

  const firstHalfEvents = halftime.events.filter(
    e => e.type !== 'assist' && e.type !== 'shot_off_target' && e.type !== 'save',
  );

  const getIcon = (type: MatchEvent['type']) => {
    if (type === 'goal') return '⚽';
    if (type === 'penalty_scored') return '⚽(P)';
    if (type === 'penalty_missed') return '❌(P)';
    if (type === 'free_kick_scored') return '⚽(FK)';
    if (type === 'yellow') return '🟨';
    if (type === 'red') return '🟥';
    if (type === 'injury') return '🏥';
    if (type === 'substitution') return '🔄';
    return '•';
  };

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Partial score */}
      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>{t('halftime.partial_score')}</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.teamName} numberOfLines={1}>{leftName}</Text>
          <View style={styles.scoreBox}>
            <Text style={styles.score}>{leftGoals} - {rightGoals}</Text>
          </View>
          <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={1}>{rightName}</Text>
        </View>
        <Text style={styles.title}>{t('halftime.title')}</Text>
      </View>

      {/* First-half stats (user perspective on the left) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('halftime.first_half_stats')}</Text>
        <View style={styles.statsCard}>
          <StatLine label={t('halftime.possession')} user={`${userPossession(hs, as)}%`} opp={`${100 - userPossession(hs, as)}%`} />
          <StatLine label={t('halftime.shots')} user={hs.shots} opp={as.shots} />
          <StatLine label={t('halftime.shots_on_target')} user={hs.shotsOnTarget} opp={as.shotsOnTarget} />
          <StatLine label={t('halftime.fouls')} user={hs.fouls} opp={as.fouls} />
          <StatLine label={t('halftime.corners')} user={hs.corners} opp={as.corners} />
          <StatLine label={t('halftime.xg')} user={hs.xG.toFixed(2)} opp={as.xG.toFixed(2)} />
        </View>
      </View>

      {/* First-half events */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('halftime.first_half_events')}</Text>
        {firstHalfEvents.length === 0 ? (
          <Text style={styles.emptyText}>{t('halftime.no_events')}</Text>
        ) : (
          <View style={styles.statsCard}>
            {firstHalfEvents.map((ev, idx) => (
              <View key={idx} style={styles.eventRow}>
                <Text style={styles.eventMinute}>{ev.minute}'</Text>
                <Text style={styles.eventIcon}>{getIcon(ev.type)}</Text>
                <Text style={styles.eventName} numberOfLines={1}>{nameOf(ev.playerId)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Substitutions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('halftime.substitutions')}</Text>
        <Text style={styles.subsUsed}>
          {t('halftime.subs_used', { used: subsUsedSoFar + subs.length, max: SUB_CAP })}
        </Text>
        {bench.length === 0 ? (
          <Text style={styles.emptyText}>{t('halftime.bench_empty')}</Text>
        ) : (
          <View style={styles.statsCard}>
            {subs.map((sub, idx) => (
              <View key={idx} style={styles.subEditor}>
                <View style={styles.subPickerCol}>
                  <Text style={styles.subPickerLabel}>{t('halftime.pick_out')}</Text>
                  <View style={styles.chipWrap}>
                    {onPitch
                      .filter(p => p.id === sub.outId || !usedOutIds.has(p.id))
                      .map(p => (
                        <Pressable
                          key={p.id}
                          style={[styles.miniChip, sub.outId === p.id && styles.miniChipActive]}
                          onPress={() => setSubOut(idx, p.id)}
                        >
                          <Text style={[styles.miniChipText, sub.outId === p.id && styles.miniChipTextActive]}>
                            {p.position} {nameOf(p.id)}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                  <Text style={styles.subPickerLabel}>{t('halftime.pick_in')}</Text>
                  <View style={styles.chipWrap}>
                    {bench
                      .filter(p => p.id === sub.inId || !usedInIds.has(p.id))
                      .map(p => (
                        <Pressable
                          key={p.id}
                          style={[styles.miniChip, sub.inId === p.id && styles.miniChipActive]}
                          onPress={() => setSubIn(idx, p.id)}
                        >
                          <Text style={[styles.miniChipText, sub.inId === p.id && styles.miniChipTextActive]}>
                            {p.position} {nameOf(p.id)}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                </View>
                <Pressable style={styles.removeBtn} onPress={() => removeSub(idx)}>
                  <Text style={styles.removeBtnText}>{t('halftime.remove_sub')}</Text>
                </Pressable>
              </View>
            ))}
            {canAddSub && (
              <Pressable style={styles.addSubBtn} onPress={addSub}>
                <Text style={styles.addSubBtnText}>{t('halftime.add_sub')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Tactical tweaks */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('halftime.tactics')}</Text>
        <View style={styles.statsCard}>
          <ChipRow
            label={t('halftime.label_mentality')}
            options={MENTALITY_OPTIONS}
            value={mentality}
            onSelect={setMentality}
            labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          />
          <View style={styles.divider} />
          <ChipRow
            label={t('halftime.label_pressing')}
            options={PRESSING_OPTIONS}
            value={pressing}
            onSelect={setPressing}
            labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          />
          <View style={styles.divider} />
          <ChipRow
            label={t('halftime.label_tempo')}
            options={TEMPO_OPTIONS}
            value={tempo}
            onSelect={setTempo}
            labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
          />
        </View>
      </View>

      {/* Resume */}
      <Pressable
        style={[styles.resumeButton, resuming && styles.resumeButtonDisabled]}
        onPress={handleResume}
        disabled={resuming}
      >
        {resuming ? (
          <View style={styles.resumingRow}>
            <ActivityIndicator color={colors.text} size="small" />
            <Text style={[styles.resumeButtonText, { marginLeft: spacing.sm }]}>{t('halftime.resuming')}</Text>
          </View>
        ) : (
          <Text style={styles.resumeButtonText}>{t('halftime.resume')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

// Possession of the user's side from the H2-start TeamStates (mirrors the engine's
// midfield-share base — only an indicative parcial, not the final possession roll).
function userPossession(home: { strength: { midfield: number } }, away: { strength: { midfield: number } }): number {
  const total = home.strength.midfield + away.strength.midfield;
  if (total <= 0) return 50;
  return Math.round((home.strength.midfield / total) * 100);
}

interface StatLineProps {
  label: string;
  user: number | string;
  opp: number | string;
}
function StatLine({ label, user, opp }: StatLineProps) {
  return (
    <View style={styles.statLine}>
      <Text style={styles.statValue}>{user}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { textAlign: 'right' }]}>{opp}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl * 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noDataText: { color: colors.textSecondary, fontSize: fontSize.lg, marginBottom: spacing.lg },
  scoreCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  scoreLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  teamName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', flex: 1, textAlign: 'left' },
  teamNameRight: { textAlign: 'right' },
  scoreBox: { paddingHorizontal: spacing.md },
  score: { color: colors.text, fontSize: fontSize.xxl, fontWeight: 'bold' },
  title: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: spacing.sm,
  },
  section: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  statValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600', width: 50 },
  statLabel: { color: colors.textMuted, fontSize: fontSize.xs, flex: 1, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, fontStyle: 'italic' },
  eventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  eventMinute: { color: colors.primary, fontSize: fontSize.sm, fontWeight: 'bold', width: 36 },
  eventIcon: { fontSize: fontSize.sm, width: 32, textAlign: 'center' },
  eventName: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  subsUsed: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.sm },
  subEditor: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  subPickerCol: { flex: 1 },
  subPickerLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  miniChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  miniChipText: { color: colors.textSecondary, fontSize: fontSize.xs },
  miniChipTextActive: { color: colors.text, fontWeight: '700' },
  removeBtn: { alignSelf: 'flex-end', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  removeBtnText: { color: colors.danger, fontSize: fontSize.xs, fontWeight: '600' },
  addSubBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addSubBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  settingRow: { paddingVertical: spacing.sm },
  settingLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  optionGroup: { flexDirection: 'row', gap: spacing.sm },
  optionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  optionButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionButtonText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  optionButtonTextActive: { color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xxs },
  resumeButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  resumeButtonDisabled: { opacity: 0.6 },
  resumeButtonText: { color: colors.text, fontSize: fontSize.lg, fontWeight: 'bold', letterSpacing: 1 },
  resumingRow: { flexDirection: 'row', alignItems: 'center' },
});
