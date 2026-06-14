import { SeededRng } from '@/engine/rng';
import {
  STAFF_CANDIDATE_POOL_SIZE,
  STAFF_ABILITY_MIN,
  STAFF_ABILITY_MAX,
  STAFF_WAGE_PER_ABILITY,
} from '@/engine/balance';
import { StaffCandidate, StaffRole } from '@/types/staff';

const STAFF_NAMES = [
  'Adriano Costa', 'Bernard Lowe', 'Cesar Aguilar', 'Dieter Hahn', 'Elias Roth',
  'Fernando Cruz', 'Gunnar Holm', 'Hugo Salas', 'Igor Volkov', 'Joaquim Pinto',
  'Klaus Werner', 'Leandro Dias', 'Mateus Rocha', 'Niels Jansen', 'Otto Brandt',
  'Pedro Vargas', 'Renaud Petit', 'Sergei Orlov', 'Tomas Lindqvist', 'Ugo Marino',
  'Vicente Soto', 'Willem Bakker', 'Yannick Dubois', 'Zé Carvalho',
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function generateStaffCandidates(
  role: StaffRole,
  clubReputation: number,
  rng: SeededRng,
): StaffCandidate[] {
  const reputationBonus = Math.round((clubReputation - 50) / 12);
  // Amostragem SEM reposição (shuffle + slice) → nunca gera nomes duplicados no pool.
  const names = rng.shuffle([...STAFF_NAMES]).slice(0, STAFF_CANDIDATE_POOL_SIZE);

  return names.map((name) => {
    const base = rng.nextInt(STAFF_ABILITY_MIN, STAFF_ABILITY_MAX);
    const ability = clamp(base + reputationBonus, 1, 20);
    return { name, role, ability, wage: ability * STAFF_WAGE_PER_ABILITY };
  });
}

export interface CanHireStaffInput {
  budget: number;
  wageBudget: number;
  candidateWage: number;
  currentCountForRole: number;
  maxSlots: number;
}

export interface CanHireStaffResult {
  ok: boolean;
  reason?: 'budget' | 'wage_budget' | 'slots';
}

export function canHireStaff(input: CanHireStaffInput): CanHireStaffResult {
  if (input.currentCountForRole >= input.maxSlots) return { ok: false, reason: 'slots' };
  if (input.candidateWage > input.wageBudget) return { ok: false, reason: 'wage_budget' };
  if (input.candidateWage > input.budget) return { ok: false, reason: 'budget' };
  return { ok: true };
}
