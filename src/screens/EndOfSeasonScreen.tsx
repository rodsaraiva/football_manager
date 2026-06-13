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
import { useDatabaseStore } from '@/store/database-store';
import { RootStackParamList } from '@/navigation/types';
import { getClubsByLeague } from '@/database/queries/clubs';
import { getCompetitionsBySeason, getAllLeagues } from '@/database/queries/leagues';
import { getFixturesByClub } from '@/database/queries/fixtures';
import { getFinancesBySeason } from '@/database/queries/finances';
import { getPromotedForClub } from '@/database/queries/season-promoted';
import { calculateStandings } from '@/engine/competition/standings';
import { buildDivisionPairs, computeDivisionSwaps } from '@/engine/competition/promotion';
import { Fixture } from '@/types';
import { SeededRng } from '@/engine/rng';
import { processSeasonEndBoard } from '@/engine/board/season-end-board';
import { processAchievementCheckpoint } from '@/engine/achievements/achievements-checkpoint';
import { isManagerDismissed } from '@/engine/board/season-outcome';
import { computeManagerReputationDelta } from '@/engine/board/manager-reputation-engine';
import { generateJobOffers, JobOfferCandidateClub } from '@/engine/board/job-offers-engine';
import { markSaveEnded, getManagerReputation, setManagerReputation, setJobOffersPending } from '@/database/queries/save';
import { insertJobOffer } from '@/database/queries/job-offers';
import { getAllClubs } from '@/database/queries/clubs';
import { getPlayersWithAttributesByClub } from '@/database/queries/players';
import { calculateOverall } from '@/utils/overall';
import { rolloverSeason } from '@/engine/season-rollover';
import { processAssistantsSeasonEnd } from '@/engine/assistant/season-end-assistants';
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
  const { season, playerClub, playerClubId, setNewSeason, updateWeek, currentSave, setPendingAnnouncedRetirementIds, setPreseasonPending, setManagerReputation: setStoreManagerReputation, setJobOffersPending: setStoreJobOffersPending, setPendingAchievementToastIds: setStorePendingAchievementToastIds } = useGameStore();
  const { dbHandle } = useDatabaseStore();
  const { setCurrentObjective, setCurrentTrust, setLastTrustResult, setReputationHistory } = useBoardStore();
  const { setAssistants } = useAssistantStore();

  const [stats, setStats] = useState<SeasonStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [boardProcessed, setBoardProcessed] = useState(false);
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
        // Get all club fixtures for the season that just ended
        const allFixtures = await getFixturesByClub(dbHandle, saveId, playerClubId, endedSeason);
        const played = allFixtures.filter((f) => f.played);

        let wins = 0;
        let draws = 0;
        let losses = 0;
        let goalsFor = 0;
        let goalsAgainst = 0;

        for (const f of played) {
          const isHome = f.homeClubId === playerClubId;
          const myGoals = isHome ? (f.homeGoals ?? 0) : (f.awayGoals ?? 0);
          const oppGoals = isHome ? (f.awayGoals ?? 0) : (f.homeGoals ?? 0);
          goalsFor += myGoals;
          goalsAgainst += oppGoals;
          if (myGoals > oppGoals) wins++;
          else if (myGoals === oppGoals) draws++;
          else losses++;
        }

        // Compute league standings for player's club
        const leagueClubs = await getClubsByLeague(dbHandle, saveId, playerClub.leagueId);
        const clubIds = leagueClubs.map((c) => c.id);

        const competitions = await getCompetitionsBySeason(dbHandle, saveId, endedSeason);
        const leagueComp = competitions.find(
          (comp) => comp.leagueId === playerClub.leagueId && comp.type === 'league',
        );

        let leaguePosition: number | null = null;
        const totalTeams = leagueClubs.length;

        if (leagueComp) {
          // Collect all played league fixtures across all league clubs
          const fixtureSet = new Map<number, Fixture>();
          for (const clubId of clubIds) {
            const clubFixtures = await getFixturesByClub(dbHandle, saveId, clubId, endedSeason);
            for (const f of clubFixtures) {
              if (f.competitionId === leagueComp.id && f.played && !fixtureSet.has(f.id)) {
                fixtureSet.set(f.id, f);
              }
            }
          }
          const allLeagueFixtures = Array.from(fixtureSet.values());
          const standings = calculateStandings(allLeagueFixtures, clubIds);
          const idx = standings.findIndex((e) => e.clubId === playerClubId);
          leaguePosition = idx >= 0 ? idx + 1 : null;
        }

        // Financial summary — sum positive (income) and negative (expenses) entries
        // separately. getSeasonBalance returns only the net, which hid one side.
        const finances = await getFinancesBySeason(dbHandle, saveId, playerClubId, endedSeason);
        const income = finances.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
        const expenses = finances.filter((f) => f.amount < 0).reduce((s, f) => s + Math.abs(f.amount), 0);

        setStats({
          played: played.length,
          wins,
          draws,
          losses,
          goalsFor,
          goalsAgainst,
          leaguePosition,
          totalTeams,
          income,
          expenses,
        });

        // Board evaluation — engine computes/persists; the screen just wires stores + UI.
        // Guard prevents re-runs on re-renders.
        if (!boardProcessed) {
          setBoardProcessed(true);
          const relegatedRow = await dbHandle
            .prepare('SELECT id FROM season_relegated WHERE save_id = ? AND season = ? AND club_id = ? LIMIT 1')
            .get(saveId, endedSeason, playerClubId) as { id: number } | undefined;
          const promotedRow = await getPromotedForClub(dbHandle, saveId, endedSeason, playerClubId);

          // Real cup detection: any won domestic cup (exclude continental).
          let wonCup = false;
          for (const comp of competitions.filter((c) => c.type === 'cup')) {
            const champ = await dbHandle
              .prepare('SELECT champion_club_id AS champ FROM season_competition_results WHERE save_id = ? AND season = ? AND competition_id = ?')
              .get(saveId, endedSeason, comp.id) as { champ: number } | undefined;
            if (champ?.champ === playerClubId) { wonCup = true; break; }
          }

          // Real squad strength (drives the reputation squad bonus).
          const squadWithAttrs = await getPlayersWithAttributesByClub(dbHandle, saveId, playerClubId);
          const overalls = squadWithAttrs.map((pl) => calculateOverall(pl.attributes, pl.position));
          const squadAverageOverall = overalls.length
            ? overalls.reduce((s, v) => s + v, 0) / overalls.length
            : 70;

          try {
            const boardResult = await processSeasonEndBoard({
              dbHandle,
              clubId: playerClubId,
              saveId: currentSave.id,
              endedSeason,
              newSeason: season,
              leaguePosition,
              totalTeams,
              currentReputation: playerClub.reputation,
              budgetBalance: income - expenses,
              wasRelegated: relegatedRow != null,
              wasPromoted: promotedRow != null,
              wonLeague: leaguePosition === 1,
              wonCup,
              squadAverageOverall,
            });
            setCurrentObjective(boardResult.newObjective);
            setCurrentTrust(boardResult.newTrust);
            setLastTrustResult(boardResult.outcome, boardResult.consequence);
            setReputationHistory(boardResult.reputationHistory);
            setBoardEval({
              oldRep: boardResult.oldReputation,
              newRep: boardResult.newReputation,
              delta: boardResult.reputationDelta,
              trust: boardResult.newTrust,
              outcome: boardResult.outcome,
              consequence: boardResult.consequence,
              objectiveType: boardResult.objectiveType,
              objectiveTarget: boardResult.objectiveTarget,
            });

            // ── P6 manager career ──────────────────────────────────────────────
            // 1. Accrue career-wide MANAGER reputation (distinct from club rep). objectiveMet
            //    is derived from the board outcome — anything that is not a failure counts.
            const objectiveMet = boardResult.outcome !== 'objective_failed';
            const currentManagerRep = await getManagerReputation(dbHandle, saveId);
            const managerRep = computeManagerReputationDelta({
              current: currentManagerRep,
              leaguePosition,
              totalTeams,
              wonLeague: leaguePosition === 1,
              wonCup,
              wasPromoted: promotedRow != null,
              wasRelegated: relegatedRow != null,
              objectiveMet,
            });
            await setManagerReputation(dbHandle, saveId, managerRep.next);
            setStoreManagerReputation(managerRep.next);
            setManagerRepEval({ before: currentManagerRep, after: managerRep.next, delta: managerRep.delta });

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
                  wonLeague: leaguePosition === 1,
                  wonCup,
                  promoted: promotedRow != null,
                  managerReputation: managerRep.next,
                  seasonsCompleted: endedSeason,
                },
              });
              if (newly.length > 0) setStorePendingAchievementToastIds(newly.map((d) => d.id));
            } catch { /* best-effort */ }

            // 2. Job offers — only when NOT fired (rescue offers are explicitly out of scope).
            if (!isManagerDismissed(boardResult.consequence)) {
              const leaguesForDiv = await getAllLeagues(dbHandle);
              const divByLeague = new Map(leaguesForDiv.map((l) => [l.id, l.divisionLevel]));
              const allClubs = await getAllClubs(dbHandle, saveId);
              const candidates: JobOfferCandidateClub[] = allClubs.map((c) => ({
                id: c.id,
                reputation: c.reputation,
                divisionLevel: divByLeague.get(c.leagueId) ?? 1,
              }));
              const offers = generateJobOffers({
                managerReputation: managerRep.next,
                currentClubId: playerClubId,
                currentClubReputation: playerClub.reputation,
                candidates,
                rng: new SeededRng(season * 6151 + saveId),
              });
              if (offers.length > 0) {
                // Keyed to the season that just FINISHED (the trigger), so a later
                // historical lookup ("who offered me a job after season X") is correct.
                for (const o of offers) {
                  await insertJobOffer(dbHandle, saveId, endedSeason, o.offeringClubId);
                }
                await setJobOffersPending(dbHandle, saveId, true);
                setStoreJobOffersPending(true);
              }
            }
          } catch {
            // Board eval is best-effort; stats still render.
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

    // Dismissal short-circuit: if the board fired the manager, end the save and
    // route to GameOver BEFORE any rollover mutation (a dead save does zero rollover).
    if (currentSave && isManagerDismissed(boardEval?.consequence ?? 'none')) {
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

      // Assistants: age/retire loop lives in the engine now; refresh the store with the result.
      if (currentSave) {
        const updatedAssistants = await processAssistantsSeasonEnd(dbHandle, currentSave.id);
        setAssistants(updatedAssistants);
      }

      // Promotion/relegation: physically move clubs between linked divisions using
      // each league's FINAL standings, BEFORE rolloverSeason regenerates the calendar
      // (so the new season's fixtures reflect the post-swap divisions).
      const swapSaveId = currentSave?.id ?? -1;
      const swapLeagues = await getAllLeagues(dbHandle);
      const standingsByLeague = new Map<number, number[]>();
      const competitionsEnded = await getCompetitionsBySeason(dbHandle, swapSaveId, endedSeason);
      for (const lg of swapLeagues) {
        const leagueComp = competitionsEnded.find((c) => c.leagueId === lg.id && c.type === 'league');
        if (!leagueComp) continue;
        const lgClubs = await getClubsByLeague(dbHandle, swapSaveId, lg.id);
        const lgClubIds = lgClubs.map((c) => c.id);
        const fxSet = new Map<number, Fixture>();
        for (const cid of lgClubIds) {
          const cf = await getFixturesByClub(dbHandle, swapSaveId, cid, endedSeason);
          for (const f of cf) {
            if (f.competitionId === leagueComp.id && f.played && !fxSet.has(f.id)) fxSet.set(f.id, f);
          }
        }
        const ordered = calculateStandings(Array.from(fxSet.values()), lgClubIds);
        standingsByLeague.set(lg.id, ordered.map((e) => e.clubId));
      }
      const divisionPairs = buildDivisionPairs(swapLeagues);
      const divisionSwaps = computeDivisionSwaps(divisionPairs, standingsByLeague);
      for (const s of divisionSwaps) {
        await dbHandle.prepare('UPDATE clubs SET league_id = ? WHERE save_id = ? AND id = ?').run(s.toLeagueId, swapSaveId, s.clubId);
      }

      // Transactional rollover: age players, expire contracts, return loans,
      // recalc potential, generate youth, regenerate the new-season calendar.
      await rolloverSeason({
        dbHandle,
        playerClubId,
        saveId: currentSave?.id ?? -1,
        endedSeason,
        newSeason,
        youthAcademyLevel: playerClub?.youthAcademy ?? 3,
        rng: new SeededRng(newSeason * 7777),
      });

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
