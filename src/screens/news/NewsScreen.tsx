import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, fontSize, commonStyles } from '@/theme';
import { useTranslation, ordinal, Language } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubsByLeague } from '@/database/queries/clubs';
import { getLeagueById, getCompetitionsBySeason } from '@/database/queries/leagues';
import { getFixturesByWeek, getMatchEvents } from '@/database/queries/fixtures';
import { getTransfersBySeason } from '@/database/queries/transfers';
import { getPlayersByClub } from '@/database/queries/players';
import { getSeasonSummary } from '@/database/queries/history';
import { calculateStandings, StandingsEntry } from '@/engine/competition/standings';
import { Fixture, Club, Competition, League } from '@/types';
import {
  NewsItem,
  generateHeadlines,
  generateHighScoringMatches,
  generateComeback,
  generateLeagueStories,
  generateRelevantTransfers,
  generateMatchStar,
  generateStreaks,
  generateSeasonRecap,
  generateRetirementNews,
  sortNews,
} from '@/engine/news/news-generator';
import type { RetirementDecision } from '@/engine/retirement/retirement-engine';
import type { TKey, TextDescriptor } from '@/i18n/translate';

type TFn = (key: TKey, vars?: Record<string, string | number>) => string;

// ─── Main ───────────────────────────────────────────────────────────────────

