import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersByClub, updatePlayerMorale } from '@/database/queries/players';
import { getRecentForm } from '@/database/queries/player-stats';
import { computeSquadTeamTalk, SquadTalkMember, SquadTalkSummary } from '@/engine/morale/squad-team-talk';
import { TeamTalkTone } from '@/engine/morale/team-talk';
import { Card, Chip } from '@/components/kit';
import { Title, Body } from '@/components/typography';

const TONES: TeamTalkTone[] = ['praise', 'motivate', 'criticize'];

export function TeamTalkScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const playerClubId = useGameStore((s) => s.playerClubId);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const season = useGameStore((s) => s.season);

  const [summary, setSummary] = useState<SquadTalkSummary | null>(null);
  const [selectedTone, setSelectedTone] = useState<TeamTalkTone | null>(null);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);

  async function applyTalk(tone: TeamTalkTone) {
    if (!dbHandle || playerClubId == null || saveId == null || busy) return;
    setBusy(true);
    setSelectedTone(tone);
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
        <Card variant="summary" accent={accent.accent}>
          <Title style={styles.title}>{t('interaction.team_talk_title')}</Title>
          <Body style={styles.intro}>{t('interaction.team_talk_intro')}</Body>
          <View style={styles.toneRow}>
            {TONES.map((tone) => (
              <Chip
                key={tone}
                label={t(`interaction.tone_${tone}` as TKey)}
                selected={selectedTone === tone}
                accent={accent.accent}
                onPress={() => applyTalk(tone)}
                testID={`teamtalk-tone-${tone}`}
                accessibilityLabel={t(`interaction.tone_${tone}` as TKey)}
              />
            ))}
          </View>
          {empty && <Body style={styles.summary}>{t('interaction.team_talk_empty')}</Body>}
          {summary != null && (
            <Body style={styles.summary}>
              {t('interaction.team_talk_summary', {
                improved: summary.improved,
                worsened: summary.worsened,
                unchanged: summary.unchanged,
              })}
            </Body>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md },
  title: { marginBottom: spacing.xs },
  intro: { marginBottom: spacing.md },
  toneRow: { flexDirection: 'row', gap: spacing.sm },
  summary: { marginTop: spacing.md },
});
