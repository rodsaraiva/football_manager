import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useClubAccent } from '@/theme/useClubAccent';
import { Card, EmptyState } from '@/components/kit';
import { Title, Label } from '@/components/typography';
import { useTranslation } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubsByLeague } from '@/database/queries/clubs';
import { getCompetitionsBySeason } from '@/database/queries/leagues';
import { getFixturesByWeek } from '@/database/queries/fixtures';
import { calculateStandings, StandingsEntry } from '@/engine/competition/standings';
import { Fixture } from '@/types';
import StandingsTable from '@/components/StandingsTable';

export function StandingsScreen() {
  const { t } = useTranslation();
  const accent = useClubAccent();
  const { playerClub, playerClubId, season, week, currentSave } = useGameStore();
  const saveId = currentSave?.id;
  const { dbHandle } = useDatabaseStore();

  const [entries, setEntries] = useState<StandingsEntry[]>([]);
  const [clubNames, setClubNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [leagueName, setLeagueName] = useState(t('nav.league_table'));

  useEffect(() => {
    if (!dbHandle || !playerClub || saveId == null) {
      setLoading(false);
      return;
    }

    (async () => {
      const leagueId = playerClub.leagueId;

      // Load all clubs in the league
      const leagueClubs = await getClubsByLeague(dbHandle, saveId, leagueId);
      const clubIds = leagueClubs.map((c) => c.id);
      const namesMap: Record<number, string> = {};
      for (const c of leagueClubs) {
        namesMap[c.id] = c.name;
      }
      setClubNames(namesMap);

      // Find the league competition for this season
      const competitions = await getCompetitionsBySeason(dbHandle, saveId, season);
      const leagueComp = competitions.find(
        (comp) => comp.leagueId === leagueId && comp.type === 'league',
      );

      if (leagueComp) {
        setLeagueName(leagueComp.name);
      }

      // Collect all played fixtures for the competition up to current week
      const playedFixtures: Fixture[] = [];
      for (let w = 1; w <= week; w++) {
        const weekFixtures = await getFixturesByWeek(dbHandle, saveId, season, w);
        const leagueFixtures = leagueComp
          ? weekFixtures.filter((f) => f.competitionId === leagueComp.id && f.played)
          : weekFixtures.filter((f) => f.played);
        playedFixtures.push(...leagueFixtures);
      }

      const standings = calculateStandings(playedFixtures, clubIds);
      setEntries(standings);
      setLoading(false);
    })();
  }, [dbHandle, playerClub, season, week]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={accent.accent} size="large" />
      </View>
    );
  }

  const header = (
    <Card variant="summary" accent={accent.accent} style={styles.header}>
      <Title>{leagueName}</Title>
      <Label color={accent.accent}>{t('standings.season', { season })}</Label>
    </Card>
  );

  if (entries.length === 0) {
    return (
      <View style={commonStyles.screen}>
        {header}
        <EmptyState
          art="generic"
          title={t('standings.empty_title')}
          description={t('standings.empty_sub')}
        />
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      {header}
      <StandingsTable
        entries={entries}
        highlightClubId={playerClubId ?? undefined}
        clubNames={clubNames}
      />
    </View>
  );
}

const styles = {
  center: { alignItems: 'center' as const, justifyContent: 'center' as const },
  header: {
    borderColor: colors.border,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
  },
};
