import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from '@/i18n';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getAllLeagues, getAllCountries } from '@/database/queries/leagues';
import { getClubById, ClubWithDivision } from '@/database/queries/clubs';
import { AMBITION_PROFILES, suggestClubsForProfile, AmbitionProfileId } from '@/engine/newgame/ambition';
import { createSave } from '@/database/queries/saves';
import { ensureSeasonFixtures } from '@/engine/competition/calendar';
import { generateSeedData } from '../../scripts/generate-seed-data';
import { generateWorldSeedSQLForSave } from '@/database/seed';
import { saveOffset } from '@/database/constants';
import { RootStackParamList } from '@/navigation/types';
import { League, Club, Country, Difficulty } from '@/types';
import { generateAssistant } from '@/engine/assistant/assistant-engine';
import { insertAssistant } from '@/database/queries/assistants';
import { SeededRng } from '@/engine/rng';
import { AssistantRole } from '@/types/assistant';
import { generateObjective } from '@/engine/board/objective-generator';
import { upsertBoardObjective } from '@/database/queries/board';
import { useBoardStore } from '@/store/board-store';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'NewGame'>;

type Step = 'ambition' | 'country' | 'suggestions' | 'league' | 'team' | 'confirm';

const COUNTRY_FLAGS: Record<string, string> = {
  EN: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  ES: '🇪🇸',
  IT: '🇮🇹',
  DE: '🇩🇪',
  FR: '🇫🇷',
};

