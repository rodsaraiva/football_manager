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
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getAllLeagues, getAllCountries, createCompetition, addCompetitionEntry } from '@/database/queries/leagues';
import { getClubsByLeague, getClubById, getClubsByCountry, ClubWithDivision } from '@/database/queries/clubs';
import { AMBITION_PROFILES, suggestClubsForProfile, AmbitionProfileId } from '@/engine/newgame/ambition';
import { createSave } from '@/database/queries/saves';
import { createFixture } from '@/database/queries/fixtures';
import { generateSeasonCalendar } from '@/engine/competition/calendar';
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
  const { db, dbHandle, isReady } = useDatabaseStore();
  const { startNewGame, setPlayerClub } = useGameStore();
  const { setCurrentObjective } = useBoardStore();

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

  async function handleSelectLeague(league: League) {
    if (!dbHandle) return;
    setSelectedLeague(league);
    try {
      const teamList = await getClubsByLeague(dbHandle, league.id);
      console.log('[NewGame] clubs for league', league.id, league.name, ':', teamList.length);
      setClubs(teamList);
    } catch (err) {
      console.error('[NewGame] getClubsByLeague failed:', err);
      setClubs([]);
    }
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

  async function handleSelectCountry(country: Country) {
    if (!dbHandle || !selectedProfile) return;
    try {
      const countryClubs = await getClubsByCountry(dbHandle, country.id);
      setSuggestions(suggestClubsForProfile(selectedProfile, countryClubs));
    } catch (err) {
      console.error('[NewGame] getClubsByCountry failed:', err);
      setSuggestions([]);
    }
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
    if (!dbHandle || !selectedClub) return;
    setStarting(true);
    try {
      const managerName = 'Manager';
      const saveId = await createSave(dbHandle, {
        name: `${managerName} at ${selectedClub.name}`,
        playerClubId: selectedClub.id,
        difficulty,
        currentSeason: 1,
        currentWeek: 1,
      });

      startNewGame(saveId, selectedClub.id, 1, 1);

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
      await upsertBoardObjective(dbHandle, {
        clubId: selectedClub.id,
        season: 1,
        type: s1Objective.type,
        target: s1Objective.target,
        description: s1Objective.description,
      });
      setCurrentObjective({
        id: 0,
        clubId: selectedClub.id,
        season: 1,
        type: s1Objective.type,
        target: s1Objective.target,
        description: s1Objective.description,
      });

      // Generate 3 assistants (one per role) for this save
      const assistantRoles: AssistantRole[] = ['squad', 'financial', 'youth'];
      const assistantRng = new SeededRng(saveId * 13337);
      for (const role of assistantRoles) {
        const generated = generateAssistant({ role, clubId: selectedClub.id, saveId, rng: assistantRng });
        await insertAssistant(dbHandle, generated);
      }

      const club = await getClubById(dbHandle, selectedClub.id);
      if (club) setPlayerClub(club);

      // Clear old season 1 data and generate fresh calendar
      try {
        // Limpa tudo que referencia competitions (FK chain) antes de regenerar o calendário.
        // Também zera club_finances pra não somar entries do save anterior na tela de Finances.
        await db!.execAsync(`
          DELETE FROM match_events WHERE fixture_id IN (SELECT id FROM fixtures WHERE season = 1);
          DELETE FROM player_stats WHERE competition_id IN (SELECT id FROM competitions WHERE season = 1);
          DELETE FROM season_player_titles WHERE competition_id IN (SELECT id FROM competitions WHERE season = 1);
          DELETE FROM season_awards WHERE competition_id IN (SELECT id FROM competitions WHERE season = 1);
          DELETE FROM season_competition_results WHERE competition_id IN (SELECT id FROM competitions WHERE season = 1);
          DELETE FROM fixtures WHERE season = 1;
          DELETE FROM competition_entries;
          DELETE FROM competitions WHERE season = 1;
          DELETE FROM club_finances;
        `);
        const allLeagues = await getAllLeagues(dbHandle);
        const clubsByLeague: Record<number, number[]> = {};
        const championsLeagueClubs: number[] = [];

        for (const league of allLeagues) {
          const leagueClubs = await getClubsByLeague(dbHandle, league.id);
          const sorted = [...leagueClubs].sort((a, b) => b.reputation - a.reputation);
          clubsByLeague[league.id] = leagueClubs.map((c) => c.id);
          // Top 2 per league → Champions League (max 8 total)
          for (const c of sorted.slice(0, 2)) {
            if (championsLeagueClubs.length < 8) {
              championsLeagueClubs.push(c.id);
            }
          }
        }

        // Fill CL to 8 if needed
        if (championsLeagueClubs.length < 8) {
          const allIds = Object.values(clubsByLeague).flat();
          for (const id of allIds) {
            if (!championsLeagueClubs.includes(id) && championsLeagueClubs.length < 8) {
              championsLeagueClubs.push(id);
            }
          }
        }

        const calendar = generateSeasonCalendar({
          season: 1,
          leagues: allLeagues,
          clubsByLeague,
          championsLeagueClubs,
        });

        for (const comp of calendar.competitions) {
          await createCompetition(dbHandle, {
            id: comp.id,
            name: comp.name,
            type: comp.type,
            format: comp.format,
            season: 1,
            leagueId: comp.leagueId,
          });
        }

        for (const entry of calendar.entries) {
          await addCompetitionEntry(dbHandle, {
            competitionId: entry.competitionId,
            clubId: entry.clubId,
            groupName: entry.groupName,
            seed: entry.seed,
          });
        }

        // Batch insert dos ~6k fixtures via execAsync — inserts individuais demoram minutos na web.
        const escape = (v: string | null) => v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`;
        const values = calendar.fixtures.map(f =>
          `(${f.id}, ${f.competitionId}, 1, ${f.week}, ${escape(f.round !== null ? String(f.round) : null)}, ${f.homeClubId}, ${f.awayClubId}, 0)`
        ).join(',\n');
        await db!.execAsync(
          `INSERT INTO fixtures (id, competition_id, season, week, round, home_club_id, away_club_id, played) VALUES ${values};`
        );
      } catch (err) {
        console.error('[NewGame] calendar generation failed:', err);
      }

      navigation.navigate('Game');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
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
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (step === 'ambition') {
    return (
      <View style={commonStyles.screen}>
        <Text style={styles.stepTitle}>Qual sua ambição?</Text>
        <Text style={styles.stepSubtitle}>Escolha um perfil — ele guia as sugestões de clube</Text>
        <ScrollView contentContainerStyle={styles.listContent}>
          {AMBITION_PROFILES.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.leagueCard}
              onPress={() => handleSelectProfile(p.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.leagueName}>{p.labelPt}</Text>
              <Text style={styles.profileDesc}>{p.descriptionPt}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.exploreLink} onPress={handleExploreManually} activeOpacity={0.7}>
            <Text style={styles.exploreLinkText}>Explorar todas as ligas →</Text>
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
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>Escolha o país</Text>
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
    const profileLabel = AMBITION_PROFILES.find((p) => p.id === selectedProfile)?.labelPt ?? '';
    return (
      <View style={commonStyles.screen}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep('country')}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>Clubes sugeridos</Text>
        <Text style={styles.stepSubtitle}>{profileLabel}</Text>
        <FlatList
          data={suggestions}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>Nenhum clube neste perfil.</Text>}
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
        <Text style={styles.stepTitle}>Select League</Text>
        <Text style={styles.stepSubtitle}>Choose the league you want to manage in</Text>
        {countriesWithLeagues.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No leagues available. Database may need seeding.</Text>
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
                    <Text style={styles.accordionMeta}>{countryLeagues.length} league{countryLeagues.length !== 1 ? 's' : ''}</Text>
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
                      <Text style={styles.leagueMeta}>Division {league.divisionLevel} · {league.numTeams} teams</Text>
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
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.stepTitle}>{selectedLeague?.name}</Text>
        <Text style={styles.stepSubtitle}>Select your club</Text>
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
      <TouchableOpacity style={styles.backButton} onPress={() => setStep('team')}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.stepTitle}>Confirm Selection</Text>

      <View style={styles.confirmCard}>
        <Text style={styles.confirmLabel}>CLUB</Text>
        <Text style={styles.confirmValue}>{selectedClub?.name}</Text>
        <Text style={styles.confirmMeta}>{selectedLeague?.name}</Text>
      </View>

      <View style={styles.confirmCard}>
        <Text style={styles.confirmLabel}>DIFFICULTY</Text>
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
                {d.charAt(0).toUpperCase() + d.slice(1)}
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
          <Text style={styles.startButtonText}>START GAME</Text>
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
