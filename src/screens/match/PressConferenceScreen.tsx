import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, commonStyles, fontSize, radius, spacing } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { RootStackParamList } from '@/navigation/types';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useBoardStore } from '@/store/board-store';
import { getPlayersByClub, updatePlayerMorale } from '@/database/queries/players';
import { getRecentForm } from '@/database/queries/player-stats';
import { getRecentFixturesForClub } from '@/database/queries/fixtures';
import { getSaveBoardTrust, updateSaveBoardTrust } from '@/database/queries/board';
import { setPressPending } from '@/database/queries/save';
import { insertNewsItem } from '@/database/queries/news';
import {
  computePressConference,
  pressQuestionKey,
  PressMember,
  PressTone,
  PressOutcome,
  SquadPressResult,
} from '@/engine/press/press-engine';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// 'measured' first (the safe default), then the riskier options.
const TONES: PressTone[] = ['measured', 'confident', 'defiant'];

function clampTrust(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function PressConferenceScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const playerClubId = useGameStore((s) => s.playerClubId);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const season = useGameStore((s) => s.season);
  const week = useGameStore((s) => s.week);
  const lastMatchResult = useGameStore((s) => s.lastMatchResult);
  const lastMatchIsHome = useGameStore((s) => s.lastMatchIsHome);
  const setPressPendingStore = useGameStore((s) => s.setPressPending);
  const setCurrentTrust = useBoardStore((s) => s.setCurrentTrust);

  const [outcome, setOutcome] = useState<PressOutcome | null>(null);
  const [result, setResult] = useState<SquadPressResult | null>(null);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);

  // Resolve the match outcome for the question's context. Prefer the in-memory
  // result; on a mid-gate reload (store cleared) fall back to the user's most
  // recent played fixture in the DB. If neither is available, default to 'draw'.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (lastMatchResult && lastMatchIsHome !== null) {
        const userGoals = lastMatchIsHome ? lastMatchResult.homeGoals : lastMatchResult.awayGoals;
        const oppGoals = lastMatchIsHome ? lastMatchResult.awayGoals : lastMatchResult.homeGoals;
        const o: PressOutcome = userGoals > oppGoals ? 'win' : userGoals < oppGoals ? 'loss' : 'draw';
        if (!cancelled) setOutcome(o);
        return;
      }
      if (dbHandle && playerClubId != null && saveId != null) {
        try {
          const recent = await getRecentFixturesForClub(dbHandle, saveId, playerClubId, season, 1);
          const f = recent[0];
          if (f && f.homeGoals != null && f.awayGoals != null) {
            const isHome = f.homeClubId === playerClubId;
            const userGoals = isHome ? f.homeGoals : f.awayGoals;
            const oppGoals = isHome ? f.awayGoals : f.homeGoals;
            const o: PressOutcome = userGoals > oppGoals ? 'win' : userGoals < oppGoals ? 'loss' : 'draw';
            if (!cancelled) setOutcome(o);
            return;
          }
        } catch { /* fall through to default */ }
      }
      if (!cancelled) setOutcome('draw');
    })();
    return () => { cancelled = true; };
  }, [lastMatchResult, lastMatchIsHome, dbHandle, playerClubId, saveId, season]);

  async function applyTone(tone: PressTone) {
    if (!dbHandle || playerClubId == null || saveId == null || outcome == null || busy) return;
    setBusy(true);
    try {
      const squad = await getPlayersByClub(dbHandle, saveId, playerClubId);
      if (squad.length === 0) {
        setEmpty(true);
        setResult(null);
        return;
      }
      const roster: PressMember[] = await Promise.all(
        squad.map(async (p) => {
          const form = await getRecentForm(dbHandle, saveId, p.id, season);
          return { id: p.id, morale: p.morale, recentAvgRating: form.avgRating };
        }),
      );
      const res = computePressConference(roster, tone, outcome);
      for (const r of res.results) {
        await updatePlayerMorale(dbHandle, saveId, r.id, r.nextMorale);
      }
      const trust = await getSaveBoardTrust(dbHandle, saveId);
      const nextTrust = clampTrust(trust + res.confidenceDelta);
      await updateSaveBoardTrust(dbHandle, saveId, nextTrust);
      setCurrentTrust(nextTrust);

      // W3 news: persist a press headline keyed to the board-confidence swing.
      const tier =
        res.confidenceDelta > 0 ? 'positive' : res.confidenceDelta < 0 ? 'negative' : 'neutral';
      await insertNewsItem(dbHandle, saveId, {
        season,
        week,
        category: 'press',
        icon: '🎙️',
        priority: 65,
        titleKey: `news.persist_press_${tier}_title` as TKey,
        bodyKey: `news.persist_press_${tier}_body` as TKey,
      });
      await useGameStore.getState().refreshUnreadNewsCount?.(dbHandle);

      setEmpty(false);
      setResult(res);
    } finally {
      setBusy(false);
    }
  }

  async function applySkip() {
    // "No comment": no morale move, a tiny neutral trust ding so it isn't free.
    if (!dbHandle || playerClubId == null || saveId == null || busy) return;
    setBusy(true);
    try {
      const trust = await getSaveBoardTrust(dbHandle, saveId);
      const nextTrust = clampTrust(trust - 1);
      await updateSaveBoardTrust(dbHandle, saveId, nextTrust);
      setCurrentTrust(nextTrust);
      setResult({
        results: [],
        summary: { improved: 0, worsened: 0, unchanged: 0 },
        confidenceDelta: -1,
        headlineKey: 'press.skip' as TKey,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleContinue() {
    if (dbHandle && saveId != null) {
      await setPressPending(dbHandle, saveId, false);
    }
    setPressPendingStore(false);
    navigation.navigate('Game');
  }

  function confidenceLine(delta: number): string {
    if (delta > 0) return t('press.confidence_up', { n: delta });
    if (delta < 0) return t('press.confidence_down', { n: delta });
    return t('press.confidence_flat');
  }

  if (outcome == null) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('press.title')}</Text>
          <Text style={styles.intro}>{t('press.intro')}</Text>
          <Text style={styles.question}>{t(pressQuestionKey(outcome))}</Text>

          {result == null && !empty && (
            <View style={styles.toneList}>
              {TONES.map((tone) => (
                <Pressable
                  key={tone}
                  style={[styles.toneButton, busy && styles.disabledButton]}
                  disabled={busy}
                  onPress={() => applyTone(tone)}
                >
                  <Text style={styles.toneButtonText}>{t(`press.tone_${tone}` as TKey)}</Text>
                  <Text style={styles.toneButtonDesc}>{t(`press.tone_${tone}_desc` as TKey)}</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.skipButton, busy && styles.disabledButton]}
                disabled={busy}
                onPress={applySkip}
              >
                <Text style={styles.skipButtonText}>{t('press.skip')}</Text>
                <Text style={styles.toneButtonDesc}>{t('press.skip_desc')}</Text>
              </Pressable>
            </View>
          )}

          {empty && <Text style={styles.feedback}>{t('press.empty')}</Text>}

          {result != null && (
            <View style={styles.feedbackCard}>
              <Text style={styles.headline}>{t(result.headlineKey)}</Text>
              {result.results.length > 0 && (
                <Text style={styles.feedback}>
                  {t('press.summary', {
                    improved: result.summary.improved,
                    worsened: result.summary.worsened,
                    unchanged: result.summary.unchanged,
                  })}
                </Text>
              )}
              <Text
                style={[
                  styles.confidence,
                  result.confidenceDelta > 0 && { color: colors.success },
                  result.confidenceDelta < 0 && { color: colors.danger },
                ]}
              >
                {confidenceLine(result.confidenceDelta)}
              </Text>
            </View>
          )}

          {(result != null || empty) && (
            <Pressable style={styles.continueButton} onPress={handleContinue}>
              <Text style={styles.continueButtonText}>{t('press.continue')}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: 'bold', marginBottom: spacing.xs },
  intro: { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.md },
  question: {
    color: colors.text,
    fontSize: fontSize.md,
    fontStyle: 'italic',
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.sm,
  },
  toneList: { gap: spacing.sm },
  toneButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  toneButtonText: { color: colors.text, fontSize: fontSize.md, fontWeight: 'bold' },
  toneButtonDesc: { color: colors.text, fontSize: fontSize.xs, opacity: 0.85, marginTop: spacing.xxs },
  skipButton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipButtonText: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '600' },
  disabledButton: { opacity: 0.4 },
  feedbackCard: { marginTop: spacing.sm },
  headline: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  feedback: { color: colors.text, fontSize: fontSize.sm, marginTop: spacing.xs },
  confidence: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginTop: spacing.sm },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  continueButtonText: { color: colors.text, fontSize: fontSize.lg, fontWeight: 'bold' },
});
