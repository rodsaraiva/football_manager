import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useTranslation } from '@/i18n';
import { Card, Badge, Button, Icon, EmptyState, Toast, useConfirm, ToastTone } from '@/components/kit';
import { Title, Subheading, Body, Caption } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubById } from '@/database/queries/clubs';
import { getStaffByClub } from '@/database/queries/staff';
import { getStaffEffects } from '@/engine/staff/staff-effects';
import {
  getPlayersByClubAndTier, getActiveYouthLoans, getAcademyReputationRanking,
  promotePlayerTier, YouthLoanRow,
} from '@/database/queries/youth';
import { recallYouthLoan } from '@/engine/youth/youth-loans';
import { evaluatePromotion } from '@/engine/youth/youth-progression';
import { previewIntake, IntakePreview, YouthSpecialization } from '@/engine/youth/youth-levers';
import { calculateOverall } from '@/utils/overall';
import { getPlayerById } from '@/database/queries/players';
import { Player } from '@/types';

interface ReservePlayer extends Player { overall: number; }
interface RankRow { clubId: number; name: string; academyReputation: number; rank: number; }
interface ToastState { title: string; tone: ToastTone; }

export function YouthAcademyScreen() {
  const playerClubId = useGameStore((s) => s.playerClubId);
  const saveId = useGameStore((s) => s.currentSave?.id);
  const dbHandle = useDatabaseStore((s) => s.dbHandle);
  const { t } = useTranslation();
  const accent = useClubAccent();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [reserves, setReserves] = useState<ReservePlayer[]>([]);
  const [loans, setLoans] = useState<YouthLoanRow[]>([]);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [benchmark, setBenchmark] = useState(70);
  const [firstTeamSize, setFirstTeamSize] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);

  const load = useCallback(async () => {
    if (!dbHandle || playerClubId === null || saveId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const club = await getClubById(dbHandle, saveId, playerClubId);
      const staff = await getStaffByClub(dbHandle, saveId, playerClubId);
      const youthCoachAbility = staff.find((s) => s.role === 'youth_coach')?.ability ?? 0;
      const youthCoachBonus = getStaffEffects({
        fitnessCoachAbility: 0, physioAbility: 0, scoutAbility: 0,
        youthCoachAbility, assistantAbility: 0,
      }).youthQualityBonus;
      const specRow = (await dbHandle
        .prepare("SELECT youth_specialization FROM staff WHERE save_id = ? AND club_id = ? AND role = 'youth_coach' LIMIT 1")
        .get(saveId, playerClubId)) as { youth_specialization: string } | undefined;
      const specialization = (specRow?.youth_specialization ?? 'balanced') as YouthSpecialization;

      setPreview(previewIntake({
        academyLevel: club?.youthAcademy ?? 3,
        youthCoachBonus,
        academyReputation: club?.academyReputation ?? 50,
        specialization,
      }));

      const reserveBase = await getPlayersByClubAndTier(dbHandle, saveId, playerClubId, 'reserve');
      const withOverall: ReservePlayer[] = [];
      for (const p of reserveBase) {
        const full = await getPlayerById(dbHandle, saveId, p.id);
        if (full) withOverall.push({ ...full, overall: Math.round(calculateOverall(full.attributes, full.position)) });
      }
      withOverall.sort((a, b) => b.overall - a.overall);
      setReserves(withOverall);

      // benchmark + first-team count para a regra de promoção (espelha o motor).
      const firstTeam = await getPlayersByClubAndTier(dbHandle, saveId, playerClubId, 'first');
      const firstOveralls: number[] = [];
      for (const p of firstTeam) {
        const full = await getPlayerById(dbHandle, saveId, p.id);
        if (full) firstOveralls.push(Math.round(calculateOverall(full.attributes, full.position)));
      }
      firstOveralls.sort((a, b) => b - a);
      const top11 = firstOveralls.slice(0, 11);
      setBenchmark(top11.length ? Math.round(top11.reduce((s, v) => s + v, 0) / top11.length) : 70);
      setFirstTeamSize(firstTeam.length);

      setLoans(await getActiveYouthLoans(dbHandle, saveId, playerClubId));
      if (club) setRanking(await getAcademyReputationRanking(dbHandle, saveId, club.countryId));
    } finally {
      setLoading(false);
    }
  }, [dbHandle, playerClubId, saveId]);

  useEffect(() => { load(); }, [load]);

  const handlePromote = useCallback(async (p: ReservePlayer) => {
    if (!dbHandle || saveId == null) return;
    const decision = evaluatePromotion(
      {
        playerId: p.id, age: p.age, currentOverall: p.overall,
        effectivePotential: p.effectivePotential, squadTier: 'reserve', seasonMinutesPercent: 0,
      },
      { firstTeamSize, starterAvgOverall: benchmark },
    );
    if (!decision.allowed) {
      const key = decision.reason === 'squad_full' ? 'youth.promote_squad_full' : 'youth.promote_too_raw';
      setToast({ title: t(key, { name: p.name }), tone: 'danger' });
      return;
    }
    await promotePlayerTier(dbHandle, saveId, p.id, 'first');
    setToast({ title: t('youth.promote_ok', { name: p.name }), tone: 'success' });
    await load();
  }, [dbHandle, saveId, firstTeamSize, benchmark, t, load]);

  const handleRecall = useCallback(async (loan: YouthLoanRow) => {
    if (!dbHandle || saveId == null) return;
    const ok = await confirm({ title: t('youth.recall_confirm', { name: `#${loan.playerId}` }), tone: 'danger' });
    if (!ok) return;
    const res = await recallYouthLoan(dbHandle, saveId, loan.id, 0, 0);
    if (res.recalled) {
      setToast({ title: t('youth.recall_ok', { name: `#${loan.playerId}` }), tone: 'success' });
      await load();
    }
  }, [dbHandle, saveId, confirm, t, load]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <View style={styles.header}>
        <Title style={styles.title}>{t('youth.title')}</Title>
        <Body color={colors.textSecondary}>{t('youth.subtitle')}</Body>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Preview do intake */}
        {preview && (
          <Card variant="detail" accent={accent.accent} style={styles.card}>
            <View style={styles.cardHead}>
              <Subheading>{t('youth.section_preview')}</Subheading>
              <Badge value={t(`youth.rep_tier.${preview.reputationTier}`)} tone="accent" accent={accent.accent} size="sm" />
            </View>
            <Body>{t('youth.preview_count', { min: preview.countMin, max: preview.countMax })}</Body>
            <Body>{t('youth.preview_potential', { min: preview.potentialMin, max: preview.potentialMax })}</Body>
            <Body>{t('youth.preview_gems', { n: preview.expectedGems })}</Body>
          </Card>
        )}

        {/* Reservas */}
        <Subheading style={styles.sectionTitle}>{t('youth.section_reserves')}</Subheading>
        {reserves.length === 0 ? (
          <EmptyState art="squad" title={t('youth.empty_reserves')} accent={accent.accent} />
        ) : (
          reserves.map((p) => (
            <Card key={p.id} variant="detail" style={styles.rowCard}>
              <View style={styles.rowInfo}>
                <Body>{p.name}</Body>
                <Caption color={colors.textSecondary}>{p.position} · {p.overall} · {p.age}</Caption>
              </View>
              <Button
                label={t('youth.promote')}
                variant="secondary"
                accent={accent.accent}
                onPress={() => handlePromote(p)}
                testID={`youth-promote-${p.id}`}
                accessibilityLabel={t('youth.promote')}
              />
            </Card>
          ))
        )}

        {/* Empréstimos */}
        <Subheading style={styles.sectionTitle}>{t('youth.section_loans')}</Subheading>
        {loans.length === 0 ? (
          <EmptyState art="search" title={t('youth.empty_loans')} accent={accent.accent} />
        ) : (
          loans.map((loan) => {
            const rating = loan.appearances > 0 ? (loan.ratingSum / loan.appearances).toFixed(1) : '—';
            return (
              <Card key={loan.id} variant="detail" style={styles.rowCard}>
                <View style={styles.rowInfo}>
                  <Body>#{loan.playerId}</Body>
                  <Caption color={colors.textSecondary}>
                    {t('youth.loan_minutes', { minutes: loan.minutesPlayed, apps: loan.appearances, rating })}
                  </Caption>
                </View>
                <Button
                  label={t('youth.recall')}
                  variant="danger"
                  onPress={() => handleRecall(loan)}
                  testID={`youth-recall-${loan.id}`}
                  accessibilityLabel={t('youth.recall')}
                />
              </Card>
            );
          })
        )}

        {/* Ranking de reputação */}
        <Subheading style={styles.sectionTitle}>{t('youth.section_ranking')}</Subheading>
        <Card variant="detail" style={styles.card}>
          {ranking.slice(0, 8).map((r) => {
            const mine = r.clubId === playerClubId;
            return (
              <View key={r.clubId} style={styles.rankRow}>
                {mine && <Icon name="squad" color={accent.accent} size={14} />}
                <Body color={mine ? accent.accent : colors.text}>
                  {t('youth.rank_row', { rank: r.rank, name: r.name, rep: r.academyReputation })}
                </Body>
              </View>
            );
          })}
        </Card>
      </ScrollView>

      {toast && (
        <Toast title={toast.title} tone={toast.tone} onDismiss={() => setToast(null)} testID="youth-toast" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { marginBottom: spacing.xs },
  body: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  card: { gap: spacing.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { marginTop: spacing.md, marginBottom: spacing.xs },
  rowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowInfo: { flex: 1, gap: 2 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
