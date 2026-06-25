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
export const REPUTATION_SQUAD_STRONG_BONUS = 3;
export const REPUTATION_SQUAD_GOOD_BONUS = 1;
export const REPUTATION_SQUAD_WEAK_PENALTY = -2;
export const REPUTATION_SQUAD_STRONG_THRESHOLD = 80;
export const REPUTATION_SQUAD_GOOD_THRESHOLD = 70;
export const REPUTATION_SQUAD_WEAK_THRESHOLD = 50;

// Manager (career) reputation deltas — modest, same discipline as the club ones.
// The MANAGER's reputation is career-wide (persists across club switches), distinct
// from a club's reputation. Defaults to 50, clamped [1,100].
export const MANAGER_REP_INITIAL = 50;
export const MANAGER_REP_LEAGUE_TITLE_BONUS = 8;
export const MANAGER_REP_CUP_BONUS = 4;
export const MANAGER_REP_PROMOTION_BONUS = 5;
export const MANAGER_REP_TOP_THIRD_BONUS = 2;
export const MANAGER_REP_RELEGATION_PENALTY = -6;
export const MANAGER_REP_OBJECTIVE_FAILED_PENALTY = -3;
// A rival club won't poach a manager whose reputation is far below the club's level.
export const MANAGER_JOB_OFFER_STEP = 12;
export const MANAGER_JOB_OFFER_MAX = 3;

// C4 manager job market — unemployment spell + contract + ambition weighting.
export const MANAGER_REP_UNEMPLOYED_DECAY = -4;   // reputação perdida por temporada parada
export const MANAGER_REP_FLOOR = 1;               // piso de reputação (clamp)
export const MANAGER_CONTRACT_MIN_SEASONS = 2;
export const MANAGER_CONTRACT_MAX_SEASONS = 4;
export const MANAGER_SAVINGS_INITIAL = 0;
export const MANAGER_UNEMPLOYED_DRAIN = 1;        // poupança drenada por temporada de desemprego
export const MANAGER_SAVINGS_FLOOR = -3;          // poupança terminal → encerra a carreira
export const MANAGER_OFFER_AMBITION_WEIGHT = 0.6; // peso da ambição no sorteio ponderado

export const RETIREMENT_MIN_AGE = 33;
export const RETIREMENT_MAX_AGE = 40;
export const RETIREMENT_MORALE_THRESHOLD = 50;
export const MAX_PLAYER_AGE = 41;
export const RETIREMENT_LOW_MORALE_STREAK_THRESHOLD = 3;
// Offsets em relação ao fim da temporada para a janela de anúncio de aposentadoria.
// Ex.: SEASON_END=46, OPEN_OFFSET=20, CLOSE_OFFSET=10 ⇒ janela semanas 26..36 inclusive.
export const RETIREMENT_ANNOUNCE_WINDOW_OPEN_OFFSET = 20;
export const RETIREMENT_ANNOUNCE_WINDOW_CLOSE_OFFSET = 10;
export const SEASON_END_WEEK = 58;
// First week of the post-league knockout band (cups + CL knockout). Keeps a
// 2-week buffer after the last league week (44) so no club is double-booked.
export const KNOCKOUT_START_WEEK = 47;

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

// Staff hiring (scout/physio/assistant/youth_coach/fitness_coach)
export const STAFF_ROLE_LIMITS: Record<string, number> = {
  scout: 2,
  assistant: 2,
  physio: 1,
  youth_coach: 1,
  fitness_coach: 1,
};
export const STAFF_CANDIDATE_POOL_SIZE = 6;
export const STAFF_ABILITY_MIN = 4;
export const STAFF_ABILITY_MAX = 20;
export const STAFF_WAGE_PER_ABILITY = 250; // wage semanal ≈ ability * 250 (±)

// ─── Match consequences (suspensions) ────────────────────────────────────────
// Injury durations live in src/engine/simulation/injury.ts (already wired).
export const RED_SUSPENSION_WEEKS = 1;
export const YELLOW_SUSPENSION_THRESHOLD = 5; // every 5 yellows in a season ⇒ 1-week ban
export const YELLOW_SUSPENSION_WEEKS = 1;

