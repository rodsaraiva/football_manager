import { generateRetirementNews } from '@/engine/news/news-generator';
import type { RetirementDecision } from '@/engine/retirement/retirement-engine';

describe('generateRetirementNews', () => {
  it('retorna 1 NewsItem com id contendo o playerId quando 1 jogador aposentado', () => {
    const decision: RetirementDecision = {
      playerId: 42,
      playerName: 'João Silva',
      age: 38,
      reason: 'max_age',
    };
    const playerNames = new Map([[42, 'João Silva']]);

    const result = generateRetirementNews([decision], playerNames, 'retired');

    expect(result).toHaveLength(1);
    expect(result[0].id).toContain('42');
    expect(result[0].category).toBe('retirement');
    expect(result[0].title.key).toBe('news.retire_retired_title');
    expect(result[0].title.vars).toEqual({ name: 'João Silva' });
  });

  it('retorna NewsItem para cada jogador aposentado (batch)', () => {
    const decisions: RetirementDecision[] = [
      { playerId: 1, playerName: 'A', age: 40, reason: 'max_age' },
      { playerId: 2, playerName: 'B', age: 36, reason: 'low_morale' },
    ];
    const names = new Map([[1, 'A'], [2, 'B']]);

    const result = generateRetirementNews(decisions, names, 'retired');

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toContain('retirement-retired-1');
    expect(result.map((r) => r.id)).toContain('retirement-retired-2');
  });

  it('lista vazia retorna array vazio', () => {
    expect(generateRetirementNews([], new Map(), 'retired')).toHaveLength(0);
  });
});
