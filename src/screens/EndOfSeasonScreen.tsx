import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, fontSize, radius, commonStyles } from '@/theme';
import { useGameStore } from '@/store/game-store';
import { useCelebrationStore } from '@/store/celebration-store';
import { useDatabaseStore } from '@/store/database-store';
import { RootStackParamList } from '@/navigation/types';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { SeededRng } from '@/engine/rng';
import { processAchievementCheckpoint } from '@/engine/achievements/achievements-checkpoint';
import { isManagerDismissed } from '@/engine/board/season-outcome';
import { markSaveEnded, setUnemployed } from '@/database/queries/save';
import { getAssistantsBySave } from '@/database/queries/assistants';
import { evaluateSeasonEndBoard } from '@/engine/season/season-end-eval';
import { runSeasonTransition } from '@/engine/season/season-transition';
import { useBoardStore } from '@/store/board-store';
import { BoardObjectiveType, TrustConsequence, TrustOutcome } from '@/types/board';
import { useTranslation, objectiveDescriptor } from '@/i18n';
import { useAssistantStore } from '@/store/assistant-store';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface SeasonStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  leaguePosition: number | null;
  totalTeams: number;
  income: number;
  expenses: number;
}

export function EndOfSeasonScreen() {
  const navigation = useNavigation<NavProp>();
  const { season, playerClub, playerClubId, setNewSeason, updateWeek, currentSave, setPendingAnnouncedRetirementIds, setPreseasonPending, setManagerReputation: setStoreManagerReputation, setJobOffersPending: setStoreJobOffersPending, setUnemployed: setStoreUnemployed, setPendingAchievementToastIds: setStorePendingAchievementToastIds } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { setCurrentObjective, setCurrentTrust, setLastTrustResult, setReputationHistory } = useBoardStore();
  const { setAssistants } = useAssistantStore();

  const [stats, setStats] = useState<SeasonStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [boardProcessed, setBoardProcessed] = useState(false);
  // W2: set when the manager was fired AND smaller clubs offered a rescue — the
  // dismissal branch then rolls the world over and routes to the unemployed gate
  // instead of ending the save.
  const [hasRescueOffers, setHasRescueOffers] = useState(false);
  const { t } = useTranslation();
  const [boardEval, setBoardEval] = useState<{
    oldRep: number; newRep: number; delta: number;
    trust: number; outcome: TrustOutcome; consequence: TrustConsequence;
    objectiveType: BoardObjectiveType; objectiveTarget: number | null;
  } | null>(null);
  const [managerRepEval, setManagerRepEval] = useState<{ before: number; after: number; delta: number } | null>(null);

  // advanceGameWeek already bumped the season pointer to the upcoming year.
  // The stats/report are about the season that just finished, which is one
  // behind the store's "current" season.
  const endedSeason = season - 1;

  useEffect(() => {
    if (!dbHandle || !playerClub || !playerClubId || !currentSave) {
      setLoading(false);
      return;
    }
    const saveId = currentSave.id;

    (async () => {
      try {
        const competitions = await getCompetitionsBySeason(dbHandle, saveId, endedSeason);

        // Engine re-computes stats + board/rep/offers and persists them; the screen
        // just wires stores + UI. Guard prevents re-runs on re-renders.
        const evalRes = await evaluateSeasonEndBoard(dbHandle, {
          saveId,
          playerClubId,
          clubReputation: playerClub.reputation,
          endedSeason,
          newSeason: season,
          competitions: competitions.map((c) => ({ id: c.id, type: c.type })),
          offerRng: new SeededRng(season * 6151 + saveId),
        });
        setStats(evalRes.stats);

        if (!boardProcessed) {
          setBoardProcessed(true);
          setCurrentObjective(evalRes.board.newObjective);
          setCurrentTrust(evalRes.board.newTrust);
          setLastTrustResult(evalRes.board.outcome, evalRes.board.consequence);
          setReputationHistory(evalRes.board.reputationHistory);
          setBoardEval({
            oldRep: evalRes.board.oldReputation,
            newRep: evalRes.board.newReputation,
            delta: evalRes.board.reputationDelta,
            trust: evalRes.board.newTrust,
            outcome: evalRes.board.outcome,
            consequence: evalRes.board.consequence,
            objectiveType: evalRes.board.objectiveType,
            objectiveTarget: evalRes.board.objectiveTarget,
          });
          setStoreManagerReputation(evalRes.managerRep.after);
          setManagerRepEval({ before: evalRes.managerRep.before, after: evalRes.managerRep.after, delta: evalRes.managerRep.delta });

          if (evalRes.stats.leaguePosition === 1 || evalRes.wonCup) {
            useCelebrationStore.getState().push({
              kind: 'trophy',
              titleKey: 'celebration.trophy',
              detail: playerClub?.name ?? undefined,
            });
          }

          // ── P8 achievements: season-end checkpoint ──────────────────────────
          // Facts known here: titles, promotion, manager rep and seasons completed
          // (finishing season N means N seasons completed). Toast surfaces on Home.
          try {
            const newly = await processAchievementCheckpoint({
              db: dbHandle,
              saveId,
              season: endedSeason,
              week: 1,
              snapshot: {
                wonLeague: evalRes.stats.leaguePosition === 1,
                wonCup: evalRes.wonCup,
                promoted: evalRes.wasPromoted,
                managerReputation: evalRes.managerRep.after,
                seasonsCompleted: endedSeason,
              },
            });
            if (newly.length > 0) setStorePendingAchievementToastIds(newly.map((d) => d.id));
          } catch { /* best-effort */ }

          if (evalRes.generatedOfferClubIds.length > 0) setStoreJobOffersPending(true);

          // W2: a dismissal that still produced offers means rescue offers — flag it so
          // handleContinue rolls the world over and routes to the unemployed gate.
          if (isManagerDismissed(evalRes.board.consequence) && evalRes.generatedOfferClubIds.length > 0) {
            setHasRescueOffers(true);
          }
        }
      } catch (e) {
        // Fallback empty stats
        setStats({
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          leaguePosition: null,
          totalTeams: 0,
          income: 0,
          expenses: 0,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [dbHandle, playerClub, playerClubId, endedSeason, currentSave, season, boardProcessed, setCurrentObjective, setCurrentTrust, setLastTrustResult, setReputationHistory]);

  async function handleContinue() {
    if (!dbHandle || starting || !playerClubId) return;
    setStarting(true);

    // Dismissal branch: the board fired the manager.
    if (currentSave && isManagerDismissed(boardEval?.consequence ?? 'none')) {
      // W2: smaller clubs offered a rescue → roll the world over (the rescue club's
      // squad is rolled alongside) and open the unemployed gate, routing to JobOffers.
      if (hasRescueOffers) {
        await runSeasonTransition(dbHandle, {
          saveId: currentSave.id,
          playerClubId,
          endedSeason,
          newSeason: season,
          youthAcademyLevel: playerClub?.youthAcademy ?? 3,
          rng: new SeededRng(season * 7777),
        });
        setAssistants(await getAssistantsBySave(dbHandle, currentSave.id));
        await setUnemployed(dbHandle, currentSave.id, true);
        setStoreUnemployed(true);
        setStoreJobOffersPending(true);
        setPendingAnnouncedRetirementIds([]);
        setNewSeason(false);
        setPreseasonPending(true);
        updateWeek(season, 1);
        setStarting(false);
        navigation.navigate('Game'); // Home gate → JobOffersScreen (unemployed mode)
        return;
      }

      // No rescue → end the save and route to GameOver BEFORE any rollover mutation
      // (a dead save does zero rollover).
      await markSaveEnded(dbHandle, currentSave.id);
      setStarting(false);
      navigation.navigate('GameOver', {
        reason: boardEval?.outcome === 'objective_failed'
          ? t('endseason.gameover_objective_failed')
          : t('endseason.gameover_trust_depleted'),
        trust: boardEval?.trust ?? 0,
        objectiveDescription: boardEval
          ? (() => { const d = objectiveDescriptor(boardEval.objectiveType, boardEval.objectiveTarget); return t(d.key, d.vars); })()
          : '',
      });
      return;
    }

    try {
      // advanceGameWeek already advanced the season pointer; `season` is the new year.
      const newSeason = season;

      // Headless season-end mutation: assistants aging + promotion/relegation + rolloverSeason.
      if (currentSave) {
        await runSeasonTransition(dbHandle, {
          saveId: currentSave.id,
          playerClubId,
          endedSeason,
          newSeason,
          youthAcademyLevel: playerClub?.youthAcademy ?? 3,
          rng: new SeededRng(newSeason * 7777),
        });
        // Refresh the assistants store from the DB after the transition aged them.
        setAssistants(await getAssistantsBySave(dbHandle, currentSave.id));
      }

      // Runs only after COMMIT — season pointer is already correct, just flip
      // the flag and make sure we're on week 1 of the new season.
      setPendingAnnouncedRetirementIds([]);
      setNewSeason(false);
      // rolloverSeason opened the pre-season window in the DB; mirror it in the store
      // so Home routes the user into PreSeasonScreen for the new season.
      setPreseasonPending(true);
      updateWeek(newSeason, 1);
      navigation.navigate('Game');
    } catch (err) {
      // rolloverSeason rolled the DB back to the pre-rollover state.
      // Do NOT advance the week / mark the season started — let the user retry.
      console.error('[EndOfSeason] rollover failed, rolled back:', err);
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>{t('endseason.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      {/* Title */}
      <View style={styles.titleCard}>
        <Text style={styles.trophy}>{t('endseason.season_complete')}</Text>
        <Text style={styles.titleText}>{t('standings.season', { season: endedSeason })}</Text>
        <Text style={styles.clubName}>{playerClub?.name ?? t('endseason.your_club')}</Text>
      </View>

      {/* League Position */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('endseason.final_position')}</Text>
          {stats.leaguePosition !== null ? (
            <View style={styles.positionRow}>
              <Text style={[styles.positionNumber, getPositionStyle(stats.leaguePosition)]}>
                {stats.leaguePosition}
              </Text>
              <Text style={styles.positionOf}>{t('endseason.position_of', { total: stats.totalTeams })}</Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>{t('endseason.position_unavailable')}</Text>
          )}
        </View>
      )}

      {/* Season Stats */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('endseason.season_stats')}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.played}</Text>
              <Text style={styles.statLabel}>{t('endseason.played')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.success }]}>{stats.wins}</Text>
              <Text style={styles.statLabel}>{t('endseason.wins')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.warning }]}>{stats.draws}</Text>
              <Text style={styles.statLabel}>{t('endseason.draws')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.danger }]}>{stats.losses}</Text>
              <Text style={styles.statLabel}>{t('endseason.losses')}</Text>
            </View>
          </View>
          <View style={styles.goalRow}>
            <Text style={styles.goalText}>{t('endseason.goals', { scored: stats.goalsFor, conceded: stats.goalsAgainst })}</Text>
          </View>
        </View>
      )}

      {/* Financial Summary */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('endseason.financial_summary')}</Text>
          <View style={styles.financeRow}>
            <View style={styles.financeItem}>
              <Text style={styles.financeLabel}>{t('endseason.total_income')}</Text>
              <Text style={[styles.financeValue, { color: colors.success }]}>
                {formatCurrency(stats.income)}
              </Text>
            </View>
            <View style={styles.financeItem}>
              <Text style={styles.financeLabel}>{t('endseason.total_expenses')}</Text>
              <Text style={[styles.financeValue, { color: colors.danger }]}>
                {formatCurrency(stats.expenses)}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>{t('endseason.net_balance')}</Text>
            <Text
              style={[
                styles.balanceValue,
                { color: stats.income - stats.expenses >= 0 ? colors.success : colors.danger },
              ]}
            >
              {formatCurrency(stats.income - stats.expenses)}
            </Text>
          </View>
        </View>
      )}

      {/* Board Evaluation */}
      {boardEval && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('endseason.board_evaluation')}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{boardEval.oldRep}</Text>
              <Text style={styles.statLabel}>{t('endseason.rep_before')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: boardEval.delta >= 0 ? colors.success : colors.danger }]}>
                {boardEval.newRep}
              </Text>
              <Text style={styles.statLabel}>{t('endseason.rep_after')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: boardEval.delta >= 0 ? colors.success : colors.danger }]}>
                {boardEval.delta >= 0 ? `+${boardEval.delta}` : `${boardEval.delta}`}
              </Text>
              <Text style={styles.statLabel}>{t('endseason.delta')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{boardEval.trust}</Text>
              <Text style={styles.statLabel}>{t('endseason.trust')}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <Text style={styles.balanceLabel}>
            {t('endseason.objective_outcome')}{' '}
            <Text style={{ color: boardEval.outcome === 'objective_met' ? colors.success : boardEval.outcome === 'objective_partial' ? colors.warning : colors.danger }}>
              {boardEval.outcome === 'objective_met' ? t('endseason.outcome_met') : boardEval.outcome === 'objective_partial' ? t('endseason.outcome_close') : t('endseason.outcome_failed')}
            </Text>
          </Text>
          {boardEval.consequence !== 'none' && (
            <Text style={[styles.noDataText, { color: boardEval.consequence === 'fired' || boardEval.consequence === 'budget_cut' ? colors.danger : colors.success, marginTop: spacing.xs }]}>
              {boardEval.consequence === 'fired' ? t('endseason.consequence_fired') :
               boardEval.consequence === 'budget_cut' ? t('endseason.consequence_budget_cut') :
               t('endseason.consequence_budget_raise')}
            </Text>
          )}
          <View style={styles.divider} />
          <Text style={styles.balanceLabel}>{t('endseason.next_objective')}</Text>
          <Text style={styles.noDataText}>
            {(() => { const d = objectiveDescriptor(boardEval.objectiveType, boardEval.objectiveTarget); return t(d.key, d.vars); })()}
          </Text>
        </View>
      )}

      {/* Manager (career) reputation change */}
      {managerRepEval && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('endseason.manager_rep_label')}</Text>
          <Text style={[styles.balanceValue, { color: managerRepEval.delta >= 0 ? colors.success : colors.danger }]}>
            {t('endseason.manager_rep_change', {
              before: managerRepEval.before,
              after: managerRepEval.after,
              delta: managerRepEval.delta >= 0 ? `+${managerRepEval.delta}` : `${managerRepEval.delta}`,
            })}
          </Text>
          <Text style={[styles.noDataText, { marginTop: spacing.xxs }]}>{t('endseason.manager_rep_hint')}</Text>
        </View>
      )}

      {/* Continue Button */}
      <TouchableOpacity
        style={[styles.continueButton, starting && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={starting}
        activeOpacity={0.8}
      >
        {starting ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.continueButtonText}>{t('endseason.continue_to', { season })}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}$${abs}`;
}

function getPositionStyle(position: number): { color: string } {
  if (position === 1) return { color: colors.gold };
  if (position <= 3) return { color: colors.silver };
  if (position <= 6) return { color: colors.success };
  return { color: colors.text };
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl * 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.md,
  },
  titleCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    margin: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  trophy: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  titleText: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  clubName: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  positionNumber: {
    fontSize: 64,
    fontWeight: 'bold',
    lineHeight: 72,
  },
  positionOf: {
    color: colors.textSecondary,
    fontSize: fontSize.xl,
    marginLeft: spacing.sm,
  },
  noDataText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xxs,
  },
  goalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  goalText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  financeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  financeItem: {
    flex: 1,
    alignItems: 'center',
  },
  financeLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  financeValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  balanceValue: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 18,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
