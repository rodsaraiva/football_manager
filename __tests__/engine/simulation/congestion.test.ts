import { computeCongestion } from '@/engine/simulation/congestion';

it('1 jogo na janela: sem regressão (mult=1, drop=base)', () => {
  expect(computeCongestion({ gamesInWindow: 1, baseFitnessDrop: 10 })).toEqual({ fitnessDrop: 10, injuryRiskMult: 1 });
});

it('0 jogos === 1 jogo (não quebra determinismo do caminho legado)', () => {
  expect(computeCongestion({ gamesInWindow: 0, baseFitnessDrop: 10 }))
    .toEqual(computeCongestion({ gamesInWindow: 1, baseFitnessDrop: 10 }));
});

it('pile-up monotônico: mais jogos → mais drop e mais risco', () => {
  const a = computeCongestion({ gamesInWindow: 1, baseFitnessDrop: 10 });
  const b = computeCongestion({ gamesInWindow: 3, baseFitnessDrop: 10 });
  const c = computeCongestion({ gamesInWindow: 5, baseFitnessDrop: 10 });
  expect(b.fitnessDrop).toBeGreaterThan(a.fitnessDrop);
  expect(c.fitnessDrop).toBeGreaterThan(b.fitnessDrop);
  expect(b.injuryRiskMult).toBeGreaterThan(1);
  expect(c.injuryRiskMult).toBeGreaterThan(b.injuryRiskMult);
});
