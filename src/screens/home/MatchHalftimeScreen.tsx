import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, Button, Chip, Icon } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Display, Title, Body, Label, Caption, Stat } from '@/components/typography';
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
import { getFixturesByClub as getClubFixtures, countClubWins } from '@/database/queries/fixtures';
import { processAchievementCheckpoint } from '@/engine/achievements/achievements-checkpoint';
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
  accent: string;
}

function ChipRow<T extends string>({ label, options, value, onSelect, labelFor, accent }: ChipRowProps<T>) {
  return (
    <View style={styles.settingRow}>
      <Label style={styles.settingLabel}>{label}</Label>
      <View style={styles.optionGroup}>
        {options.map((opt) => (
          <View key={opt} style={styles.optionItem}>
            <Chip
              label={labelFor(opt)}
              selected={value === opt}
              accent={accent}
              onPress={() => onSelect(opt)}
              testID={`halftime-opt-${opt}`}
              accessibilityLabel={labelFor(opt)}
            />
          </View>
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
  const accent = useClubAccent();
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
    setPendingAchievementToastIds,
    setPendingInternationalCallUpCount,
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
        <Body style={styles.noDataText}>{t('halftime.no_match')}</Body>
        <View style={styles.guardButton}>
          <Button
            label={t('matchresult.continue')}
            variant="primary"
            onPress={() => navigation.goBack()}
            testID="halftime-back"
            accessibilityLabel={t('matchresult.continue')}
          />
        </View>
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

      // Post-match achievement checkpoint (USER perspective). The toast surfaces on Home
      // via the store, since this path navigates away to MatchResult.
      if (result.playerMatchResult) {
        const pmr = result.playerMatchResult;
        const myGoals = halftimeIsHome ? pmr.homeGoals : pmr.awayGoals;
        const oppGoals = halftimeIsHome ? pmr.awayGoals : pmr.homeGoals;
        const totalWins = await countClubWins(dbHandle, currentSave.id, playerClubId);
        try {
          const newly = await processAchievementCheckpoint({
            db: dbHandle,
            saveId: currentSave.id,
            season,
            week,
            snapshot: { justWon: myGoals > oppGoals, goalMargin: myGoals - oppGoals, totalWins },
          });
          if (newly.length > 0) setPendingAchievementToastIds(newly.map((d) => d.id));
        } catch { /* best-effort */ }
      }
      if (result.assistantComment) {
        setPendingComment(result.assistantComment);
        setLastCommentWeek(result.newWeek);
      }
      // P9: surface the international call-up notice on Home (this path navigates away).
      setPendingInternationalCallUpCount(result.internationalCallUps?.length ?? 0);
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

  const getIcon = (type: MatchEvent['type']): { name: IconName; color: string; suffix?: string } => {
    if (type === 'goal') return { name: 'goal', color: colors.text };
    if (type === 'penalty_scored') return { name: 'goal', color: colors.text, suffix: '(P)' };
    if (type === 'penalty_missed') return { name: 'close', color: colors.danger, suffix: '(P)' };
    if (type === 'free_kick_scored') return { name: 'goal', color: colors.text, suffix: '(FK)' };
    if (type === 'yellow') return { name: 'yellow', color: colors.warning };
    if (type === 'red') return { name: 'red', color: colors.danger };
    if (type === 'injury') return { name: 'injury', color: colors.danger };
    if (type === 'substitution') return { name: 'sub', color: colors.textSecondary };
    return { name: 'target', color: colors.textMuted };
  };

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Partial score */}
      <Card variant="hero" accent={accent.accent} style={styles.scoreCard}>
        <Label style={styles.scoreLabel}>{t('halftime.partial_score')}</Label>
        <View style={styles.scoreRow}>
          <Body numberOfLines={1} style={styles.teamName}>{leftName}</Body>
          <View style={styles.scoreBox}>
            <Display>{leftGoals} - {rightGoals}</Display>
          </View>
          <Body numberOfLines={1} style={[styles.teamName, styles.teamNameRight]}>{rightName}</Body>
        </View>
        <Label color={accent.accent} style={styles.title}>{t('halftime.title')}</Label>
      </Card>

      {/* First-half stats (user perspective on the left) */}
      <View style={styles.section}>
        <Title style={styles.sectionTitle}>{t('halftime.first_half_stats')}</Title>
        <Card variant="summary" accent={accent.accent}>
          <StatLine label={t('halftime.possession')} user={`${userPossession(hs, as)}%`} opp={`${100 - userPossession(hs, as)}%`} />
          <StatLine label={t('halftime.shots')} user={hs.shots} opp={as.shots} />
          <StatLine label={t('halftime.shots_on_target')} user={hs.shotsOnTarget} opp={as.shotsOnTarget} />
          <StatLine label={t('halftime.fouls')} user={hs.fouls} opp={as.fouls} />
          <StatLine label={t('halftime.corners')} user={hs.corners} opp={as.corners} />
          <StatLine label={t('halftime.xg')} user={hs.xG.toFixed(2)} opp={as.xG.toFixed(2)} />
        </Card>
      </View>

      {/* First-half events */}
      <View style={styles.section}>
        <Title style={styles.sectionTitle}>{t('halftime.first_half_events')}</Title>
        {firstHalfEvents.length === 0 ? (
          <Caption style={styles.emptyText}>{t('halftime.no_events')}</Caption>
        ) : (
          <Card variant="summary" accent={accent.accent}>
            {firstHalfEvents.map((ev, idx) => {
              const g = getIcon(ev.type);
              return (
                <View key={idx} style={styles.eventRow}>
                  <Label color={accent.accent} style={styles.eventMinute}>{ev.minute}'</Label>
                  <View style={styles.eventIcon}>
                    <Icon name={g.name} color={g.color} size={fontSize.md} />
                    {g.suffix != null && <Caption color={g.color}>{g.suffix}</Caption>}
                  </View>
                  <Body numberOfLines={1} style={styles.eventName}>{nameOf(ev.playerId)}</Body>
                </View>
              );
            })}
          </Card>
        )}
      </View>

      {/* Substitutions */}
      <View style={styles.section}>
        <Title style={styles.sectionTitle}>{t('halftime.substitutions')}</Title>
        <Caption style={styles.subsUsed}>
          {t('halftime.subs_used', { used: subsUsedSoFar + subs.length, max: SUB_CAP })}
        </Caption>
        {bench.length === 0 ? (
          <Caption style={styles.emptyText}>{t('halftime.bench_empty')}</Caption>
        ) : (
          <Card variant="summary" accent={accent.accent}>
            {subs.map((sub, idx) => (
              <View key={idx} style={styles.subEditor}>
                <View style={styles.subPickerCol}>
                  <Label style={styles.subPickerLabel}>{t('halftime.pick_out')}</Label>
                  <View style={styles.chipWrap}>
                    {onPitch
                      .filter(p => p.id === sub.outId || !usedOutIds.has(p.id))
                      .map(p => (
                        <Chip
                          key={p.id}
                          label={`${p.position} ${nameOf(p.id)}`}
                          selected={sub.outId === p.id}
                          accent={accent.accent}
                          onPress={() => setSubOut(idx, p.id)}
                          testID={`halftime-out-${p.id}`}
                          accessibilityLabel={`${p.position} ${nameOf(p.id)}`}
                        />
                      ))}
                  </View>
                  <Label style={styles.subPickerLabel}>{t('halftime.pick_in')}</Label>
                  <View style={styles.chipWrap}>
                    {bench
                      .filter(p => p.id === sub.inId || !usedInIds.has(p.id))
                      .map(p => (
                        <Chip
                          key={p.id}
                          label={`${p.position} ${nameOf(p.id)}`}
                          selected={sub.inId === p.id}
                          accent={accent.accent}
                          onPress={() => setSubIn(idx, p.id)}
                          testID={`halftime-in-${p.id}`}
                          accessibilityLabel={`${p.position} ${nameOf(p.id)}`}
                        />
                      ))}
                  </View>
                </View>
                <View style={styles.removeBtn}>
                  <Button
                    label={t('halftime.remove_sub')}
                    variant="ghost"
                    onPress={() => removeSub(idx)}
                    testID={`halftime-remove-${idx}`}
                    accessibilityLabel={t('halftime.remove_sub')}
                  />
                </View>
              </View>
            ))}
            {canAddSub && (
              <View style={styles.addSubBtn}>
                <Button
                  label={t('halftime.add_sub')}
                  variant="secondary"
                  onPress={addSub}
                  testID="halftime-add-sub"
                  accessibilityLabel={t('halftime.add_sub')}
                />
              </View>
            )}
          </Card>
        )}
      </View>

      {/* Tactical tweaks */}
      <View style={styles.section}>
        <Title style={styles.sectionTitle}>{t('halftime.tactics')}</Title>
        <Card variant="summary" accent={accent.accent}>
          <ChipRow
            label={t('halftime.label_mentality')}
            options={MENTALITY_OPTIONS}
            value={mentality}
            onSelect={setMentality}
            labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
            accent={accent.accent}
          />
          <View style={styles.divider} />
          <ChipRow
            label={t('halftime.label_pressing')}
            options={PRESSING_OPTIONS}
            value={pressing}
            onSelect={setPressing}
            labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
            accent={accent.accent}
          />
          <View style={styles.divider} />
          <ChipRow
            label={t('halftime.label_tempo')}
            options={TEMPO_OPTIONS}
            value={tempo}
            onSelect={setTempo}
            labelFor={(o) => t(`tactics.opt_${o}` as TKey)}
            accent={accent.accent}
          />
        </Card>
      </View>

      {/* Resume */}
      <View style={styles.resumeWrap}>
        <Button
          label={resuming ? t('halftime.resuming') : t('halftime.resume')}
          variant="primary"
          loading={resuming}
          disabled={resuming}
          onPress={handleResume}
          testID="halftime-resume"
          accessibilityLabel={t('halftime.resume')}
        />
      </View>
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
      <Stat style={styles.statValue}>{user}</Stat>
      <Label style={styles.statLabel}>{label}</Label>
      <Stat style={[styles.statValue, styles.statValueRight]}>{opp}</Stat>
    </View>
  );
}

const styles = {
  container: { paddingBottom: spacing.xxl },
  centered: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const },
  noDataText: { marginBottom: spacing.lg },
  guardButton: { alignSelf: 'stretch' as const, marginHorizontal: spacing.md },
  scoreCard: {
    margin: spacing.md,
    alignItems: 'center' as const,
  },
  scoreLabel: {
    marginBottom: spacing.sm,
  },
  scoreRow: { flexDirection: 'row' as const, alignItems: 'center' as const, width: '100%' as const },
  teamName: { flex: 1, textAlign: 'left' as const },
  teamNameRight: { textAlign: 'right' as const },
  scoreBox: { paddingHorizontal: spacing.md },
  title: {
    marginTop: spacing.sm,
  },
  section: { marginHorizontal: spacing.md, marginBottom: spacing.md },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  statLine: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: spacing.xs },
  statValue: { width: spacing.xxl },
  statValueRight: { textAlign: 'right' as const },
  statLabel: { flex: 1, textAlign: 'center' as const },
  emptyText: { fontStyle: 'italic' as const },
  eventRow: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: spacing.xxs },
  eventMinute: { width: spacing.xl },
  eventIcon: { width: spacing.xl, alignItems: 'center' as const },
  eventName: { flex: 1 },
  subsUsed: { marginBottom: spacing.sm },
  subEditor: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  subPickerCol: { flex: 1 },
  subPickerLabel: {
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  chipWrap: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs },
  removeBtn: { alignSelf: 'flex-end' as const, marginTop: spacing.xs },
  addSubBtn: {
    marginTop: spacing.sm,
  },
  settingRow: { paddingVertical: spacing.sm },
  settingLabel: {
    marginBottom: spacing.sm,
  },
  optionGroup: { flexDirection: 'row' as const, gap: spacing.sm, flexWrap: 'wrap' as const },
  optionItem: {},
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xxs },
  resumeWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
};
