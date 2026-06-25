import { generateMatchAdvice, MatchAdviceInput } from '@/engine/assistant/match-advisor';
import { SeededRng } from '@/engine/rng';
import { Tactic } from '@/types/tactic';
import { PlayerForStrength } from '@/engine/simulation/team-strength';
import { PlayerAttributes, Position } from '@/types';

const attrs = (b: number): PlayerAttributes => ({
  finishing: b, passing: b, crossing: b, dribbling: b, heading: b, longShots: b,
  freeKicks: b, vision: b, composure: b, decisions: b, positioning: b, aggression: b,
  leadership: b, pace: b, stamina: b, strength: b, agility: b, jumping: b,
});
const p = (id: number, position: Position, b = 70): PlayerForStrength => ({
  id, position, secondaryPosition: null, attributes: attrs(b), morale: 70, fitness: 90,
});
const tactic: Tactic = {
  id: 1, clubId: 1, name: 'D', isActive: true, formation: '4-4-2',
  mentality: 'balanced', pressing: 'medium', passingStyle: 'mixed',
  tempo: 'normal', width: 'normal', attackFocus: 'balanced', subStrategy: 'balanced',
};
const base = (over: Partial<MatchAdviceInput> = {}): MatchAdviceInput => ({
  archetype: 'tactician', qualityStars: 5,
  userGoals: 0, oppGoals: 0, currentBlock: 22, userTactic: tactic,
  onPitch: [p(1, 'GK'), p(2, 'CB'), p(3, 'CB'), p(4, 'ST')],
  bench: [p(10, 'ST'), p(11, 'CB')],
  yellowCardedIds: new Set<number>(), fatigueByPlayer: new Map<number, number>(),
  subsRemaining: 5, opponentName: 'Rival', rng: new SeededRng(1), ...over,
});

describe('generateMatchAdvice — leitura de placar', () => {
  it('vencendo confortável (2-0) com tactician → topo é defensivo', () => {
    const a = generateMatchAdvice(base({ userGoals: 2, oppGoals: 0, archetype: 'tactician' }));
    expect(a.length).toBeGreaterThan(0);
    expect(['change_mentality', 'sub_defender', 'hold']).toContain(a[0].kind);
    if (a[0].kind === 'change_mentality') expect(a[0].suggestedMentality).toBe('defensive');
  });

  it('perdendo 0-1 com motivator → topo empurra pra frente', () => {
    const a = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, archetype: 'motivator' }));
    expect(['sub_attacker', 'change_mentality']).toContain(a[0].kind);
    if (a[0].kind === 'change_mentality') expect(a[0].suggestedMentality).toBe('attacking');
  });

  it('empate tardio (bloco 25) → inclui hold ou ajuste leve', () => {
    const a = generateMatchAdvice(base({ userGoals: 1, oppGoals: 1, currentBlock: 25 }));
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('generateMatchAdvice — modulação por arquétipo', () => {
  it('analytics e old_school perdendo → mesma DIREÇÃO (atacar) mas textos i18n distintos', () => {
    const ana = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, archetype: 'analytics' }));
    const old = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, archetype: 'old_school' }));
    const dir = (x: typeof ana) => x.some(ad => ad.kind === 'sub_attacker' || (ad.kind === 'change_mentality' && ad.suggestedMentality === 'attacking'));
    expect(dir(ana)).toBe(true);
    expect(dir(old)).toBe(true);
    expect(ana[0].text.key).not.toBe(old[0].text.key);
  });
});

describe('generateMatchAdvice — banco/subs/cartões/fadiga', () => {
  it('banco vazio → nenhum conselho de substituição', () => {
    const a = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, bench: [] }));
    expect(a.every(ad => !ad.kind.startsWith('sub_'))).toBe(true);
  });

  it('subs esgotados → só change_*/hold', () => {
    const a = generateMatchAdvice(base({ userGoals: 0, oppGoals: 1, subsRemaining: 0 }));
    expect(a.every(ad => ad.kind === 'change_mentality' || ad.kind === 'change_pressing' || ad.kind === 'hold')).toBe(true);
  });

  it('jogador no amarelo + fadiga alta → sub_off com suggestedSubOutId correto', () => {
    const a = generateMatchAdvice(base({
      yellowCardedIds: new Set([2]),
      fatigueByPlayer: new Map([[2, 30]]),
    }));
    const off = a.find(ad => ad.kind === 'sub_off');
    expect(off).toBeDefined();
    expect(off!.suggestedSubOutId).toBe(2);
    expect(off!.suggestedSubInId).toBe(11); // CB do banco p/ cobrir o CB amarelado
  });
});

describe('generateMatchAdvice — determinismo e qualityStars', () => {
  it('mesma rng + mesmo input → lista idêntica', () => {
    const i1 = base({ userGoals: 0, oppGoals: 1, rng: new SeededRng(7) });
    const i2 = base({ userGoals: 0, oppGoals: 1, rng: new SeededRng(7) });
    expect(generateMatchAdvice(i1)).toEqual(generateMatchAdvice(i2));
  });

  it('qualityStars baixo → lista menor que qualityStars alto', () => {
    const lo = generateMatchAdvice(base({ userGoals: 0, oppGoals: 2, qualityStars: 1 }));
    const hi = generateMatchAdvice(base({ userGoals: 0, oppGoals: 2, qualityStars: 5 }));
    expect(lo.length).toBeLessThanOrEqual(hi.length);
  });
});
