import { assignMatchInjuries } from '@/engine/simulation/injury';
import { SeededRng } from '@/engine/rng';
import { MatchEvent } from '@/types';

const inj = (playerId: number): MatchEvent => ({ fixtureId: 1, minute: 10, type: 'injury', playerId, secondaryPlayerId: null });

it('mult=1 mantém todas as lesões (sem regressão)', () => {
  const ev = [inj(1), inj(2)];
  const r = assignMatchInjuries(ev, new Set([1, 2]), new SeededRng(3), 1);
  expect(r.map((a) => a.playerId).sort()).toEqual([1, 2]);
});

it('mult alto nunca remove lesões (só pode escalar gravidade)', () => {
  const ev = [inj(1)];
  const r = assignMatchInjuries(ev, new Set([1]), new SeededRng(3), 3);
  expect(r.length).toBeGreaterThanOrEqual(1);
});

it('determinístico p/ uma dada seed e mult', () => {
  const a = assignMatchInjuries([inj(1), inj(2)], new Set([1, 2]), new SeededRng(9), 2);
  const b = assignMatchInjuries([inj(1), inj(2)], new Set([1, 2]), new SeededRng(9), 2);
  expect(a).toEqual(b);
});

it('mult=1 não consome roll extra: stream igual ao legado (1 roll por lesão)', () => {
  const a = assignMatchInjuries([inj(1)], new Set([1]), new SeededRng(5), 1);
  const b = assignMatchInjuries([inj(1)], new Set([1]), new SeededRng(5));
  expect(a).toEqual(b);
});
