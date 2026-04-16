/**
 * Assistente Técnico.
 *
 * Pure analysis functions: take a squad snapshot + recent fixtures/events and
 * return insights about form, evolution, and who deserves more minutes.
 *
 * Not UI-aware — each function takes plain data and returns plain data.
 */
import { MatchEvent, Position, Fixture } from '@/types';
import { PlayerAttributes } from '@/types/player';

export const FORM_WINDOW = 5;

export interface SquadPlayer {
  id: number;
  name: string;
  age: number;
  position: Position;
  overall: number;
  basePotential: number;
  effectivePotential: number;
  injuryWeeksLeft: number;
  attributes?: PlayerAttributes;
  /** Morale score 1-100 (from players.morale). Optional for backwards compatibility. */
  morale?: number;
  /** Season in which the contract expires (from players.contract_end). */
  contractEnd?: number;
  /** Weekly wage (from players.wage). */
  wage?: number;
}

// ─── Squad Summary ─────────────────────────────────────────────────────────

export const ATTRIBUTE_LABELS: Record<keyof PlayerAttributes, string> = {
  finishing: 'Finalização',
  passing: 'Passe',
  crossing: 'Cruzamento',
  dribbling: 'Drible',
  heading: 'Cabeceio',
  longShots: 'Chutes de longe',
  freeKicks: 'Bolas paradas',
  vision: 'Visão',
  composure: 'Compostura',
  decisions: 'Decisões',
  positioning: 'Posicionamento',
  aggression: 'Agressividade',
  leadership: 'Liderança',
  pace: 'Velocidade',
  stamina: 'Resistência',
  strength: 'Força',
  agility: 'Agilidade',
  jumping: 'Impulsão',
};

export interface CollectiveAttribute {
  attribute: keyof PlayerAttributes;
  label: string;
  avg: number;
}

export interface IndividualHighlight {
  playerId: number;
  playerName: string;
  position: Position;
  attribute: keyof PlayerAttributes;
  label: string;
  value: number;
}

export interface SquadSummary {
  collectiveStrengths: CollectiveAttribute[];
  collectiveWeaknesses: CollectiveAttribute[];
  individualHighlights: IndividualHighlight[];
}

/** Atributos considerados para destaques individuais */
const HIGHLIGHT_ATTRIBUTES: (keyof PlayerAttributes)[] = [
  'crossing', 'pace', 'passing', 'finishing', 'dribbling',
  'vision', 'heading', 'freeKicks', 'longShots', 'leadership',
];

const MIN_VALUE_FOR_HIGHLIGHT = 80;

export function buildSquadSummary(squad: SquadPlayer[]): SquadSummary {
  const withAttrs = squad.filter((p) => p.attributes != null);

  if (withAttrs.length === 0) {
    return { collectiveStrengths: [], collectiveWeaknesses: [], individualHighlights: [] };
  }

  // Compute average per attribute across all players (inclusive — simples)
  const attrKeys = Object.keys(ATTRIBUTE_LABELS) as (keyof PlayerAttributes)[];
  const avgs: CollectiveAttribute[] = attrKeys.map((attr) => {
    const sum = withAttrs.reduce((acc, p) => acc + (p.attributes![attr] as number), 0);
    return {
      attribute: attr,
      label: ATTRIBUTE_LABELS[attr],
      avg: Math.round((sum / withAttrs.length) * 10) / 10,
    };
  });

  const sorted = [...avgs].sort((a, b) => b.avg - a.avg);
  const collectiveStrengths = sorted.slice(0, 4);
  const collectiveWeaknesses = [...sorted].reverse().slice(0, 3);

  // Individual highlights: for each key attribute, best player if value >= 80
  const highlights: IndividualHighlight[] = [];
  for (const attr of HIGHLIGHT_ATTRIBUTES) {
    let best: SquadPlayer | null = null;
    let bestVal = MIN_VALUE_FOR_HIGHLIGHT - 1;
    for (const p of withAttrs) {
      const v = p.attributes![attr] as number;
      if (v > bestVal) {
        bestVal = v;
        best = p;
      }
    }
    if (best != null) {
      highlights.push({
        playerId: best.id,
        playerName: best.name,
        position: best.position,
        attribute: attr,
        label: ATTRIBUTE_LABELS[attr],
        value: bestVal,
      });
    }
    if (highlights.length >= 8) break;
  }

  return { collectiveStrengths, collectiveWeaknesses, individualHighlights: highlights };
}

export interface PlayerMatchAppearance {
  fixtureId: number;
  /** Did the player feature in this match (has at least one event)? */
  played: boolean;
  /** Heuristic rating for the match, 4.0–10.0. */
  rating: number;
  /** Raw event counts for attribution. */
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
}

