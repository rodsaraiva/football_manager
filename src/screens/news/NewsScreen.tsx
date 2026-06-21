import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, commonStyles } from '@/theme';
import { useTranslation, ordinal, Language } from '@/i18n';
import { Card, Icon, EmptyState } from '@/components/kit';
import type { IconName } from '@/components/kit';
import { Headline, Body, Caption } from '@/components/typography';
import { useGameStore } from '@/store/game-store';
import { useDatabaseStore } from '@/store/database-store';
import { getClubsByLeague, getClubById } from '@/database/queries/clubs';
import { getLeagueById, getCompetitionsBySeason } from '@/database/queries/leagues';
import { getFixturesByWeek, getMatchEvents } from '@/database/queries/fixtures';
import { getTransfersBySeason } from '@/database/queries/transfers';
import { getPlayersByClub } from '@/database/queries/players';
import { getSeasonSummary } from '@/database/queries/history';
import { calculateStandings, StandingsEntry } from '@/engine/competition/standings';
import { Fixture, Club, Competition, League } from '@/types';
import {
  NewsItem,
  NewsCategory,
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
import { getNewsItems, toNewsItem, markNewsRead } from '@/database/queries/news';
import type { RetirementDecision } from '@/engine/retirement/retirement-engine';
import type { TKey, TextDescriptor } from '@/i18n/translate';

type TFn = (key: TKey, vars?: Record<string, string | number>) => string;

// Mapeia a categoria do item de notícia para um ícone SVG do kit (substitui o emoji
// que o gerador carrega em NewsItem.icon — o glifo deixa de ser renderizado).
const CATEGORY_ICON: Record<NewsCategory, IconName> = {
  headline: 'news',
  result: 'goal',
  standings: 'chart',
  transfer: 'money',
  injury: 'injury',
  topscorer: 'goal',
  info: 'news',
  star: 'target',
  streak: 'chart',
  comeback: 'whistle',
  league: 'shield',
  season_recap: 'chart',
  retirement: 'squad',
  press: 'news',
  board: 'shield',
  achievement: 'check',
  scouting: 'target',
  callup: 'squad',
};

const CATEGORY_ACCENT: Record<NewsCategory, string> = {
  headline: colors.primaryLight,
  result: colors.primary,
  standings: colors.gold,
  transfer: colors.accent,
  injury: colors.danger,
  topscorer: colors.success,
  info: colors.border,
  star: colors.gold,
  streak: colors.warning,
  comeback: colors.accent,
  league: colors.primaryLight,
  season_recap: colors.gold,
  retirement: colors.textSecondary,
  press: colors.primary,
  board: colors.gold,
  achievement: colors.success,
  scouting: colors.accent,
  callup: colors.primaryLight,
};

// Itens de ranking (artilheiros) carregam um índice textual "1." em vez de emoji.
const RANK_ICON = /^\d+\.$/;

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
        // Enrich names for transfer players outside the player's league
        // (playerNames only covers league clubs), so headlines show real names.
        const missingIds = [...new Set(transfers.map((tr) => tr.playerId))].filter(
          (id) => !playerNames.has(id),
        );
        if (missingIds.length > 0) {
          const rows = (await dbHandle
            .prepare(
              `SELECT id, name FROM players WHERE id IN (${missingIds.map(() => '?').join(',')})`,
            )
            .all(...missingIds)) as Array<{ id: number; name: string }>;
          for (const r of rows) playerNames.set(r.id, r.name);
        }
        // Likewise enrich clubMap for clubs outside the player's league.
        const missingClubIds = [...new Set(transfers.flatMap((tr) => [tr.fromClubId, tr.toClubId]))]
          .filter((id): id is number => id != null && !clubMap.has(id));
        for (const id of missingClubIds) {
          const c = await getClubById(dbHandle, saveId, id);
          if (c) clubMap.set(id, c);
        }
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
              icon: '',
              title: { key: 'news.injury_report_title' },
              body: { key: injured.length > 1 ? 'news.injury_report_body_other' : 'news.injury_report_body_one', vars: { count: injured.length } },
              category: 'injury',
              priority: 50,
            });
            for (const p of injured) {
              items.push({
                id: `injury-${p.id}`,
                icon: '',
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
              icon: '',
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
              icon: '',
              title: { key: 'news.contracts_title' },
              body: { key: expiring.length > 1 ? 'news.contracts_body_other' : 'news.contracts_body_one', vars: { count: expiring.length } },
              category: 'info',
              priority: 40,
            });
            for (const p of expiring) {
              items.push({
                id: `contract-${p.id}`,
                icon: '',
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
              icon: '',
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

        // ── Persisted news (W3) — merge with on-the-fly stories ──────────
        const persistedRows = await getNewsItems(dbHandle, saveId, season);
        const seen = new Set(items.map((i) => i.id));
        for (const row of persistedRows) {
          const p = toNewsItem(row);
          if (!seen.has(p.id)) items.push(p);
        }

        setNews(sortNews(items));

        // W3 news: opening the feed clears the unread badge.
        await markNewsRead(dbHandle, saveId);
        useGameStore.getState().setUnreadNewsCount(0);
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

  if (news.length === 0) {
    return (
      <View style={commonStyles.screen}>
        <View style={styles.header}>
          <Headline>{t('news.header_title')}</Headline>
          <Body color={colors.primary}>{t('news.header_sub', { season, week })}</Body>
        </View>
        <View style={styles.emptyWrap}>
          <EmptyState art="inbox" title={t('news.empty_title')} description={t('news.empty_body')} />
        </View>
      </View>
    );
  }

  return (
    <View style={commonStyles.screen}>
      <View style={styles.header}>
        <Headline>{t('news.header_title')}</Headline>
        <Body color={colors.primary}>{t('news.header_sub', { season, week })}</Body>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {news.map((item) => {
          const accent = CATEGORY_ACCENT[item.category];
          const isRank = RANK_ICON.test(item.icon);
          return (
            <Card key={item.id} variant="detail" accent={accent} style={styles.card}>
              {isRank ? (
                <Caption color={accent} style={styles.rankIcon}>{item.icon}</Caption>
              ) : (
                <View style={styles.cardIcon}>
                  <Icon name={CATEGORY_ICON[item.category]} color={accent} size={20} />
                </View>
              )}
              <View style={styles.cardContent}>
                <Body>{resolveDescriptor(t, lang, item.title)}</Body>
                <Caption color={colors.textSecondary}>{resolveDescriptor(t, lang, item.body)}</Caption>
              </View>
            </Card>
          );
        })}
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
    icon: '',
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
    icon: '',
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
    gap: spacing.xxs,
  },
  emptyWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md },
  list: {
    padding: spacing.sm,
    paddingBottom: spacing.xl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
    gap: spacing.sm,
  },
  cardIcon: {
    width: 36,
    alignItems: 'center',
  },
  rankIcon: {
    width: 36,
    textAlign: 'center',
  },
  cardContent: {
    flex: 1,
    gap: spacing.xxs,
  },
});
