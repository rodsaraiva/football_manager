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
import { SecondHalfOverrides } from '@/engine/simulation/match-engine';
import { advanceToNextWindow, finishLiveMatch, nextWindowBlock } from '@/engine/match-day/live-match';
import { getAssistantByRole } from '@/database/queries/assistants';
import type { AssistantArchetype } from '@/types/assistant';
import type { MatchAdvice } from '@/types/match-advice';
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
    liveWindowKind,
    liveAdvice,
    playerClub,
    currentSave,
    playerClubId,
    season,
    week,
    setLastMatchResult,
    setLastMatchContext,
    setLive,
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

  // ── Live-window framing (C7) ───────────────────────────────────────────
  const windowKind = liveWindowKind ?? 'halftime';
  // Janelas já consumidas: intervalo conta 1; cada janela do 2º tempo (currentBlock>=22) +1.
  const windowsUsed = halftime.currentBlock >= 22 ? 2 : 1;
  // Última janela quando não há mais ponto fixo de pausa antes do fim.
  const isLastWindow = nextWindowBlock(halftime.currentBlock, windowsUsed) === null;

  // Aplica um conselho ao painel de ajustes (pré-preenche o controle correspondente).
  const applyAdvice = (advice: MatchAdvice) => {
    if (advice.suggestedMentality) setMentality(advice.suggestedMentality);
    if (advice.suggestedPressing) setPressing(advice.suggestedPressing);
    if (
      advice.suggestedSubOutId != null &&
      advice.suggestedSubInId != null &&
      canAddSub &&
      onPitchIds.has(advice.suggestedSubOutId) &&
      !usedOutIds.has(advice.suggestedSubOutId) &&
      !usedInIds.has(advice.suggestedSubInId)
    ) {
      setSubs([...subs, { outId: advice.suggestedSubOutId, inId: advice.suggestedSubInId }]);
    }
  };

  const buildOverrides = (): SecondHalfOverrides => ({
    homeTactic: { ...(halftimeTactic as Tactic), mentality, pressing, tempo },
    homeSubs: subs.filter(s => onPitchIds.has(s.outId)),
  });

  // Recarrega o arquétipo/qualidade do assistente p/ recomputar conselho na próxima janela.
  const loadAssistantMeta = async (): Promise<{ archetype: AssistantArchetype; qualityStars: number }> => {
    const a = currentSave ? await getAssistantByRole(dbHandle!, currentSave.id, 'squad') : null;
    return { archetype: (a?.archetype as AssistantArchetype) ?? 'tactician', qualityStars: a?.qualityStars ?? 3 };
  };

  // Avança para a PRÓXIMA janela do 2º tempo (sem finalizar). Permanece na tela.
  const handleAdvance = async () => {
    if (resuming || !dbHandle || !currentSave || !playerClubId) return;
    setResuming(true);
    try {
      const { archetype, qualityStars } = await loadAssistantMeta();
      const next = advanceToNextWindow({
        state: halftime,
        isHome: halftimeIsHome,
        opponentName: oppName,
        windowsUsed,
        overrides: buildOverrides(),
        // D7 (settings-store) fornecerá os toggles de trigger; engine já suporta.
        triggers: [],
        archetype,
        qualityStars,
      });
      if (!next) {
        // Já chegou ao fim — finaliza direto (overrides já aplicados acima ⇒ vazios).
        await finalizeMatch({});
        return;
      }
      setLive({
        halftime: next.state,
        isHome: next.isHome,
        opponentName: next.opponentName,
        bench: next.homeBench,
        tactic: next.homeTactic,
        fixtureId: next.fixtureId,
        windowKind: next.windowKind,
        advice: next.advice,
      });
      // Reset dos controles para o estado tático corrente da nova janela.
      setMentality(next.homeTactic.mentality);
      setPressing(next.homeTactic.pressing);
      setTempo(next.homeTactic.tempo);
      setSubs([]);
      setResuming(false);
    } catch (err) {
      console.error('[MatchHalftime] advance failed:', err);
      setResuming(false);
    }
  };

  // Finaliza a partida (aplica overrides finais, roda até o fim, persiste).
  const finalizeMatch = async (overrides: SecondHalfOverrides) => {
    if (!dbHandle || !currentSave || !playerClubId) return;
    const fixtureResult = finishLiveMatch({ state: halftime, isHome: halftimeIsHome, overrides });

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
    if (result.playerMatchResult) setPressPending(true);

    if (result.playerMatchResult) {
      const pmr = result.playerMatchResult;
      const myGoals = halftimeIsHome ? pmr.homeGoals : pmr.awayGoals;
      const oppG = halftimeIsHome ? pmr.awayGoals : pmr.homeGoals;
      const totalWins = await countClubWins(dbHandle, currentSave.id, playerClubId);
      try {
        const newly = await processAchievementCheckpoint({
          db: dbHandle,
          saveId: currentSave.id,
          season,
          week,
          snapshot: { justWon: myGoals > oppG, goalMargin: myGoals - oppG, totalWins },
        });
        if (newly.length > 0) setPendingAchievementToastIds(newly.map((d) => d.id));
      } catch { /* best-effort */ }
    }
    if (result.assistantComment) {
      setPendingComment(result.assistantComment);
      setLastCommentWeek(result.newWeek);
    }
    setPendingInternationalCallUpCount(result.internationalCallUps?.length ?? 0);
    setLive(null);

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
  };

  const handleFinish = async () => {
    if (resuming || !dbHandle || !currentSave || !playerClubId) return;
    setResuming(true);
    try {
      await finalizeMatch(buildOverrides());
    } catch (err) {
      console.error('[MatchHalftime] finish failed:', err);
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
        <Label color={accent.accent} style={styles.title}>{t(`live.window_${windowKind}` as TKey)}</Label>
      </Card>

      {/* Assistant advice panel (C7) */}
      <View style={styles.section}>
        <Title style={styles.sectionTitle}>{t('live.advice_title')}</Title>
        {liveAdvice.length === 0 ? (
          <Caption style={styles.emptyText}>{t('live.no_advice')}</Caption>
        ) : (
          <Card variant="summary" accent={accent.accent}>
            {liveAdvice.map((advice, idx) => {
              const canApply =
                advice.suggestedMentality != null ||
                advice.suggestedPressing != null ||
                (advice.suggestedSubOutId != null && advice.suggestedSubInId != null);
              return (
                <View key={idx} style={styles.adviceRow}>
                  <Body numberOfLines={2} style={styles.adviceText}>{t(advice.text.key, advice.text.vars)}</Body>
                  {canApply && (
                    <View style={styles.adviceApply}>
                      <Button
                        label={t('live.apply')}
                        variant="ghost"
                        onPress={() => applyAdvice(advice)}
                        testID={`advice-apply-${advice.kind}`}
                        accessibilityLabel={t('live.apply')}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        )}
      </View>

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

      {/* Continue / Finish (C7 live windows) */}
      <View style={styles.resumeWrap}>
        {!isLastWindow && (
          <View style={styles.advanceBtn}>
            <Button
              label={t('live.advance')}
              variant="secondary"
              loading={resuming}
              disabled={resuming}
              onPress={handleAdvance}
              testID="live-advance"
              accessibilityLabel={t('live.advance')}
            />
          </View>
        )}
        <Button
          label={resuming ? t('halftime.resuming') : t('live.finish')}
          variant="primary"
          loading={resuming}
          disabled={resuming}
          onPress={handleFinish}
          testID="live-finish"
          accessibilityLabel={t('live.finish')}
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
  advanceBtn: { marginBottom: spacing.sm },
  adviceRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing.xs,
  },
  adviceText: { flex: 1 },
  adviceApply: { marginLeft: spacing.sm },
};