export function NewsScreen() {
  const { t, lang } = useTranslation();
  const { playerClub, playerClubId, season, week, lastRetiredPlayerIds, pendingAnnouncedRetirementIds, currentSave } = useGameStore();
  const { dbHandle } = useDatabaseStore();

  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbHandle || !playerClub || !currentSave) {
      setLoading(false);
      return;
    }
    const saveId = currentSave.id;

    (async () => {
      try {
        const items: NewsItem[] = [];

        // ── Core league data ────────────────────────────────────────────
        const league: League | null = await getLeagueById(dbHandle, playerClub.leagueId);
        const leagueClubs = await getClubsByLeague(dbHandle, saveId, playerClub.leagueId);
        const clubMap = new Map<number, Club>();
        for (const c of leagueClubs) clubMap.set(c.id, c);
        const clubIds = leagueClubs.map((c) => c.id);

        // Include player's club even if in different league (just in case)
        if (playerClubId && !clubMap.has(playerClubId)) {
          clubMap.set(playerClubId, playerClub);
        }

        const competitions = await getCompetitionsBySeason(dbHandle, saveId, season);
        const leagueComp = competitions.find(
          (c) => c.leagueId === playerClub.leagueId && c.type === 'league',
        );

        // ── Load all played league fixtures up to current week ─────────
        const allPlayedFixtures: Fixture[] = [];
        for (let w = 1; w <= week; w++) {
          const wf = await getFixturesByWeek(dbHandle, saveId, season, w);
          const lf = leagueComp
            ? wf.filter((f) => f.competitionId === leagueComp.id && f.played)
            : wf.filter((f) => f.played);
          allPlayedFixtures.push(...lf);
        }

        // ── Player names map (used for transfers & match star) ─────────
        const playerNames = new Map<number, string>();
        const playerToClub = new Map<number, number>();
        for (const club of leagueClubs) {
          const players = await getPlayersByClub(dbHandle, saveId, club.id);
          for (const p of players) {
            playerNames.set(p.id, p.name);
            playerToClub.set(p.id, club.id);
          }
        }

        // ── 1. Headlines (leader streak & movers) ─────────────────────
        items.push(
          ...generateHeadlines({
            allPlayedFixtures,
            clubIds,
            currentWeek: week,
            clubMap,
            playerClubId,
          }),
        );

        // ── 2. Last round results header + high-scoring matches ───────
        const resultsWeek = week > 1 ? week - 1 : week;
        const lastWeekFixturesAll = await getFixturesByWeek(dbHandle, saveId, season, resultsWeek);
        const lastWeekLeagueFixtures = leagueComp
          ? lastWeekFixturesAll.filter((f) => f.competitionId === leagueComp.id && f.played)
          : lastWeekFixturesAll.filter((f) => f.played);

        if (lastWeekLeagueFixtures.length > 0) {
          items.push(buildResultsHeader(resultsWeek, leagueComp));
          for (const f of lastWeekLeagueFixtures) {
            items.push(buildMatchResult(f, clubMap, playerClubId));
          }
          // High-scoring matches (4+ goals)
          items.push(
            ...generateHighScoringMatches(lastWeekLeagueFixtures, clubMap, playerClubId),
          );
        }

        // ── 3. Comeback + Match star (from user's detailed events) ────
        const playerLastFixture = playerClubId
          ? lastWeekFixturesAll.find(
              (f) =>
                f.played &&
                (f.homeClubId === playerClubId || f.awayClubId === playerClubId),
            )
          : undefined;

        if (playerLastFixture) {
          const events = await getMatchEvents(dbHandle, playerLastFixture.id);
          if (events.length > 0) {
            const comeback = generateComeback({
              fixture: playerLastFixture,
              events,
              playerToClub,
              clubMap,
            });
            if (comeback) items.push(comeback);

            const star = generateMatchStar({
              fixture: playerLastFixture,
              events,
              playerNames,
              playerToClub,
              clubMap,
            });
            if (star) items.push(star);
          }
        }

        // ── 4. League stories (title race, relegation, best attack/def) ─
        if (allPlayedFixtures.length > 0 && league) {
          const standings = calculateStandings(allPlayedFixtures, clubIds);
          items.push(
            ...generateLeagueStories({
              standings,
              clubMap,
              league,
              playerClubId,
              weeksPlayed: week,
              totalWeeks: 46,
            }),
          );
        }

        // ── 5. Relevant transfers (big fees) ──────────────────────────
        const transfers = await getTransfersBySeason(dbHandle, saveId, season);
        items.push(...generateRelevantTransfers(transfers, playerNames, clubMap));

        // ── 6. Streaks for player's club ──────────────────────────────
        if (playerClubId) {
          const playerFixtures = allPlayedFixtures.filter(
            (f) => f.homeClubId === playerClubId || f.awayClubId === playerClubId,
          );
          items.push(...generateStreaks({ playerClubId, playerFixtures }));
        }

        // ── 7. Injuries / morale / contracts (squad items) ────────────
        if (playerClubId) {
          const squad = await getPlayersByClub(dbHandle, saveId, playerClubId);
          const injured = squad.filter((p) => p.injuryWeeksLeft > 0);
          if (injured.length > 0) {
            items.push({
              id: 'injury-header',
              icon: '🏥',
              title: { key: 'news.injury_report_title' },
              body: { key: injured.length > 1 ? 'news.injury_report_body_other' : 'news.injury_report_body_one', vars: { count: injured.length } },
              category: 'injury',
              priority: 50,
            });
            for (const p of injured) {
              items.push({
                id: `injury-${p.id}`,
                icon: '🤕',
                title: { key: 'news.raw', vars: { text: p.name } },
                body: { key: p.injuryWeeksLeft > 1 ? 'news.injury_player_body_other' : 'news.injury_player_body_one', vars: { weeks: p.injuryWeeksLeft, position: p.position } },
                category: 'injury',
                priority: 49,
              });
            }
          }

          const lowMorale = squad.filter((p) => p.morale < 40);
          for (const p of lowMorale) {
            items.push({
              id: `morale-${p.id}`,
              icon: '😤',
              title: { key: 'news.morale_title', vars: { name: p.name } },
              body: { key: 'news.morale_body', vars: { morale: p.morale } },
              category: 'info',
              priority: 45,
            });
          }

          const expiring = squad.filter((p) => p.contractEnd <= season);
          if (expiring.length > 0) {
            items.push({
              id: 'contracts-header',
              icon: '📝',
              title: { key: 'news.contracts_title' },
              body: { key: expiring.length > 1 ? 'news.contracts_body_other' : 'news.contracts_body_one', vars: { count: expiring.length } },
              category: 'info',
              priority: 40,
            });
            for (const p of expiring) {
              items.push({
                id: `contract-${p.id}`,
                icon: '⏳',
                title: { key: 'news.raw', vars: { text: p.name } },
                body: { key: 'news.contract_player_body', vars: { season: p.contractEnd, position: p.position } },
                category: 'info',
                priority: 39,
              });
            }
          }
        }

        // ── 8. Top scorers ─────────────────────────────────────────────
        if (leagueComp) {
          const topScorers = await getTopScorers(dbHandle, leagueComp.id, season);
          if (topScorers.length > 0) {
            items.push({
              id: 'topscorer-header',
              icon: '👑',
              title: { key: 'news.topscorer_title' },
              body: { key: 'news.raw', vars: { text: leagueComp.name } },
              category: 'topscorer',
              priority: 55,
            });
            for (let i = 0; i < Math.min(5, topScorers.length); i++) {
              const ts = topScorers[i];
              const clubNm = clubMap.get(ts.clubId)?.shortName ?? '???';
              items.push({
                id: `topscorer-${ts.playerId}`,
                icon: `${i + 1}.`,
                title: { key: 'news.raw', vars: { text: ts.name } },
                body: { key: 'news.topscorer_goals', vars: { goals: ts.goals, club: clubNm } },
                category: 'topscorer',
                priority: 54 - i,
              });
            }
          }
        }

        // ── 9. Season recap — shown only on week 1 of a new season ──────
        if (week === 1 && season > 1 && playerClub) {
          const prevSummary = await getSeasonSummary(dbHandle, saveId, season - 1);
          items.push(
            ...generateSeasonRecap({
              previousSeason: season - 1,
              summary: prevSummary,
              clubMap,
              playerClubId,
              playerLeagueId: playerClub.leagueId,
            }),
          );
        }

        // ── 10. Retirement news — jogadores efetivamente aposentados ─────
        if (lastRetiredPlayerIds.length > 0) {
          const retiredRows = (await dbHandle
            .prepare(
              `SELECT id, name, age FROM players WHERE id IN (${lastRetiredPlayerIds.map(() => '?').join(',')})`,
            )
            .all(...lastRetiredPlayerIds)) as Array<{ id: number; name: string; age: number }>;
          const retiredDecisions: RetirementDecision[] = retiredRows.map((r) => ({
            playerId: r.id,
            playerName: r.name,
            age: r.age,
            reason: 'max_age' as const,
          }));
          const retiredNames = new Map<number, string>(retiredRows.map((r) => [r.id, r.name]));
          items.push(...generateRetirementNews(retiredDecisions, retiredNames, 'retired'));
        }

        // ── 11. Retirement announcements — jogadores que anunciaram aposentadoria ─
        if (pendingAnnouncedRetirementIds.length > 0) {
          const announcedRows = (await dbHandle
            .prepare(
              `SELECT id, name, age FROM players WHERE id IN (${pendingAnnouncedRetirementIds.map(() => '?').join(',')})`,
            )
            .all(...pendingAnnouncedRetirementIds)) as Array<{ id: number; name: string; age: number }>;
          if (announcedRows.length > 0) {
            const announcedDecisions: RetirementDecision[] = announcedRows.map((r) => ({
              playerId: r.id,
              playerName: r.name,
              age: r.age,
              reason: 'low_morale' as const,
            }));
            const announcedNames = new Map<number, string>(announcedRows.map((r) => [r.id, r.name]));
            items.push(...generateRetirementNews(announcedDecisions, announcedNames, 'announced'));
          }
        }

        // Empty state
        if (items.length === 0) {
          items.push({
            id: 'empty',
            icon: '📰',
            title: { key: 'news.empty_title' },
            body: { key: 'news.empty_body' },
            category: 'info',
            priority: 0,
          });
        }

        setNews(sortNews(items));
      } finally {
        setLoading(false);
      }
    })();
  }, [dbHandle, playerClub, playerClubId, season, week, currentSave]);

  if (loading) {
    return (
      <View style={[commonStyles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('news.header_title')}</Text>
        <Text style={styles.headerSub}>
          {t('news.header_sub', { season, week })}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {news.map((item) => (
          <View
            key={item.id}
            style={[
              styles.card,
              item.category === 'headline' && styles.cardHeadline,
              item.category === 'result' && styles.cardResult,
              item.category === 'standings' && styles.cardStandings,
              item.category === 'transfer' && styles.cardTransfer,
              item.category === 'injury' && styles.cardInjury,
              item.category === 'topscorer' && styles.cardTopscorer,
              item.category === 'star' && styles.cardStar,
              item.category === 'streak' && styles.cardStreak,
              item.category === 'comeback' && styles.cardComeback,
              item.category === 'league' && styles.cardLeague,
              item.category === 'season_recap' && styles.cardSeasonRecap,
              item.category === 'retirement' && styles.cardRetirement,
            ]}
          >
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{resolveDescriptor(t, lang, item.title)}</Text>
              <Text style={styles.cardBody}>{resolveDescriptor(t, lang, item.body)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Local helpers ──────────────────────────────────────────────────────────

// Vars whose numeric value is a table position → rendered as a locale-aware ordinal.
const ORDINAL_VARS = new Set(['pos', 'from']);

function resolveDescriptor(t: TFn, lang: Language, d: TextDescriptor): string {
  if (!d.vars) return t(d.key);
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(d.vars)) {
    out[k] = ORDINAL_VARS.has(k) && typeof v === 'number' ? ordinal(lang, v) : v;
  }
  return t(d.key, out);
}

function buildResultsHeader(week: number, comp: Competition | undefined): NewsItem {
  return {
    id: `results-header-${week}`,
    icon: '📅',
    title: { key: 'news.results_header_title', vars: { week } },
    body: comp ? { key: 'news.results_header_body_comp', vars: { comp: comp.name } } : { key: 'news.results_header_body_fallback' },
    category: 'result',
    priority: 72,
  };
}

function buildMatchResult(
  f: Fixture,
  clubMap: Map<number, Club>,
  playerClubId: number | null,
): NewsItem {
  const home = clubMap.get(f.homeClubId)?.shortName ?? `Club ${f.homeClubId}`;
  const away = clubMap.get(f.awayClubId)?.shortName ?? `Club ${f.awayClubId}`;
  const isPlayerMatch = f.homeClubId === playerClubId || f.awayClubId === playerClubId;
  return {
    id: `result-${f.id}`,
    icon: isPlayerMatch ? '🏟️' : '⚽',
    title: { key: 'news.scoreline', vars: { home, hg: f.homeGoals ?? 0, ag: f.awayGoals ?? 0, away } },
    body: isPlayerMatch ? { key: 'news.match_your' } : { key: 'news.match_result' },
    category: 'result',
    priority: isPlayerMatch ? 71 : 68,
  };
}

interface TopScorer {
  playerId: number;
  name: string;
  clubId: number;
  goals: number;
}

async function getTopScorers(
  db: import('@/database/queries/players').DbHandle,
  competitionId: number,
  season: number,
): Promise<TopScorer[]> {
  const rows = (await db
    .prepare(
      `SELECT ps.player_id, p.name, p.club_id, ps.goals
       FROM player_stats ps
       JOIN players p ON p.id = ps.player_id
       WHERE ps.competition_id = ? AND ps.season = ? AND ps.goals > 0
       ORDER BY ps.goals DESC
       LIMIT 10`,
    )
    .all(competitionId, season)) as {
    player_id: number;
    name: string;
    club_id: number;
    goals: number;
  }[];

  return rows.map((r) => ({
    playerId: r.player_id,
    name: r.name,
    clubId: r.club_id,
    goals: r.goals,
  }));
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  headerSub: {
    color: colors.primary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  list: {
    padding: spacing.sm,
    paddingBottom: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginVertical: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  cardHeadline: {
    borderLeftColor: colors.primaryLight,
    backgroundColor: colors.surfaceLight,
    borderLeftWidth: 4,
  },
  cardResult: {
    borderLeftColor: colors.primary,
  },
  cardStandings: {
    borderLeftColor: colors.gold,
  },
  cardTransfer: {
    borderLeftColor: colors.accent,
  },
  cardInjury: {
    borderLeftColor: colors.danger,
  },
  cardTopscorer: {
    borderLeftColor: colors.success,
  },
  cardStar: {
    borderLeftColor: colors.gold,
    backgroundColor: colors.surfaceLight,
  },
  cardStreak: {
    borderLeftColor: colors.warning,
  },
  cardComeback: {
    borderLeftColor: colors.accent,
  },
  cardLeague: {
    borderLeftColor: colors.primaryLight,
  },
  cardSeasonRecap: {
    borderLeftColor: colors.gold,
    backgroundColor: colors.surfaceLight,
    borderLeftWidth: 4,
  },
  cardRetirement: {
    borderLeftColor: colors.textSecondary,
  },
  cardIcon: {
    fontSize: fontSize.xl,
    width: 36,
    textAlign: 'center',
    marginRight: spacing.sm,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  cardBody: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
