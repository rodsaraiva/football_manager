import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersByClub, getPlayerById } from '@/database/queries/players';
import { getFixturesByClub, getMatchEvents } from '@/database/queries/fixtures';
import { calculateOverall } from '@/utils/overall';
import {
  buildTechnicalReport,
  SquadPlayer,
  FormListItem,
  ReplacementSuggestion,
  TechnicalReport,
  FORM_WINDOW,
} from '@/engine/reports/technical-report';
import { MatchEvent } from '@/types';

export function ReportsTechnicalScreen() {
  const { playerClubId, season, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<TechnicalReport | null>(null);

  const load = React.useCallback(async () => {
    if (!dbHandle || !playerClubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Squad
      const basePlayers = await getPlayersByClub(dbHandle, playerClubId);
      const squad: SquadPlayer[] = [];
      for (const p of basePlayers) {
        const full = await getPlayerById(dbHandle, p.id);
        if (!full) continue;
        squad.push({
          id: full.id,
          name: full.name,
          age: full.age,
          position: full.position,
          overall: calculateOverall(full.attributes, full.position),
          basePotential: full.basePotential,
          effectivePotential: full.effectivePotential,
          injuryWeeksLeft: full.injuryWeeksLeft,
        });
      }

      // Recent fixtures (window = FORM_WINDOW)
      const allFixtures = await getFixturesByClub(dbHandle, playerClubId, season);
      const recent = allFixtures
        .filter((f) => f.played && f.week < week)
        .sort((a, b) => b.week - a.week)
        .slice(0, FORM_WINDOW);

      // Events by fixture
      const eventsByFixture = new Map<number, MatchEvent[]>();
      for (const f of recent) {
        const evts = await getMatchEvents(dbHandle, f.id);
        eventsByFixture.set(f.id, evts);
      }

      const r = buildTechnicalReport({
        squad,
        recentFixtures: recent,
        eventsByFixture,
        playerClubId,
        currentWeek: week,
      });
      setReport(r);
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, season, week]);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.subtitle}>Sem dados para analisar.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIntro}>
          Analisando as últimas {FORM_WINDOW} partidas.
        </Text>
      </View>

      <Section title="🔥 Em grande fase" subtitle="Maior rating médio recente">
        {report.inForm.length === 0 ? (
          <EmptyLine />
        ) : (
          report.inForm.map((item) => (
            <FormLine key={item.player.id} item={item} tone="good" />
          ))
        )}
      </Section>

      <Section title="📉 Em má fase" subtitle="Rating médio abaixo do esperado">
        {report.outOfForm.length === 0 ? (
          <EmptyLine label="Nenhum jogador em má fase — bom sinal." />
        ) : (
          report.outOfForm.map((item) => (
            <FormLine key={item.player.id} item={item} tone="bad" />
          ))
        )}
      </Section>

      <Section title="🌱 Em evolução" subtitle="Jovens com espaço para crescer">
        {report.rising.length === 0 ? (
          <EmptyLine />
        ) : (
          report.rising.map((p) => (
            <View key={p.id} style={styles.risingRow}>
              <View style={styles.risingLeft}>
                <Text style={styles.playerName}>{p.name}</Text>
                <Text style={styles.playerMeta}>
                  {p.position} · {p.age}a · OVR {p.overall} → Pot {p.effectivePotential}
                </Text>
              </View>
              <View style={[styles.gapBadge, { borderColor: colors.success }]}>
                <Text style={[styles.gapText, { color: colors.success }]}>
                  +{p.effectivePotential - p.overall}
                </Text>
              </View>
            </View>
          ))
        )}
      </Section>

      <Section title="🎯 Merecem ser titulares" subtitle="Reservas com overall competitivo">
        {report.replacementSuggestions.length === 0 ? (
          <EmptyLine label="Ninguém no banco em posição de superar os titulares." />
        ) : (
          report.replacementSuggestions.map((s) => <SuggestionLine key={s.benchPlayer.id} item={s} />)
        )}
      </Section>

      <Section title="🪑 Banco ocioso" subtitle="Jogadores bons sem minutos">
        {report.benchedButDeservesMinutes.length === 0 ? (
          <EmptyLine label="Todo mundo apto está sendo usado." />
        ) : (
          report.benchedButDeservesMinutes.map((p) => (
            <View key={p.id} style={styles.benchedRow}>
              <Text style={styles.playerName}>{p.name}</Text>
              <Text style={styles.playerMeta}>
                {p.position} · {p.age}a · OVR {p.overall} — 0 jogos nas últimas {FORM_WINDOW}
              </Text>
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSub}>{subtitle}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function FormLine({ item, tone }: { item: FormListItem; tone: 'good' | 'bad' }) {
  const accent = tone === 'good' ? colors.success : colors.danger;
  return (
    <View style={[styles.formRow, { borderLeftColor: accent }]}>
      <View style={styles.formLeft}>
        <Text style={styles.playerName}>{item.player.name}</Text>
        <Text style={styles.playerMeta}>
          {item.player.position} · {item.form.appearances} jogos · {item.form.goals}G {item.form.assists}A
        </Text>
      </View>
      <View style={[styles.ratingBadge, { borderColor: accent }]}>
        <Text style={[styles.ratingText, { color: accent }]}>{item.form.avgRating.toFixed(1)}</Text>
      </View>
    </View>
  );
}

function SuggestionLine({ item }: { item: ReplacementSuggestion }) {
  return (
    <View style={styles.suggestionRow}>
      <Text style={styles.playerName}>{item.benchPlayer.name}</Text>
      <Text style={styles.playerMeta}>
        {item.benchPlayer.position} · OVR {item.benchPlayer.overall} — concorre com {item.starter.name} (OVR {item.starter.overall})
      </Text>
    </View>
  );
}

function EmptyLine({ label }: { label?: string } = {}) {
  return <Text style={styles.empty}>{label ?? 'Nada a reportar.'}</Text>;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerIntro: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  section: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  sectionSub: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  sectionBody: { gap: spacing.xs },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
    borderLeftWidth: 3,
  },
  formLeft: { flex: 1 },
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
  ratingBadge: {
    width: 44,
    height: 32,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  risingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  risingLeft: { flex: 1 },
  gapBadge: {
    borderWidth: 2,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  gapText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  suggestionRow: {
    paddingVertical: spacing.xs,
  },
  benchedRow: {
    paddingVertical: spacing.xs,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
});