export interface PlayerForm {
  playerId: number;
  appearances: number;
  avgRating: number;
  goals: number;
  assists: number;
}

export interface FormListItem {
  player: SquadPlayer;
  form: PlayerForm;
}

export interface ReplacementSuggestion {
  benchPlayer: SquadPlayer;
  starter: SquadPlayer;
  overallGap: number;
}

export interface TechnicalReport {
  inForm: FormListItem[];
  outOfForm: FormListItem[];
  rising: SquadPlayer[];
  replacementSuggestions: ReplacementSuggestion[];
  benchedButDeservesMinutes: SquadPlayer[];
  squadSummary: SquadSummary;
  /** Raw form data for all squad players — used by downstream features (e.g. line efficiency). */
  forms: PlayerForm[];
}

// ─── Rating heuristic from events ───────────────────────────────────────────

/**
 * Compute a rough match rating from the player's events in a single fixture.
 * This mirrors the match-engine's rating formula in spirit but runs after the
 * fact from stored events (which is all the DB exposes historically).
 */
export function ratePlayerFromEvents(
  playerId: number,
  overall: number,
  events: MatchEvent[],
  teamWon: boolean,
  teamConceded: number,
  isDefender: boolean,
): PlayerMatchAppearance {
  const playerEvents = events.filter(
    (e) => e.playerId === playerId || e.secondaryPlayerId === playerId,
  );
  if (playerEvents.length === 0) {
    return {
      fixtureId: events[0]?.fixtureId ?? 0,
      played: false,
      rating: 0,
      goals: 0,
      assists: 0,
      yellows: 0,
      reds: 0,
    };
  }

  let rating = 6.0 + (overall - 50) * 0.03;
  let goals = 0;
  let assists = 0;
  let yellows = 0;
  let reds = 0;

  for (const e of playerEvents) {
    if (e.playerId === playerId) {
      switch (e.type) {
        case 'goal':
        case 'penalty_scored':
        case 'free_kick_scored':
          rating += e.type === 'free_kick_scored' ? 0.7 : e.type === 'penalty_scored' ? 0.6 : 0.8;
          goals++;
          break;
        case 'assist':
          rating += 0.5;
          assists++;
          break;
        case 'penalty_missed':
          rating -= 0.8;
          break;
        case 'free_kick_missed':
          rating -= 0.2;
          break;
        case 'yellow':
          rating -= 0.3;
          yellows++;
          break;
        case 'red':
          rating -= 1.5;
          reds++;
          break;
        case 'injury':
          rating -= 0.2;
          break;
        case 'shot_on_target':
          rating += 0.05;
          break;
        case 'save':
          rating += 0.1;
          break;
        case 'shot_off_target':
          break;
      }
    }
    // Secondary-id assist bonus (old-style "assist credit" on goal events)
    if (
      e.secondaryPlayerId === playerId &&
      (e.type === 'goal' || e.type === 'penalty_scored' || e.type === 'free_kick_scored')
    ) {
      rating += 0.25;
    }
  }

  if (teamWon) rating += 0.3;
  if (teamConceded === 0 && isDefender) rating += 0.5;

  rating = Math.max(4.0, Math.min(10.0, rating));
  return {
    fixtureId: events[0].fixtureId,
    played: true,
    rating: Math.round(rating * 10) / 10,
    goals,
    assists,
    yellows,
    reds,
  };
}

const DEFENSE_POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB'];

export function isDefender(pos: Position): boolean {
  return DEFENSE_POSITIONS.includes(pos);
}

// ─── Form aggregation ──────────────────────────────────────────────────────

export interface FormInput {
  squad: SquadPlayer[];
  /**
   * Fixtures the player club played, most recent first, limited to FORM_WINDOW.
   */
  recentFixtures: Fixture[];
  /** Events grouped by fixtureId (for efficient lookup). */
  eventsByFixture: Map<number, MatchEvent[]>;
  playerClubId: number;
}

