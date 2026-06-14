import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, alpha, spacing, fontSize, radius, commonStyles } from '@/theme';
import { ClubBanner } from '@/components/ClubBanner';
import { useTranslation, objectiveDescriptor } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { useBoardStore } from '@/store/board-store';
import { useAssistantStore } from '@/store/assistant-store';
import { Fixture, Club, MatchEvent } from '@/types';
import { RootStackParamList } from '@/navigation/types';
import { SeededRng } from '@/engine/rng';
import { getFixturesByWeek, getFixturesByClub } from '@/database/queries/fixtures';
import { getClubById } from '@/database/queries/clubs';
import { getPlayerById, getPlayersByClub, getPlayersAboutToRetire } from '@/database/queries/players';
import { getActiveTactic } from '@/database/queries/tactics';
import { getBoardObjective, getSaveBoardTrust, getReputationHistory } from '@/database/queries/board';
import { advanceGameWeek } from '@/engine/game-loop';
import { countClubWins } from '@/database/queries/fixtures';
import { processAchievementCheckpoint } from '@/engine/achievements/achievements-checkpoint';
import { getAchievementDef } from '@/engine/achievements/achievements-catalog';
import { isOnboardingSeen, setOnboardingSeen } from '@/database/queries/save';
import { AchievementToast } from '@/components/AchievementToast';
import { OnboardingModal } from '@/components/OnboardingModal';
import { startUserMatchHalftime } from '@/engine/match-day/halftime';
import { resolveAdvanceReload } from '@/engine/advance-reload';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';
import { FORMATION_ROWS } from '@/engine/formations';
import { calculateOverall } from '@/utils/overall';
import { Player, PlayerAttributes, Position } from '@/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { t } = useTranslation();

  const {
    playerClub,
    playerClubId,
    season,
    week,
    recentResults,
    isAdvancing,
    isNewSeason,
    preseasonPending,
    pressPending,
    jobOffersPending,
    managerReputation,
    onboardingSeen,
    setOnboardingSeen: setStoreOnboardingSeen,
    pendingAchievementToastIds,
    setPendingAchievementToastIds,
    pendingInternationalCallUpCount,
    setPendingInternationalCallUpCount,
    lastMatchResult,
    currentSave,
    setAdvancing,
    updateWeek,
    setPressPending,
    setLastMatchResult,
    setLastMatchContext,
    setHalftime,
    lastMatchIsHome,
    lastMatchOpponentName,
    setNewSeason,
    setPlayerClub,
    setRecentResults,
    setLastRetiredPlayerIds,
    setPendingAnnouncedRetirementIds,
    pendingAnnouncedRetirementIds,
    refreshUnreadNewsCount,
  } = useGameStore();

  const { dbHandle } = useDatabaseStore();
  const { currentObjective, currentTrust, setCurrentObjective, setCurrentTrust, setReputationHistory } = useBoardStore();
  const { pendingComment, setPendingComment, setLastCommentWeek } = useAssistantStore();

  const [announcedRetirees, setAnnouncedRetirees] = useState<Array<{ id: number; name: string; age: number }>>([]);
  const [nextOpponent, setNextOpponent] = useState<{ club: Club; isHome: boolean } | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showOpponentModal, setShowOpponentModal] = useState(false);
  const [opponentSquad, setOpponentSquad] = useState<Array<{ name: string; position: Position; overall: number }>>([]);
  const [opponentFormation, setOpponentFormation] = useState('4-4-2');
  const [loadingOpponent, setLoadingOpponent] = useState(false);

  const boardLoadedRef = useRef(false);
  // Only the instant-advance path auto-opens the result modal on Home; the halftime
  // path already shows the result on MatchResultScreen, so its modal would be redundant.
  const autoShowResultRef = useRef(false);

  // Load club data, reset stale fixtures, and load recent results on save load
  useEffect(() => {
    if (!dbHandle || !playerClubId || !currentSave) return;
    const saveId = currentSave.id;
    (async () => {
      // Load player club if not set
      if (!playerClub) {
        const club = await getClubById(dbHandle, saveId, playerClubId);
        if (club) setPlayerClub(club);
      }

      // Rescue old saves: if no fixtures exist for the season, generate them now.
      // This fixes saves created before calendar generation was correctly awaited.
      try {
        await ensureSeasonFixtures(dbHandle, saveId, season);
      } catch { /* non-fatal */ }

      // Load recent results for current save (only weeks before current)
      try {
        const allFixtures = await getFixturesByClub(dbHandle, saveId, playerClubId, season);
        const played = allFixtures.filter(f => f.played && f.week < week);
        setRecentResults(played.slice(-5));
      } catch { /* ignore */ }
    })();
  }, [dbHandle, playerClubId, currentSave, season, week]);

  // Load retiring player names when IDs become available
  useEffect(() => {
    if (!dbHandle || !playerClubId || !currentSave || pendingAnnouncedRetirementIds.length === 0) {
      setAnnouncedRetirees([]);
      return;
    }
    const saveId = currentSave.id;
    (async () => {
      const players = await getPlayersAboutToRetire(dbHandle, saveId, playerClubId);
      setAnnouncedRetirees(players.map(p => ({ id: p.id, name: p.name, age: p.age })));
    })();
  }, [dbHandle, playerClubId, currentSave, pendingAnnouncedRetirementIds]);

  // Load next match opponent
  useEffect(() => {
    if (!dbHandle || !playerClubId || !currentSave) return;
    const saveId = currentSave.id;
    (async () => {
      try {
        const weekFixtures = await getFixturesByWeek(dbHandle, saveId, season, week);
        const myFixture = weekFixtures.find(
          f => !f.played && (f.homeClubId === playerClubId || f.awayClubId === playerClubId),
        );
        if (myFixture) {
          const isHome = myFixture.homeClubId === playerClubId;
          const oppId = isHome ? myFixture.awayClubId : myFixture.homeClubId;
          const oppClub = await getClubById(dbHandle, saveId, oppId);
          if (oppClub) setNextOpponent({ club: oppClub, isHome });
        } else {
          setNextOpponent(null);
        }
      } catch {
        setNextOpponent(null);
      }
    })();
  }, [dbHandle, playerClubId, currentSave, season, week]);

  // Reset board-loaded flag when switching saves
  useEffect(() => {
    boardLoadedRef.current = false;
  }, [currentSave?.id]);

  // Navigate to EndOfSeason when flag is set
  useEffect(() => {
    if (isNewSeason) {
      navigation.navigate('EndOfSeason');
    }
  }, [isNewSeason, navigation]);

  // Career gate: rival job offers at season-end resolve BEFORE pre-season. Accepting an
  // offer sets preseason_pending for the chosen club, which then fires the gate below.
  useEffect(() => {
    if (jobOffersPending && !isNewSeason && !pressPending) {
      navigation.navigate('JobOffers');
    }
  }, [jobOffersPending, isNewSeason, pressPending, navigation]);

  // Route to the pre-season window whenever it is pending (new game / season turn).
  // Deferred to the job-offers gate: pre-season only starts once offers are resolved.
  useEffect(() => {
    if (preseasonPending && !jobOffersPending && !isNewSeason) {
      navigation.navigate('PreSeason');
    }
  }, [preseasonPending, jobOffersPending, isNewSeason, navigation]);

  // Route to the post-match press conference. Sequencing vs the result modal: when a
  // match was just played, the result modal opens and the close handler drives the
  // press navigation, so they never clash. This effect is the fallback path — it only
  // fires when there is NO result modal to acknowledge (e.g. a mid-gate page reload
  // cleared lastMatchResult but the DB gate is still set). Guarded on the season/
  // pre-season gates; the gate is cleared on the press screen, so it fires once.
  useEffect(() => {
    if (
      pressPending &&
      !lastMatchResult &&
      !showMatchModal &&
      !isNewSeason &&
      !preseasonPending
    ) {
      navigation.navigate('PressConference');
    }
  }, [pressPending, lastMatchResult, showMatchModal, isNewSeason, preseasonPending, navigation]);

  // First-game onboarding: a one-time welcome, LOWER priority than every navigation gate.
  // Shows only when no gate is pending and nothing is being acknowledged, so the player
  // sees it on a calm Home. Setting the gate (DB + store) guarantees it never returns.
  useEffect(() => {
    if (
      !onboardingSeen &&
      !preseasonPending &&
      !pressPending &&
      !jobOffersPending &&
      !isNewSeason &&
      !lastMatchResult &&
      !showMatchModal
    ) {
      setShowOnboarding(true);
    }
  }, [onboardingSeen, preseasonPending, pressPending, jobOffersPending, isNewSeason, lastMatchResult, showMatchModal]);

  const handleDismissOnboarding = useCallback(async () => {
    setShowOnboarding(false);
    setStoreOnboardingSeen(true);
    if (dbHandle && currentSave) {
      try { await setOnboardingSeen(dbHandle, currentSave.id, true); } catch { /* non-fatal */ }
    }
  }, [dbHandle, currentSave, setStoreOnboardingSeen]);

  // Load player names and show modal after match
  useEffect(() => {
    if (!lastMatchResult || !dbHandle || !currentSave) return;
    const saveId = currentSave.id;
    (async () => {
      const ids = new Set<number>();
      for (const evt of lastMatchResult.events) {
        ids.add(evt.playerId);
        if (evt.secondaryPlayerId) ids.add(evt.secondaryPlayerId);
      }
      const names: Record<number, string> = {};
      for (const id of ids) {
        try {
          const p = await getPlayerById(dbHandle, saveId, id);
          if (p) names[id] = p.name;
        } catch { /* ignore */ }
      }
      setPlayerNames(names);
      if (autoShowResultRef.current) {
        setShowMatchModal(true);
        autoShowResultRef.current = false;
      }
    })();
  }, [lastMatchResult, dbHandle, currentSave]);

  // Load board state from DB once per save load (guard: store empty + not yet loaded)
  useEffect(() => {
    if (!dbHandle || !currentSave || !playerClubId) return;
    if (boardLoadedRef.current || currentObjective !== null) return;
    boardLoadedRef.current = true;
    (async () => {
      const [obj, trust, history] = await Promise.all([
        getBoardObjective(dbHandle, currentSave.id, playerClubId, season),
        getSaveBoardTrust(dbHandle, currentSave.id),
        getReputationHistory(dbHandle, currentSave.id, playerClubId),
      ]);
      if (obj) setCurrentObjective(obj);
      setCurrentTrust(trust);
      setReputationHistory(history);
    })();
  }, [dbHandle, currentSave, playerClubId, season, currentObjective, setCurrentObjective, setCurrentTrust, setReputationHistory]);

  const handleAdvanceWeek = useCallback(async () => {
    if (isAdvancing || !dbHandle || !playerClubId || !currentSave) return;
    setAdvancing(true);
    try {
      // Resolve opponent name from fixture before simulating
      const weekFixtures = await getFixturesByWeek(dbHandle, currentSave.id, season, week);
      const myFixture = weekFixtures.find(
        f => !f.played && (f.homeClubId === playerClubId || f.awayClubId === playerClubId),
      );
      let matchIsHome: boolean | null = null;
      if (myFixture) {
        matchIsHome = myFixture.homeClubId === playerClubId;
        const oppId = matchIsHome ? myFixture.awayClubId : myFixture.homeClubId;
        const oppClub = await getClubById(dbHandle, currentSave.id, oppId);
        if (oppClub) {
          setLastMatchContext(matchIsHome, oppClub.name);
        }
      }

      const rng = new SeededRng(season * 1000 + week);
      const result = await advanceGameWeek({
        dbHandle,
        season,
        week,
        playerClubId,
        saveId: currentSave.id,
        rng,
      });

      updateWeek(result.newSeason, result.newWeek);
      if (result.playerMatchResult) {
        autoShowResultRef.current = true;
        setLastMatchResult(result.playerMatchResult);
        // Mirror the press gate the engine armed; the post-match press-conference
        // effect fires once the result modal closes.
        setPressPending(true);

        // Post-match achievement checkpoint: facts from the USER's perspective.
        const pmr = result.playerMatchResult;
        const myGoals = matchIsHome ? pmr.homeGoals : pmr.awayGoals;
        const oppGoals = matchIsHome ? pmr.awayGoals : pmr.homeGoals;
        const justWon = myGoals > oppGoals;
        const totalWins = await countClubWins(dbHandle, currentSave.id, playerClubId);
        try {
          const newly = await processAchievementCheckpoint({
            db: dbHandle,
            saveId: currentSave.id,
            season,
            week,
            snapshot: { justWon, goalMargin: myGoals - oppGoals, totalWins },
          });
          if (newly.length > 0) setPendingAchievementToastIds(newly.map((d) => d.id));
        } catch { /* achievements are best-effort */ }
      }
      if (result.assistantComment) {
        setPendingComment(result.assistantComment);
        setLastCommentWeek(result.newWeek);
      }

      // P9: surface a brief, non-blocking call-up notice when international-break
      // call-ups happened. It's a bottom toast that coexists with the achievement
      // toast and never gates the result modal / press conference.
      setPendingInternationalCallUpCount(result.internationalCallUps?.length ?? 0);

      // Reload club data
      const updatedClub = await getClubById(dbHandle, currentSave.id, playerClubId);
      if (updatedClub) setPlayerClub(updatedClub);

      // Reload recent results — decisão de reload extraída p/ helper puro testável.
      const reload = resolveAdvanceReload({ result, season });
      const allFixtures = await getFixturesByClub(dbHandle, currentSave.id, playerClubId, reload.fetchSeasonForRecents);
      const played = allFixtures.filter(f => f.played);
      setRecentResults(played.slice(-5));

      if (reload.shouldStartNewSeason) setNewSeason(true);
      if (result.retiringPlayerIds.length > 0) {
        setLastRetiredPlayerIds(result.retiringPlayerIds);
      }
      if (result.newlyAnnouncedRetirementIds.length > 0) {
        setPendingAnnouncedRetirementIds(result.newlyAnnouncedRetirementIds);
      } else if (pendingAnnouncedRetirementIds.length > 0) {
        setPendingAnnouncedRetirementIds([]);
      }

      // W3 news: refresh the unread badge after the week's producers ran.
      try {
        await refreshUnreadNewsCount(dbHandle);
      } catch { /* badge is best-effort */ }
    } catch (err) {
      // Surface the error to the console so it can be diagnosed; the week will
      // NOT advance so the user can try again next session.
      console.error('[HomeScreen] advanceGameWeek failed:', err);
    } finally {
      setAdvancing(false);
    }
  }, [
    isAdvancing,
    dbHandle,
    playerClubId,
    currentSave,
    season,
    week,
    setAdvancing,
    updateWeek,
    setLastMatchResult,
    setNewSeason,
    setPlayerClub,
    setRecentResults,
    setPendingComment,
    setLastCommentWeek,
  ]);

  const handleWatchLive = useCallback(async () => {
    if (isAdvancing || !dbHandle || !playerClubId || !currentSave) return;
    setAdvancing(true);
    try {
      const ctx = await startUserMatchHalftime({
        dbHandle,
        season,
        week,
        playerClubId,
        saveId: currentSave.id,
      });
      if (!ctx) {
        // No user fixture this week — fall back to instant advance.
        setAdvancing(false);
        await handleAdvanceWeek();
        return;
      }
      setHalftime({
        halftime: ctx.halftime,
        isHome: ctx.isHome,
        opponentName: ctx.opponentName,
        bench: ctx.homeBench,
        tactic: ctx.homeTactic,
        fixtureId: ctx.fixtureId,
      });
      navigation.navigate('MatchHalftime');
    } catch (err) {
      console.error('[HomeScreen] startUserMatchHalftime failed:', err);
    } finally {
      setAdvancing(false);
    }
  }, [
    isAdvancing,
    dbHandle,
    playerClubId,
    currentSave,
    season,
    week,
    setAdvancing,
    setHalftime,
    navigation,
    handleAdvanceWeek,
  ]);

  const renderRecentResult = useCallback(
    ({ item }: { item: Fixture }) => {
      const isHome = item.homeClubId === playerClub?.id;
      const myGoals = isHome ? item.homeGoals : item.awayGoals;
      const oppGoals = isHome ? item.awayGoals : item.homeGoals;
      const ha = isHome ? 'H' : 'A';

      let resultColor = colors.warning;
      if (myGoals != null && oppGoals != null) {
        if (myGoals > oppGoals) resultColor = colors.success;
        else if (myGoals < oppGoals) resultColor = colors.danger;
      }

      return (
        <View style={styles.resultCard}>
          <View style={[styles.resultBadge, { backgroundColor: resultColor }]}>
            <Text style={styles.resultBadgeText}>{ha}</Text>
          </View>
          <View style={styles.resultInfo}>
            <Text style={styles.resultScore}>
              {myGoals ?? '-'} - {oppGoals ?? '-'}
            </Text>
            <Text style={styles.resultWeek}>
              {t('home.result_week', { week: item.week, season: item.season })}
            </Text>
          </View>
        </View>
      );
    },
    [playerClub?.id, t],
  );

  return (
    <ScrollView style={commonStyles.screen} contentContainerStyle={styles.container}>
      <ClubBanner subtitle={t('home.season_week', { season, week })} />

      {/* Assistant comment card */}
      {pendingComment && (
        <TouchableOpacity
          style={styles.commentCard}
          activeOpacity={0.8}
          onPress={() => setPendingComment(null)}
        >
          <Text style={styles.commentAuthor}>{pendingComment.assistantName}</Text>
          <Text style={styles.commentText}>{t(pendingComment.comment.key, pendingComment.comment.vars)}</Text>
          <Text style={styles.commentDismiss}>{t('home.tap_dismiss')}</Text>
        </TouchableOpacity>
      )}

      {/* Retirement announcement alert */}
      {announcedRetirees.length > 0 && (
        <View style={styles.retirementAlert}>
          <Text style={styles.retirementAlertTitle}>{t('home.retirement_title')}</Text>
          {announcedRetirees.map(p => (
            <Text key={p.id} style={styles.retirementAlertItem}>
              {t('home.retirement_item', { name: p.name, age: p.age })}
            </Text>
          ))}
        </View>
      )}

      {/* Board objective widget */}
      {currentObjective && (
        <TouchableOpacity
          style={styles.boardWidget}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('ClubBoard')}
        >
          <View style={styles.boardWidgetLeft}>
            <Text style={styles.boardWidgetLabel}>{t('home.objective_label')}</Text>
            <Text style={styles.boardWidgetText} numberOfLines={1}>
              {(() => { const d = objectiveDescriptor(currentObjective.type, currentObjective.target); return t(d.key, d.vars); })()}
            </Text>
          </View>
          <View style={styles.boardWidgetRight}>
            <Text style={styles.boardWidgetLabel}>{t('home.trust_label')}</Text>
            <View style={styles.boardMiniBar}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.boardMiniSegment,
                    i < Math.round((currentTrust / 100) * 5) && {
                      backgroundColor: currentTrust < 40 ? colors.danger : currentTrust < 80 ? colors.warning : colors.success,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Manager (career) reputation — distinct from the club's reputation. */}
      <View style={styles.managerRepWidget}>
        <Text style={styles.boardWidgetLabel}>{t('home.manager_reputation')}</Text>
        <View style={styles.managerRepRow}>
          <View style={styles.managerRepBarContainer}>
            <View style={[styles.managerRepBarFill, { width: `${managerReputation}%` as `${number}%` }]} />
          </View>
          <Text style={styles.managerRepValue}>{managerReputation}</Text>
        </View>
      </View>

      {/* League Table shortcut */}
      <TouchableOpacity
        style={styles.leagueTableBtn}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('LeagueStandings')}
      >
        <Text style={styles.leagueTableIcon}>🏆</Text>
        <View style={styles.leagueTableContent}>
          <Text style={styles.leagueTableTitle}>{t('home.league_table_title')}</Text>
          <Text style={styles.leagueTableSub}>{t('home.league_table_sub')}</Text>
        </View>
        <Text style={styles.leagueTableChevron}>›</Text>
      </TouchableOpacity>

      {/* Calendar shortcut */}
      <TouchableOpacity
        style={styles.leagueTableBtn}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Calendar')}
      >
        <Text style={styles.leagueTableIcon}>📅</Text>
        <View style={styles.leagueTableContent}>
          <Text style={styles.leagueTableTitle}>{t('home.calendar_title')}</Text>
          <Text style={styles.leagueTableSub}>{t('home.calendar_sub')}</Text>
        </View>
        <Text style={styles.leagueTableChevron}>›</Text>
      </TouchableOpacity>

      {/* Top scorers shortcut */}
      <TouchableOpacity
        style={styles.leagueTableBtn}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('TopScorers')}
      >
        <Text style={styles.leagueTableIcon}>⚽</Text>
        <View style={styles.leagueTableContent}>
          <Text style={styles.leagueTableTitle}>{t('home.top_scorers_title')}</Text>
          <Text style={styles.leagueTableSub}>{t('home.top_scorers_sub')}</Text>
        </View>
        <Text style={styles.leagueTableChevron}>›</Text>
      </TouchableOpacity>

      {/* Cup bracket shortcut */}
      <TouchableOpacity
        style={styles.leagueTableBtn}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('CupBracket')}
      >
        <Text style={styles.leagueTableIcon}>🏆</Text>
        <View style={styles.leagueTableContent}>
          <Text style={styles.leagueTableTitle}>{t('home.cup_bracket_title')}</Text>
          <Text style={styles.leagueTableSub}>{t('home.cup_bracket_sub')}</Text>
        </View>
        <Text style={styles.leagueTableChevron}>›</Text>
      </TouchableOpacity>

      {/* Last Match Result Banner */}
      {lastMatchResult !== null && (
        <TouchableOpacity
          style={styles.matchResultBanner}
          onPress={() => setShowMatchModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.matchResultLabel}>{t('home.last_result_label')}</Text>
          <Text style={styles.matchResultScore}>
            {lastMatchResult.homeGoals} - {lastMatchResult.awayGoals}
          </Text>
          <Text style={styles.matchResultTap}>{t('home.tap_details')}</Text>
        </TouchableOpacity>
      )}

      {/* Next Match Card */}
      {nextOpponent ? (
        <View style={styles.nextMatchCard}>
          <View style={styles.nextMatchHeader}>
            <Text style={styles.cardLabel}>{t('home.next_match_label')}</Text>
            <View style={[styles.nextMatchBadge, { backgroundColor: nextOpponent.isHome ? colors.success : colors.accent }]}>
              <Text style={styles.nextMatchBadgeText}>{nextOpponent.isHome ? t('home.badge_home') : t('home.badge_away')}</Text>
            </View>
          </View>
          <View style={styles.nextMatchTeams}>
            {(() => {
              const homeTeam = nextOpponent.isHome
                ? { name: playerClub?.name ?? '—', reputation: playerClub?.reputation ?? 0 }
                : { name: nextOpponent.club.name, reputation: nextOpponent.club.reputation };
              const awayTeam = nextOpponent.isHome
                ? { name: nextOpponent.club.name, reputation: nextOpponent.club.reputation }
                : { name: playerClub?.name ?? '—', reputation: playerClub?.reputation ?? 0 };
              return (
                <>
                  <View style={styles.nextMatchTeamBlock}>
                    <Text style={styles.nextMatchTeamName} numberOfLines={1}>{homeTeam.name}</Text>
                    <Text style={styles.nextMatchTeamRep}>{homeTeam.reputation}</Text>
                  </View>
                  <Text style={styles.nextMatchVs}>VS</Text>
                  <View style={styles.nextMatchTeamBlock}>
                    <Text style={styles.nextMatchTeamName} numberOfLines={1}>{awayTeam.name}</Text>
                    <Text style={styles.nextMatchTeamRep}>{awayTeam.reputation}</Text>
                  </View>
                </>
              );
            })()}
          </View>
          <Text style={styles.nextMatchVenue}>
            {nextOpponent.isHome ? (playerClub?.stadiumName ?? t('home.home_stadium')) : nextOpponent.club.stadiumName}
          </Text>
          <TouchableOpacity
            style={styles.scoutButton}
            activeOpacity={0.7}
            onPress={async () => {
              if (!dbHandle || !nextOpponent || !currentSave) return;
              const saveId = currentSave.id;
              setLoadingOpponent(true);
              setShowOpponentModal(true);
              try {
                const players = await getPlayersByClub(dbHandle, saveId, nextOpponent.club.id);
                const squad: Array<{ name: string; position: Position; overall: number }> = [];
                for (const p of players) {
                  const full = await getPlayerById(dbHandle, saveId, p.id);
                  if (full) {
                    squad.push({ name: full.name, position: full.position, overall: calculateOverall(full.attributes, full.position) });
                  }
                }
                setOpponentSquad(squad);
                const tactic = await getActiveTactic(dbHandle, saveId, nextOpponent.club.id);
                setOpponentFormation(tactic?.formation ?? '4-4-2');
              } catch { /* ignore */ }
              setLoadingOpponent(false);
            }}
          >
            <Text style={styles.scoutButtonText}>{t('home.scout_button')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t('home.next_match_label')}</Text>
          <Text style={styles.nextMatchText}>{t('home.no_upcoming')}</Text>
        </View>
      )}

      {/* Watch Live Button — only when the user has a fixture this week */}
      {nextOpponent && (
        <TouchableOpacity
          style={[styles.watchLiveButton, isAdvancing && styles.advanceButtonDisabled]}
          onPress={handleWatchLive}
          disabled={isAdvancing}
          activeOpacity={0.8}
        >
          <Text style={styles.watchLiveButtonText}>{t('home.watch_live')}</Text>
        </TouchableOpacity>
      )}

      {/* Advance Week Button */}
      <TouchableOpacity
        style={[styles.advanceButton, isAdvancing && styles.advanceButtonDisabled]}
        onPress={handleAdvanceWeek}
        disabled={isAdvancing}
        activeOpacity={0.8}
      >
        {isAdvancing ? (
          <View style={styles.advancingRow}>
            <ActivityIndicator color={colors.text} size="small" />
            <Text style={[styles.advanceButtonText, { marginLeft: spacing.sm }]}>
              {t('home.simulating')}
            </Text>
          </View>
        ) : (
          <Text style={styles.advanceButtonText}>{t('home.advance_week')}</Text>
        )}
      </TouchableOpacity>

      {/* Recent Results */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('home.recent_results')}</Text>
      </View>

      {recentResults.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('home.no_results')}</Text>
        </View>
      ) : (
        <FlatList
          data={recentResults}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRecentResult}
          scrollEnabled={false}
          contentContainerStyle={styles.resultsList}
        />
      )}

      {/* Match Result Modal */}
      <Modal
        visible={showMatchModal && lastMatchResult !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMatchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('home.modal_match_title')}</Text>

            {lastMatchResult && (
              <>
                <View style={styles.modalScoreRow}>
                  <Text style={styles.modalTeamName}>
                    {lastMatchIsHome === false ? (lastMatchOpponentName ?? t('matchresult.opponent')) : (playerClub?.name ?? 'Home')}
                  </Text>
                  <View style={styles.modalScoreBox}>
                    <Text style={styles.modalScore}>
                      {lastMatchResult.homeGoals} - {lastMatchResult.awayGoals}
                    </Text>
                  </View>
                  <Text style={[styles.modalTeamName, { textAlign: 'right' }]}>
                    {lastMatchIsHome === false ? (playerClub?.name ?? 'Home') : (lastMatchOpponentName ?? t('matchresult.opponent'))}
                  </Text>
                </View>

                {lastMatchResult.stats && (
                  <View style={styles.modalStatsRow}>
                    <Text style={styles.modalStat}>Poss: {lastMatchResult.stats.homePossession}%-{lastMatchResult.stats.awayPossession}%</Text>
                    <Text style={styles.modalStat}>Shots: {lastMatchResult.stats.homeShots}({lastMatchResult.stats.homeShotsOnTarget ?? 0})-{lastMatchResult.stats.awayShots}({lastMatchResult.stats.awayShotsOnTarget ?? 0})</Text>
                  </View>
                )}

                {lastMatchResult.events.length > 0 && (() => {
                  const homeIds = new Set(lastMatchResult.homeRatings.map(r => r.playerId));
                  const getName = (id: number) => {
                    const full = playerNames[id];
                    if (!full) return `#${id}`;
                    const parts = full.split(' ');
                    return parts[parts.length - 1];
                  };
                  const getIcon = (type: MatchEvent['type']) => {
                    if (type === 'goal') return '⚽';
                    if (type === 'penalty_scored') return '⚽(P)';
                    if (type === 'penalty_missed') return '❌(P)';
                    if (type === 'free_kick_scored') return '⚽(FK)';
                    if (type === 'free_kick_missed') return '❌(FK)';
                    if (type === 'yellow') return '🟨';
                    if (type === 'red') return '🟥';
                    if (type === 'injury') return '🏥';
                    if (type === 'substitution') return '🔄';
                    if (type === 'assist') return '🅰️';
                    if (type === 'shot_on_target') return '🎯';
                    return '';
                  };
                  // Filter out assists (shown inline with goals)
                  const visible = lastMatchResult.events.filter(
                    e => e.type !== 'assist' && e.type !== 'shot_off_target' && e.type !== 'save',
                  );
                  // Build assist lookup: goalPlayerId -> assisterName
                  const assistMap = new Map<number, string>();
                  for (const evt of lastMatchResult.events) {
                    if (evt.type === 'assist' && evt.secondaryPlayerId) {
                      assistMap.set(evt.secondaryPlayerId, getName(evt.playerId));
                    }
                  }

                  return (
                    <View style={styles.modalEvents}>
                      <Text style={styles.modalEventsTitle}>{t('home.modal_match_events')}</Text>
                      <ScrollView style={styles.modalEventsList} nestedScrollEnabled>
                        {visible.map((evt, idx) => {
                          const isHome = homeIds.has(evt.playerId);
                          const icon = getIcon(evt.type);
                          const name = getName(evt.playerId);
                          const assist = (evt.type === 'goal' || evt.type === 'penalty_scored' || evt.type === 'free_kick_scored')
                            ? assistMap.get(evt.playerId) : null;
                          const isSub = evt.type === 'substitution';
                          const subIn = isSub && evt.secondaryPlayerId ? getName(evt.secondaryPlayerId) : null;

                          const renderContent = (side: 'home' | 'away') => {
                            if (isSub) {
                              return (
                                <View style={styles.modalSubRow}>
                                  {side === 'home' ? (
                                    <>
                                      {subIn && <Text style={styles.modalEventSubIn}>{subIn}</Text>}
                                      {subIn && <Text style={styles.modalSubArrowUp}> ▲ </Text>}
                                      <Text style={styles.modalSubArrowDown}> ▼ </Text>
                                      <Text style={styles.modalEventSubOut}>{name}</Text>
                                    </>
                                  ) : (
                                    <>
                                      <Text style={styles.modalEventSubOut}>{name}</Text>
                                      <Text style={styles.modalSubArrowDown}> ▼ </Text>
                                      {subIn && <Text style={styles.modalSubArrowUp}> ▲ </Text>}
                                      {subIn && <Text style={styles.modalEventSubIn}>{subIn}</Text>}
                                    </>
                                  )}
                                </View>
                              );
                            }
                            return (
                              <>
                                <Text style={styles.modalEventName} numberOfLines={1}>
                                  {side === 'home' ? `${name} ${icon}` : `${icon} ${name}`}
                                </Text>
                                {assist && (
                                  <Text style={styles.modalEventAssist}>
                                    {side === 'home' ? `${assist} 🅰️` : `🅰️ ${assist}`}
                                  </Text>
                                )}
                              </>
                            );
                          };

                          return (
                            <View key={idx} style={styles.modalEventRow}>
                              {/* Home side (left, aligned right → toward minute) */}
                              <View style={[styles.modalEventSide, styles.modalEventSideHome]}>
                                {isHome && (
                                  <View style={styles.modalEventHome}>
                                    {renderContent('home')}
                                  </View>
                                )}
                              </View>
                              {/* Minute (center) */}
                              <Text style={styles.modalEventMinute}>{evt.minute}'</Text>
                              {/* Away side (right, aligned left → toward minute) */}
                              <View style={[styles.modalEventSide, styles.modalEventSideAway]}>
                                {!isHome && (
                                  <View style={styles.modalEventAway}>
                                    {renderContent('away')}
                                  </View>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })()}

                {lastMatchResult.attendance > 0 && (
                  <Text style={styles.modalAttendance}>
                    Attendance: {lastMatchResult.attendance.toLocaleString()}
                  </Text>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowMatchModal(false);
                // Acknowledging the result leads straight into the press conference
                // when the gate is armed (a user match was played this week).
                if (pressPending && !isNewSeason && !preseasonPending) {
                  navigation.navigate('PressConference');
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseText}>{t('home.modal_close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Opponent Scout Modal */}
      <Modal
        visible={showOpponentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOpponentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{nextOpponent?.club.name ?? t('home.opponent_default')}</Text>
            <View style={styles.oppInfoRow}>
              <Text style={styles.oppInfoLabel}>{t('home.opponent_formation', { formation: opponentFormation })}</Text>
              <Text style={styles.oppInfoLabel}>{t('home.opponent_rep', { rep: nextOpponent?.club.reputation ?? 0 })}</Text>
            </View>

            {loadingOpponent ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : (() => {
              // Build starting XI using formation layout (shared module)
              const POS_GROUP: Record<string, string> = {
                GK:'GK', CB:'DEF', LB:'DEF', RB:'DEF',
                CDM:'MID', CM:'MID', CAM:'MID', LM:'MID', RM:'MID',
                LW:'FWD', RW:'FWD', ST:'FWD',
              };
              const rows = FORMATION_ROWS[opponentFormation as keyof typeof FORMATION_ROWS] ?? FORMATION_ROWS['4-4-2'];
              const usedIds = new Set<number>();
              const startingXI = rows.map(row =>
                row.map(role => {
                  const targetGroup = POS_GROUP[role] ?? 'MID';
                  const best = opponentSquad
                    .filter((_, i) => !usedIds.has(i))
                    .map((p, origIdx) => {
                      const realIdx = opponentSquad.indexOf(p);
                      let bonus = 0;
                      if (p.position === role) bonus = 15;
                      else if (POS_GROUP[p.position] === targetGroup) bonus = 3;
                      else if (role === 'GK' && p.position !== 'GK') bonus = -30;
                      else if (p.position === 'GK' && role !== 'GK') bonus = -30;
                      else bonus = -10;
                      return { p, idx: realIdx, score: p.overall + bonus };
                    })
                    .sort((a, b) => b.score - a.score)[0];
                  if (best) {
                    usedIds.add(best.idx);
                    return { role, name: best.p.name, overall: best.p.overall };
                  }
                  return { role, name: '—', overall: 0 };
                })
              );
              // Build a realistic bench: 1 GK + 6 best outfield (prioritize position variety)
              const available = opponentSquad
                .map((p, i) => ({ ...p, idx: i }))
                .filter(p => !usedIds.has(p.idx));
              const subs: typeof available = [];
              // 1 reserve GK
              const gk = available.find(p => p.position === 'GK');
              if (gk) subs.push(gk);
              // 6 outfield: pick best by position group to cover DEF, MID, FWD
              const outfield = available.filter(p => p.position !== 'GK' && !subs.includes(p));
              outfield.sort((a, b) => b.overall - a.overall);
              for (const p of outfield) {
                if (subs.length >= 8) break;
                subs.push(p);
              }

              return (
                <ScrollView style={styles.oppSquadList} nestedScrollEnabled>
                  <Text style={styles.oppSectionLabel}>{t('home.starting_xi')}</Text>
                  <View style={styles.oppPitchView}>
                    {startingXI.map((row, ri) => (
                      <View key={ri} style={styles.oppPitchRow}>
                        {row.map((slot, si) => {
                          const ovrColor = slot.overall >= 75 ? colors.success : slot.overall >= 60 ? colors.warning : colors.danger;
                          return (
                            <View key={si} style={styles.oppPitchSlot}>
                              <Text style={styles.oppPitchRole}>{slot.role}</Text>
                              <Text style={styles.oppPitchName} numberOfLines={1}>
                                {slot.name.split(' ').pop()}
                              </Text>
                              {slot.overall > 0 && (
                                <Text style={[styles.oppPitchOvr, { color: ovrColor }]}>{slot.overall}</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    ))}
                  </View>

                  {subs.length > 0 && (
                    <>
                      <Text style={styles.oppSectionLabel}>{t('home.substitutes')}</Text>
                      {subs.map((p, idx) => {
                        const ovrColor = p.overall >= 75 ? colors.success : p.overall >= 60 ? colors.warning : colors.danger;
                        return (
                          <View key={idx} style={styles.oppPlayerRow}>
                            <Text style={styles.oppPlayerPos}>{p.position}</Text>
                            <Text style={styles.oppPlayerName} numberOfLines={1}>{p.name}</Text>
                            <Text style={[styles.oppPlayerOvr, { color: ovrColor }]}>{p.overall}</Text>
                          </View>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              );
            })()}

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowOpponentModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseText}>{t('home.modal_close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* First-game onboarding welcome (one-time) */}
      <OnboardingModal visible={showOnboarding} onStart={handleDismissOnboarding} />

      {/* P9 international call-up notice — non-blocking bottom toast. Sits above the
          achievement toast so the two never overlap when both fire the same week. */}
      {pendingInternationalCallUpCount > 0 && (
        <TouchableOpacity
          style={styles.callUpToast}
          activeOpacity={0.9}
          onPress={() => setPendingInternationalCallUpCount(0)}
        >
          <Text style={styles.callUpToastText}>
            {t('internationals.callup_notice', { count: pendingInternationalCallUpCount })}
          </Text>
          <Text style={styles.callUpToastDismiss}>{t('internationals.callup_notice_dismiss')}</Text>
        </TouchableOpacity>
      )}

      {/* Achievement unlocked toast (post-match, from either advance or halftime path) */}
      <AchievementToast
        achievements={pendingAchievementToastIds
          .map((id) => getAchievementDef(id))
          .filter((d): d is NonNullable<typeof d> => d != null)}
        onDismiss={() => setPendingAchievementToastIds([])}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clubName: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  seasonInfo: {
    color: colors.primary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  matchResultBanner: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  boardWidget: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  boardWidgetLeft: { flex: 1, marginRight: spacing.md },
  boardWidgetRight: { alignItems: 'flex-end' },
  boardWidgetLabel: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1 },
  boardWidgetText: { color: colors.text, fontSize: fontSize.sm, marginTop: spacing.xxs },
  boardMiniBar: { flexDirection: 'row', gap: 3, marginTop: spacing.xs },
  boardMiniSegment: { width: 12, height: 6, borderRadius: 2, backgroundColor: colors.border },
  managerRepWidget: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
  },
  managerRepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  managerRepBarContainer: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  managerRepBarFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 3 },
  managerRepValue: { color: colors.gold, fontSize: fontSize.sm, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  commentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  commentAuthor: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  commentText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  commentDismiss: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  retirementAlert: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: alpha(colors.warning, 0.4),
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  retirementAlertTitle: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  retirementAlertItem: {
    color: colors.text,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  leagueTableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.gold,
  },
  leagueTableIcon: {
    fontSize: 24,
    width: 36,
    textAlign: 'center',
    marginRight: spacing.sm,
  },
  leagueTableContent: { flex: 1 },
  leagueTableTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  leagueTableSub: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xxs,
  },
  leagueTableChevron: {
    color: colors.textMuted,
    fontSize: fontSize.xxl,
    marginLeft: spacing.sm,
  },
  matchResultLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xxs,
  },
  matchResultScore: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  matchResultTap: {
    color: colors.primary,
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
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
    marginBottom: spacing.xs,
  },
  nextMatchText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  watchLiveButton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: 16,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  watchLiveButtonText: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  advanceButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 18,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  advanceButtonDisabled: {
    opacity: 0.6,
  },
  advanceButtonText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  advancingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  resultsList: {
    paddingHorizontal: spacing.md,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  resultBadgeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
  },
  resultInfo: {
    flex: 1,
  },
  resultScore: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  resultWeek: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  nextMatchCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  nextMatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  nextMatchTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  nextMatchTeamBlock: {
    flex: 1,
    alignItems: 'center',
  },
  nextMatchTeamName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    textAlign: 'center',
  },
  scoutButton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoutButtonText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  nextMatchTeamRep: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  nextMatchVs: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  nextMatchBadge: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  nextMatchBadgeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  nextMatchVenue: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  oppInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  oppInfoLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  oppSquadList: {
    maxHeight: 400,
    marginBottom: spacing.md,
  },
  oppSectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  oppPitchView: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  oppPitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  oppPitchSlot: {
    alignItems: 'center',
    minWidth: 54,
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  oppPitchRole: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  oppPitchName: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    textAlign: 'center',
  },
  oppPitchOvr: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    marginTop: 1,
  },
  oppPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  oppPlayerPos: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    width: 36,
  },
  oppPlayerName: {
    color: colors.text,
    fontSize: fontSize.sm,
    flex: 1,
  },
  oppPlayerOvr: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    width: 30,
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTeamName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  modalScoreBox: {
    paddingHorizontal: spacing.md,
  },
  modalScore: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  modalStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  modalStat: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  modalEvents: {
    marginBottom: spacing.md,
  },
  modalEventsTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  modalEventsList: {
    maxHeight: 200,
  },
  modalEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalEventSide: {
    flex: 1,
  },
  modalEventSideHome: {
    alignItems: 'flex-end',
  },
  modalEventSideAway: {
    alignItems: 'flex-start',
  },
  modalEventHome: {
    alignItems: 'flex-end',
  },
  modalEventAway: {
    alignItems: 'flex-start',
  },
  modalEventMinute: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: 'bold',
    width: 36,
    textAlign: 'center',
  },
  modalEventName: {
    color: colors.text,
    fontSize: fontSize.sm,
  },
  modalEventAssist: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  modalSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalEventSubOut: {
    color: colors.danger,
    fontSize: fontSize.sm,
  },
  modalEventSubIn: {
    color: colors.success,
    fontSize: fontSize.sm,
  },
  modalSubArrowDown: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  modalSubArrowUp: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  modalAttendance: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalCloseButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  callUpToast: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.6),
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  callUpToastText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  callUpToastDismiss: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
});
