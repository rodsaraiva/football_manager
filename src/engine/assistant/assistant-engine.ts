import { SeededRng } from '@/engine/rng';
import {
  ASSISTANT_RETIREMENT_MIN_AGE,
  ASSISTANT_RETIREMENT_MAX_AGE,
  ASSISTANT_AGE_MIN,
  ASSISTANT_AGE_MAX,
  ASSISTANT_WAGE_MIN,
  ASSISTANT_WAGE_MAX,
  ASSISTANT_QUALITY_THRESHOLDS,
  ASSISTANT_CANDIDATE_POOL_SIZE,
} from '@/engine/balance';
import {
  Assistant,
  AssistantArchetype,
  AssistantCandidate,
  AssistantRole,
} from '@/types/assistant';

export const ALL_ARCHETYPES: AssistantArchetype[] = [
  'old_school', 'analytics', 'motivator', 'tactician', 'developer', 'pragmatic',
];

export const ARCHETYPE_POOL_BY_ROLE: Record<AssistantRole, AssistantArchetype[]> = {
  squad:     ['old_school', 'tactician'],
  financial: ['pragmatic', 'analytics'],
  youth:     ['developer', 'motivator'],
};

const ASSISTANT_NAMES = [
  'Alan Bright', 'Carlos Mendes', 'David Walsh', 'Eduardo Lima', 'Frank Osei',
  'George Santos', 'Henri Moreau', 'Ivan Kowalski', 'James Archer', 'Kevin Okafor',
  'Lucas Ferreira', 'Marco Ricci', 'Nathan Burke', 'Oliver Strand', 'Paolo Conti',
  'Quentin Hall', 'Rafael Sousa', 'Stefan Müller', 'Thomas Reed', 'Ulrich Bauer',
  'Victor Pereira', 'Walter Diaz', 'Xavier Nunes', 'Yusuf Adeola', 'Zoran Petric',
  'Bruno Tavares', 'Derek Finn', 'Emil Novak', 'Fabio Greco', 'Greg Sutton',
];

export function computeQualityStars(seasonsAtClub: number): number {
  let stars = 1;
  for (let i = 1; i < ASSISTANT_QUALITY_THRESHOLDS.length; i++) {
    if (seasonsAtClub >= ASSISTANT_QUALITY_THRESHOLDS[i]) stars = i + 1;
  }
  return stars;
}

export interface GenerateAssistantInput {
  role: AssistantRole;
  clubId: number;
  saveId: number;
  rng: SeededRng;
}

export interface GeneratedAssistant {
  role: AssistantRole;
  clubId: number;
  saveId: number;
  name: string;
  age: number;
  archetype: AssistantArchetype;
  seasonsAtClub: number;
  retirementAge: number;
  wagePerMonth: number;
  willRetireNextSeason: boolean;
}

export function generateAssistant(input: GenerateAssistantInput): GeneratedAssistant {
  const { role, clubId, saveId, rng } = input;
  const name = ASSISTANT_NAMES[rng.nextInt(0, ASSISTANT_NAMES.length - 1)];
  const age = rng.nextInt(ASSISTANT_AGE_MIN, ASSISTANT_AGE_MAX);
  const retirementAge = rng.nextInt(ASSISTANT_RETIREMENT_MIN_AGE, ASSISTANT_RETIREMENT_MAX_AGE);
  const archetypePool = ARCHETYPE_POOL_BY_ROLE[role];
  const archetype = archetypePool[rng.nextInt(0, archetypePool.length - 1)];
  const wagePerMonth = Math.round(rng.nextInt(ASSISTANT_WAGE_MIN, ASSISTANT_WAGE_MAX) / 500) * 500;

  return {
    role, clubId, saveId, name, age, archetype,
    seasonsAtClub: 0,
    retirementAge,
    wagePerMonth,
    willRetireNextSeason: false,
  };
}

export interface SeasonEndAssistantResult {
  assistantId: number;
  newAge: number;
  newSeasonsAtClub: number;
  newQualityStars: number;
  willRetireNextSeason: boolean;
  retired: boolean;
}

export function processAssistantSeasonEnd(assistant: Assistant): SeasonEndAssistantResult {
  const newAge = assistant.age + 1;
  const newSeasonsAtClub = assistant.seasonsAtClub + 1;
  const retired = newAge > assistant.retirementAge;
  const willRetireNextSeason = !retired && newAge === assistant.retirementAge;

  return {
    assistantId: assistant.id,
    newAge,
    newSeasonsAtClub,
    newQualityStars: computeQualityStars(newSeasonsAtClub),
    willRetireNextSeason,
    retired,
  };
}

export interface GenerateCandidatesInput {
  role: AssistantRole;
  saveId: number;
  season: number;
  rng: SeededRng;
}

export function generateCandidates(input: GenerateCandidatesInput): AssistantCandidate[] {
  const { role, rng } = input;
  const candidates: AssistantCandidate[] = [];

  for (let i = 0; i < ASSISTANT_CANDIDATE_POOL_SIZE; i++) {
    const name = ASSISTANT_NAMES[rng.nextInt(0, ASSISTANT_NAMES.length - 1)];
    const age = rng.nextInt(30, 58);
    const archetype = ALL_ARCHETYPES[rng.nextInt(0, ALL_ARCHETYPES.length - 1)];
    const wagePerMonth = Math.round(rng.nextInt(ASSISTANT_WAGE_MIN, ASSISTANT_WAGE_MAX) / 500) * 500;
    const reputationRequired = rng.nextInt(20, 75);

    candidates.push({
      name, age, archetype, role,
      qualityStars: 1,
      wagePerMonth,
      reputationRequired,
    });
  }

  return candidates;
}

export interface CandidateAcceptanceInput {
  candidate: AssistantCandidate;
  clubReputation: number;
  offeredWage: number;
}

export function candidateWillAccept(input: CandidateAcceptanceInput): boolean {
  return input.clubReputation >= input.candidate.reputationRequired;
}
