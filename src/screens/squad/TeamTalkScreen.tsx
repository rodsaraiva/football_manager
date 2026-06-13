import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, commonStyles, fontSize, radius, spacing } from '@/theme';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersByClub, updatePlayerMorale } from '@/database/queries/players';
import { getRecentForm } from '@/database/queries/player-stats';
import { computeSquadTeamTalk, SquadTalkMember, SquadTalkSummary } from '@/engine/morale/squad-team-talk';
import { TeamTalkTone } from '@/engine/morale/team-talk';

const TONES: TeamTalkTone[] = ['praise', 'motivate', 'criticize'];

export function TeamTalkScreen() {
  const { t } = useTranslation();
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const playerClubId = useGameStore((s) => s.playerClubId);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const season = useGameStore((s) => s.season);

  const [summary, setSummary] = useState<SquadTalkSummary | null>(null);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);

  async function applyTalk(tone: TeamTalkTone) {
    if (!dbHandle || playerClubId == null || saveId == null || busy) return;
    setBusy(true);
    try {
      const squad = await getPlayersByClub(dbHandle, saveId, playerClubId);
      if (squad.length === 0) {
        setEmpty(true);
        setSummary(null);
        return;
      }
      const roster: SquadTalkMember[] = await Promise.all(
        squad.map(async (p) => {
          const form = await getRecentForm(dbHandle, saveId, p.id, season);
          return { id: p.id, morale: p.morale, recentAvgRating: form.avgRating };
        }),
      );
      const { results, summary: s } = computeSquadTeamTalk(roster, tone);
      for (const r of results) {
        await updatePlayerMorale(dbHandle, saveId, r.id, r.nextMorale);
      }
      setEmpty(false);
      setSummary(s);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={commonStyles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('interaction.team_talk_title')}</Text>
          <Text style={styles.intro}>{t('interaction.team_talk_intro')}</Text>
          <View style={styles.toneRow}>
            {TONES.map((tone) => (
              <Pressable
                key={tone}
                style={[styles.toneButton, busy && styles.disabledButton]}
                disabled={busy}
                onPress={() => applyTalk(tone)}
              >
                <Text style={styles.toneButtonText}>{t(`interaction.tone_${tone}` as TKey)}</Text>
              </Pressable>
            ))}
          </View>
          {empty && <Text style={styles.summary}>{t('interaction.team_talk_empty')}</Text>}
          {summary != null && (
            <Text style={styles.summary}>
              {t('interaction.team_talk_summary', {
                improved: summary.improved,
                worsened: summary.worsened,
                unchanged: summary.unchanged,
              })}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: 'bold', marginBottom: spacing.xs },
  intro: { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.md },
  toneRow: { flexDirection: 'row', gap: spacing.sm },
  toneButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.4 },
  toneButtonText: { color: colors.text, fontSize: fontSize.sm, fontWeight: 'bold' },
  summary: { color: colors.text, fontSize: fontSize.md, marginTop: spacing.md },
});
