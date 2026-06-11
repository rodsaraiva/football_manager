// Board / trust thresholds
export const BOARD_TRUST_FIRE_THRESHOLD = 20;
export const BOARD_TRUST_CUT_THRESHOLD = 40;
export const BOARD_TRUST_BONUS_THRESHOLD = 80;
export const BOARD_TRUST_INITIAL = 50;

// Reputation deltas (per-season)
export const REPUTATION_RELEGATION_PENALTY = -15;
export const REPUTATION_PROMOTION_BONUS = 10;
export const REPUTATION_TITLE_BONUS = 10;
export const REPUTATION_CUP_BONUS = 6;
export const REPUTATION_TOP3_BONUS = 4;
export const REPUTATION_BOTTOM3_PENALTY = -4;
export const REPUTATION_BUDGET_SURPLUS_BONUS = 2;
export const REPUTATION_BUDGET_DEFICIT_PENALTY = -3;

export const RETIREMENT_MIN_AGE = 33;
export const RETIREMENT_MAX_AGE = 40;
export const RETIREMENT_MORALE_THRESHOLD = 50;
export const MAX_PLAYER_AGE = 41;
export const RETIREMENT_LOW_MORALE_STREAK_THRESHOLD = 3;
// Offsets em relação ao fim da temporada para a janela de anúncio de aposentadoria.
// Ex.: SEASON_END=46, OPEN_OFFSET=20, CLOSE_OFFSET=10 ⇒ janela semanas 26..36 inclusive.
export const RETIREMENT_ANNOUNCE_WINDOW_OPEN_OFFSET = 20;
export const RETIREMENT_ANNOUNCE_WINDOW_CLOSE_OFFSET = 10;
export const SEASON_END_WEEK = 46;

// Assistants
export const ASSISTANT_RETIREMENT_MIN_AGE = 60;
export const ASSISTANT_RETIREMENT_MAX_AGE = 70;
export const ASSISTANT_AGE_MIN = 35;
export const ASSISTANT_AGE_MAX = 55;
export const ASSISTANT_WAGE_MIN = 5_000;
export const ASSISTANT_WAGE_MAX = 20_000;
export const ASSISTANT_CANDIDATE_POOL_SIZE = 5;
export const ASSISTANT_COMMENT_CHANCE_PER_WEEK = 0.15;
// seasonsAtClub thresholds to reach each star level (index = star - 1)
export const ASSISTANT_QUALITY_THRESHOLDS = [0, 2, 4, 7, 10] as const;

// ─── Match consequences (suspensions) ────────────────────────────────────────
// Injury durations live in src/engine/simulation/injury.ts (already wired).
export const RED_SUSPENSION_WEEKS = 1;
export const YELLOW_SUSPENSION_THRESHOLD = 5; // every 5 yellows in a season ⇒ 1-week ban
export const YELLOW_SUSPENSION_WEEKS = 1;

// ─── Tactics → match outcome ─────────────────────────────────────────────────
// Pressing modifier on attack, centred on medium (pressFactor 0.5).
// high(0.8) ⇒ +3.6% attack, low(0.3) ⇒ -2.4% attack.
export const PRESSING_ATTACK_GAIN = 0.12;
