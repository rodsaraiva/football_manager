import { Club, Fixture, MatchEvent, Transfer, League } from '@/types';
import { StandingsEntry, calculateStandings } from '@/engine/competition/standings';
import type { SeasonCompetitionSummary } from '@/database/queries/history';

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
  | 'season_recap';

export interface NewsItem {
  id: string;
  icon: string;
  title: string;
  body: string;
  category: NewsCategory;
  priority: number; // higher = shown first
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

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
        title: `${clubName(clubMap, leaderId)} holds top spot`,
        body: `${streak} consecutive week${streak > 1 ? 's' : ''} at the top of the table`,
        category: 'headline',
        priority: 100,
      });
    } else {
      items.push({
        id: 'headline-new-leader',
        icon: '🚀',
        title: `${clubName(clubMap, leaderId)} takes the lead`,
        body: `New leader at the top of the table`,
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
        items.push({
          id: `headline-mover-${m.clubId}`,
          icon: isUp ? '📈' : '📉',
          title: `${clubName(clubMap, m.clubId)} ${isUp ? 'climbs to' : 'drops to'} ${ordinal(m.to)}`,
          body: `${isUp ? 'Up' : 'Down'} ${Math.abs(m.delta)} position${Math.abs(m.delta) > 1 ? 's' : ''} from ${ordinal(m.from)}${isPlayer ? ' — your club' : ''}`,
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
    const descriptor = diff >= 3 ? 'Thrashing' : total >= 6 ? 'Goal fest' : 'High-scoring clash';
    items.push({
      id: `high-score-${f.id}`,
      icon,
      title: `${clubShort(clubMap, f.homeClubId)} ${f.homeGoals} - ${f.awayGoals} ${clubShort(clubMap, f.awayClubId)}`,
      body: `${descriptor} — ${total} goals${isPlayer ? ' (your match)' : ''}`,
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
      title: `${awayName} stage comeback`,
      body: `Came back from ${maxHomeLead} goals down to win ${homeScore}-${awayScore} at ${homeName}`,
      category: 'comeback',
      priority: 80,
    };
  }
  // Home team comeback
  if (homeScore > awayScore && maxAwayLead >= 2) {
    return {
      id: `comeback-${fixture.id}`,
      icon: '🔄',
      title: `${homeName} stage comeback`,
      body: `Came back from ${maxAwayLead} goals down to win ${homeScore}-${awayScore} vs ${awayName}`,
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
      title: `Dramatic equalizer in ${homeName} vs ${awayName}`,
      body: `Recovered ${lead}-goal deficit to draw ${homeScore}-${awayScore}`,
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
        title: 'Title race heats up',
        body: `${clubShort(clubMap, standings[0].clubId)} lead ${clubShort(clubMap, standings[1].clubId)} by just ${gap} point${gap === 1 ? '' : 's'}`,
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
        title: 'Relegation battle',
        body: `Your club is in the drop zone, ${gap} point${gap === 1 ? '' : 's'} from safety`,
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
        title: 'Relegation worries',
        body: `Your club sits ${ordinal(playerIdx + 1)}, only ${gap} point${gap === 1 ? '' : 's'} above the drop zone`,
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
        title: 'On course for promotion',
        body: `Your club sits ${ordinal(playerIdx + 1)}, currently in a promotion spot`,
        category: 'league',
        priority: 85,
      });
    } else if (playerIdx >= 0 && playerIdx < league.promotionSpots + 3) {
      const gap = promoTop[promoTop.length - 1].points - standings[playerIdx].points;
      items.push({
        id: 'league-player-promo-chase',
        icon: '🎯',
        title: 'Chasing promotion',
        body: `Your club sits ${ordinal(playerIdx + 1)}, ${gap} point${gap === 1 ? '' : 's'} off the promotion places`,
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
    title: `Best attack: ${clubName(clubMap, bestAttack.clubId)}`,
    body: `${bestAttack.goalsFor} goals scored in ${bestAttack.played} match${bestAttack.played > 1 ? 'es' : ''} (${(bestAttack.goalsFor / bestAttack.played).toFixed(2)}/game)`,
    category: 'league',
    priority: 60,
  });

  // Best defense
  const bestDefense = [...played].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
  items.push({
    id: 'league-best-defense',
    icon: '🛡️',
    title: `Best defense: ${clubName(clubMap, bestDefense.clubId)}`,
    body: `Only ${bestDefense.goalsAgainst} goals conceded in ${bestDefense.played} match${bestDefense.played > 1 ? 'es' : ''} (${(bestDefense.goalsAgainst / bestDefense.played).toFixed(2)}/game)`,
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
    const label = t.type === 'loan' ? 'Loan move' : 'Major transfer';
    items.push({
      id: `transfer-big-${t.id}`,
      icon,
      title: `${pName} — ${formatMoney(t.fee)}`,
      body: `${label}: ${from} → ${to}`,
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
  const { fixture, events, playerNames, playerToClub, clubMap } = input;

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
  const parts: string[] = [];
  if (best.goals > 0) parts.push(`${best.goals} goal${best.goals > 1 ? 's' : ''}`);
  if (best.assists > 0) parts.push(`${best.assists} assist${best.assists > 1 ? 's' : ''}`);
  const hatTrick = best.goals >= 3;

  return {
    id: 'star-of-the-week',
    icon: hatTrick ? '🎩' : '⭐',
    title: `${hatTrick ? 'Hat-trick hero' : 'Star of the week'}: ${pName}`,
    body: `${parts.join(', ')}${club ? ` for ${club}` : ''}`,
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
      title: `${winStreak} wins in a row!`,
      body: `Your club is on fire — ${winStreak} consecutive victories`,
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
      title: `${unbeaten} games unbeaten`,
      body: `No defeats in the last ${unbeaten} matches`,
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
      title: `${loseStreak} defeats in a row`,
      body: `Your club is in a rough patch — ${loseStreak} straight losses`,
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
      title: 'Goal drought',
      body: `Your club has not scored in the last ${recent5.length} matches`,
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
      title: `${cleanSheets} clean sheets in a row`,
      body: `Your defense is rock-solid — ${cleanSheets} matches without conceding`,
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

  // Filter to competitions that matter for the viewing player.
  // A competition matters if:
  //   - the player's club participated (champion, runner-up, relegated, or had any award entry); OR
  //   - it's tied to the player's league (league competition in their division).
  // For the first release we keep it simple: include every competition in summary,
  // but boost priority for ones involving the player's club.
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
        title: `Champions of the ${s.competitionName}!`,
        body: `Your club lifted the ${s.competitionName} trophy in season ${previousSeason}`,
        category: 'season_recap',
        priority: 100,
      });
    } else if (s.runnerUpClubId === playerClubId) {
      items.push({
        id: `recap-you-runnerup-${previousSeason}-${s.competitionId}`,
        icon: '🥈',
        title: `Runners-up in the ${s.competitionName}`,
        body: `Your club finished second in season ${previousSeason}`,
        category: 'season_recap',
        priority: 95,
      });
    }
    if (s.relegated.some((r) => r.clubId === playerClubId)) {
      items.push({
        id: `recap-you-relegated-${previousSeason}-${s.competitionId}`,
        icon: '⬇️',
        title: 'Relegated',
        body: `Your club was relegated at the end of season ${previousSeason}`,
        category: 'season_recap',
        priority: 99,
      });
    }
  }

  // Champions of each competition.
  for (const s of summary) {
    const championName = clubMap.get(s.championClubId)?.name ?? `Club #${s.championClubId}`;
    if (s.championClubId === playerClubId) continue; // already covered above
    items.push({
      id: `recap-champion-${previousSeason}-${s.competitionId}`,
      icon: '🏆',
      title: `${championName} are ${s.competitionName} champions`,
      body: `Won the ${s.competitionName} in season ${previousSeason}${s.runnerUpClubId != null ? `, ahead of ${clubMap.get(s.runnerUpClubId)?.name ?? `Club #${s.runnerUpClubId}`}` : ''}`,
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
      title: `${s.relegated.length} ${s.relegated.length === 1 ? 'club' : 'clubs'} relegated from ${s.competitionName}`,
      body: names,
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
        title: `${s.competitionName} Top Scorer`,
        body: `Player #${top.playerId} led with ${top.value} goals`,
        category: 'season_recap',
        priority: 75,
      });
    }
    if (s.mvp) {
      items.push({
        id: `recap-mvp-${previousSeason}-${s.competitionId}`,
        icon: '⭐',
        title: `${s.competitionName} Player of the Season`,
        body: `Player #${s.mvp.playerId} — average rating ${s.mvp.value.toFixed(2)}`,
        category: 'season_recap',
        priority: 73,
      });
    }
    if (s.breakthrough) {
      items.push({
        id: `recap-breakthrough-${previousSeason}-${s.competitionId}`,
        icon: '🌟',
        title: `${s.competitionName} Young Player of the Season`,
        body: `Player #${s.breakthrough.playerId} — average rating ${s.breakthrough.value.toFixed(2)}`,
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

// ─── Sorting ────────────────────────────────────────────────────────────────

export function sortNews(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => b.priority - a.priority);
}
