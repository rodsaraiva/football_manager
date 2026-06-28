import { SeededRng } from '@/engine/rng';
import {
  CHEMISTRY_MAX_GROUPS,
  CHEMISTRY_AFF_NATIONALITY,
  CHEMISTRY_AFF_AGE_BAND,
  CHEMISTRY_AFF_TENURE,
  CHEMISTRY_DRIFT_HAPPY,
  CHEMISTRY_DRIFT_SAD,
  CHEMISTRY_DRIFT_MAX_BONUS,
} from '@/engine/balance';

export interface ChemistryMember {
  id: number;
  nationality: string;
  age: number;
  seasonsAtClub: number;
  morale: number;
}

export interface ChemistryGroup {
  memberIds: number[];
  cohesion: number; // 0..1
}

function affinity(a: ChemistryMember, b: ChemistryMember): number {
  let aff = 0;
  if (a.nationality === b.nationality) aff += CHEMISTRY_AFF_NATIONALITY;
  if (Math.abs(a.age - b.age) <= 3) aff += CHEMISTRY_AFF_AGE_BAND;
  if (Math.abs(a.seasonsAtClub - b.seasonsAtClub) <= 1) aff += CHEMISTRY_AFF_TENURE;
  return aff; // 0..1
}

/**
 * Pure & deterministic (rng seedado): particiona o elenco em até CHEMISTRY_MAX_GROUPS
 * cliques. Seed embaralha a ordem de seeds dos grupos; a atribuição é greedy por afinidade
 * média ao grupo. Cohesion = afinidade média intragrupo.
 */
export function computeChemistryGroups(members: readonly ChemistryMember[], rng: SeededRng): ChemistryGroup[] {
  if (members.length === 0) return [];
  const order = rng.shuffle([...members]);
  const groupCount = Math.max(1, Math.min(CHEMISTRY_MAX_GROUPS, Math.ceil(order.length / 6)));
  const buckets: ChemistryMember[][] = Array.from({ length: groupCount }, () => []);
  for (const m of order) {
    // escolhe o bucket com maior afinidade média (vazio = 0); empate → menor índice (determinístico)
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const score = b.length === 0 ? 0 : b.reduce((s, x) => s + affinity(m, x), 0) / b.length;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    buckets[best].push(m);
  }
  return buckets
    .filter((b) => b.length > 0)
    .map((b) => {
      let pairs = 0;
      let sum = 0;
      for (let i = 0; i < b.length; i++) {
        for (let j = i + 1; j < b.length; j++) { sum += affinity(b[i], b[j]); pairs++; }
      }
      const cohesion = pairs === 0 ? 0.5 : sum / pairs; // solo group = neutral cohesion
      return { memberIds: b.map((x) => x.id).sort((a, c) => a - c), cohesion };
    });
}

/** Pure: bônus/penalidade de drift que o grupo aplica ao membro nesta semana. */
export function chemistryDriftBonus(group: ChemistryGroup, member: ChemistryMember): number {
  let raw = 0;
  if (member.morale >= CHEMISTRY_DRIFT_HAPPY) raw = group.cohesion * CHEMISTRY_DRIFT_MAX_BONUS;
  else if (member.morale <= CHEMISTRY_DRIFT_SAD) raw = -group.cohesion * CHEMISTRY_DRIFT_MAX_BONUS;
  return Math.max(-CHEMISTRY_DRIFT_MAX_BONUS, Math.min(CHEMISTRY_DRIFT_MAX_BONUS, raw));
}