export function NewGameScreen() {
  const navigation = useNavigation<NavProp>();
  const { t } = useTranslation();
  const { db, dbHandle, isReady } = useDatabaseStore();
  const { startNewGame, setPlayerClub } = useGameStore();
  const { setCurrentObjective } = useBoardStore();

  // Clubs/players live per-save now (no global club seed), so the picker reads the
  // canonical seed in memory. handleStartGame reuses this same data to seed the new save.
  const seedData = React.useMemo(() => generateSeedData(2026), []);

  const [step, setStep] = useState<Step>('ambition');
  const [selectedProfile, setSelectedProfile] = useState<AmbitionProfileId | null>(null);
  const [suggestions, setSuggestions] = useState<ClubWithDivision[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [expandedCountries, setExpandedCountries] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isReady || !dbHandle) {
      if (isReady) setLoading(false);
      return;
    }
    (async () => {
      try {
        const [leagueRows, countryRows] = await Promise.all([
          getAllLeagues(dbHandle),
          getAllCountries(dbHandle),
        ]);
        console.log('[NewGame] leagues loaded:', leagueRows.map(l => ({ id: l.id, name: l.name })));
        setLeagues(leagueRows);
        setCountries(countryRows);
      } catch (err) {
        console.error('[NewGame] failed to load leagues/countries:', err);
        setLeagues([]);
        setCountries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isReady, dbHandle]);

  function toggleCountry(countryId: number) {
    setExpandedCountries(prev => {
      const next = new Set(prev);
      if (next.has(countryId)) {
        next.delete(countryId);
      } else {
        next.add(countryId);
      }
      return next;
    });
  }

  function seedClubToClub(c: (typeof seedData)['clubs'][number]): Club {
    return {
      id: c.id, name: c.name, shortName: c.shortName, countryId: c.countryId, leagueId: c.leagueId,
      reputation: c.reputation, budget: c.budget, wageBudget: c.wageBudget,
      stadiumName: c.stadiumName, stadiumCapacity: c.stadiumCapacity,
      trainingFacilities: c.trainingFacilities, youthAcademy: c.youthAcademy,
      medicalDepartment: c.medicalDepartment, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor,
      trainingFocus: 'balanced',
    };
  }

  function handleSelectLeague(league: League) {
    setSelectedLeague(league);
    const teamList = seedData.clubs.filter((c) => c.leagueId === league.id).map(seedClubToClub);
    setClubs(teamList);
    setStep('team');
  }

  function handleSelectClub(club: Club) {
    setSelectedClub(club);
    setStep('confirm');
  }

  function handleSelectProfile(id: AmbitionProfileId) {
    setSelectedProfile(id);
    setStep('country');
  }

  function handleSelectCountry(country: Country) {
    if (!selectedProfile) return;
    const divisionByLeague = new Map(leagues.map((l) => [l.id, l.divisionLevel]));
    const countryClubs: ClubWithDivision[] = seedData.clubs
      .filter((c) => c.countryId === country.id)
      .map((c) => ({ ...seedClubToClub(c), divisionLevel: divisionByLeague.get(c.leagueId) ?? 1 }));
    setSuggestions(suggestClubsForProfile(selectedProfile, countryClubs));
    setStep('suggestions');
  }

  // Suggested-club path: also resolve the club's league (already loaded) so
  // handleStartGame's objective generation gets numTeams/divisionLevel right.
  function handleSelectSuggestedClub(club: ClubWithDivision) {
    setSelectedClub(club);
    setSelectedLeague(leagues.find((l) => l.id === club.leagueId) ?? null);
    setStep('confirm');
  }

  function handleExploreManually() {
    setSelectedProfile(null);
    setStep('league');
  }

  async function handleStartGame() {
    if (!db || !dbHandle || !selectedClub) return;
    setStarting(true);
    try {
      const managerName = 'Manager';
      // Bootstrap has a circular FK (save_games.player_club_id <-> clubs.save_id), so the seed
      // runs with FK enforcement off (production runs it on). PRAGMA can't change in a transaction.
      await db.execAsync('PRAGMA foreign_keys = OFF;');
      const saveId = await createSave(dbHandle, {
        name: `${managerName} at ${selectedClub.name}`,
        playerClubId: selectedClub.id, // placeholder; rewritten to the per-save offset id below
        difficulty,
        currentSeason: 1,
        currentWeek: 1,
      });
      const playerClubId = saveOffset(saveId) + selectedClub.id;
      await dbHandle.prepare('UPDATE save_games SET player_club_id = ? WHERE id = ?').run(playerClubId, saveId);

      // Seed THIS save's own world (clubs/players/staff/tactics with offset ids).
      await db.execAsync(generateWorldSeedSQLForSave(seedData, saveId));
      await db.execAsync('PRAGMA foreign_keys = ON;');

      startNewGame(saveId, playerClubId, 1, 1);

      // Generate season-1 board objective
      const boardRng = new SeededRng(saveId * 999);
      const s1Objective = generateObjective({
        clubReputation: selectedClub.reputation,
        currentLeaguePosition: null,
        totalTeams: selectedLeague?.numTeams ?? 16,
        divisionLevel: selectedLeague?.divisionLevel ?? 1,
        wasRelegated: false,
        wasPromoted: false,
        rng: boardRng,
      });
      await upsertBoardObjective(dbHandle, saveId, {
        clubId: playerClubId,
        season: 1,
        type: s1Objective.type,
        target: s1Objective.target,
        description: '',
      });
      setCurrentObjective({
        id: 0,
        clubId: playerClubId,
        season: 1,
        type: s1Objective.type,
        target: s1Objective.target,
        description: '',
      });

      // Generate 3 assistants (one per role) for this save
      const assistantRoles: AssistantRole[] = ['squad', 'financial', 'youth'];
      const assistantRng = new SeededRng(saveId * 13337);
      for (const role of assistantRoles) {
        const generated = generateAssistant({ role, clubId: playerClubId, saveId, rng: assistantRng });
        await insertAssistant(dbHandle, generated);
      }

      const club = await getClubById(dbHandle, saveId, playerClubId);
      if (club) setPlayerClub(club);

      // Generate the season-1 calendar for THIS save (scoped + offset internally).
      await ensureSeasonFixtures(dbHandle, saveId, 1);

      navigation.navigate('Game');
    } catch (err) {
      Alert.alert(t('newgame.error'), (err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  function renderClubCard(item: Club, onPress: () => void) {
    return (
      <TouchableOpacity style={styles.clubCard} onPress={onPress} activeOpacity={0.8}>
        <View style={styles.clubCardHeader}>
          <Text style={styles.clubName}>{item.name}</Text>
          <Text style={styles.clubRep}>{item.reputation}</Text>
        </View>
        <View style={styles.reputationBarContainer}>
          <View style={[styles.reputationBarFill, { width: `${item.reputation}%` as `${number}%` }]} />
        </View>
        <Text style={styles.clubStadium}>{item.stadiumName}</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>{t('newgame.loading')}</Text>
      </View>
    );
  }

  if (step === 'ambition') {
    return (
      <View style={commonStyles.screen}>
        <Text style={styles.stepTitle}>{t('newgame.ambition_title')}</Text>
        <Text style={styles.stepSubtitle}>{t('newgame.ambition_subtitle')}</Text>
        <ScrollView contentContainerStyle={styles.listContent}>
          {AMBITION_PROFILES.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.leagueCard}
              onPress={() => handleSelectProfile(p.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.leagueName}>{t(`newgame.ambition_${p.id}_label`)}</Text>
              <Text style={styles.profileDesc}>{t(`newgame.ambition_${p.id}_desc`)}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.exploreLink} onPress={handleExploreManually} activeOpacity={0.7}>
            <Text style={styles.exploreLinkText}>{t('newgame.explore_leagues')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (step === 'country') {
    const countriesWithLeagues = countries.filter((c) => leagues.some((l) => l.countryId === c.id));
    return (
      <View style={commonStyles.screen}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('ambition')}>
          <Text style={styles.backButtonText}>{'← ' + t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>{t('newgame.country_title')}</Text>
        <ScrollView contentContainerStyle={styles.listContent}>
          {countriesWithLeagues.map((country) => (
            <TouchableOpacity
              key={country.id}
              style={styles.leagueCard}
              onPress={() => handleSelectCountry(country)}
              activeOpacity={0.8}
            >
              <Text style={styles.leagueName}>
                {(COUNTRY_FLAGS[country.code] ?? '🌍') + '  ' + country.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (step === 'suggestions') {
    const profileLabel = selectedProfile ? t(`newgame.ambition_${selectedProfile}_label`) : '';
    return (
      <View style={commonStyles.screen}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('country')}>
          <Text style={styles.backButtonText}>{'← ' + t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>{t('newgame.suggestions_title')}</Text>
        <Text style={styles.stepSubtitle}>{profileLabel}</Text>
        <FlatList
          data={suggestions}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>{t('newgame.suggestions_empty')}</Text>}
          renderItem={({ item }) => renderClubCard(item, () => handleSelectSuggestedClub(item))}
        />
      </View>
    );
  }

  if (step === 'league') {
    // Build a map of countryId -> leagues sorted by divisionLevel
    const leaguesByCountry: Record<number, League[]> = {};
    for (const league of leagues) {
      if (!leaguesByCountry[league.countryId]) {
        leaguesByCountry[league.countryId] = [];
      }
      leaguesByCountry[league.countryId].push(league);
    }
    for (const key of Object.keys(leaguesByCountry)) {
      leaguesByCountry[Number(key)].sort((a, b) => a.divisionLevel - b.divisionLevel);
    }

    // Only show countries that have leagues
    const countriesWithLeagues = countries.filter(c => leaguesByCountry[c.id]?.length > 0);

    return (
      <View style={commonStyles.screen}>
        <Text style={styles.stepTitle}>{t('newgame.league_title')}</Text>
        <Text style={styles.stepSubtitle}>{t('newgame.league_subtitle')}</Text>
        {countriesWithLeagues.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>{t('newgame.league_empty')}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {countriesWithLeagues.map((country) => {
              const isExpanded = expandedCountries.has(country.id);
              const countryLeagues = leaguesByCountry[country.id] ?? [];
              const flag = COUNTRY_FLAGS[country.code] ?? '🌍';
              return (
                <View key={country.id} style={styles.accordionGroup}>
                  <TouchableOpacity
                    style={styles.accordionHeader}
                    onPress={() => toggleCountry(country.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.accordionFlag}>{flag}</Text>
                    <Text style={styles.accordionCountryName}>{country.name}</Text>
                    <Text style={styles.accordionMeta}>{t('newgame.league_count', { count: countryLeagues.length })}</Text>
                    <Text style={styles.accordionChevron}>{isExpanded ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {isExpanded && countryLeagues.map((league) => (
                    <TouchableOpacity
                      key={league.id}
                      style={styles.leagueCard}
                      onPress={() => handleSelectLeague(league)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.leagueName}>{league.name}</Text>
                      <Text style={styles.leagueMeta}>{t('newgame.division_teams', { division: league.divisionLevel, teams: league.numTeams })}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  if (step === 'team') {
    return (
      <View style={commonStyles.screen}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('league')}>
          <Text style={styles.backButtonText}>{'← ' + t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>{selectedLeague?.name}</Text>
        <Text style={styles.stepSubtitle}>{t('newgame.team_subtitle')}</Text>
        <FlatList
          data={clubs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No clubs found in this league.</Text>
          }
          renderItem={({ item }) => renderClubCard(item, () => handleSelectClub(item))}
        />
      </View>
    );
  }

  // Step: confirm
  return (
    <View style={commonStyles.screen}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => setStep(selectedProfile ? 'suggestions' : 'team')}
      >
        <Text style={styles.backButtonText}>{'← ' + t('common.back')}</Text>
      </TouchableOpacity>
      <Text style={styles.stepTitle}>{t('newgame.confirm_title')}</Text>

      <View style={styles.confirmCard}>
        <Text style={styles.confirmLabel}>{t('newgame.confirm_club_label')}</Text>
        <Text style={styles.confirmValue}>{selectedClub?.name}</Text>
        <Text style={styles.confirmMeta}>{selectedLeague?.name}</Text>
      </View>

      <View style={styles.confirmCard}>
        <Text style={styles.confirmLabel}>{t('newgame.confirm_difficulty_label')}</Text>
        <View style={styles.difficultyRow}>
          {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.difficultyButton, difficulty === d && styles.difficultyButtonActive]}
              onPress={() => setDifficulty(d)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.difficultyButtonText,
                  difficulty === d && styles.difficultyButtonTextActive,
                ]}
              >
                {t(`newgame.difficulty_${d}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.startButton, starting && styles.startButtonDisabled]}
        onPress={handleStartGame}
        disabled={starting}
        activeOpacity={0.8}
      >
        {starting ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.startButtonText}>{t('newgame.start_game')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
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
  stepTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  stepSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  accordionGroup: {
    marginBottom: spacing.sm,
  },
  accordionHeader: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  accordionFlag: {
    fontSize: fontSize.lg,
    marginRight: spacing.sm,
  },
  accordionCountryName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    flex: 1,
  },
  accordionMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginRight: spacing.sm,
  },
  accordionChevron: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },
  leagueCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 6,
    padding: spacing.md,
    marginTop: 2,
    marginLeft: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  leagueName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  leagueMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  profileDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  exploreLink: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  exploreLinkText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
  },
  clubCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clubCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clubName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  clubRep: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  reputationBarContainer: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  reputationBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  clubStadium: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  confirmValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  confirmMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  difficultyButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  difficultyButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  difficultyButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  difficultyButtonTextActive: {
    color: colors.text,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 16,
    marginHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
