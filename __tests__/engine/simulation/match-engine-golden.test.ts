/**
 * GOLDEN MASTER de determinismo do match engine (gate L3/EH-5).
 *
 * Trava o comportamento ATUAL de simulateMatch (e portanto do runBlock, que ele
 * consome 2×/bloco) ANTES da decomposição planejada em
 * docs/superpowers/plans/2026-06-27-l3-eh5-runblock.md.
 *
 * Os literais GOLDEN abaixo foram CAPTURADOS rodando o código atual (não é
 * self-compare "roda 2×"). Qualquer reordenação/adição/remoção de chamada de rng
 * dentro de runBlock altera a stream determinística e quebra este teste — sinal de
 * que a extração não foi byte-equivalente.
 *
 * Engine puro: zero DB, zero React.
 */
import { simulateMatch, MatchInput, MatchResult } from '@/engine/simulation/match-engine';
import { PlayerAttributes, Position } from '@/types';
import { Tactic } from '@/types/tactic';
import { SeededRng } from '@/engine/rng';

const makeAttrs = (base: number): PlayerAttributes => ({
  finishing: base, passing: base, crossing: base, dribbling: base,
  heading: base, longShots: base, freeKicks: base,
  vision: base, composure: base, decisions: base,
  positioning: base, aggression: base, leadership: base,
  pace: base, stamina: base, strength: base, agility: base, jumping: base,
});

const makeSquad = (overall: number) => Array.from({ length: 11 }, (_, i) => ({
  id: i + 1,
  position: (['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'LM', 'RM', 'ST', 'ST'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall),
  morale: 70,
  fitness: 90,
}));

const defaultTactic: Tactic = {
  id: 1, clubId: 1, name: 'Default', isActive: true,
  formation: '4-4-2', mentality: 'balanced', pressing: 'medium',
  passingStyle: 'mixed', tempo: 'normal', width: 'normal',
  attackFocus: 'balanced', subStrategy: 'balanced',
};

const makeBench = (overall: number, idOffset: number) => Array.from({ length: 5 }, (_, i) => ({
  id: idOffset + i,
  position: (['CM', 'ST', 'LW', 'CB', 'GK'] as Position[])[i],
  secondaryPosition: null as Position | null,
  attributes: makeAttrs(overall),
  morale: 70,
  fitness: 95,
}));

function makeInput(seed: number): MatchInput {
  return {
    fixtureId: 1,
    homeSquad: makeSquad(72),
    awaySquad: makeSquad(68).map((p, i) => ({ ...p, id: i + 100 })),
    homeBench: makeBench(72, 200),
    awayBench: makeBench(68, 300),
    homeTactic: defaultTactic,
    awayTactic: { ...defaultTactic, id: 2, clubId: 2 },
    homeClubReputation: 80,
    awayClubReputation: 80,
    rng: new SeededRng(seed),
  };
}

/**
 * Digest determinístico e ORDER-STABLE do MatchResult. Preserva a ordem de
 * GERAÇÃO dos events (não ordena por minuto) — é exatamente essa ordem que reflete
 * a ordem de consumo do rng. Inclui placar, attendance, stats agregados e ratings.
 */
function digest(result: MatchResult): string {
  const evs = result.events
    .map(e => `${e.minute}|${e.type}|${e.playerId}|${e.secondaryPlayerId ?? 'x'}`)
    .join(',');
  const ratings = [...result.homeRatings, ...result.awayRatings]
    .map(x => `${x.playerId}:${x.rating}`)
    .join(',');
  const s = result.stats;
  const stats = [
    s.homePossession, s.awayPossession,
    s.homeShots, s.awayShots,
    s.homeShotsOnTarget, s.awayShotsOnTarget,
    s.homeFouls, s.awayFouls,
    s.homeCorners, s.awayCorners,
    s.homeXG, s.awayXG,
  ].join('/');
  return `SCORE=${result.homeGoals}-${result.awayGoals};ATT=${result.attendance};STATS=${stats};EVENTS=[${evs}];RATINGS=[${ratings}]`;
}

// Literais GOLDEN capturados contra o código atual (pré-decomposição do runBlock).
const GOLDEN: Record<number, string> = {
  42: 'SCORE=1-0;ATT=42505;STATS=49/51/3/6/3/2/6/5/0/0/0.67/1.77;EVENTS=[23|shot_off_target|109|x,37|goal|3|x,68|save|1|100,68|shot_on_target|100|x,72|substitution|5|200,76|save|1|110,76|shot_on_target|110|x,81|substitution|4|201,84|substitution|1|204];RATINGS=[1:7.4,2:7.4,3:8.4,4:7.1,5:7.2,6:6.8,7:7.1,8:6.9,9:7.1,10:7.3,11:6.9,100:6.8,101:6.7,102:6.2,103:6.7,104:6.8,105:6.3,106:6.6,107:6.9,108:6.5,109:6.4,110:6.9]',
  99: 'SCORE=3-0;ATT=44571;STATS=48/52/6/3/4/2/3/2/1/0/1.9/0.62;EVENTS=[3|penalty_scored|1|x,2|save|1|104,2|shot_on_target|104|x,15|goal|10|x,40|shot_off_target|9|x,55|substitution|104|300,61|substitution|110|301,63|substitution|8|200,65|substitution|107|302,70|substitution|100|304,87|goal|1|x];RATINGS=[1:8.6,2:7.4,3:7.4,4:7.7,5:7.5,6:6.8,7:6.8,8:7.1,9:7.2,10:7.8,11:7,100:6.8,101:6.7,102:6.8,103:6.6,104:6.6,105:6.8,106:6.7,107:6.8,108:6.2,109:6.5,110:6.6]',
  2024: 'SCORE=0-2;ATT=45027;STATS=46/54/4/5/1/4/3/4/0/0/1.95/1.13;EVENTS=[7|save|1|104,7|shot_on_target|104|x,21|shot_off_target|2|x,24|goal|100|x,24|assist|103|100,40|yellow|106|x,53|shot_off_target|10|x,55|substitution|100|304,56|shot_off_target|11|x,61|substitution|102|303,72|goal|303|x,72|assist|104|303,81|substitution|106|300,85|substitution|101|301];RATINGS=[1:6.7,2:6.4,3:6.7,4:6.7,5:6.4,6:6.8,7:6.6,8:6.4,9:6.9,10:6.6,11:6.5,100:8.3,101:7.6,102:7,103:7.8,104:7.7,105:7.1,106:6.6,107:6.5,108:6.7,109:6.9,110:7.1]',
};

describe('match-engine golden master (gate de decomposição do runBlock)', () => {
  for (const seed of [42, 99, 2024]) {
    it(`seed ${seed}: digest do MatchResult bate com o golden capturado`, () => {
      const result = simulateMatch(makeInput(seed));
      expect(digest(result)).toBe(GOLDEN[seed]);
    });
  }

  it('mesma seed = mesmo MatchResult (sanity de determinismo)', () => {
    for (const seed of [42, 99, 2024]) {
      const a = simulateMatch(makeInput(seed));
      const b = simulateMatch(makeInput(seed));
      expect(a).toEqual(b);
    }
  });
});
