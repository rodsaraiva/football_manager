import { Club, Fixture, MatchEvent, Transfer, League } from '@/types';
import { StandingsEntry, calculateStandings } from '@/engine/competition/standings';
import type { SeasonCompetitionSummary } from '@/database/queries/history';
import type { RetirementDecision } from '@/engine/retirement/retirement-engine';
import { TextDescriptor } from '@/i18n/translate';

// ─── Types ──────────────────────────────────────────────────────────────────

export type NewsCategory =
  | 'headline'
  | 'result'
  | 'standings'
  | 'transfer'
  | 'injury'
  | 'topscorer'
  | 'info'
  | 'star'
  | 'streak'
  | 'comeback'
  | 'league'
  | 'season_recap'
  | 'retirement'
  | 'press'
  | 'board'
  | 'achievement'
  | 'scouting'
  | 'callup'
  | 'national';

export interface NewsItem {
  id: string;
  icon: string;
  title: TextDescriptor;
  body: TextDescriptor;
  category: NewsCategory;
  priority: number; // higher = shown first
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// Ordinals are applied at render time (locale-aware) — the engine emits raw numbers.

function clubName(clubMap: Map<number, Club>, id: number | null): string {
  if (id === null) return 'Free Agent';
  return clubMap.get(id)?.name ?? `Club #${id}`;
}

function clubShort(clubMap: Map<number, Club>, id: number | null): string {
  if (id === null) return 'Free Agent';
  return clubMap.get(id)?.shortName ?? `#${id}`;
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

// ─── 1. Headlines (standings shifts & leader streak) ────────────────────────

export interface HeadlineInput {
  allPlayedFixtures: Fixture[];
  clubIds: number[];
  currentWeek: number;
  clubMap: Map<number, Club>;
  playerClubId: number | null;
}

export function generateHeadlines(input: HeadlineInput): NewsItem[] {
  const { allPlayedFixtures, clubIds, currentWeek, clubMap, playerClubId } = input;
  const items: NewsItem[] = [];

  if (allPlayedFixtures.length === 0) return items;

  // Snapshot of standings per completed week
  const leaderByWeek: { week: number; leaderId: number }[] = [];
  for (let w = 1; w <= currentWeek; w++) {
    const upTo = allPlayedFixtures.filter((f) => f.week <= w);
    if (upTo.length === 0) continue;
    const s = calculateStandings(upTo, clubIds);
    if (s[0].played > 0) {
      leaderByWeek.push({ week: w, leaderId: s[0].clubId });
    }
  }

  // Leader streak
  if (leaderByWeek.length > 0) {
    const leaderId = leaderByWeek[leaderByWeek.length - 1].leaderId;
    let streak = 0;
    for (let i = leaderByWeek.length - 1; i >= 0; i--) {
      if (leaderByWeek[i].leaderId === leaderId) streak++;
      else break;
    }
    if (streak >= 2) {
      items.push({
        id: 'headline-leader-streak',
        icon: '👑',
        title: { key: 'news.leader_streak_title', vars: { club: clubName(clubMap, leaderId) } },
        body: { key: streak === 1 ? 'news.leader_streak_body_one' : 'news.leader_streak_body_other', vars: { streak } },
        category: 'headline',
        priority: 100,
      });
    } else {
      items.push({
        id: 'headline-new-leader',
        icon: '🚀',
        title: { key: 'news.new_leader_title', vars: { club: clubName(clubMap, leaderId) } },
        body: { key: 'news.new_leader_body' },
        category: 'headline',
        priority: 100,
      });
    }
  }

  // Position changes between last week and current
  if (currentWeek >= 2) {
    const prevFixtures = allPlayedFixtures.filter((f) => f.week <= currentWeek - 1);
    const currFixtures = allPlayedFixtures;

    if (prevFixtures.length > 0) {
      const prev = calculateStandings(prevFixtures, clubIds);
      const curr = calculateStandings(currFixtures, clubIds);

      const prevPos = new Map<number, number>();
      prev.forEach((e, i) => prevPos.set(e.clubId, i + 1));

      const movers: { clubId: number; from: number; to: number; delta: number }[] = [];
      curr.forEach((e, i) => {
        const from = prevPos.get(e.clubId) ?? i + 1;
        const to = i + 1;
        const delta = from - to; // positive = moved up
        if (Math.abs(delta) >= 2) {
          movers.push({ clubId: e.clubId, from, to, delta });
        }
      });

      // Sort by biggest absolute movement, show top 2
      movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      const topMovers = movers.slice(0, 2);

      for (const m of topMovers) {
        const isPlayer = m.clubId === playerClubId;
        const isUp = m.delta > 0;
        const absDelta = Math.abs(m.delta);
        const plural = absDelta > 1 ? 'other' : 'one';
        const dir = isUp ? 'up' : 'down';
        const you = isPlayer ? '_you' : '';
        items.push({
          id: `headline-mover-${m.clubId}`,
          icon: isUp ? '📈' : '📉',
          title: { key: isUp ? 'news.mover_up_title' : 'news.mover_down_title', vars: { club: clubName(clubMap, m.clubId), pos: m.to } },
          body: { key: `news.mover_${dir}_body${you}_${plural}`, vars: { delta: absDelta, from: m.from } },
          category: 'headline',
          priority: isPlayer ? 95 : 85,
        });
      }
    }
  }

  return items;
}

// ─── 2. High-scoring matches (4+ goals) ─────────────────────────────────────

export function generateHighScoringMatches(
  fixtures: Fixture[],
  clubMap: Map<number, Club>,
  playerClubId: number | null,
): NewsItem[] {
  const items: NewsItem[] = [];
  const highScoring = fixtures.filter(
    (f) => f.played && f.homeGoals !== null && f.awayGoals !== null && f.homeGoals + f.awayGoals >= 4,
  );

  highScoring.sort(
    (a, b) => (b.homeGoals! + b.awayGoals!) - (a.homeGoals! + a.awayGoals!),
  );

  for (const f of highScoring) {
    const total = f.homeGoals! + f.awayGoals!;
    const diff = Math.abs(f.homeGoals! - f.awayGoals!);
    const isPlayer = f.homeClubId === playerClubId || f.awayClubId === playerClubId;
    const icon = total >= 6 ? '🔥' : diff >= 3 ? '💥' : '⚡';
    const kind = diff >= 3 ? 'thrash' : total >= 6 ? 'goalfest' : 'clash';
    const you = isPlayer ? '_you' : '';
    items.push({
      id: `high-score-${f.id}`,
      icon,
      title: { key: 'news.highscore_title', vars: { home: clubShort(clubMap, f.homeClubId), hg: f.homeGoals!, ag: f.awayGoals!, away: clubShort(clubMap, f.awayClubId) } },
      body: { key: `news.highscore_${kind}${you}`, vars: { total } },
      category: 'result',
      priority: isPlayer ? 75 : 70,
    });
  }

  return items;
}

// ─── 3. Comebacks (from user's match — only match with detailed events) ────

export interface ComebackInput {
  fixture: Fixture;
  events: MatchEvent[];
  playerToClub: Map<number, number>;
  clubMap: Map<number, Club>;
}

export function generateComeback(input: ComebackInput): NewsItem | null {
  const { fixture, events, playerToClub, clubMap } = input;

  const goalEvents = events
    .filter(
      (e) =>
        e.type === 'goal' ||
        e.type === 'penalty_scored' ||
        e.type === 'free_kick_scored',
    )
    .sort((a, b) => a.minute - b.minute);

  if (goalEvents.length === 0) return null;

  let homeScore = 0;
  let awayScore = 0;
  let maxHomeLead = 0;
  let maxAwayLead = 0;

  for (const e of goalEvents) {
    const scorerClub = playerToClub.get(e.playerId);
    if (scorerClub === fixture.homeClubId) homeScore++;
    else if (scorerClub === fixture.awayClubId) awayScore++;
    maxHomeLead = Math.max(maxHomeLead, homeScore - awayScore);
    maxAwayLead = Math.max(maxAwayLead, awayScore - homeScore);
  }

  const homeName = clubShort(clubMap, fixture.homeClubId);
  const awayName = clubShort(clubMap, fixture.awayClubId);

  // Away team comeback (was losing, won)
  if (awayScore > homeScore && maxHomeLead >= 2) {
    return {
      id: `comeback-${fixture.id}`,
      icon: '🔄',
      title: { key: 'news.comeback_title', vars: { club: awayName } },
      body: { key: 'news.comeback_away_body', vars: { deficit: maxHomeLead, hg: homeScore, ag: awayScore, home: homeName } },
      category: 'comeback',
      priority: 80,
    };
  }
  // Home team comeback
  if (homeScore > awayScore && maxAwayLead >= 2) {
    return {
      id: `comeback-${fixture.id}`,
      icon: '🔄',
      title: { key: 'news.comeback_title', vars: { club: homeName } },
      body: { key: 'news.comeback_home_body', vars: { deficit: maxAwayLead, hg: homeScore, ag: awayScore, away: awayName } },
      category: 'comeback',
      priority: 80,
    };
  }
  // Draw after being behind (equalizer drama)
  if (homeScore === awayScore && (maxHomeLead >= 2 || maxAwayLead >= 2)) {
    const lead = Math.max(maxHomeLead, maxAwayLead);
    return {
      id: `comeback-${fixture.id}`,
      icon: '🔄',
      title: { key: 'news.equalizer_title', vars: { home: homeName, away: awayName } },
      body: { key: 'news.equalizer_body', vars: { lead, hg: homeScore, ag: awayScore } },
      category: 'comeback',
      priority: 75,
    };
  }

  return null;
}

// ─── 4. League stories (title race, relegation, best attack/defense) ───────

export interface LeagueStoryInput {
  standings: StandingsEntry[];
  clubMap: Map<number, Club>;
  league: League;
  playerClubId: number | null;
  weeksPlayed: number;
  totalWeeks: number;
}

export function generateLeagueStories(input: LeagueStoryInput): NewsItem[] {
  const { standings, clubMap, league, playerClubId, weeksPlayed, totalWeeks } = input;
  const items: NewsItem[] = [];
  const played = standings.filter((s) => s.played > 0);
  if (played.length < 2) return items;

  // Title race: close gap after 40% of season
  const seasonProgress = totalWeeks > 0 ? weeksPlayed / totalWeeks : 0;
  if (seasonProgress >= 0.4 && standings.length >= 2) {
    const gap = standings[0].points - standings[1].points;
    if (gap <= 3) {
      items.push({
        id: 'league-title-race',
        icon: '🏁',
        title: { key: 'news.title_race_title' },
        body: { key: gap === 1 ? 'news.title_race_body_one' : 'news.title_race_body_other', vars: { leader: clubShort(clubMap, standings[0].clubId), chaser: clubShort(clubMap, standings[1].clubId), gap } },
        category: 'league',
        priority: 90,
      });
    }
  }

  // Relegation zone
  if (league.relegationSpots > 0) {
    const relegationStart = standings.length - league.relegationSpots;
    const inZone = standings.slice(relegationStart);
    const playerIdx = playerClubId !== null ? standings.findIndex((s) => s.clubId === playerClubId) : -1;

    // Player in relegation zone
    if (playerIdx >= relegationStart) {
      const safePoints = standings[relegationStart - 1]?.points ?? 0;
      const gap = safePoints - standings[playerIdx].points;
      items.push({
        id: 'league-player-relegation',
        icon: '⚠️',
        title: { key: 'news.relegation_title' },
        body: { key: gap === 1 ? 'news.relegation_body_one' : 'news.relegation_body_other', vars: { gap } },
        category: 'league',
        priority: 92,
      });
    } else if (playerIdx >= 0 && playerIdx >= relegationStart - 3 && playerIdx < relegationStart) {
      // Near the zone (within 3 positions)
      const zonePoints = inZone[0]?.points ?? 0;
      const gap = standings[playerIdx].points - zonePoints;
      items.push({
        id: 'league-player-near-relegation',
        icon: '⚠️',
        title: { key: 'news.relegation_worries_title' },
        body: { key: gap === 1 ? 'news.relegation_worries_body_one' : 'news.relegation_worries_body_other', vars: { pos: playerIdx + 1, gap } },
        category: 'league',
        priority: 82,
      });
    }
  }

  // Promotion zone (for non-top-flight leagues)
  if (league.promotionSpots > 0 && league.divisionLevel > 1) {
    const promoTop = standings.slice(0, league.promotionSpots);
    const playerIdx = playerClubId !== null ? standings.findIndex((s) => s.clubId === playerClubId) : -1;
    if (playerIdx >= 0 && playerIdx < league.promotionSpots) {
      items.push({
        id: 'league-player-promotion',
        icon: '⬆️',
        title: { key: 'news.promotion_title' },
        body: { key: 'news.promotion_body', vars: { pos: playerIdx + 1 } },
        category: 'league',
        priority: 85,
      });
    } else if (playerIdx >= 0 && playerIdx < league.promotionSpots + 3) {
      const gap = promoTop[promoTop.length - 1].points - standings[playerIdx].points;
      items.push({
        id: 'league-player-promo-chase',
        icon: '🎯',
        title: { key: 'news.promo_chase_title' },
        body: { key: gap === 1 ? 'news.promo_chase_body_one' : 'news.promo_chase_body_other', vars: { pos: playerIdx + 1, gap } },
        category: 'league',
        priority: 78,
      });
    }
  }

  // Best attack
  const bestAttack = [...played].sort((a, b) => b.goalsFor - a.goalsFor)[0];
  items.push({
    id: 'league-best-attack',
    icon: '🎯',
    title: { key: 'news.best_attack_title', vars: { club: clubName(clubMap, bestAttack.clubId) } },
    body: { key: bestAttack.played === 1 ? 'news.best_attack_body_one' : 'news.best_attack_body_other', vars: { goals: bestAttack.goalsFor, played: bestAttack.played, avg: (bestAttack.goalsFor / bestAttack.played).toFixed(2) } },
    category: 'league',
    priority: 60,
  });

  // Best defense
  const bestDefense = [...played].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
  items.push({
    id: 'league-best-defense',
    icon: '🛡️',
    title: { key: 'news.best_defense_title', vars: { club: clubName(clubMap, bestDefense.clubId) } },
    body: { key: bestDefense.played === 1 ? 'news.best_defense_body_one' : 'news.best_defense_body_other', vars: { goals: bestDefense.goalsAgainst, played: bestDefense.played, avg: (bestDefense.goalsAgainst / bestDefense.played).toFixed(2) } },
    category: 'league',
    priority: 58,
  });

  return items;
}

// ─── 5. Relevant transfers ──────────────────────────────────────────────────

const TRANSFER_RELEVANT_FEE = 5_000_000;

export function generateRelevantTransfers(
  transfers: Transfer[],
  playerNames: Map<number, string>,
  clubMap: Map<number, Club>,
): NewsItem[] {
  const items: NewsItem[] = [];
  // Filter relevant: big fees OR any non-trivial activity (last 5 total as fallback)
  const relevant = transfers.filter((t) => t.fee >= TRANSFER_RELEVANT_FEE);
  relevant.sort((a, b) => b.fee - a.fee);
  const top = relevant.slice(0, 5);

  for (const t of top) {
    const pName = playerNames.get(t.playerId) ?? `Player #${t.playerId}`;
    const from = clubShort(clubMap, t.fromClubId);
    const to = clubShort(clubMap, t.toClubId);
    const icon = t.fee >= 20_000_000 ? '💎' : '💰';
    items.push({
      id: `transfer-big-${t.id}`,
      icon,
      title: { key: 'news.transfer_title', vars: { player: pName, fee: formatMoney(t.fee) } },
      body: { key: t.type === 'loan' ? 'news.transfer_loan_body' : 'news.transfer_major_body', vars: { from, to } },
      category: 'transfer',
      priority: 70,
    });
  }

  return items;
}

// ─── 6. Match star (from user's match events) ──────────────────────────────

export interface MatchStarInput {
  fixture: Fixture;
  events: MatchEvent[];
  playerNames: Map<number, string>;
  playerToClub: Map<number, number>;
  clubMap: Map<number, Club>;
}

export function generateMatchStar(input: MatchStarInput): NewsItem | null {
  const { events, playerNames, playerToClub, clubMap } = input;

  interface Contribution {
    goals: number;
    assists: number;
    score: number;
  }
  const contrib = new Map<number, Contribution>();

  const bump = (playerId: number, g: number, a: number) => {
    const c = contrib.get(playerId) ?? { goals: 0, assists: 0, score: 0 };
    c.goals += g;
    c.assists += a;
    c.score = c.goals * 3 + c.assists * 1.5;
    contrib.set(playerId, c);
  };

  for (const e of events) {
    if (e.type === 'goal' || e.type === 'penalty_scored' || e.type === 'free_kick_scored') {
      bump(e.playerId, 1, 0);
    } else if (e.type === 'assist' && e.secondaryPlayerId !== null) {
      // In this codebase, assist events: playerId is the assister, secondaryPlayerId is the scorer.
      bump(e.playerId, 0, 1);
    }
  }

  if (contrib.size === 0) return null;

  // Bonus: hat-trick
  let bestId = -1;
  let best: Contribution | null = null;
  for (const [pid, c] of contrib.entries()) {
    let adj = c.score;
    if (c.goals >= 3) adj += 2; // hat-trick bonus
    if (best === null || adj > (best.goals * 3 + best.assists * 1.5 + (best.goals >= 3 ? 2 : 0))) {
      best = c;
      bestId = pid;
    }
  }

  if (!best || bestId < 0) return null;

  const pName = playerNames.get(bestId) ?? `Player #${bestId}`;
  const clubId = playerToClub.get(bestId);
  const club = clubId ? clubShort(clubMap, clubId) : '';
  const hatTrick = best.goals >= 3;

  // Body branch: goals-only / assists-only / both, with/without a club tag.
  const shape = best.goals > 0 && best.assists > 0 ? 'both' : best.goals > 0 ? 'goals' : 'assists';
  const clubSuffix = club ? '' : '_noclub';

  return {
    id: 'star-of-the-week',
    icon: hatTrick ? '🎩' : '⭐',
    title: { key: hatTrick ? 'news.star_hattrick_title' : 'news.star_title', vars: { player: pName } },
    body: { key: `news.star_body_${shape}${clubSuffix}`, vars: { goals: best.goals, assists: best.assists, club } },
    category: 'star',
    priority: 88,
  };
}

// ─── 7. Streaks for the player's club ──────────────────────────────────────

export interface StreakInput {
  playerClubId: number;
  playerFixtures: Fixture[]; // all fixtures involving player's club, played
}

export function generateStreaks(input: StreakInput): NewsItem[] {
  const { playerClubId, playerFixtures } = input;
  const items: NewsItem[] = [];

  const played = playerFixtures
    .filter((f) => f.played && f.homeGoals !== null && f.awayGoals !== null)
    .sort((a, b) => b.week - a.week); // most recent first

  if (played.length === 0) return items;

  type Outcome = 'W' | 'D' | 'L';
  const outcomes: Outcome[] = played.map((f) => {
    const isHome = f.homeClubId === playerClubId;
    const gf = isHome ? f.homeGoals! : f.awayGoals!;
    const ga = isHome ? f.awayGoals! : f.homeGoals!;
    if (gf > ga) return 'W';
    if (gf < ga) return 'L';
    return 'D';
  });

  // Win streak (most recent consecutive Ws)
  let winStreak = 0;
  for (const o of outcomes) {
    if (o === 'W') winStreak++;
    else break;
  }
  if (winStreak >= 3) {
    items.push({
      id: 'streak-wins',
      icon: '🔥',
      title: { key: 'news.streak_wins_title', vars: { wins: winStreak } },
      body: { key: 'news.streak_wins_body', vars: { wins: winStreak } },
      category: 'streak',
      priority: 86,
    });
  }

  // Unbeaten run (W or D)
  let unbeaten = 0;
  for (const o of outcomes) {
    if (o !== 'L') unbeaten++;
    else break;
  }
  if (unbeaten >= 5 && winStreak < unbeaten) {
    items.push({
      id: 'streak-unbeaten',
      icon: '🛡️',
      title: { key: 'news.streak_unbeaten_title', vars: { n: unbeaten } },
      body: { key: 'news.streak_unbeaten_body', vars: { n: unbeaten } },
      category: 'streak',
      priority: 78,
    });
  }

  // Losing streak
  let loseStreak = 0;
  for (const o of outcomes) {
    if (o === 'L') loseStreak++;
    else break;
  }
  if (loseStreak >= 3) {
    items.push({
      id: 'streak-losses',
      icon: '💀',
      title: { key: 'news.streak_losses_title', vars: { n: loseStreak } },
      body: { key: 'news.streak_losses_body', vars: { n: loseStreak } },
      category: 'streak',
      priority: 84,
    });
  }

  // Scoring drought
  const recent5 = played.slice(0, Math.min(5, played.length));
  const drought = recent5.every((f) => {
    const isHome = f.homeClubId === playerClubId;
    return (isHome ? f.homeGoals! : f.awayGoals!) === 0;
  });
  if (drought && recent5.length >= 3) {
    items.push({
      id: 'streak-drought',
      icon: '❄️',
      title: { key: 'news.streak_drought_title' },
      body: { key: 'news.streak_drought_body', vars: { n: recent5.length } },
      category: 'streak',
      priority: 76,
    });
  }

  // Clean-sheet run
  let cleanSheets = 0;
  for (const f of played) {
    const isHome = f.homeClubId === playerClubId;
    const ga = isHome ? f.awayGoals! : f.homeGoals!;
    if (ga === 0) cleanSheets++;
    else break;
  }
  if (cleanSheets >= 3) {
    items.push({
      id: 'streak-clean-sheets',
      icon: '🧱',
      title: { key: 'news.streak_clean_title', vars: { n: cleanSheets } },
      body: { key: 'news.streak_clean_body', vars: { n: cleanSheets } },
      category: 'streak',
      priority: 74,
    });
  }

  return items;
}

// ─── 8. Season recap (shown on week 1 of season > 1) ────────────────────────

export interface SeasonRecapInput {
  previousSeason: number;
  summary: SeasonCompetitionSummary[];
  clubMap: Map<number, Club>;
  playerClubId: number | null;
  playerLeagueId: number | null;
}

export function generateSeasonRecap(input: SeasonRecapInput): NewsItem[] {
  const { previousSeason, summary, clubMap, playerClubId } = input;
  const items: NewsItem[] = [];
  if (summary.length === 0) return items;

  const playerInvolved = (s: SeasonCompetitionSummary): boolean => {
    if (playerClubId == null) return false;
    if (s.championClubId === playerClubId) return true;
    if (s.runnerUpClubId === playerClubId) return true;
    if (s.relegated.some((r) => r.clubId === playerClubId)) return true;
    return false;
  };

  // Personal headline first, if the player's club did something noteworthy.
  for (const s of summary) {
    if (s.championClubId === playerClubId) {
      items.push({
        id: `recap-you-champion-${previousSeason}-${s.competitionId}`,
        icon: '🏆',
        title: { key: 'news.recap_you_champion_title', vars: { competition: s.competitionName } },
        body: { key: 'news.recap_you_champion_body', vars: { competition: s.competitionName, season: previousSeason } },
        category: 'season_recap',
        priority: 100,
      });
    } else if (s.runnerUpClubId === playerClubId) {
      items.push({
        id: `recap-you-runnerup-${previousSeason}-${s.competitionId}`,
        icon: '🥈',
        title: { key: 'news.recap_you_runnerup_title', vars: { competition: s.competitionName } },
        body: { key: 'news.recap_you_runnerup_body', vars: { season: previousSeason } },
        category: 'season_recap',
        priority: 95,
      });
    }
    if (s.relegated.some((r) => r.clubId === playerClubId)) {
      items.push({
        id: `recap-you-relegated-${previousSeason}-${s.competitionId}`,
        icon: '⬇️',
        title: { key: 'news.recap_you_relegated_title' },
        body: { key: 'news.recap_you_relegated_body', vars: { season: previousSeason } },
        category: 'season_recap',
        priority: 99,
      });
    }
  }

  // Champions of each competition.
  for (const s of summary) {
    const championName = clubMap.get(s.championClubId)?.name ?? `Club #${s.championClubId}`;
    if (s.championClubId === playerClubId) continue; // already covered above
    const hasRunnerUp = s.runnerUpClubId != null;
    const runnerUpName = hasRunnerUp ? (clubMap.get(s.runnerUpClubId!)?.name ?? `Club #${s.runnerUpClubId}`) : '';
    items.push({
      id: `recap-champion-${previousSeason}-${s.competitionId}`,
      icon: '🏆',
      title: { key: 'news.recap_champion_title', vars: { club: championName, competition: s.competitionName } },
      body: hasRunnerUp
        ? { key: 'news.recap_champion_body_runnerup', vars: { competition: s.competitionName, season: previousSeason, runnerup: runnerUpName } }
        : { key: 'news.recap_champion_body', vars: { competition: s.competitionName, season: previousSeason } },
      category: 'season_recap',
      priority: 85,
    });
  }

  // Relegations summary per league.
  const relegatedByLeague = new Map<number, SeasonCompetitionSummary>();
  for (const s of summary) {
    if (s.relegated.length > 0) {
      relegatedByLeague.set(s.competitionId, s);
    }
  }
  for (const s of relegatedByLeague.values()) {
    const names = s.relegated
      .map((r) => clubMap.get(r.clubId)?.shortName ?? `Club #${r.clubId}`)
      .join(', ');
    items.push({
      id: `recap-relegated-${previousSeason}-${s.competitionId}`,
      icon: '⬇️',
      title: { key: s.relegated.length === 1 ? 'news.recap_relegated_title_one' : 'news.recap_relegated_title_other', vars: { count: s.relegated.length, competition: s.competitionName } },
      body: { key: 'news.recap_relegated_body', vars: { names } },
      category: 'season_recap',
      priority: 70,
    });
  }

  // Individual awards: top scorer, MVP, breakthrough for each competition.
  for (const s of summary) {
    const top = s.topScorers[0];
    if (top) {
      items.push({
        id: `recap-topscorer-${previousSeason}-${s.competitionId}`,
        icon: '👑',
        title: { key: 'news.recap_topscorer_title', vars: { competition: s.competitionName } },
        body: { key: 'news.recap_topscorer_body', vars: { player: `#${top.playerId}`, goals: top.value } },
        category: 'season_recap',
        priority: 75,
      });
    }
    if (s.mvp) {
      items.push({
        id: `recap-mvp-${previousSeason}-${s.competitionId}`,
        icon: '⭐',
        title: { key: 'news.recap_mvp_title', vars: { competition: s.competitionName } },
        body: { key: 'news.recap_mvp_body', vars: { player: `#${s.mvp.playerId}`, rating: s.mvp.value.toFixed(2) } },
        category: 'season_recap',
        priority: 73,
      });
    }
    if (s.breakthrough) {
      items.push({
        id: `recap-breakthrough-${previousSeason}-${s.competitionId}`,
        icon: '🌟',
        title: { key: 'news.recap_breakthrough_title', vars: { competition: s.competitionName } },
        body: { key: 'news.recap_breakthrough_body', vars: { player: `#${s.breakthrough.playerId}`, rating: s.breakthrough.value.toFixed(2) } },
        category: 'season_recap',
        priority: 68,
      });
    }
  }

  // Reserved for future narrowing (e.g., filter to league-only competitions).
  void (input.playerLeagueId);
  void playerInvolved;

  return items;
}

// ─── 9. Retirements ─────────────────────────────────────────────────────────

export type RetirementNewsStage = 'announced' | 'retired';

export function generateRetirementNews(
  retiringPlayers: RetirementDecision[],
  playerNames: Map<number, string>,
  stage: RetirementNewsStage = 'retired',
): NewsItem[] {
  return retiringPlayers.map((r) => {
    const name = playerNames.get(r.playerId) ?? r.playerName;
    const announced = stage === 'announced';
    const title: TextDescriptor = announced
      ? { key: 'news.retire_announced_title', vars: { name } }
      : { key: 'news.retire_retired_title', vars: { name } };
    let body: TextDescriptor;
    if (announced) body = { key: 'news.retire_announced_body', vars: { age: r.age } };
    else if (r.reason === 'max_age') body = { key: 'news.retire_maxage_body', vars: { age: r.age } };
    else body = { key: 'news.retire_tough_body', vars: { age: r.age } };
    return {
      id: `retirement-${stage}-${r.playerId}`,
      icon: announced ? '📣' : '👋',
      title,
      body,
      category: 'retirement' as NewsCategory,
      priority: announced ? 90 : 93,
    };
  });
}

// ─── Sorting ────────────────────────────────────────────────────────────────

export function sortNews(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => b.priority - a.priority);
}
