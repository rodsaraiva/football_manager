import {
  shouldAnnounceRetirement,
  detectCompulsoryRetirements,
  isInAnnounceWindow,
  nextMoraleStreak,
} from '@/engine/retirement/retirement-engine';
import {
  RETIREMENT_LOW_MORALE_STREAK_THRESHOLD,
  RETIREMENT_ANNOUNCE_WINDOW_OPEN_OFFSET,
  RETIREMENT_ANNOUNCE_WINDOW_CLOSE_OFFSET,
  RETIREMENT_MORALE_THRESHOLD,
  SEASON_END_WEEK,
} from '@/engine/balance';

describe('isInAnnounceWindow', () => {
  it('retorna true para semanas dentro da janela', () => {
    // SEASON_END=46, OPEN_OFFSET=20, CLOSE_OFFSET=10 ⇒ janela [26..36]
    expect(isInAnnounceWindow(26)).toBe(true);
    expect(isInAnnounceWindow(30)).toBe(true);
    expect(isInAnnounceWindow(36)).toBe(true);
  });

  it('retorna false antes da janela', () => {
    expect(isInAnnounceWindow(10)).toBe(false);
    expect(isInAnnounceWindow(25)).toBe(false);
  });

  it('retorna false depois da janela', () => {
    expect(isInAnnounceWindow(37)).toBe(false);
    expect(isInAnnounceWindow(46)).toBe(false);
  });

  it('limites derivados das constantes', () => {
    const start = SEASON_END_WEEK - RETIREMENT_ANNOUNCE_WINDOW_OPEN_OFFSET;
    const end = SEASON_END_WEEK - RETIREMENT_ANNOUNCE_WINDOW_CLOSE_OFFSET;
    expect(isInAnnounceWindow(start)).toBe(true);
    expect(isInAnnounceWindow(end)).toBe(true);
    expect(isInAnnounceWindow(start - 1)).toBe(false);
    expect(isInAnnounceWindow(end + 1)).toBe(false);
  });
});

describe('shouldAnnounceRetirement', () => {
  const baseInput = {
    age: 35,
    streak: RETIREMENT_LOW_MORALE_STREAK_THRESHOLD,
    currentWeek: 30,
    alreadyAnnounced: false,
  };

  it('dispara: idade dentro da janela, streak ≥ threshold, semana na janela, não anunciado', () => {
    expect(shouldAnnounceRetirement(baseInput)).toBe(true);
  });

  it('não dispara se já anunciado', () => {
    expect(shouldAnnounceRetirement({ ...baseInput, alreadyAnnounced: true })).toBe(false);
  });

  it('não dispara com streak abaixo do threshold', () => {
    expect(
      shouldAnnounceRetirement({ ...baseInput, streak: RETIREMENT_LOW_MORALE_STREAK_THRESHOLD - 1 }),
    ).toBe(false);
  });

  it('não dispara fora da janela (antes)', () => {
    expect(shouldAnnounceRetirement({ ...baseInput, currentWeek: 20 })).toBe(false);
  });

  it('não dispara fora da janela (depois)', () => {
    expect(shouldAnnounceRetirement({ ...baseInput, currentWeek: 40 })).toBe(false);
  });

  it('não dispara com idade abaixo do mínimo', () => {
    expect(shouldAnnounceRetirement({ ...baseInput, age: 32 })).toBe(false);
  });

  it('não dispara com idade acima do máximo low_morale (41+)', () => {
    expect(shouldAnnounceRetirement({ ...baseInput, age: 41 })).toBe(false);
  });
});

describe('nextMoraleStreak', () => {
  const low = RETIREMENT_MORALE_THRESHOLD - 1;
  const high = RETIREMENT_MORALE_THRESHOLD;

  it('incrementa em semana com morale baixo', () => {
    expect(nextMoraleStreak(0, low)).toBe(1);
    expect(nextMoraleStreak(1, low)).toBe(2);
    expect(nextMoraleStreak(2, low)).toBe(3);
  });

  it('zera em semana com morale alto', () => {
    expect(nextMoraleStreak(5, high)).toBe(0);
    expect(nextMoraleStreak(5, high + 30)).toBe(0);
  });

  it('morale = threshold não conta como baixo (comparação estrita)', () => {
    expect(nextMoraleStreak(3, RETIREMENT_MORALE_THRESHOLD)).toBe(0);
  });

  it('sequência baixa-baixa-alta-baixa-baixa: streak reseta no alto e recomeça', () => {
    let s = 0;
    s = nextMoraleStreak(s, low);
    expect(s).toBe(1);
    s = nextMoraleStreak(s, low);
    expect(s).toBe(2);
    s = nextMoraleStreak(s, high);
    expect(s).toBe(0);
    s = nextMoraleStreak(s, low);
    expect(s).toBe(1);
    s = nextMoraleStreak(s, low);
    expect(s).toBe(2);
  });

  it('sequência baixa x3 atinge threshold, x4 continua acumulando', () => {
    let s = 0;
    for (let i = 0; i < 3; i++) s = nextMoraleStreak(s, low);
    expect(s).toBe(RETIREMENT_LOW_MORALE_STREAK_THRESHOLD);
    s = nextMoraleStreak(s, low);
    expect(s).toBe(4);
  });
});

describe('detectCompulsoryRetirements', () => {
  it('retorna jogadores com age ≥ MAX_PLAYER_AGE', () => {
    const players = [
      { id: 1, name: 'A', age: 41, isFreeAgent: false },
      { id: 2, name: 'B', age: 42, isFreeAgent: false },
      { id: 3, name: 'C', age: 40, isFreeAgent: false },
    ];
    const result = detectCompulsoryRetirements(players);
    expect(result.map((r) => r.playerId).sort()).toEqual([1, 2]);
    expect(result.every((r) => r.reason === 'max_age')).toBe(true);
  });

  it('ignora free agents', () => {
    const players = [
      { id: 1, name: 'A', age: 45, isFreeAgent: true },
    ];
    expect(detectCompulsoryRetirements(players)).toHaveLength(0);
  });
});