// ─── Tactics → match outcome ─────────────────────────────────────────────────
// Pressing modifier on attack, centred on medium (pressFactor 0.5).
// high(0.8) ⇒ +3.6% attack, low(0.3) ⇒ -2.4% attack.
export const PRESSING_ATTACK_GAIN = 0.12;

// ─── Morale dynamics (progression-wired) ─────────────────────────────────────
export const MORALE_WIN_BONUS = 3;
export const MORALE_LOSS_PENALTY = -4;
export const MORALE_DRAW_DELTA = 0;
export const MORALE_BENCH_PENALTY = -2;          // per match while benched
export const MORALE_BENCH_STREAK_EXTRA = -0.5;   // additional per consecutive benched week
export const MORALE_HEAVY_DEFEAT_EXTRA = -1;     // applied when conceding by >=3
export const MORALE_DRIFT_TARGET = 50;
export const MORALE_DRIFT_RATE = 0.1;            // fraction of the gap closed per idle week

// ─── C5: Psicologia — personalidade (modula deltas de driver por arquétipo) ────
// Multiplicadores por (arquétipo, "sinal" do driver). 1.0 = neutro. Aplicado sobre
// o delta base; o resultado é clampado em magnitude p/ não explodir a moral.
export const PERSONALITY_BENCH_DAMPEN_LEADER = 0.5;   // líder sofre metade do banco
export const PERSONALITY_WAGE_AMPLIFY_MERCENARY = 1.6; // mercenário liga p/ salário
export const PERSONALITY_CRITICISM_AMPLIFY_TEMPER = 1.5; // temperamental explode com crítica
export const PERSONALITY_NEGATIVE_AMPLIFY_PROBLEM = 1.3; // dressing-room amplia qualquer negativo
export const PERSONALITY_MODIFIER_MAX_MAGNITUDE = 8;   // teto absoluto do delta após modulação

// ─── C5: Psicologia — química de cliques ──────────────────────────────────────
export const CHEMISTRY_MAX_GROUPS = 3;            // até N cliques por elenco
export const CHEMISTRY_AFF_NATIONALITY = 0.4;     // peso de nacionalidade compartilhada
export const CHEMISTRY_AFF_AGE_BAND = 0.3;        // peso de faixa etária próxima (<=3 anos)
export const CHEMISTRY_AFF_TENURE = 0.3;          // peso de tempo de casa próximo
export const CHEMISTRY_DRIFT_HAPPY = 75;          // moral do membro acima disto → grupo puxa p/ cima
export const CHEMISTRY_DRIFT_SAD = 35;            // abaixo disto → grupo arrasta p/ baixo
export const CHEMISTRY_DRIFT_MAX_BONUS = 1.5;     // |bônus| máximo por semana

// ─── C5: Psicologia — conflito / fallout (máquina de estados por jogador) ──────
export const FALLOUT_RISK_ARCHETYPES: readonly string[] = ['temperamental', 'mercenary', 'dressingRoomProblem'];
export const FALLOUT_STREAK_TO_UNSETTLE = 3;        // semanas de moral baixa p/ ficar inquieto
export const FALLOUT_CRITICISMS_TO_WANT_OUT = 2;    // críticas recentes p/ pedir p/ sair
export const FALLOUT_RECOVERY_MORALE = 70;          // moral acima disto regride o estado (histerese)
export const MORALE_EVENTS_KEEP_SEASONS = 2;        // janela do ledger podada no rollover
export const FALLOUT_CRITICISM_LOOKBACK_WEEKS = 8;  // janela p/ contar críticas recentes

// ─── Ordinary (age-based) retirement (progression-wired) ─────────────────────
export const ORDINARY_RETIREMENT_BASE_PROB = 0.05;   // at RETIREMENT_MIN_AGE
export const ORDINARY_RETIREMENT_AGE_SLOPE = 0.07;   // added per year above the min age

// ─── C1 dynasty/legacy ───────────────────────────────────────────────────────
export const LEGENDS_LIMIT = 12;                      // top-N legends materialized per club
