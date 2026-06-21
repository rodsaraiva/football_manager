import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from '@/i18n';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { useDatabaseStore } from '@/store/database-store';
import { useGameStore } from '@/store/game-store';
import { getAllLeagues, getAllCountries } from '@/database/queries/leagues';
import { getClubById, ClubWithDivision } from '@/database/queries/clubs';
import { AMBITION_PROFILES, suggestClubsForProfile, AmbitionProfileId } from '@/engine/newgame/ambition';
import { createSave } from '@/database/queries/saves';
import { setPreseasonPending } from '@/database/queries/save';
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
import { Card, Chip, Button, useConfirm } from '@/components/kit';
import StatBar from '@/components/StatBar';
import { Display, Title, Body, Label, Caption, Stat } from '@/components/typography';

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
  const { accent } = useClubAccent();
  const { db, dbHandle, isReady } = useDatabaseStore();
  const { startNewGame, setPlayerClub, setPreseasonPending: setStorePreseasonPending } = useGameStore();
  const { setCurrentObjective } = useBoardStore();
  const confirm = useConfirm();

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

      // Open the pre-season friendly window before round 1 of the new game.
      await setPreseasonPending(dbHandle, saveId, true);
      setStorePreseasonPending(true);

      navigation.navigate('Game');
    } catch (err) {
      await confirm({ title: t('newgame.error'), message: (err as Error).message, confirmLabel: t('kit.ok'), tone: 'danger' });
    } finally {
      setStarting(false);
    }
  }

  function BackLink({ onPress }: { onPress: () => void }) {
    return (
      <Pressable
        style={styles.backButton}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        testID="newgame-back"
      >
        <Body color={colors.primary}>{'← ' + t('common.back')}</Body>
      </Pressable>
    );
  }

  function renderClubCard(item: Club, onPress: () => void) {
    return (
      <Card variant="detail" style={styles.clubCard} testID={`newgame-club-${item.id}`}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={item.name}
        >
          <View style={styles.clubCardHeader}>
            <Title style={styles.clubName}>{item.name}</Title>
            <Stat color={colors.primary}>{item.reputation}</Stat>
          </View>
          <StatBar value={item.reputation} maxValue={100} color={colors.primary} barOnly height={4} />
          <Caption color={colors.textMuted}>{item.stadiumName}</Caption>
        </Pressable>
      </Card>
    );
  }

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Body color={colors.textSecondary}>{t('newgame.loading')}</Body>
      </View>
    );
  }

  if (step === 'ambition') {
    return (
      <View style={commonStyles.screen}>
        <Display style={styles.stepTitle}>{t('newgame.ambition_title')}</Display>
        <Caption color={colors.textSecondary} style={styles.stepSubtitle}>{t('newgame.ambition_subtitle')}</Caption>
        <ScrollView contentContainerStyle={styles.listContent}>
          {AMBITION_PROFILES.map((p) => (
            <Card key={p.id} variant="detail" style={styles.profileCard} testID={`newgame-profile-${p.id}`}>
              <Pressable
                onPress={() => handleSelectProfile(p.id)}
                accessibilityRole="button"
                accessibilityLabel={t(`newgame.ambition_${p.id}_label`)}
              >
                <Title>{t(`newgame.ambition_${p.id}_label`)}</Title>
                <Caption color={colors.textSecondary}>{t(`newgame.ambition_${p.id}_desc`)}</Caption>
              </Pressable>
            </Card>
          ))}
          <Pressable
            style={styles.exploreLink}
            onPress={handleExploreManually}
            accessibilityRole="button"
            accessibilityLabel={t('newgame.explore_leagues')}
            testID="newgame-explore"
          >
            <Body color={colors.primary}>{t('newgame.explore_leagues')}</Body>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (step === 'country') {
    const countriesWithLeagues = countries.filter((c) => leagues.some((l) => l.countryId === c.id));
    return (
      <View style={commonStyles.screen}>
        <BackLink onPress={() => setStep('ambition')} />
        <Display style={styles.stepTitle}>{t('newgame.country_title')}</Display>
        <ScrollView contentContainerStyle={styles.listContent}>
          {countriesWithLeagues.map((country) => (
            <Card key={country.id} variant="detail" style={styles.profileCard} testID={`newgame-country-${country.id}`}>
              <Pressable
                onPress={() => handleSelectCountry(country)}
                accessibilityRole="button"
                accessibilityLabel={country.name}
              >
                <Title>{(COUNTRY_FLAGS[country.code] ?? '🌍') + '  ' + country.name}</Title>
              </Pressable>
            </Card>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (step === 'suggestions') {
    const profileLabel = selectedProfile ? t(`newgame.ambition_${selectedProfile}_label`) : '';
    return (
      <View style={commonStyles.screen}>
        <BackLink onPress={() => setStep('country')} />
        <Display style={styles.stepTitle}>{t('newgame.suggestions_title')}</Display>
        <Caption color={colors.textSecondary} style={styles.stepSubtitle}>{profileLabel}</Caption>
        <FlatList
          data={suggestions}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Body color={colors.textMuted} style={styles.emptyText}>{t('newgame.suggestions_empty')}</Body>}
          renderItem={({ item }) => renderClubCard(item, () => handleSelectSuggestedClub(item))}
        />
      </View>
    );
  }

  if (step === 'league') {
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

    const countriesWithLeagues = countries.filter(c => leaguesByCountry[c.id]?.length > 0);

    return (
      <View style={commonStyles.screen}>
        <Display style={styles.stepTitle}>{t('newgame.league_title')}</Display>
        <Caption color={colors.textSecondary} style={styles.stepSubtitle}>{t('newgame.league_subtitle')}</Caption>
        {countriesWithLeagues.length === 0 ? (
          <View style={styles.centered}>
            <Body color={colors.textMuted} style={styles.emptyText}>{t('newgame.league_empty')}</Body>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {countriesWithLeagues.map((country) => {
              const isExpanded = expandedCountries.has(country.id);
              const countryLeagues = leaguesByCountry[country.id] ?? [];
              const flag = COUNTRY_FLAGS[country.code] ?? '🌍';
              return (
                <View key={country.id} style={styles.accordionGroup}>
                  <Card variant="detail" style={styles.accordionHeader}>
                    <Pressable
                      style={styles.accordionHeaderRow}
                      onPress={() => toggleCountry(country.id)}
                      accessibilityRole="button"
                      accessibilityLabel={country.name}
                      accessibilityState={{ expanded: isExpanded }}
                      testID={`newgame-country-toggle-${country.id}`}
                    >
                      <Text style={styles.accordionFlag}>{flag}</Text>
                      <Body style={styles.accordionCountryName}>{country.name}</Body>
                      <Caption color={colors.textSecondary}>{t('newgame.league_count', { count: countryLeagues.length })}</Caption>
                      <Caption color={colors.textSecondary} style={styles.accordionChevron}>{isExpanded ? '▲' : '▼'}</Caption>
                    </Pressable>
                  </Card>
                  {isExpanded && countryLeagues.map((league) => (
                    <Card key={league.id} variant="detail" style={styles.leagueCard} testID={`newgame-league-${league.id}`}>
                      <Pressable
                        onPress={() => handleSelectLeague(league)}
                        accessibilityRole="button"
                        accessibilityLabel={league.name}
                      >
                        <Title>{league.name}</Title>
                        <Caption color={colors.textSecondary}>{t('newgame.division_teams', { division: league.divisionLevel, teams: league.numTeams })}</Caption>
                      </Pressable>
                    </Card>
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
        <BackLink onPress={() => setStep('league')} />
        <Display style={styles.stepTitle}>{selectedLeague?.name}</Display>
        <Caption color={colors.textSecondary} style={styles.stepSubtitle}>{t('newgame.team_subtitle')}</Caption>
        <FlatList
          data={clubs}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Body color={colors.textMuted} style={styles.emptyText}>{t('newgame.team_empty')}</Body>}
          renderItem={({ item }) => renderClubCard(item, () => handleSelectClub(item))}
        />
      </View>
    );
  }

  // Step: confirm
  return (
    <View style={commonStyles.screen}>
      <BackLink onPress={() => setStep(selectedProfile ? 'suggestions' : 'team')} />
      <Display style={styles.stepTitle}>{t('newgame.confirm_title')}</Display>

      <Card variant="summary" style={styles.confirmCard}>
        <Label>{t('newgame.confirm_club_label')}</Label>
        <Title>{selectedClub?.name}</Title>
        <Caption color={colors.textSecondary}>{selectedLeague?.name}</Caption>
      </Card>

      <Card variant="summary" style={styles.confirmCard}>
        <Label>{t('newgame.confirm_difficulty_label')}</Label>
        <View style={styles.difficultyRow}>
          {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
            <Chip
              key={d}
              label={t(`newgame.difficulty_${d}`)}
              selected={difficulty === d}
              accent={accent}
              onPress={() => setDifficulty(d)}
              testID={`newgame-difficulty-${d}`}
              accessibilityLabel={t(`newgame.difficulty_${d}`)}
            />
          ))}
        </View>
      </Card>

      <View style={styles.startWrap}>
        <Button
          label={t('newgame.start_game')}
          variant="primary"
          loading={starting}
          disabled={starting}
          onPress={handleStartGame}
          testID="newgame-start"
          accessibilityLabel={t('newgame.start_game')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  stepTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  stepSubtitle: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  accordionGroup: {
    marginBottom: spacing.sm,
  },
  accordionHeader: {
    paddingVertical: spacing.sm,
  },
  accordionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accordionFlag: {
    fontSize: fontSize.lg,
  },
  accordionCountryName: {
    flex: 1,
  },
  accordionChevron: {},
  leagueCard: {
    marginTop: spacing.xxs,
    marginLeft: spacing.md,
  },
  profileCard: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  exploreLink: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  clubCard: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  clubCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clubName: {
    flex: 1,
  },
  confirmCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  startWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
});
