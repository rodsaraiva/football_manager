import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontSize, spacing, commonStyles } from '@/theme';
import { SectionCard } from '@/components/SectionCard';
import { ValueBadge } from '@/components/ValueBadge';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { getFixturesByClub, getMatchEvents } from '@/database/queries/fixtures';
import { getActiveTactic, getTacticLineup } from '@/database/queries/tactics';
import { calculateOverall } from '@/utils/overall';
import {
  buildTechnicalReport,
  SquadPlayer,
  FormListItem,
  ReplacementSuggestion,
  TechnicalReport,
  SquadSummary,
} from '@/engine/reports/technical-report';
import { buildMoraleReport, MoraleReport } from '@/engine/reports/morale-report';
import { buildContractAlerts, ContractAlert } from '@/engine/reports/contract-alerts';
import { buildLineEfficiency, LineEfficiency } from '@/engine/reports/line-efficiency';
import { MatchEvent } from '@/types';
import { RootStackParamList } from '@/navigation/types';

const WINDOW_OPTIONS = [3, 5, 10] as const;
type WindowOption = (typeof WINDOW_OPTIONS)[number];
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function ReportsTechnicalScreen() {
  const navigation = useNavigation<NavProp>();
  const { playerClubId, season, week } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [windowSize, setWindowSize] = useState<WindowOption>(5);
  const [report, setReport] = useState<TechnicalReport | null>(null);
  const [moraleReport, setMoraleReport] = useState<MoraleReport | null>(null);
  const [contractAlerts, setContractAlerts] = useState<ContractAlert[]>([]);
  const [lineEfficiency, setLineEfficiency] = useState<LineEfficiency[]>([]);

  const load = React.useCallback(async () => {
    if (!dbHandle || !playerClubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Squad (single batch query)
      const fullPlayers = await getPlayersWithAttributesByClub(dbHandle, playerClubId);
      const squad: SquadPlayer[] = fullPlayers.map((full) => ({
        id: full.id,
        name: full.name,
        age: full.age,
        position: full.position,
        overall: calculateOverall(full.attributes, full.position),
        basePotential: full.basePotential,
        effectivePotential: full.effectivePotential,
        injuryWeeksLeft: full.injuryWeeksLeft,
        attributes: full.attributes,
        morale: full.morale,
        contractEnd: full.contractEnd,
        wage: full.wage,
      }));

      // Recent fixtures (configurable window)
      const allFixtures = await getFixturesByClub(dbHandle, playerClubId, season);
      const recent = allFixtures
        .filter((f) => f.played && f.week < week)
        .sort((a, b) => b.week - a.week)
        .slice(0, windowSize);

      // Events by fixture
      const eventsByFixture = new Map<number, MatchEvent[]>();
      for (const f of recent) {
        const evts = await getMatchEvents(dbHandle, f.id);
        eventsByFixture.set(f.id, evts);
      }

      // Matchday squad (11 titulares + até 8 suplentes) para squadSummary
      let matchdaySquadIds: Set<number> | undefined;
      const activeTactic = await getActiveTactic(dbHandle, playerClubId);
      if (activeTactic) {
        const lineup = await getTacticLineup(dbHandle, activeTactic.id);
        if (lineup) {
          const ids = [...lineup.starterIds, ...lineup.benchIds].filter((id) => id != null);
          if (ids.length > 0) {
            matchdaySquadIds = new Set(ids);
          }
        }
      }

      const r = buildTechnicalReport({
        squad,
        recentFixtures: recent,
        eventsByFixture,
        playerClubId,
        currentWeek: week,
        matchdaySquadIds,
      });
      setReport(r);
      setMoraleReport(buildMoraleReport(squad));
      setContractAlerts(buildContractAlerts(squad, season));
      setLineEfficiency(buildLineEfficiency(r.forms, squad));
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, season, week, windowSize]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

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
    <ScrollView
      style={commonStyles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerSummary}>
          {report.inForm.length} em alta · {report.outOfForm.length} em baixa · {report.replacementSuggestions.length} merecem chance
        </Text>
        <View style={styles.windowPicker}>
          <Text style={styles.headerIntro}>Janela:</Text>
          {WINDOW_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => setWindowSize(opt)}
              style={[styles.windowChip, windowSize === opt && styles.windowChipActive]}
            >
              <Text style={[styles.windowChipText, windowSize === opt && styles.windowChipTextActive]}>
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {moraleReport && <MoraleSection report={moraleReport} />}
      <ContractAlertsSection alerts={contractAlerts} />
      <SquadSummarySection summary={report.squadSummary} />
      {lineEfficiency.length > 0 && <LineEfficiencySection lines={lineEfficiency} />}

      <Section title="🔥 Em grande fase" subtitle="Maior rating médio recente">
        {report.inForm.length === 0 ? (
          <EmptyLine />
        ) : (
          report.inForm.map((item) => (
            <FormLine
              key={item.player.id}
              item={item}
              tone="good"
              onPress={() => navigation.navigate('PlayerDetail', { playerId: item.player.id })}
            />
          ))
        )}
      </Section>

      <Section title="📉 Em má fase" subtitle="Rating médio abaixo do esperado">
        {report.outOfForm.length === 0 ? (
          <EmptyLine label="Nenhum jogador em má fase — bom sinal." />
        ) : (
          report.outOfForm.map((item) => (
            <FormLine
              key={item.player.id}
              item={item}
              tone="bad"
              onPress={() => navigation.navigate('PlayerDetail', { playerId: item.player.id })}
            />
          ))
        )}
      </Section>

      <Section title="🌱 Em evolução" subtitle="Jovens com espaço para crescer">
        {report.rising.length === 0 ? (
          <EmptyLine />
        ) : (
          report.rising.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: p.id })}
              style={({ pressed }) => [styles.risingRow, pressed && styles.rowPressed]}
            >
              <View style={styles.risingLeft}>
                <Text style={styles.playerName}>{p.name}</Text>
                <Text style={styles.playerMeta}>
                  {p.position} · {p.age}a · OVR {p.overall} → Pot {p.effectivePotential}
                </Text>
              </View>
              <ValueBadge value={`+${p.effectivePotential - p.overall}`} tone="success" />
            </Pressable>
          ))
        )}
      </Section>

      <Section title="🎯 Merecem ser titulares" subtitle="Reservas com overall competitivo">
        {report.replacementSuggestions.length === 0 ? (
          <EmptyLine label="Ninguém no banco em posição de superar os titulares." />
        ) : (
          report.replacementSuggestions.map((s) => (
            <Pressable
              key={s.benchPlayer.id}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: s.benchPlayer.id })}
              style={({ pressed }) => [styles.suggestionRow, pressed && styles.rowPressed]}
            >
              <SuggestionInner item={s} />
            </Pressable>
          ))
        )}
      </Section>

      <Section title="🪑 Banco ocioso" subtitle="Jogadores bons sem minutos">
        {report.benchedButDeservesMinutes.length === 0 ? (
          <EmptyLine label="Todo mundo apto está sendo usado." />
        ) : (
          report.benchedButDeservesMinutes.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: p.id })}
              style={({ pressed }) => [styles.benchedRow, pressed && styles.rowPressed]}
            >
              <Text style={styles.playerName}>{p.name}</Text>
              <Text style={styles.playerMeta}>
                {p.position} · {p.age}a · OVR {p.overall} — 0 jogos nas últimas {windowSize}
              </Text>
            </Pressable>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function MoraleSection({ report }: { report: MoraleReport }) {
  const { avgMorale, topMorale, bottomMorale, alertLevel } = report;
  const gaugeColor =
    alertLevel === 'critical' ? colors.danger : alertLevel === 'warning' ? colors.warning : colors.success;

  return (
    <SectionCard title="💬 Moral do Elenco" subtitle="Índice coletivo e extremos de motivação">
      {alertLevel === 'critical' && (
        <View style={styles.moraleBanner}>
          <Text style={styles.moraleBannerText}>⚠️ Atenção: moral coletiva crítica</Text>
        </View>
      )}

      {/* Gauge bar */}
      <View style={styles.moraleGaugeContainer}>
        <View style={styles.moraleGaugeBg}>
          <View style={[styles.moraleGaugeFill, { width: `${avgMorale}%`, backgroundColor: gaugeColor }]} />
        </View>
        <Text style={[styles.moraleAvgText, { color: gaugeColor }]}>{avgMorale}</Text>
      </View>

      {topMorale.length > 0 && (
        <>
          <Text style={styles.summaryGroupLabel}>Top 3 Moral Alta</Text>
          <View style={styles.sectionBody}>
            {topMorale.map((e) => (
              <View key={e.playerId} style={styles.moraleRow}>
                <View style={[styles.moraleDot, { backgroundColor: colors.success }]} />
                <Text style={styles.playerName}>{e.playerName}</Text>
                <Text style={styles.playerMeta}> · {e.position}</Text>
                <Text style={[styles.moraleValue, { color: colors.success }]}>{e.morale}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {bottomMorale.length > 0 && (
        <>
          <Text style={[styles.summaryGroupLabel, { marginTop: spacing.sm }]}>Top 3 Moral Baixa</Text>
          <View style={styles.sectionBody}>
            {bottomMorale.map((e) => (
              <View key={e.playerId} style={styles.moraleRow}>
                <View style={[styles.moraleDot, { backgroundColor: colors.danger }]} />
                <Text style={styles.playerName}>{e.playerName}</Text>
                <Text style={styles.playerMeta}> · {e.position}</Text>
                <Text style={[styles.moraleValue, { color: colors.danger }]}>{e.morale}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {topMorale.length === 0 && bottomMorale.length === 0 && (
        <Text style={styles.empty}>Sem dados de moral para analisar.</Text>
      )}
    </SectionCard>
  );
}

function ContractAlertsSection({ alerts }: { alerts: ContractAlert[] }) {
  const urgencyColor = (u: ContractAlert['urgency']) => {
    if (u === 'critical') return colors.danger;
    if (u === 'warning') return colors.warning;
    return colors.primary;
  };

  return (
    <SectionCard title="⚠️ Contratos Vencendo" subtitle="Jogadores OVR > 70 com contrato expirando em até 2 temporadas">
      {alerts.length === 0 ? (
        <Text style={styles.empty}>Nenhum contrato crítico no momento.</Text>
      ) : (
        alerts.map((alert) => (
          <View key={alert.player.id} style={styles.contractRow}>
            <View style={styles.contractLeft}>
              <Text style={styles.playerName}>{alert.player.name}</Text>
              <Text style={styles.playerMeta}>
                {alert.player.position} · OVR {alert.player.overall}
                {alert.player.wage != null ? ` · ${alert.player.wage.toLocaleString('pt-BR')} /sem` : ''}
              </Text>
            </View>
            <ValueBadge
              value={`Vence T${alert.contractEnd}`}
              tone={alert.urgency === 'critical' ? 'danger' : alert.urgency === 'warning' ? 'warning' : 'primary'}
              size="sm"
            />
          </View>
        ))
      )}
    </SectionCard>
  );
}

function SquadSummarySection({ summary }: { summary: SquadSummary }) {
  const { collectiveStrengths, collectiveWeaknesses, individualHighlights } = summary;
  const hasData = collectiveStrengths.length > 0;

  return (
    <SectionCard title="📊 Resumo do Elenco" subtitle="Pontos fortes, fracos e destaques individuais">
      {!hasData ? (
        <Text style={styles.empty}>Sem dados de atributos para analisar.</Text>
      ) : (
        <>
          <Text style={styles.summaryGroupLabel}>Pontos fortes coletivos</Text>
          <View style={styles.sectionBody}>
            {collectiveStrengths.map((item) => (
              <View key={item.attribute} style={styles.attrRow}>
                <Text style={styles.attrLabel}>{item.label}</Text>
                <View style={[styles.attrBar, { borderColor: colors.success }]}>
                  <Text style={[styles.attrValue, { color: colors.success }]}>
                    {item.avg.toFixed(1)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={[styles.summaryGroupLabel, { marginTop: spacing.sm }]}>Pontos fracos coletivos</Text>
          <View style={styles.sectionBody}>
            {collectiveWeaknesses.map((item) => (
              <View key={item.attribute} style={styles.attrRow}>
                <Text style={styles.attrLabel}>{item.label}</Text>
                <View style={[styles.attrBar, { borderColor: colors.danger }]}>
                  <Text style={[styles.attrValue, { color: colors.danger }]}>
                    {item.avg.toFixed(1)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {individualHighlights.length > 0 && (
            <>
              <Text style={[styles.summaryGroupLabel, { marginTop: spacing.sm }]}>Destaques individuais</Text>
              <View style={styles.sectionBody}>
                {individualHighlights.map((item) => (
                  <Pressable
                    key={`${item.playerId}-${item.attribute}`}
                    onPress={() => {}}
                    style={({ pressed }) => [styles.highlightRow, pressed && styles.rowPressed]}
                  >
                    <View style={styles.highlightLeft}>
                      <Text style={styles.playerName}>{item.playerName}</Text>
                      <Text style={styles.playerMeta}>{item.position} · {item.label}</Text>
                    </View>
                    <View style={[styles.attrBar, { borderColor: colors.primary }]}>
                      <Text style={[styles.attrValue, { color: colors.primary }]}>{item.value}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}

function LineEfficiencySection({ lines }: { lines: LineEfficiency[] }) {
  const hasAnyData = lines.some((l) => l.appearances > 0);

  return (
    <SectionCard title="📊 Eficiência por Linha" subtitle="Rating médio dos setores no período analisado">
      {!hasAnyData ? (
        <Text style={styles.empty}>Sem aparições registradas no período.</Text>
      ) : (
        lines.map((line) => {
          const barColor = line.isWeakest
            ? colors.danger
            : line.isStrongest
            ? colors.success
            : colors.primary;
          const barWidth = line.appearances > 0 ? `${((line.avgRating - 4) / 6) * 100}%` : '0%';

          return (
            <View key={line.group} style={styles.lineRow}>
              <View style={styles.lineLeft}>
                <Text style={styles.playerName}>{line.label}</Text>
                {line.appearances === 0 ? (
                  <Text style={[styles.playerMeta, { fontStyle: 'italic' }]}>Sem dados</Text>
                ) : (
                  <Text style={styles.playerMeta}>{line.appearances} aparições</Text>
                )}
              </View>
              <View style={styles.lineBarContainer}>
                <View style={styles.lineBarBg}>
                  <View style={[styles.lineBarFill, { width: barWidth as any, backgroundColor: barColor }]} />
                </View>
                {line.appearances > 0 && (
                  <Text style={[styles.lineRating, { color: barColor }]}>{line.avgRating.toFixed(1)}</Text>
                )}
              </View>
              {(line.isWeakest || line.isStrongest) && (
                <View style={[styles.lineTag, { borderColor: barColor }]}>
                  <Text style={[styles.lineTagText, { color: barColor }]}>
                    {line.isWeakest ? 'Mais fraco' : 'Mais forte'}
                  </Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </SectionCard>
  );
}

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
    <SectionCard title={title} subtitle={subtitle}>
      {children}
    </SectionCard>
  );
}

function FormLine({
  item,
  tone,
  onPress,
}: {
  item: FormListItem;
  tone: 'good' | 'bad';
  onPress?: () => void;
}) {
  const accent = tone === 'good' ? colors.success : colors.danger;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.formRow,
        { borderLeftColor: accent },
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.formLeft}>
        <Text style={styles.playerName}>{item.player.name}</Text>
        <Text style={styles.playerMeta}>
          {item.player.position} · {item.form.appearances} jogos · {item.form.goals}G {item.form.assists}A
        </Text>
      </View>
      <ValueBadge value={item.form.avgRating.toFixed(1)} tone={tone === 'good' ? 'success' : 'danger'} />
    </Pressable>
  );
}

function SuggestionInner({ item }: { item: ReplacementSuggestion }) {
  return (
    <>
      <Text style={styles.playerName}>{item.benchPlayer.name}</Text>
      <Text style={styles.playerMeta}>
        {item.benchPlayer.position} · OVR {item.benchPlayer.overall} — concorre com {item.starter.name} (OVR {item.starter.overall})
      </Text>
    </>
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
  headerSummary: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  windowPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  windowChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  windowChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  windowChipText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  windowChipTextActive: {
    color: colors.text,
  },
  rowPressed: {
    opacity: 0.6,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
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
  risingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  risingLeft: { flex: 1 },
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
  summaryGroupLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  attrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  attrLabel: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
  },
  attrBar: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    minWidth: 44,
    alignItems: 'center',
  },
  attrValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  highlightLeft: {
    flex: 1,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  lineLeft: {
    width: 80,
  },
  lineBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lineBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 5,
    overflow: 'hidden',
  },
  lineBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  lineRating: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    width: 30,
    textAlign: 'right',
  },
  lineTag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  lineTagText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  contractRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  contractLeft: {
    flex: 1,
  },
  moraleBanner: {
    backgroundColor: colors.danger,
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  moraleBannerText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  moraleGaugeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  moraleGaugeBg: {
    flex: 1,
    height: 14,
    backgroundColor: colors.border,
    borderRadius: 7,
    overflow: 'hidden',
  },
  moraleGaugeFill: {
    height: '100%',
    borderRadius: 7,
  },
  moraleAvgText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    width: 32,
    textAlign: 'right',
  },
  moraleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    gap: spacing.xs,
  },
  moraleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  moraleValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginLeft: 'auto',
  },
});
