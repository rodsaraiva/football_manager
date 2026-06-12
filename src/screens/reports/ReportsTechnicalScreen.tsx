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
import { useTranslation } from '@/i18n';
import type { TKey } from '@/i18n/translate';

function attrI18nKey(k: string): TKey {
  return ('tactics.attr_' + k.replace(/([A-Z])/g, '_$1').toLowerCase()) as TKey;
}

const WINDOW_OPTIONS = [3, 5, 10] as const;
type WindowOption = (typeof WINDOW_OPTIONS)[number];
type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function ReportsTechnicalScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { playerClubId, season, week, currentSave } = useGameStore();
  const saveId = currentSave?.id;
  const { dbHandle } = useDatabaseStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [windowSize, setWindowSize] = useState<WindowOption>(5);
  const [report, setReport] = useState<TechnicalReport | null>(null);
  const [moraleReport, setMoraleReport] = useState<MoraleReport | null>(null);
  const [contractAlerts, setContractAlerts] = useState<ContractAlert[]>([]);
  const [lineEfficiency, setLineEfficiency] = useState<LineEfficiency[]>([]);

  const load = React.useCallback(async () => {
    if (!dbHandle || !playerClubId || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Squad (single batch query)
      const fullPlayers = await getPlayersWithAttributesByClub(dbHandle, saveId, playerClubId);
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
      const allFixtures = await getFixturesByClub(dbHandle, saveId, playerClubId, season);
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
      const activeTactic = await getActiveTactic(dbHandle, saveId, playerClubId);
      if (activeTactic) {
        const lineup = await getTacticLineup(dbHandle, saveId, activeTactic.id);
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
  }, [dbHandle, playerClubId, saveId, season, week, windowSize]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.reportTechnical} size="large" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <Text style={styles.subtitle}>{t('report.tech_no_data_to_analyze')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={commonStyles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.reportTechnical} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerSummary}>
          {t('report.tech_header_summary', {
            up: report.inForm.length,
            down: report.outOfForm.length,
            deserve: report.replacementSuggestions.length,
          })}
        </Text>
        <View style={styles.windowPicker}>
          <Text style={styles.headerIntro}>{t('report.tech_window')}</Text>
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

      <Section title={t('report.tech_inform_title')} subtitle={t('report.tech_inform_subtitle')}>
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

      <Section title={t('report.tech_outform_title')} subtitle={t('report.tech_outform_subtitle')}>
        {report.outOfForm.length === 0 ? (
          <EmptyLine label={t('report.tech_outform_empty')} />
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

      <Section title={t('report.tech_rising_title')} subtitle={t('report.tech_rising_subtitle')}>
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
                  {t('report.tech_rising_meta', {
                    position: p.position,
                    age: p.age,
                    ovr: p.overall,
                    pot: p.effectivePotential,
                  })}
                </Text>
              </View>
              <ValueBadge value={`+${p.effectivePotential - p.overall}`} tone="success" />
            </Pressable>
          ))
        )}
      </Section>

      <Section title={t('report.tech_replacement_title')} subtitle={t('report.tech_replacement_subtitle')}>
        {report.replacementSuggestions.length === 0 ? (
          <EmptyLine label={t('report.tech_replacement_empty')} />
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

      <Section title={t('report.tech_benched_title')} subtitle={t('report.tech_benched_subtitle')}>
        {report.benchedButDeservesMinutes.length === 0 ? (
          <EmptyLine label={t('report.tech_benched_empty')} />
        ) : (
          report.benchedButDeservesMinutes.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => navigation.navigate('PlayerDetail', { playerId: p.id })}
              style={({ pressed }) => [styles.benchedRow, pressed && styles.rowPressed]}
            >
              <Text style={styles.playerName}>{p.name}</Text>
              <Text style={styles.playerMeta}>
                {t('report.tech_benched_meta', {
                  position: p.position,
                  age: p.age,
                  ovr: p.overall,
                  window: windowSize,
                })}
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
  const { t } = useTranslation();
  const { avgMorale, topMorale, bottomMorale, alertLevel } = report;
  const gaugeColor =
    alertLevel === 'critical' ? colors.danger : alertLevel === 'warning' ? colors.warning : colors.success;

  return (
    <SectionCard title={t('report.tech_morale_title')} subtitle={t('report.tech_morale_subtitle')}>
      {alertLevel === 'critical' && (
        <View style={styles.moraleBanner}>
          <Text style={styles.moraleBannerText}>{t('report.tech_morale_critical_banner')}</Text>
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
          <Text style={styles.summaryGroupLabel}>{t('report.tech_morale_top_high')}</Text>
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
          <Text style={[styles.summaryGroupLabel, { marginTop: spacing.sm }]}>{t('report.tech_morale_top_low')}</Text>
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
        <Text style={styles.empty}>{t('report.tech_morale_empty')}</Text>
      )}
    </SectionCard>
  );
}

function ContractAlertsSection({ alerts }: { alerts: ContractAlert[] }) {
  const { t } = useTranslation();
  const urgencyColor = (u: ContractAlert['urgency']) => {
    if (u === 'critical') return colors.danger;
    if (u === 'warning') return colors.warning;
    return colors.primary;
  };

  return (
    <SectionCard title={t('report.tech_contracts_title')} subtitle={t('report.tech_contracts_subtitle')}>
      {alerts.length === 0 ? (
        <Text style={styles.empty}>{t('report.tech_contracts_empty')}</Text>
      ) : (
        alerts.map((alert) => (
          <View key={alert.player.id} style={styles.contractRow}>
            <View style={styles.contractLeft}>
              <Text style={styles.playerName}>{alert.player.name}</Text>
              <Text style={styles.playerMeta}>
                {alert.player.position} · OVR {alert.player.overall}
                {alert.player.wage != null
                  ? t('report.tech_contracts_wage', { wage: alert.player.wage.toLocaleString('pt-BR') })
                  : ''}
              </Text>
            </View>
            <ValueBadge
              value={t('report.tech_contracts_expires', { season: alert.contractEnd })}
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
  const { t } = useTranslation();
  const { collectiveStrengths, collectiveWeaknesses, individualHighlights } = summary;
  const hasData = collectiveStrengths.length > 0;

  return (
    <SectionCard title={t('report.tech_summary_title')} subtitle={t('report.tech_summary_subtitle')}>
      {!hasData ? (
        <Text style={styles.empty}>{t('report.tech_summary_empty')}</Text>
      ) : (
        <>
          <Text style={styles.summaryGroupLabel}>{t('report.tech_summary_strengths')}</Text>
          <View style={styles.sectionBody}>
            {collectiveStrengths.map((item) => (
              <View key={item.attribute} style={styles.attrRow}>
                <Text style={styles.attrLabel}>{t(attrI18nKey(item.attribute))}</Text>
                <View style={[styles.attrBar, { borderColor: colors.success }]}>
                  <Text style={[styles.attrValue, { color: colors.success }]}>
                    {item.avg.toFixed(1)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={[styles.summaryGroupLabel, { marginTop: spacing.sm }]}>{t('report.tech_summary_weaknesses')}</Text>
          <View style={styles.sectionBody}>
            {collectiveWeaknesses.map((item) => (
              <View key={item.attribute} style={styles.attrRow}>
                <Text style={styles.attrLabel}>{t(attrI18nKey(item.attribute))}</Text>
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
              <Text style={[styles.summaryGroupLabel, { marginTop: spacing.sm }]}>{t('report.tech_summary_highlights')}</Text>
              <View style={styles.sectionBody}>
                {individualHighlights.map((item) => (
                  <Pressable
                    key={`${item.playerId}-${item.attribute}`}
                    onPress={() => {}}
                    style={({ pressed }) => [styles.highlightRow, pressed && styles.rowPressed]}
                  >
                    <View style={styles.highlightLeft}>
                      <Text style={styles.playerName}>{item.playerName}</Text>
                      <Text style={styles.playerMeta}>{item.position} · {t(attrI18nKey(item.attribute))}</Text>
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
  const { t } = useTranslation();
  const hasAnyData = lines.some((l) => l.appearances > 0);
  const lineLabelKey = (g: LineEfficiency['group']): TKey =>
    ('report.tech_line_' + g.toLowerCase()) as TKey;

  return (
    <SectionCard title={t('report.tech_line_title')} subtitle={t('report.tech_line_subtitle')}>
      {!hasAnyData ? (
        <Text style={styles.empty}>{t('report.tech_line_empty')}</Text>
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
                <Text style={styles.playerName}>{t(lineLabelKey(line.group))}</Text>
                {line.appearances === 0 ? (
                  <Text style={[styles.playerMeta, { fontStyle: 'italic' }]}>{t('report.tech_line_no_data')}</Text>
                ) : (
                  <Text style={styles.playerMeta}>{t('report.tech_line_appearances', { count: line.appearances })}</Text>
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
                    {line.isWeakest ? t('report.tech_line_weakest') : t('report.tech_line_strongest')}
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
  const { t } = useTranslation();
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
          {t('report.tech_form_meta', {
            position: item.player.position,
            games: item.form.appearances,
            goals: item.form.goals,
            assists: item.form.assists,
          })}
        </Text>
      </View>
      <ValueBadge value={item.form.avgRating.toFixed(1)} tone={tone === 'good' ? 'success' : 'danger'} />
    </Pressable>
  );
}

function SuggestionInner({ item }: { item: ReplacementSuggestion }) {
  const { t } = useTranslation();
  return (
    <>
      <Text style={styles.playerName}>{item.benchPlayer.name}</Text>
      <Text style={styles.playerMeta}>
        {t('report.tech_suggestion_meta', {
          position: item.benchPlayer.position,
          ovr: item.benchPlayer.overall,
          starter: item.starter.name,
          starterOvr: item.starter.overall,
        })}
      </Text>
    </>
  );
}

function EmptyLine({ label }: { label?: string } = {}) {
  const { t } = useTranslation();
  return <Text style={styles.empty}>{label ?? t('report.tech_nothing_to_report')}</Text>;
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
