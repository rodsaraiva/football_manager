export type AssistantRole = 'squad' | 'financial' | 'youth';

export type AssistantArchetype =
  | 'old_school'
  | 'analytics'
  | 'motivator'
  | 'tactician'
  | 'developer'
  | 'pragmatic';

export interface Assistant {
  id: number;
  clubId: number;
  saveId: number;
  role: AssistantRole;
  name: string;
  age: number;
  archetype: AssistantArchetype;
  seasonsAtClub: number;
  retirementAge: number;
  wagePerMonth: number;
  willRetireNextSeason: boolean;
}

export interface AssistantWithQuality extends Assistant {
  qualityStars: number; // 1-5, derived from seasonsAtClub
}

export interface AssistantCandidate {
  name: string;
  age: number;
  archetype: AssistantArchetype;
  role: AssistantRole;
  qualityStars: number;
  wagePerMonth: number;
  reputationRequired: number;
}

export interface AssistantComment {
  assistantId: number;
  assistantName: string;
  archetype: AssistantArchetype;
  role: AssistantRole;
  comment: import('@/i18n/translate').TextDescriptor;
}
