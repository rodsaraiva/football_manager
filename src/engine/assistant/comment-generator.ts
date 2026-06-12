import { SeededRng } from '@/engine/rng';
import { AssistantArchetype, AssistantComment, AssistantRole, AssistantWithQuality } from '@/types/assistant';
import { ASSISTANT_COMMENT_CHANCE_PER_WEEK } from '@/engine/balance';
import { TextDescriptor } from '@/i18n/translate';

export interface CommentContext {
  leaguePosition: number | null;
  totalTeams: number;
  week: number;
  season: number;
  budgetBalance: number;
  squadAvgAge: number;
  topYouthPotential: number | null;
}

type CommentTemplate = (ctx: CommentContext) => TextDescriptor;

const SQUAD_TEMPLATES: Record<AssistantArchetype, CommentTemplate[]> = {
  old_school: [
    (ctx) => ctx.leaguePosition && ctx.leaguePosition <= 5
      ? { key: 'assistant.squad.old_school.0_a' }
      : { key: 'assistant.squad.old_school.0_b' },
    (ctx) => ({ key: 'assistant.squad.old_school.1', vars: { week: ctx.week } }),
    () => ({ key: 'assistant.squad.old_school.2' }),
  ],
  analytics: [
    (ctx) => ctx.leaguePosition
      ? {
          key: ctx.leaguePosition <= ctx.totalTeams / 2 ? 'assistant.squad.analytics.0_above' : 'assistant.squad.analytics.0_below',
          vars: { pos: ctx.leaguePosition, total: ctx.totalTeams },
        }
      : { key: 'assistant.squad.analytics.0_b' },
    (ctx) => ({ key: ctx.budgetBalance > 0 ? 'assistant.squad.analytics.1_sustainable' : 'assistant.squad.analytics.1_strained' }),
    () => ({ key: 'assistant.squad.analytics.2' }),
  ],
  motivator: [
    (ctx) => ctx.leaguePosition && ctx.leaguePosition <= 3
      ? { key: 'assistant.squad.motivator.0_a' }
      : { key: 'assistant.squad.motivator.0_b' },
    () => ({ key: 'assistant.squad.motivator.1' }),
    () => ({ key: 'assistant.squad.motivator.2' }),
  ],
  tactician: [
    (ctx) => ({ key: 'assistant.squad.tactician.0', vars: { week: ctx.week } }),
    () => ({ key: 'assistant.squad.tactician.1' }),
    () => ({ key: 'assistant.squad.tactician.2' }),
  ],
  developer: [
    (ctx) => ctx.topYouthPotential
      ? { key: 'assistant.squad.developer.0_a', vars: { pot: ctx.topYouthPotential } }
      : { key: 'assistant.squad.developer.0_b' },
    () => ({ key: 'assistant.squad.developer.1' }),
    () => ({ key: 'assistant.squad.developer.2' }),
  ],
  pragmatic: [
    (ctx) => ctx.leaguePosition && ctx.leaguePosition > ctx.totalTeams * 0.7
      ? { key: 'assistant.squad.pragmatic.0_a' }
      : { key: 'assistant.squad.pragmatic.0_b' },
    () => ({ key: 'assistant.squad.pragmatic.1' }),
    () => ({ key: 'assistant.squad.pragmatic.2' }),
  ],
};

