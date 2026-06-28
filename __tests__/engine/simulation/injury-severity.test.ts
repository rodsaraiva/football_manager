import { classifyInjury, returnFitnessForSeverity, injuryRecoveryStep, assignMatchInjuries } from '@/engine/simulation/injury';
import { SeededRng } from '@/engine/rng';
import { MatchEvent } from '@/types';

it('classifica por duração: <=2 knock, 3-5 moderate, >=6 serious', () => {
  expect(classifyInjury(1)).toBe('knock');
  expect(classifyInjury(2)).toBe('knock');
  expect(classifyInjury(3)).toBe('moderate');
  expect(classifyInjury(5)).toBe('moderate');
  expect(classifyInjury(6)).toBe('serious');
  expect(classifyInjury(8)).toBe('serious');
});

it('cap de retorno cai com a gravidade (mais grave volta pior)', () => {
  expect(returnFitnessForSeverity('knock')).toBeGreaterThan(returnFitnessForSeverity('moderate'));
  expect(returnFitnessForSeverity('moderate')).toBeGreaterThan(returnFitnessForSeverity('serious'));
  expect(returnFitnessForSeverity('serious')).toBeGreaterThanOrEqual(60);
});

it('physio acelera a recuperação; physio 0 = decremento 1/semana (legado)', () => {
  expect(injuryRecoveryStep(4, 0)).toBe(3);
  expect(injuryRecoveryStep(4, 20)).toBeLessThan(3);
  expect(injuryRecoveryStep(0, 20)).toBe(0);
  expect(injuryRecoveryStep(1, 20)).toBeGreaterThanOrEqual(0);
});

it('assignMatchInjuries devolve severity + returnFitnessCap', () => {
  const ev: MatchEvent[] = [{ fixtureId: 1, minute: 5, type: 'injury', playerId: 1, secondaryPlayerId: null }];
  const [a] = assignMatchInjuries(ev, new Set([1]), new SeededRng(2));
  expect(a.severity).toBe(classifyInjury(a.weeksLeft));
  expect(a.returnFitnessCap).toBe(returnFitnessForSeverity(a.severity));
});