export function computeForm(input: FormInput): PlayerForm[] {
  const { squad, recentFixtures, eventsByFixture, playerClubId } = input;

  const perPlayer = new Map<number, {
    apps: number;
    ratingSum: number;
    goals: number;
    assists: number;
  }>();

  for (const p of squad) {
    perPlayer.set(p.id, { apps: 0, ratingSum: 0, goals: 0, assists: 0 });
  }

  for (const fixture of recentFixtures) {
    const evts = eventsByFixture.get(fixture.id) ?? [];
    if (evts.length === 0) continue;
    const isHome = fixture.homeClubId === playerClubId;
    const myGoals = isHome ? (fixture.homeGoals ?? 0) : (fixture.awayGoals ?? 0);
    const oppGoals = isHome ? (fixture.awayGoals ?? 0) : (fixture.homeGoals ?? 0);
    const teamWon = myGoals > oppGoals;

    for (const p of squad) {
      const appearance = ratePlayerFromEvents(p.id, p.overall, evts, teamWon, oppGoals, isDefender(p.position));
      if (!appearance.played) continue;
      const bucket = perPlayer.get(p.id)!;
      bucket.apps++;
      bucket.ratingSum += appearance.rating;
      bucket.goals += appearance.goals;
      bucket.assists += appearance.assists;
    }
  }

  const result: PlayerForm[] = [];
  for (const [playerId, v] of perPlayer.entries()) {
    result.push({
      playerId,
      appearances: v.apps,
      avgRating: v.apps > 0 ? Math.round((v.ratingSum / v.apps) * 10) / 10 : 0,
      goals: v.goals,
      assists: v.assists,
    });
  }
  return result;
}

// ─── Report building ───────────────────────────────────────────────────────

export interface ReportInput extends FormInput {
  /** Current week — used to judge "benched" status via appearances. */
  currentWeek: number;
  /**
   * IDs dos 11 titulares + até 8 suplentes (matchday squad).
   * Quando fornecido, `squadSummary` considera apenas esses jogadores.
   * As demais seções do relatório continuam usando o elenco completo.
   */
  matchdaySquadIds?: Set<number>;
}

export function buildTechnicalReport(input: ReportInput): TechnicalReport {
  const { squad } = input;
  const forms = computeForm(input);
  const formById = new Map<number, PlayerForm>(forms.map((f) => [f.playerId, f]));

  // Only players with at least 2 appearances are considered for form lists
  const playing = squad
    .filter((p) => (formById.get(p.id)?.appearances ?? 0) >= 2)
    .map((p) => ({ player: p, form: formById.get(p.id)! }));

  const inForm = [...playing].sort((a, b) => b.form.avgRating - a.form.avgRating).slice(0, 5);
  const outOfForm = [...playing]
    .filter((p) => p.form.avgRating < 6.3)
    .sort((a, b) => a.form.avgRating - b.form.avgRating)
    .slice(0, 5);

  // Rising: big potential gap AND young OR mid-age
  const rising = squad
    .filter((p) => p.age <= 26 && p.effectivePotential - p.overall >= 5)
    .sort((a, b) => (b.effectivePotential - b.overall) - (a.effectivePotential - a.overall))
    .slice(0, 6);

  // Replacement suggestions: for each position, if a bench player has higher
  // overall than a player with many appearances in form
  const suggestions: ReplacementSuggestion[] = [];
  const byPosition = new Map<Position, SquadPlayer[]>();
  for (const p of squad) {
    if (p.injuryWeeksLeft > 0) continue;
    const arr = byPosition.get(p.position) ?? [];
    arr.push(p);
    byPosition.set(p.position, arr);
  }
  for (const [, group] of byPosition.entries()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => b.overall - a.overall);
    const best = sorted[0];
    const secondBest = sorted[1];
    const bestApps = formById.get(best.id)?.appearances ?? 0;
    const secondApps = formById.get(secondBest.id)?.appearances ?? 0;
    // The best is probably a starter; if someone else has higher overall and
    // is barely playing, flag it.
    for (let i = 1; i < sorted.length; i++) {
      const candidate = sorted[i];
      const apps = formById.get(candidate.id)?.appearances ?? 0;
      if (candidate.overall >= best.overall - 1 && apps < bestApps / 2 && apps < 2) {
        suggestions.push({
          benchPlayer: candidate,
          starter: best,
          overallGap: candidate.overall - best.overall,
        });
      }
    }
    // Also suppress unused local var warning
    void secondApps;
  }

  // Benched but deserves minutes: player with high overall who hasn't played
  // at all in the recent window
  const benchedButDeserves = squad
    .filter((p) => {
      const apps = formById.get(p.id)?.appearances ?? 0;
      return apps === 0 && p.overall >= 70 && p.injuryWeeksLeft === 0;
    })
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 5);

  return {
    inForm,
    outOfForm,
    rising,
    replacementSuggestions: suggestions.slice(0, 5),
    benchedButDeservesMinutes: benchedButDeserves,
    squadSummary: buildSquadSummary(
      input.matchdaySquadIds && input.matchdaySquadIds.size > 0
        ? squad.filter((p) => input.matchdaySquadIds!.has(p.id))
        : squad,
    ),
    forms,
  };
}