const FINANCIAL_TEMPLATES: Record<AssistantArchetype, CommentTemplate[]> = {
  pragmatic: [
    (ctx) => ctx.budgetBalance >= 0
      ? { key: 'assistant.financial.pragmatic.0_a' }
      : { key: 'assistant.financial.pragmatic.0_b' },
    () => ({ key: 'assistant.financial.pragmatic.1' }),
    () => ({ key: 'assistant.financial.pragmatic.2' }),
  ],
  analytics: [
    (ctx) => ({
      key: ctx.budgetBalance >= 0 ? 'assistant.financial.analytics.0_pos' : 'assistant.financial.analytics.0_neg',
      vars: { k: Math.round(ctx.budgetBalance / 1000) },
    }),
    () => ({ key: 'assistant.financial.analytics.1' }),
    () => ({ key: 'assistant.financial.analytics.2' }),
  ],
  old_school: [
    (ctx) => ctx.budgetBalance >= 0
      ? { key: 'assistant.financial.old_school.0_a' }
      : { key: 'assistant.financial.old_school.0_b' },
    () => ({ key: 'assistant.financial.old_school.1' }),
    () => ({ key: 'assistant.financial.old_school.2' }),
  ],
  motivator: [
    (ctx) => ctx.budgetBalance >= 0
      ? { key: 'assistant.financial.motivator.0_a' }
      : { key: 'assistant.financial.motivator.0_b' },
    () => ({ key: 'assistant.financial.motivator.1' }),
    () => ({ key: 'assistant.financial.motivator.2' }),
  ],
  tactician: [
    (ctx) => ({ key: ctx.budgetBalance >= 0 ? 'assistant.financial.tactician.0_pos' : 'assistant.financial.tactician.0_neg' }),
    () => ({ key: 'assistant.financial.tactician.1' }),
    () => ({ key: 'assistant.financial.tactician.2' }),
  ],
  developer: [
    () => ({ key: 'assistant.financial.developer.0' }),
    (ctx) => ctx.budgetBalance < 0
      ? { key: 'assistant.financial.developer.1_a' }
      : { key: 'assistant.financial.developer.1_b' },
    () => ({ key: 'assistant.financial.developer.2' }),
  ],
};

const YOUTH_TEMPLATES: Record<AssistantArchetype, CommentTemplate[]> = {
  developer: [
    (ctx) => ctx.topYouthPotential && ctx.topYouthPotential >= 80
      ? { key: 'assistant.youth.developer.0_a', vars: { pot: ctx.topYouthPotential } }
      : { key: 'assistant.youth.developer.0_b' },
    () => ({ key: 'assistant.youth.developer.1' }),
    () => ({ key: 'assistant.youth.developer.2' }),
  ],
  motivator: [
    () => ({ key: 'assistant.youth.motivator.0' }),
    (ctx) => ctx.topYouthPotential
      ? { key: 'assistant.youth.motivator.1_a', vars: { pot: ctx.topYouthPotential } }
      : { key: 'assistant.youth.motivator.1_b' },
    () => ({ key: 'assistant.youth.motivator.2' }),
  ],
  old_school: [
    () => ({ key: 'assistant.youth.old_school.0' }),
    () => ({ key: 'assistant.youth.old_school.1' }),
    () => ({ key: 'assistant.youth.old_school.2' }),
  ],
  analytics: [
    (ctx) => ctx.topYouthPotential
      ? { key: 'assistant.youth.analytics.0_a', vars: { pot: ctx.topYouthPotential } }
      : { key: 'assistant.youth.analytics.0_b' },
    () => ({ key: 'assistant.youth.analytics.1' }),
    () => ({ key: 'assistant.youth.analytics.2' }),
  ],
  tactician: [
    () => ({ key: 'assistant.youth.tactician.0' }),
    () => ({ key: 'assistant.youth.tactician.1' }),
    (ctx) => ({ key: 'assistant.youth.tactician.2', vars: { week: ctx.week } }),
  ],
  pragmatic: [
    () => ({ key: 'assistant.youth.pragmatic.0' }),
    () => ({ key: 'assistant.youth.pragmatic.1' }),
    (ctx) => ctx.topYouthPotential && ctx.topYouthPotential >= 75
      ? { key: 'assistant.youth.pragmatic.2_a' }
      : { key: 'assistant.youth.pragmatic.2_b' },
  ],
};

const TEMPLATES_BY_ROLE: Record<AssistantRole, Record<AssistantArchetype, CommentTemplate[]>> = {
  squad:     SQUAD_TEMPLATES,
  financial: FINANCIAL_TEMPLATES,
  youth:     YOUTH_TEMPLATES,
};

export function maybeGenerateComment(
  assistant: AssistantWithQuality,
  context: CommentContext,
  rng: SeededRng,
): AssistantComment | null {
  const chance = rng.nextFloat(0, 1);
  if (chance > ASSISTANT_COMMENT_CHANCE_PER_WEEK) return null;

  const templates = TEMPLATES_BY_ROLE[assistant.role][assistant.archetype];
  const template = templates[rng.nextInt(0, templates.length - 1)];
  const descriptor = template(context);

  return {
    assistantId: assistant.id,
    assistantName: assistant.name,
    archetype: assistant.archetype,
    role: assistant.role,
    comment: descriptor,
  };
}
