import { computeChemistryGroups, chemistryDriftBonus, ChemistryMember } from '@/engine/morale/chemistry';
import { SeededRng } from '@/engine/rng';

const make = (id: number, nat: string, age: number, sea: number, mor: number): ChemistryMember =>
  ({ id, nationality: nat, age, seasonsAtClub: sea, morale: mor });

it('elenco vazio → []', () => {
  expect(computeChemistryGroups([], new SeededRng(1))).toEqual([]);
});

it('determinístico: mesma seed → mesmos grupos', () => {
  const squad = [make(1,'BR',24,3,70), make(2,'BR',25,3,72), make(3,'AR',30,1,40), make(4,'IT',31,1,42)];
  const a = computeChemistryGroups(squad, new SeededRng(99));
  const b = computeChemistryGroups(squad, new SeededRng(99));
  expect(a).toEqual(b);
});

it('coesão sobe com nacionalidade/idade compartilhadas', () => {
  const homogeneo = [make(1,'BR',24,3,70), make(2,'BR',24,3,70), make(3,'BR',25,3,70)];
  const heterogeneo = [make(1,'BR',19,0,70), make(2,'AR',34,6,70), make(3,'IT',28,2,70)];
  const ch = computeChemistryGroups(homogeneo, new SeededRng(7));
  const he = computeChemistryGroups(heterogeneo, new SeededRng(7));
  const avg = (gs: {cohesion:number}[]) => gs.reduce((s,g)=>s+g.cohesion,0)/Math.max(1,gs.length);
  expect(avg(ch)).toBeGreaterThan(avg(he));
});

it('chemistryDriftBonus: grupo feliz puxa p/ cima, membro infeliz arrasta', () => {
  const happy = { memberIds: [1,2,3], cohesion: 0.9 };
  const happyMember = make(2,'BR',24,3,78);
  expect(chemistryDriftBonus(happy, happyMember)).toBeGreaterThan(0);
  const sadMember = make(2,'BR',24,3,20);
  expect(chemistryDriftBonus(happy, sadMember)).toBeLessThan(0);
});
